import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { FILE_TOOLS, executeTool } from "./tools/files.js";
import { buildProjectContext, getSystemPrompt } from "./utils/context.js";
import { isGitRepo, autoCommit } from "./utils/git.js";
import { createSession, saveMessage, updateTokenEstimate, loadMessages } from "./utils/sessions.js";
import type { ProviderConfig } from "./config.js";

// Tools that can modify your project — require approval
const DANGEROUS_TOOLS = new Set(["write_file", "run_command"]);

export interface AgentOptions {
  provider: ProviderConfig;
  cwd: string;
  maxTokens: number;
  autoApprove: boolean;
  onToken?: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onThinking?: (text: string) => void;
  onToolApproval?: (name: string, args: Record<string, unknown>) => Promise<"yes" | "no" | "always">;
  onGitCommit?: (message: string) => void;
}

interface AssembledToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class CodingAgent {
  private client: OpenAI;
  private messages: ChatCompletionMessageParam[] = [];
  private tools: ChatCompletionTool[] = FILE_TOOLS;
  private cwd: string;
  private maxTokens: number;
  private autoApprove: boolean;
  private model: string;
  private alwaysApproved: Set<string> = new Set();
  private gitEnabled: boolean;
  private autoCommitEnabled: boolean = false;
  private repoMap: string = "";
  private sessionId: string = "";

  constructor(private options: AgentOptions) {
    this.client = new OpenAI({
      baseURL: options.provider.baseUrl,
      apiKey: options.provider.apiKey,
    });
    this.cwd = options.cwd;
    this.maxTokens = options.maxTokens;
    this.autoApprove = options.autoApprove;
    this.model = options.provider.model;
    this.gitEnabled = isGitRepo(this.cwd);
  }

  /**
   * Initialize the agent — call this after constructor to build async context
   */
  async init(): Promise<void> {
    const context = await buildProjectContext(this.cwd);
    const systemPrompt = await getSystemPrompt(context);

    this.messages = [
      { role: "system", content: systemPrompt },
    ];

    // Create a new session
    this.sessionId = createSession(this.cwd, this.model);
    saveMessage(this.sessionId, this.messages[0]);
  }

  /**
   * Resume an existing session by loading its messages
   */
  async resume(sessionId: string): Promise<void> {
    const messages = loadMessages(sessionId);
    if (messages.length === 0) {
      throw new Error(`Session ${sessionId} not found or empty`);
    }
    this.messages = messages;
    this.sessionId = sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the current repo map
   */
  getRepoMap(): string {
    return this.repoMap;
  }

  /**
   * Rebuild the repo map (useful after file changes)
   */
  async refreshRepoMap(): Promise<string> {
    const { buildRepoMap } = await import("./utils/repomap.js");
    this.repoMap = await buildRepoMap(this.cwd);
    return this.repoMap;
  }

  /**
   * Stream a response from the model.
   * Assembles tool call chunks, emits tokens in real-time,
   * and loops until the model responds with text (no more tool calls).
   */
  async chat(userMessage: string): Promise<string> {
    const userMsg: ChatCompletionMessageParam = { role: "user", content: userMessage };
    this.messages.push(userMsg);
    saveMessage(this.sessionId, userMsg);

    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        tools: this.tools,
        max_tokens: this.maxTokens,
        stream: true,
      });

      // Accumulate the streamed response
      let contentText = "";
      let thinkingText = "";
      let inThinking = false;
      const toolCalls: Map<number, AssembledToolCall> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Handle content tokens (the actual response text)
        if (delta.content) {
          const token = delta.content;

          // Detect <think> blocks from reasoning models (Qwen, DeepSeek, etc.)
          if (token.includes("<think>")) {
            inThinking = true;
            thinkingText = "";
            continue;
          }
          if (inThinking) {
            if (token.includes("</think>")) {
              inThinking = false;
              this.options.onThinking?.(thinkingText.trim());
              continue;
            }
            thinkingText += token;
            continue;
          }

          contentText += token;
          this.options.onToken?.(token);
        }

