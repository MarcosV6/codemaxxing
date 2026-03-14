import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { FILE_TOOLS, executeTool, generateDiff, getExistingContent } from "./tools/files.js";
import { buildProjectContext, getSystemPrompt } from "./utils/context.js";
import { isGitRepo, autoCommit } from "./utils/git.js";
import { createSession, saveMessage, updateTokenEstimate, updateSessionCost, loadMessages } from "./utils/sessions.js";
import type { ProviderConfig } from "./config.js";

// Tools that can modify your project — require approval
const DANGEROUS_TOOLS = new Set(["write_file", "run_command"]);

// Cost per 1M tokens (input/output) for common models
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Qwen (typically free/cheap on local, but OpenRouter pricing)
  "qwen/qwen-2.5-coder-32b-instruct": { input: 0.2, output: 0.2 },
  "qwen/qwen-2.5-72b-instruct": { input: 0.35, output: 0.4 },
  // DeepSeek
  "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek/deepseek-coder": { input: 0.14, output: 0.28 },
  // Llama
  "meta-llama/llama-3.1-70b-instruct": { input: 0.52, output: 0.75 },
  "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
  // Google
  "google/gemini-pro-1.5": { input: 1.25, output: 5 },
  "google/gemini-flash-1.5": { input: 0.075, output: 0.3 },
};

function getModelCost(model: string): { input: number; output: number } {
  // Direct match
  if (MODEL_COSTS[model]) return MODEL_COSTS[model];
  // Partial match (model name contains a known key)
  const lower = model.toLowerCase();
  for (const [key, cost] of Object.entries(MODEL_COSTS)) {
    if (lower.includes(key) || key.includes(lower)) return cost;
  }
  // Default: $0 (local/unknown models)
  return { input: 0, output: 0 };
}

export interface AgentOptions {
  provider: ProviderConfig;
  cwd: string;
  maxTokens: number;
  autoApprove: boolean;
  onToken?: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onThinking?: (text: string) => void;
  onToolApproval?: (name: string, args: Record<string, unknown>, diff?: string) => Promise<"yes" | "no" | "always">;
  onGitCommit?: (message: string) => void;
  onContextCompressed?: (oldTokens: number, newTokens: number) => void;
  contextCompressionThreshold?: number;
}

interface AssembledToolCall {
  id: string;
  name: string;
  arguments: string;
}

export class CodingAgent {
  private client: OpenAI;
  private anthropicClient: Anthropic | null = null;
  private providerType: "openai" | "anthropic";
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
  private totalPromptTokens: number = 0;
  private totalCompletionTokens: number = 0;
  private totalCost: number = 0;
  private systemPrompt: string = "";
  private compressionThreshold: number;

  constructor(private options: AgentOptions) {
    this.providerType = options.provider.type || "openai";
    this.client = new OpenAI({
      baseURL: options.provider.baseUrl,
      apiKey: options.provider.apiKey,
    });
    if (this.providerType === "anthropic") {
      this.anthropicClient = new Anthropic({
        apiKey: options.provider.apiKey,
      });
    }
    this.cwd = options.cwd;
    this.maxTokens = options.maxTokens;
    this.autoApprove = options.autoApprove;
    this.model = options.provider.model;
    // Default model for Anthropic
    if (this.providerType === "anthropic" && (this.model === "auto" || !this.model)) {
      this.model = "claude-sonnet-4-20250514";
    }
    this.gitEnabled = isGitRepo(this.cwd);
    this.compressionThreshold = options.contextCompressionThreshold ?? 80000;
  }

  /**
   * Initialize the agent — call this after constructor to build async context
   */
  async init(): Promise<void> {
    const context = await buildProjectContext(this.cwd);
    this.systemPrompt = await getSystemPrompt(context);

    this.messages = [
      { role: "system", content: this.systemPrompt },
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

    // Check if context needs compression before sending
    await this.maybeCompressContext();

    if (this.providerType === "anthropic" && this.anthropicClient) {
      return this.chatAnthropic(userMessage);
    }

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
        stream_options: { include_usage: true },
      });