        // Handle tool call chunks — they arrive in pieces
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                arguments: "",
              });
            }
            const existing = toolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      }

      // Build the assistant message for history
      const assistantMessage: any = { role: "assistant", content: contentText || null };
      if (toolCalls.size > 0) {
        assistantMessage.tool_calls = Array.from(toolCalls.values()).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      this.messages.push(assistantMessage);
      saveMessage(this.sessionId, assistantMessage);

      // If no tool calls, we're done — return the text
      if (toolCalls.size === 0) {
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText || "(empty response)";
      }

      // Process tool calls
      for (const toolCall of toolCalls.values()) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          args = {};
        }

        this.options.onToolCall?.(toolCall.name, args);

        // Check approval for dangerous tools
        if (DANGEROUS_TOOLS.has(toolCall.name) && !this.autoApprove && !this.alwaysApproved.has(toolCall.name)) {
          if (this.options.onToolApproval) {
            const decision = await this.options.onToolApproval(toolCall.name, args);
            if (decision === "no") {
              const denied = `Tool call "${toolCall.name}" was denied by the user.`;
              this.options.onToolResult?.(toolCall.name, denied);
              const deniedMsg: ChatCompletionMessageParam = {
                role: "tool",
                tool_call_id: toolCall.id,
                content: denied,
              };
              this.messages.push(deniedMsg);
              saveMessage(this.sessionId, deniedMsg);
              continue;
            }
            if (decision === "always") {
              this.alwaysApproved.add(toolCall.name);
            }
          }
        }

        const result = await executeTool(toolCall.name, args, this.cwd);
        this.options.onToolResult?.(toolCall.name, result);

        // Auto-commit after successful write_file (only if enabled)
        if (this.gitEnabled && this.autoCommitEnabled && toolCall.name === "write_file" && result.startsWith("✅")) {
          const path = String(args.path ?? "unknown");
          const committed = autoCommit(this.cwd, path, "write");
          if (committed) {
            this.options.onGitCommit?.(`write ${path}`);
          }
        }

        const toolMsg: ChatCompletionMessageParam = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        };
        this.messages.push(toolMsg);
        saveMessage(this.sessionId, toolMsg);
      }

      // Reset content for next iteration (tool results → model responds again)
      // The onToken callback will stream the next response too
    }

    return "Max iterations reached. The agent may be stuck in a loop.";
  }

  /**
   * Switch to a different model mid-session
   */
  switchModel(model: string, baseUrl?: string, apiKey?: string): void {
    this.model = model;
    if (baseUrl || apiKey) {
      this.client = new OpenAI({
        baseURL: baseUrl ?? this.options.provider.baseUrl,
        apiKey: apiKey ?? this.options.provider.apiKey,
      });
    }
  }

  getModel(): string {
    return this.model;
  }

  setAutoCommit(enabled: boolean): void {
    this.autoCommitEnabled = enabled;
  }

  isGitEnabled(): boolean {
    return this.gitEnabled;
  }

  getContextLength(): number {
    return this.messages.length;
  }

  /**
   * Estimate token count across all messages (~4 chars per token)
   */
  estimateTokens(): number {
    let chars = 0;
    for (const msg of this.messages) {
      if (typeof msg.content === "string") {
        chars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if ("text" in part) chars += part.text.length;
        }
      }
      // Count tool call arguments too
      if ("tool_calls" in msg && Array.isArray((msg as any).tool_calls)) {
        for (const tc of (msg as any).tool_calls) {
          chars += (tc.function?.arguments?.length ?? 0);
          chars += (tc.function?.name?.length ?? 0);
        }
      }
    }
    return Math.ceil(chars / 4);
  }

  reset(): void {
    const systemMsg = this.messages[0];
    this.messages = [systemMsg];
  }
}