      // Accumulate the streamed response
      let contentText = "";
      let thinkingText = "";
      let inThinking = false;
      const toolCalls: Map<number, AssembledToolCall> = new Map();
      let chunkPromptTokens = 0;
      let chunkCompletionTokens = 0;

      for await (const chunk of stream) {
        // Capture usage from the final chunk
        if ((chunk as any).usage) {
          chunkPromptTokens = (chunk as any).usage.prompt_tokens ?? 0;
          chunkCompletionTokens = (chunk as any).usage.completion_tokens ?? 0;
        }
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

      // Track token usage and cost
      if (chunkPromptTokens > 0 || chunkCompletionTokens > 0) {
        this.totalPromptTokens += chunkPromptTokens;
        this.totalCompletionTokens += chunkCompletionTokens;
        const costs = getModelCost(this.model);
        this.totalCost = (this.totalPromptTokens / 1_000_000) * costs.input +
                         (this.totalCompletionTokens / 1_000_000) * costs.output;
        updateSessionCost(this.sessionId, this.totalPromptTokens, this.totalCompletionTokens, this.totalCost);
      }

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
            // Generate diff for write_file if file already exists
            let diff: string | undefined;
            if (toolCall.name === "write_file" && args.path && args.content) {
              const existing = getExistingContent(String(args.path), this.cwd);
              if (existing !== null) {
                diff = generateDiff(existing, String(args.content), String(args.path));
              }
            }
            const decision = await this.options.onToolApproval(toolCall.name, args, diff);
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
   * Convert OpenAI-format tools to Anthropic tool format
   */
  private getAnthropicTools(): Anthropic.Tool[] {
    return this.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      input_schema: (t.function.parameters as Anthropic.Tool.InputSchema) ?? { type: "object" as const, properties: {} },
    }));
  }

  /**
   * Convert messages to Anthropic format (separate system from conversation)
   */
  private getAnthropicMessages(): Anthropic.MessageParam[] {
    const msgs: Anthropic.MessageParam[] = [];
    for (const msg of this.messages) {
      if (msg.role === "system") continue; // system handled separately
      if (msg.role === "user") {
        msgs.push({ role: "user", content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) });
      } else if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) });
        }
        if ("tool_calls" in msg && Array.isArray((msg as any).tool_calls)) {
          for (const tc of (msg as any).tool_calls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments); } catch {}
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
        }
        if (content.length > 0) {
          msgs.push({ role: "assistant", content });
        }
      } else if (msg.role === "tool") {
        const toolCallId = (msg as any).tool_call_id;
        const resultContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        // Anthropic expects tool results as user messages with tool_result content
        msgs.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolCallId,
            content: resultContent,
          }],
        });
      }
    }
    return msgs;
  }

  /**
   * Anthropic-native streaming chat
   */
  private async chatAnthropic(_userMessage: string): Promise<string> {
    const client = this.anthropicClient!;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const anthropicMessages = this.getAnthropicMessages();
      const anthropicTools = this.getAnthropicTools();

      const stream = client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      let contentText = "";
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentToolId = "";
      let currentToolName = "";
      let currentToolInput = "";

      stream.on("text", (text) => {
        contentText += text;
        this.options.onToken?.(text);
      });

      const finalMessage = await stream.finalMessage();

      // Track usage
      if (finalMessage.usage) {
        const promptTokens = finalMessage.usage.input_tokens;
        const completionTokens = finalMessage.usage.output_tokens;
        this.totalPromptTokens += promptTokens;
        this.totalCompletionTokens += completionTokens;
        const costs = getModelCost(this.model);
        this.totalCost = (this.totalPromptTokens / 1_000_000) * costs.input +
                         (this.totalCompletionTokens / 1_000_000) * costs.output;
        updateSessionCost(this.sessionId, this.totalPromptTokens, this.totalCompletionTokens, this.totalCost);
      }

      // Extract tool uses from content blocks
      for (const block of finalMessage.content) {
        if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      // Build OpenAI-format assistant message for session storage
      const assistantMessage: any = { role: "assistant", content: contentText || null };
      if (toolCalls.length > 0) {
        assistantMessage.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
      }
      this.messages.push(assistantMessage);
      saveMessage(this.sessionId, assistantMessage);

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText || "(empty response)";
      }

      // Process tool calls
      for (const toolCall of toolCalls) {
        const args = toolCall.input;
        this.options.onToolCall?.(toolCall.name, args);

        // Check approval for dangerous tools
        if (DANGEROUS_TOOLS.has(toolCall.name) && !this.autoApprove && !this.alwaysApproved.has(toolCall.name)) {
          if (this.options.onToolApproval) {
            let diff: string | undefined;
            if (toolCall.name === "write_file" && args.path && args.content) {
              const existing = getExistingContent(String(args.path), this.cwd);
              if (existing !== null) {
                diff = generateDiff(existing, String(args.content), String(args.path));
              }
            }
            const decision = await this.options.onToolApproval(toolCall.name, args, diff);
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

        // Auto-commit after successful write_file
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

  /**
   * Check if context needs compression and compress if threshold exceeded
   */
  private async maybeCompressContext(): Promise<void> {
    const currentTokens = this.estimateTokens();
    if (currentTokens < this.compressionThreshold) return;

    // Keep: system prompt (index 0) + last 10 messages
    const keepCount = 10;
    if (this.messages.length <= keepCount + 1) return; // Not enough to compress

    const systemMsg = this.messages[0];
    const middleMessages = this.messages.slice(1, this.messages.length - keepCount);
    const recentMessages = this.messages.slice(this.messages.length - keepCount);

    if (middleMessages.length === 0) return;

    // Build a summary of the middle messages
    const summaryParts: string[] = [];
    for (const msg of middleMessages) {
      if (msg.role === "user" && typeof msg.content === "string") {
        summaryParts.push(`User: ${msg.content.slice(0, 200)}`);
      } else if (msg.role === "assistant" && typeof msg.content === "string" && msg.content) {
        summaryParts.push(`Assistant: ${msg.content.slice(0, 200)}`);
      } else if (msg.role === "tool") {
        // Skip tool messages in summary to save tokens
      }
    }

    // Use the active model to summarize
    const summaryPrompt = `Summarize this conversation history in 2-3 concise paragraphs. Focus on: what was discussed, what files were modified, what decisions were made, and any important context for continuing the conversation.\n\n${summaryParts.join("\n")}`;

    try {
      let summary: string;
      if (this.providerType === "anthropic" && this.anthropicClient) {
        const response = await this.anthropicClient.messages.create({
          model: this.model,
          max_tokens: 500,
          messages: [{ role: "user", content: summaryPrompt }],
        });
        summary = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
      } else {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 500,
          messages: [{ role: "user", content: summaryPrompt }],
        });
        summary = response.choices[0]?.message?.content ?? "Previous conversation context.";
      }

      const compressedMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: `[Context compressed: ${summary}]`,
      };

      const oldTokens = currentTokens;
      this.messages = [systemMsg, compressedMsg, ...recentMessages];
      const newTokens = this.estimateTokens();

      this.options.onContextCompressed?.(oldTokens, newTokens);
    } catch {
      // If summarization fails, just truncate without summary
      const compressedMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: "[Context compressed: Earlier conversation history was removed to stay within token limits.]",
      };
      const oldTokens = currentTokens;
      this.messages = [systemMsg, compressedMsg, ...recentMessages];
      const newTokens = this.estimateTokens();
      this.options.onContextCompressed?.(oldTokens, newTokens);
    }
  }

  getCostInfo(): { promptTokens: number; completionTokens: number; totalCost: number } {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      totalCost: this.totalCost,
    };
  }

  reset(): void {
    const systemMsg = this.messages[0];
    this.messages = [systemMsg];
  }
}
