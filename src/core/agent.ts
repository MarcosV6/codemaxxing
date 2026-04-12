import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, statSync } from "fs";
import { join as joinPath } from "path";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { FILE_TOOLS, executeTool, generateDiff, getExistingContent } from "../tools/files.js";
import { detectLinter, runLinter } from "../utils/lint.js";
import { detectTestRunner, runTests, type TestRunnerInfo } from "../utils/test-runner.js";
import { buildProjectContext, getSystemPrompt, loadProjectRules } from "./context.js";
import { isGitRepo, autoCommit } from "../utils/git.js";
import { buildSkillPrompts, getActiveSkillCount } from "../bridge/skills.js";
import { createSession, saveMessage, updateTokenEstimate, updateSessionCost, loadMessages } from "../utils/sessions.js";
import { loadMCPConfig, connectToServers, disconnectAll, getAllMCPTools, parseMCPToolName, callMCPTool, getConnectedServers, type ConnectedServer } from "../bridge/mcp.js";
import { refreshAnthropicOAuthToken } from "../utils/anthropic-oauth.js";
import { refreshOpenAICodexToken } from "../utils/openai-oauth.js";
import { getCredential, saveCredential } from "../utils/auth.js";
import { chatWithResponsesAPI, shouldUseResponsesAPI } from "../utils/responses-api.js";
import { detectModelContextWindow, getStaticContextWindow } from "../utils/model-context.js";
import type { ProviderConfig } from "../config.js";

// ── Helper: Sanitize unpaired Unicode surrogates (copied from Pi/OpenClaw) ──
function sanitizeSurrogates(text: string): string {
  // Removes unpaired Unicode surrogates that cause JSON serialization errors in APIs.
  // Valid emoji (properly paired surrogates) are preserved.
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

// ── Helper: Build tool result message (with image support) ──
function buildToolResultMessage(
  toolCallId: string,
  toolName: string,
  result: string,
): ChatCompletionMessageParam {
  // For view_image, parse the JSON and create a multimodal content array
  if (toolName === "view_image" && result.startsWith("{")) {
    try {
      const img = JSON.parse(result);
      if (img.type === "image") {
        return {
          role: "tool",
          tool_call_id: toolCallId,
          content: [
            { type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } } as any,
            { type: "text", text: `Image: ${img.path} (${img.size})` },
          ],
        } as any;
      }
    } catch { /* fall through to plain text */ }
  }
  return { role: "tool", tool_call_id: toolCallId, content: result };
}

// ── Helper: Create Anthropic client with proper auth ──
function createAnthropicClient(apiKey: string): Anthropic {
  // OAuth tokens start with "sk-ant-oat" — need special handling
  if (apiKey.startsWith("sk-ant-oat")) {
    return new Anthropic({
      apiKey: null,
      authToken: apiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
        "user-agent": "claude-cli/2.1.75",
        "x-app": "cli",
      },
    } as any);
  }
  // Regular API keys
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

// Tools that can modify your project — require approval
const DANGEROUS_TOOLS = new Set(["write_file", "edit_file", "run_command"]);

// Tools that are safe to run in parallel (read-only, no side effects)
const PARALLELIZABLE_TOOLS = new Set([
  "read_file", "list_files", "search_files", "glob", "web_fetch",
  "web_search", "view_image", "think", "recall_memory", "remember_memory",
  "create_task", "update_task",
]);

// Cost per 1M tokens (input/output) for common models
// Prices as of mid-2025; update when providers change pricing.
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "o1": { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o1-pro": { input: 150, output: 600 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.4-pro": { input: 30, output: 180 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.3, output: 1.25 },
  "gpt-5.3-codex": { input: 1.25, output: 10 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "o4-mini": { input: 1.1, output: 4.4 },
  // Provider-prefixed variants (OpenRouter / LM Studio style)
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/o3-mini": { input: 1.1, output: 4.4 },
  "openai/o4-mini": { input: 1.1, output: 4.4 },
  "openai/o1": { input: 15, output: 60 },
  "openai/o3": { input: 10, output: 40 },

  // ── Anthropic ────────────────────────────────────────────────────────────
  // Claude 3.5 family
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  // Claude 3 family
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet-20240229": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  // Claude 4 family (2025)
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-opus-4": { input: 15, output: 75 },
  "claude-haiku-4": { input: 0.8, output: 4 },
  // Provider-prefixed (OpenRouter)
  "anthropic/claude-3-5-sonnet": { input: 3, output: 15 },
  "anthropic/claude-3-5-haiku": { input: 0.8, output: 4 },
  "anthropic/claude-3-opus": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4-20250514": { input: 3, output: 15 },
  "anthropic/claude-opus-4-20250514": { input: 15, output: 75 },

  // ── Google Gemini ────────────────────────────────────────────────────────
  // Gemini 1.5
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  // Gemini 2.0
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-2.0-pro": { input: 1.25, output: 10 },
  // Gemini 2.5
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  // Provider-prefixed (OpenRouter / LM Studio)
  "google/gemini-pro-1.5": { input: 1.25, output: 5 },
  "google/gemini-flash-1.5": { input: 0.075, output: 0.3 },
  "google/gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.6 },

  // ── Qwen ─────────────────────────────────────────────────────────────────
  "qwen/qwen-2.5-coder-32b-instruct": { input: 0.2, output: 0.2 },
  "qwen/qwen-2.5-72b-instruct": { input: 0.35, output: 0.4 },
  "qwen/qwq-32b": { input: 0.15, output: 0.2 },
  "qwen/qwen3-235b-a22b": { input: 0.2, output: 0.4 },

  // ── DeepSeek ─────────────────────────────────────────────────────────────
  "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek/deepseek-coder": { input: 0.14, output: 0.28 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },

  // ── Meta Llama ───────────────────────────────────────────────────────────
  "meta-llama/llama-3.1-70b-instruct": { input: 0.52, output: 0.75 },
  "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.12, output: 0.3 },
  "meta-llama/llama-4-scout": { input: 0.11, output: 0.34 },
  "meta-llama/llama-4-maverick": { input: 0.22, output: 0.88 },

  // ── Mistral ──────────────────────────────────────────────────────────────
  "mistral/mistral-large": { input: 2, output: 6 },
  "mistral/mistral-small": { input: 0.1, output: 0.3 },
  "mistral/codestral": { input: 0.3, output: 0.9 },
};

export function getModelCost(model: string): { input: number; output: number } {
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
  onLoopStatus?: (stage: string, meta?: Record<string, unknown>) => void;
  onToolApproval?: (name: string, args: Record<string, unknown>, diff?: string) => Promise<"yes" | "no" | "always">;
  onAskUser?: (question: string) => Promise<string>;
  onGitCommit?: (message: string) => void;
  onContextCompressed?: (oldTokens: number, newTokens: number) => void;
  onArchitectPlan?: (plan: string) => void;
  onLintResult?: (file: string, errors: string) => void;
  onMCPStatus?: (server: string, status: string) => void;
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
  private currentApiKey: string | null = null;
  private currentBaseUrl: string = "";
  private aborted: boolean = false;
  private messages: ChatCompletionMessageParam[] = [];
  private tools: ChatCompletionTool[] = FILE_TOOLS;
  private cwd: string;
  private maxTokens: number;
  private autoApprove: boolean;
  private approvalMode: "suggest" | "auto-edit" | "full-auto" = "suggest";
  private model: string;
  private alwaysApproved: Set<string> = new Set();
  private gitEnabled: boolean;
  private autoCommitEnabled: boolean = false;
  private repoMap: string = "";
  private sessionId: string = "";
  private totalPromptTokens: number = 0;
  private totalCompletionTokens: number = 0;
  private totalCost: number = 0;
  // Tokens-per-second of the most recent assistant completion (null until first response)
  private lastTokensPerSecond: number | null = null;
  // Detected model context window in tokens. Starts as a static-table guess
  // (best effort, sync) and gets refined by an async runtime detection that
  // queries Ollama / LM Studio / OpenRouter native APIs once per model switch.
  private contextWindow: number | null = null;
  // Whether the user explicitly set a compression threshold in config — if so,
  // we leave it alone and don't auto-derive it from the detected window.
  private compressionThresholdLocked: boolean = false;
  private systemPrompt: string = "";
  private compressionThreshold: number;
  private sessionDisabledSkills: Set<string> = new Set();
  private projectRulesSource: string | null = null;
  private architectModel: string | null = null;
  private autoLintEnabled: boolean = true;
  private detectedLinter: { command: string; name: string } | null = null;
  private autoTestEnabled: boolean = false;
  private detectedTestRunner: TestRunnerInfo | null = null;
  private mcpServers: ConnectedServer[] = [];
  private sendCount: number = 0;
  private lastMemoryNudge: number = 0;
  private workflowTrace: {
    toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
    hadError: boolean;
    errorRecovered: boolean;
    userCorrection: boolean;
    totalIterations: number;
  } = { toolCalls: [], hadError: false, errorRecovered: false, userCorrection: false, totalIterations: 0 };

  constructor(private options: AgentOptions) {
    this.providerType = options.provider.type || "openai";
    this.currentBaseUrl = options.provider.baseUrl || "https://api.openai.com/v1";
    this.client = new OpenAI({
      baseURL: this.currentBaseUrl,
      apiKey: options.provider.apiKey,
    });
    if (this.providerType === "anthropic") {
      this.anthropicClient = createAnthropicClient(options.provider.apiKey);
    }
    this.cwd = options.cwd;
    this.maxTokens = options.maxTokens;
    this.autoApprove = options.autoApprove;
    this.model = options.provider.model;
    // Default model for Anthropic
    if (this.providerType === "anthropic" && (this.model === "auto" || !this.model)) {
      this.model = "claude-sonnet-4-6";
    }
    this.gitEnabled = isGitRepo(this.cwd);
    this.compressionThreshold = options.contextCompressionThreshold ?? 80000;
    this.compressionThresholdLocked = options.contextCompressionThreshold !== undefined;
    // Best-effort sync seed from the static lookup so the status bar has
    // something sensible before the async detection finishes.
    this.contextWindow = getStaticContextWindow(this.model);
    void this.refreshContextWindow();
  }

  /**
   * Async runtime detection of the loaded model's context window. Queries
   * Ollama / LM Studio / OpenRouter native APIs (with short timeouts) and
   * falls back through static lookup. Updates compressionThreshold to ~75%
   * of the detected window unless the user explicitly pinned it in config.
   *
   * Safe to call repeatedly; failures are silent.
   */
  private async refreshContextWindow(): Promise<void> {
    try {
      const detected = await detectModelContextWindow({
        model: this.model,
        baseUrl: this.currentBaseUrl,
        providerType: this.providerType,
      });
      if (detected > 0) {
        this.contextWindow = detected;
        if (!this.compressionThresholdLocked) {
          // Compact when we hit ~75% of the window so the model still has
          // headroom to actually generate a response after summarization.
          this.compressionThreshold = Math.floor(detected * 0.75);
        }
      }
    } catch {
      // detection is best-effort; static seed remains in place
    }
  }

  /**
   * Initialize the agent — call this after constructor to build async context
   */
  async init(): Promise<void> {
    const context = await buildProjectContext(this.cwd);
    const skillPrompts = buildSkillPrompts(this.cwd, this.sessionDisabledSkills);
    const rules = loadProjectRules(this.cwd);
    if (rules) this.projectRulesSource = rules.source;
    this.systemPrompt = await getSystemPrompt(context, skillPrompts, rules?.content ?? "");

    // Detect project linter and test runner
    this.detectedLinter = detectLinter(this.cwd);
    this.detectedTestRunner = detectTestRunner(this.cwd);

    // Connect to MCP servers
    const mcpConfig = loadMCPConfig(this.cwd);
    if (Object.keys(mcpConfig.mcpServers).length > 0) {
      this.mcpServers = await connectToServers(mcpConfig, this.options.onMCPStatus);
      if (this.mcpServers.length > 0) {
        const mcpTools = getAllMCPTools(this.mcpServers);
        this.tools = [...FILE_TOOLS, ...mcpTools];
      }
    }

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
    const { buildRepoMap } = await import("../utils/repomap.js");
    this.repoMap = await buildRepoMap(this.cwd);
    return this.repoMap;
  }

  /**
   * Execute a tool with pre/post hooks.
   */
  private async executeToolWithHooks(name: string, args: Record<string, unknown>, cwd: string): Promise<string> {
    try {
      const { runHooks } = await import("../utils/hooks.js");

      // Pre-tool hooks
      const preResults = await runHooks("pre-tool", cwd, { toolName: name, toolArgs: args });
      for (const r of preResults) {
        if (r.output && this.options.onToolResult) {
          this.options.onToolResult("hook", r.output);
        }
      }

      // Execute the actual tool
      const result = await executeTool(name, args, cwd);

      // Track for skill learning
      this.workflowTrace.toolCalls.push({ name, args, result: result.slice(0, 200) });
      this.workflowTrace.totalIterations++;

      // Post-tool hooks
      const filePath = typeof args.path === "string" ? args.path : undefined;
      const postResults = await runHooks("post-tool", cwd, {
        toolName: name,
        toolArgs: args,
        toolResult: result.slice(0, 500),
        filePath,
      });
      for (const r of postResults) {
        if (r.output && this.options.onToolResult) {
          this.options.onToolResult("hook", r.output);
        }
      }

      // On-edit hooks for file write/edit tools
      if ((name === "write_file" || name === "edit_file") && filePath) {
        await runHooks("on-edit", cwd, { toolName: name, filePath });
      }

      return result;
    } catch (err: any) {
      if (err.message?.startsWith("Blocking hook failed:")) {
        return `Hook blocked this action: ${err.message}`;
      }
      // Hooks module not available — fall through to direct execution
      return executeTool(name, args, cwd);
    }
  }

  /**
   * Send a message, routing through architect model if enabled
   */
  async send(userMessage: string, images?: Array<{ mime: string; base64: string }>): Promise<string> {
    this.sendCount++;
    let result: string;

    // If images are provided, inject them as multimodal content before routing
    if (images && images.length > 0) {
      const content: any[] = [];
      for (const img of images) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${img.mime};base64,${img.base64}` },
        });
      }
      content.push({ type: "text", text: userMessage || "Describe these images." });
      const userMsg: ChatCompletionMessageParam = { role: "user", content } as any;
      this.messages.push(userMsg);
      saveMessage(this.sessionId, userMsg);
      await this.maybeCompressContext();
      // Route to the correct backend — skip chat() since message is already pushed
      if (this.providerType === "anthropic" && this.anthropicClient) {
        result = await this.chatAnthropic(userMessage);
      } else if (this.providerType === "openai" && shouldUseResponsesAPI(this.model)) {
        result = await this.chatOpenAIResponses(userMessage);
      } else {
        result = await this.chatOpenAICompletions();
      }
    } else if (this.architectModel) {
      result = await this.architectChat(userMessage);
    } else {
      result = await this.chat(userMessage);
    }

    // Memory nudge: every 3 sends, inject a nudge so the agent saves useful knowledge
    if (this.sendCount - this.lastMemoryNudge >= 3) {
      this.lastMemoryNudge = this.sendCount;
      try {
        const { getMemoryNudgePrompt } = await import("../utils/memory.js");
        const nudge = getMemoryNudgePrompt();
        this.messages.push({ role: "system", content: nudge });
      } catch {
        // Memory module not available
      }
    }

    // Skill learning: evaluate if this workflow should be saved
    try {
      const { shouldLearnSkill, generateSkillFromTrace, saveLearnedSkill } = await import("../utils/skill-learner.js");
      const fullTrace = { ...this.workflowTrace, userMessage };
      if (shouldLearnSkill(fullTrace)) {
        const skill = generateSkillFromTrace(fullTrace);
        saveLearnedSkill(skill);
        this.options.onToolResult?.("skill-learner", `Learned new skill: "${skill.name}" from this workflow`);
      }
    } catch {
      // Skill learner not available
    }

    // Reset trace for next send
    this.workflowTrace = {
      toolCalls: [],
      hadError: false,
      errorRecovered: false,
      userCorrection: false,
      totalIterations: 0,
    };

    return result;
  }

  /**
   * Stream a response from the model.
   * Assembles tool call chunks, emits tokens in real-time,
   * and loops until the model responds with text (no more tool calls).
   */
  async chat(userMessage: string): Promise<string> {
    this.resetAbort();
    const userMsg: ChatCompletionMessageParam = { role: "user", content: userMessage };
    this.messages.push(userMsg);
    saveMessage(this.sessionId, userMsg);

    // Check if context needs compression before sending
    await this.maybeCompressContext();

    if (this.providerType === "anthropic" && this.anthropicClient) {
      return this.chatAnthropic(userMessage);
    }

    // Route to Responses API for models that need it (GPT-5.x, Codex, etc)
    if (this.providerType === "openai" && shouldUseResponsesAPI(this.model)) {
      return this.chatOpenAIResponses(userMessage);
    }

    return this.chatOpenAICompletions();
  }

  /**
   * OpenAI Chat Completions streaming loop.
   * Messages must already be in this.messages before calling.
   */
  private async chatOpenAICompletions(): Promise<string> {
    this.resetAbort();
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      this.options.onLoopStatus?.("opening model stream", { iteration: iterations });

      let stream;
      try {
        stream = await this.client.chat.completions.create({
          model: this.model,
          messages: this.messages,
          tools: this.tools,
          max_tokens: this.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        });
      } catch (err: any) {
        // Better error for OpenAI Codex OAuth scope limitations
        if (err.status === 401 && err.message?.includes("Missing scopes")) {
          throw new Error(
            `Model "${this.model}" is not available via Chat Completions with your OAuth token. ` +
            `Try a GPT-5.x model (which uses the Responses API automatically), ` +
            `or use an API key for full model access (/login openai → api-key).`
          );
        }
        // Try refreshing expired OAuth token
        if (err.status === 401) {
          const refreshed = await this.tryRefreshOpenAIToken();
          if (refreshed) {
            iterations--;
            continue;
          }
          throw new Error("OpenAI OAuth token expired and could not be refreshed. Run /login to re-authenticate.");
        }
        throw err;
      }

      // Accumulate the streamed response
      let contentText = "";
      let thinkingText = "";
      let inThinking = false;
      const toolCalls: Map<number, AssembledToolCall> = new Map();
      let chunkPromptTokens = 0;
      let chunkCompletionTokens = 0;
      // Visible-content throughput tracking. We count only content deltas the user
      // actually sees stream on screen (excluding <think> blocks and tool-call
      // arg deltas) and time from the first such delta to the last. Each delta is
      // ~1 token on Ollama / LM Studio / llama.cpp, so this approximates real
      // tok/s without depending on the server reporting usage.completion_tokens
      // (which can also wrongly include thinking/tool tokens for the whole turn).
      let firstVisibleMs: number | null = null;
      let lastVisibleMs: number | null = null;
      let visibleDeltaCount = 0;

      for await (const chunk of stream) {
        // Check for abort
        if (this.aborted) {
          try { stream.controller?.abort(); } catch {}
          break;
        }
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

          // Visible content — count it for throughput measurement
          const now = Date.now();
          if (firstVisibleMs === null) firstVisibleMs = now;
          lastVisibleMs = now;
          visibleDeltaCount++;

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

      // Visible-content throughput. Need at least 2 deltas to have a real time
      // window — a single-delta response (e.g., just "yes") gives elapsed ≈ 0
      // and no useful measurement.
      if (
        visibleDeltaCount >= 2 &&
        firstVisibleMs !== null &&
        lastVisibleMs !== null &&
        lastVisibleMs > firstVisibleMs
      ) {
        const elapsedSec = (lastVisibleMs - firstVisibleMs) / 1000;
        // (visibleDeltaCount - 1) deltas arrived AFTER the first one in the
        // measured window — that's the count that corresponds to elapsedSec.
        this.lastTokensPerSecond = (visibleDeltaCount - 1) / elapsedSec;
      }

      // If aborted, return what we have so far
      if (this.aborted) {
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText ? contentText + "\n\n_(cancelled)_" : "_(cancelled)_";
      }

      // If no tool calls, we're done — return the text
      if (toolCalls.size === 0) {
        this.options.onLoopStatus?.("response completed", { iteration: iterations });
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText || "(empty response)";
      }

      this.options.onLoopStatus?.("processing tool calls", { iteration: iterations, toolCount: toolCalls.size });

      // Check if all tool calls are parallelizable
      const toolCallArray = Array.from(toolCalls.values());
      const allParallelizable = toolCallArray.length > 1 && toolCallArray.every(
        (tc) => PARALLELIZABLE_TOOLS.has(tc.name) && !parseMCPToolName(tc.name)
      );

      if (allParallelizable) {
        // Execute all safe tools in parallel
        const parsedCalls = toolCallArray.map((tc) => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.arguments); } catch { args = {}; }
          return { tc, args };
        });

        // Fire onToolCall for all before executing
        for (const { tc, args } of parsedCalls) {
          this.options.onToolCall?.(tc.name, args);
        }

        const results = await Promise.all(parsedCalls.map(async ({ tc, args }) => {
          if (tc.name === "think") {
            this.options.onThinking?.(String(args.thought ?? ""));
            return { tc, result: "(thinking complete)" };
          }
          const result = await this.executeToolWithHooks(tc.name, args, this.cwd);
          return { tc, result };
        }));

        for (const { tc, result } of results) {
          this.options.onToolResult?.(tc.name, result);
          const toolMsg = buildToolResultMessage(tc.id, tc.name, result);
          this.messages.push(toolMsg);
          saveMessage(this.sessionId, toolMsg);
          this.options.onLoopStatus?.("tool result appended to conversation", {
            iteration: iterations,
            toolName: tc.name,
            resultLength: result.length,
          });
        }
      } else {
        // Sequential execution (original behavior)
        for (const toolCall of toolCalls.values()) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            args = {};
          }

          this.options.onToolCall?.(toolCall.name, args);

          // Check approval for dangerous tools
          if (this.needsApproval(toolCall.name)) {
            if (this.options.onToolApproval) {
              let diff: string | undefined;
              if (toolCall.name === "write_file" && args.path && args.content) {
                const existing = getExistingContent(String(args.path), this.cwd);
                if (existing !== null) {
                  diff = generateDiff(existing, String(args.content), String(args.path));
                }
              }
              if (toolCall.name === "edit_file" && args.path && args.oldText !== undefined && args.newText !== undefined) {
                const existing = getExistingContent(String(args.path), this.cwd);
                if (existing !== null) {
                  const oldText = String(args.oldText);
                  const newText = String(args.newText);
                  const replaceAll = Boolean(args.replaceAll);
                  const next = replaceAll ? existing.split(oldText).join(newText) : existing.replace(oldText, newText);
                  diff = generateDiff(existing, next, String(args.path));
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

          // Handle special tools (think, ask_user) before routing
          if (toolCall.name === "think") {
            this.options.onThinking?.(String(args.thought ?? ""));
            const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, "(thinking complete)");
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            continue;
          }
          if (toolCall.name === "ask_user" && this.options.onAskUser) {
            const answer = await this.options.onAskUser(String(args.question ?? ""));
            const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, answer);
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            continue;
          }

          // Route to MCP or built-in tool
          const mcpParsed = parseMCPToolName(toolCall.name);
          let result: string;
          if (mcpParsed) {
            result = await callMCPTool(mcpParsed.serverName, mcpParsed.toolName, args);
          } else {
            result = await this.executeToolWithHooks(toolCall.name, args, this.cwd);
          }
          this.options.onToolResult?.(toolCall.name, result);

          // Auto-commit after successful write_file (only if enabled)
          if (this.gitEnabled && this.autoCommitEnabled && ["write_file","edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
            const path = String(args.path ?? "unknown");
            const committed = autoCommit(this.cwd, path, "write");
            if (committed) {
              this.options.onGitCommit?.(`write ${path}`);
            }
          }

          // Auto-lint after successful write_file
          if (this.autoLintEnabled && this.detectedLinter && ["write_file","edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
            const filePath = String(args.path ?? "");
            const lintErrors = runLinter(this.detectedLinter, filePath, this.cwd);
            if (lintErrors) {
              this.options.onLintResult?.(filePath, lintErrors);
              const lintMsg: ChatCompletionMessageParam = {
                role: "tool",
                tool_call_id: toolCall.id,
                content: result + `\n\nLint errors detected in ${filePath}:\n${lintErrors}\nPlease fix these issues.`,
              };
              this.messages.push(lintMsg);
              saveMessage(this.sessionId, lintMsg);
              continue;
            }
          }

          const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, result);
          this.messages.push(toolMsg);
          saveMessage(this.sessionId, toolMsg);
          this.options.onLoopStatus?.("tool result appended to conversation", {
            iteration: iterations,
            toolName: toolCall.name,
            resultLength: result.length,
          });
        }
      }

      this.options.onLoopStatus?.("opening next model stream", { iteration: iterations + 1 });

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
        // Handle multimodal user messages (text + images)
        if (Array.isArray(msg.content)) {
          const anthropicContent = (msg.content as any[]).map((block: any) => {
            if (block.type === "image_url" && block.image_url?.url?.startsWith("data:")) {
              const match = block.image_url.url.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                return {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: match[1] as any, data: match[2] },
                };
              }
            }
            if (block.type === "text") return { type: "text" as const, text: block.text };
            return { type: "text" as const, text: JSON.stringify(block) };
          });
          msgs.push({ role: "user", content: anthropicContent as any });
        } else {
          msgs.push({ role: "user", content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) });
        }
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
        // Anthropic expects tool results as user messages with tool_result content
        // Handle multimodal content (images from view_image)
        let toolResultContent: any;
        if (Array.isArray(msg.content)) {
          // Convert OpenAI-style image_url blocks to Anthropic image blocks
          toolResultContent = (msg.content as any[]).map((block: any) => {
            if (block.type === "image_url" && block.image_url?.url?.startsWith("data:")) {
              const match = block.image_url.url.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                return {
                  type: "image",
                  source: { type: "base64", media_type: match[1], data: match[2] },
                };
              }
            }
            if (block.type === "text") return { type: "text", text: block.text };
            return { type: "text", text: JSON.stringify(block) };
          });
        } else {
          toolResultContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        }
        msgs.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolCallId,
            content: toolResultContent,
          }],
        });
      }
    }
    // Sanitize: remove tool_result messages that don't have a matching tool_use
    const validToolUseIds = new Set<string>();
    for (const m of msgs) {
      if (m.role === "assistant" && Array.isArray(m.content)) {
        for (const block of m.content) {
          if ((block as any).type === "tool_use") {
            validToolUseIds.add((block as any).id);
          }
        }
      }
    }
    
    return msgs.filter((m) => {
      if (m.role === "user" && Array.isArray(m.content)) {
        const toolResults = (m.content as any[]).filter((b) => b.type === "tool_result");
        if (toolResults.length > 0) {
          // Only keep if ALL tool_results have matching tool_use
          return toolResults.every((tr) => validToolUseIds.has(tr.tool_use_id));
        }
      }
      return true;
    });
  }

  /**
   * Anthropic-native streaming chat
   */
  private async chatAnthropic(_userMessage: string): Promise<string> {
    this.resetAbort();
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      this.options.onLoopStatus?.("opening model stream", { iteration: iterations });

      const anthropicMessages = this.getAnthropicMessages();
      const anthropicTools = this.getAnthropicTools();

      // For OAuth tokens, system prompt must be a structured array with Claude Code identity
      // Check both the current provider key and what was passed to switchModel
      const currentApiKey = this.currentApiKey ?? this.options.provider.apiKey;
      const isOAuthToken = currentApiKey?.includes("sk-ant-oat");
      let systemPrompt: any = this.systemPrompt;
      if (isOAuthToken) {
        systemPrompt = [
          {
            type: "text" as const,
            text: "You are Claude Code, Anthropic's official CLI for Claude.",
          },
          {
            type: "text" as const,
            text: sanitizeSurrogates(this.systemPrompt),
          },
        ];
      } else {
        systemPrompt = sanitizeSurrogates(this.systemPrompt);
      }

      let stream: any;
      let finalMessage: any;
      let contentText = "";
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      try {
        stream = this.anthropicClient!.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: anthropicTools,
        });

        stream.on("text", (text: string) => {
          if (this.aborted) {
            stream.abort();
            return;
          }
          contentText += text;
          this.options.onToken?.(text);
        });

        finalMessage = await stream.finalMessage();
      } catch (err: any) {
        // Handle 401 Unauthorized — try refreshing OAuth token
        const isOAuth = (this.currentApiKey ?? this.options.provider.apiKey)?.startsWith("sk-ant-oat");
        if (err.status === 401 && isOAuth) {
          const refreshed = await this.tryRefreshAnthropicToken();
          if (refreshed) {
            // Token was refreshed — retry this iteration
            iterations--;
            continue;
          }
          throw new Error("Anthropic OAuth token expired. Please re-login with /login anthropic");
        }
        // Re-throw if we can't handle it
        throw err;
      }

      // If aborted, return what we have
      if (this.aborted) {
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText ? contentText + "\n\n_(cancelled)_" : "_(cancelled)_";
      }

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
        this.options.onLoopStatus?.("response completed", { iteration: iterations });
        updateTokenEstimate(this.sessionId, this.estimateTokens());
        return contentText || "(empty response)";
      }

      this.options.onLoopStatus?.("processing tool calls", { iteration: iterations, toolCount: toolCalls.length });

      // Check if all tool calls are parallelizable
      const allParallelizable = toolCalls.length > 1 && toolCalls.every(
        (tc) => PARALLELIZABLE_TOOLS.has(tc.name) && !parseMCPToolName(tc.name)
      );

      if (allParallelizable) {
        for (const tc of toolCalls) this.options.onToolCall?.(tc.name, tc.input);

        const results = await Promise.all(toolCalls.map(async (tc) => {
          if (tc.name === "think") {
            this.options.onThinking?.(String(tc.input.thought ?? ""));
            return { tc, result: "(thinking complete)" };
          }
          const result = await this.executeToolWithHooks(tc.name, tc.input as Record<string, unknown>, this.cwd);
          return { tc, result };
        }));

        for (const { tc, result } of results) {
          this.options.onToolResult?.(tc.name, result);
          const toolMsg = buildToolResultMessage(tc.id, tc.name, result);
          this.messages.push(toolMsg);
          saveMessage(this.sessionId, toolMsg);
          this.options.onLoopStatus?.("tool result appended to conversation", {
            iteration: iterations,
            toolName: tc.name,
            resultLength: result.length,
          });
        }
      } else {
        // Sequential execution
        for (const toolCall of toolCalls) {
          const args = toolCall.input;
          this.options.onToolCall?.(toolCall.name, args);

          if (this.needsApproval(toolCall.name)) {
            if (this.options.onToolApproval) {
              let diff: string | undefined;
              if (toolCall.name === "write_file" && args.path && args.content) {
                const existing = getExistingContent(String(args.path), this.cwd);
                if (existing !== null) {
                  diff = generateDiff(existing, String(args.content), String(args.path));
                }
              }
              if (toolCall.name === "edit_file" && args.path && args.oldText !== undefined && args.newText !== undefined) {
                const existing = getExistingContent(String(args.path), this.cwd);
                if (existing !== null) {
                  const oldText = String(args.oldText);
                  const newText = String(args.newText);
                  const replaceAll = Boolean(args.replaceAll);
                  const next = replaceAll ? existing.split(oldText).join(newText) : existing.replace(oldText, newText);
                  diff = generateDiff(existing, next, String(args.path));
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

          if (toolCall.name === "think") {
            this.options.onThinking?.(String(args.thought ?? ""));
            const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, "(thinking complete)");
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            continue;
          }
          if (toolCall.name === "ask_user" && this.options.onAskUser) {
            const answer = await this.options.onAskUser(String(args.question ?? ""));
            const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, answer);
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            continue;
          }

          const mcpParsed = parseMCPToolName(toolCall.name);
          let result: string;
          if (mcpParsed) {
            result = await callMCPTool(mcpParsed.serverName, mcpParsed.toolName, args);
          } else {
            result = await this.executeToolWithHooks(toolCall.name, args, this.cwd);
          }
          this.options.onToolResult?.(toolCall.name, result);

          if (this.gitEnabled && this.autoCommitEnabled && ["write_file","edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
            const path = String(args.path ?? "unknown");
            const committed = autoCommit(this.cwd, path, "write");
            if (committed) {
              this.options.onGitCommit?.(`write ${path}`);
            }
          }

          if (this.autoLintEnabled && this.detectedLinter && ["write_file","edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
            const filePath = String(args.path ?? "");
            const lintErrors = runLinter(this.detectedLinter, filePath, this.cwd);
            if (lintErrors) {
              this.options.onLintResult?.(filePath, lintErrors);
              const lintMsg: ChatCompletionMessageParam = {
                role: "tool",
                tool_call_id: toolCall.id,
                content: result + `\n\nLint errors detected in ${filePath}:\n${lintErrors}\nPlease fix these issues.`,
              };
              this.messages.push(lintMsg);
              saveMessage(this.sessionId, lintMsg);
              continue;
            }
          }

          const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, result);
          this.messages.push(toolMsg);
          saveMessage(this.sessionId, toolMsg);
          this.options.onLoopStatus?.("tool result appended to conversation", {
            iteration: iterations,
            toolName: toolCall.name,
            resultLength: result.length,
          });
        }
      }

      this.options.onLoopStatus?.("opening next model stream", { iteration: iterations + 1 });
    }

    return "Max iterations reached. The agent may be stuck in a loop.";
  }

  /**
   * OpenAI Responses API chat (for Codex OAuth tokens + GPT-5.4)
   */
  private async chatOpenAIResponses(userMessage: string): Promise<string> {
    this.resetAbort();
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      this.options.onLoopStatus?.("opening model stream", { iteration: iterations });

      try {
        const currentKey = this.currentApiKey || this.options.provider.apiKey;
        
        const result = await chatWithResponsesAPI({
          baseUrl: this.currentBaseUrl,
          apiKey: currentKey,
          model: this.model,
          maxTokens: this.maxTokens,
          systemPrompt: this.systemPrompt,
          messages: this.messages,
          tools: this.tools,
          onToken: (token) => this.options.onToken?.(token),
          onToolCall: (name, args) => this.options.onToolCall?.(name, args),
        });

        const { contentText, toolCalls, promptTokens, completionTokens } = result;

        // Track usage
        this.totalPromptTokens += promptTokens;
        this.totalCompletionTokens += completionTokens;
        const costs = getModelCost(this.model);
        this.totalCost = (this.totalPromptTokens / 1_000_000) * costs.input +
                         (this.totalCompletionTokens / 1_000_000) * costs.output;
        updateSessionCost(this.sessionId, this.totalPromptTokens, this.totalCompletionTokens, this.totalCost);

        // Build and save assistant message
        const assistantMessage: ChatCompletionMessageParam = { role: "assistant", content: contentText || null };
        if (toolCalls.length > 0) {
          (assistantMessage as any).tool_calls = toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }));
        }
        this.messages.push(assistantMessage);
        saveMessage(this.sessionId, assistantMessage);

        // If aborted, return what we have
        if (this.aborted) {
          updateTokenEstimate(this.sessionId, this.estimateTokens());
          return contentText ? contentText + "\n\n_(cancelled)_" : "_(cancelled)_";
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          this.options.onLoopStatus?.("response completed", { iteration: iterations });
          updateTokenEstimate(this.sessionId, this.estimateTokens());
          return contentText || "(empty response)";
        }

        this.options.onLoopStatus?.("processing tool calls", { iteration: iterations, toolCount: toolCalls.length });

        // Check if all tool calls are parallelizable
        const allParallelizable = toolCalls.length > 1 && toolCalls.every(
          (tc) => PARALLELIZABLE_TOOLS.has(tc.name) && !parseMCPToolName(tc.name)
        );

        if (allParallelizable) {
          for (const tc of toolCalls) this.options.onToolCall?.(tc.name, tc.input);

          const results = await Promise.all(toolCalls.map(async (tc) => {
            if (tc.name === "think") {
              this.options.onThinking?.(String(tc.input.thought ?? ""));
              return { tc, result: "(thinking complete)" };
            }
            const result = await this.executeToolWithHooks(tc.name, tc.input as Record<string, unknown>, this.cwd);
            return { tc, result };
          }));

          for (const { tc, result } of results) {
            this.options.onToolResult?.(tc.name, result);
            const toolMsg = buildToolResultMessage(tc.id, tc.name, result);
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            this.options.onLoopStatus?.("tool result appended to conversation", {
              iteration: iterations,
              toolName: tc.name,
              resultLength: result.length,
            });
          }
        } else {
          for (const toolCall of toolCalls) {
            const args = toolCall.input;

            if (this.needsApproval(toolCall.name)) {
              if (this.options.onToolApproval) {
                let diff: string | undefined;
                if (toolCall.name === "write_file" && args.path && args.content) {
                  const existing = getExistingContent(String(args.path), this.cwd);
                  if (existing !== null) {
                    diff = generateDiff(existing, String(args.content), String(args.path));
                  }
                }
                if (toolCall.name === "edit_file" && args.path && args.oldText !== undefined && args.newText !== undefined) {
                  const existing = getExistingContent(String(args.path), this.cwd);
                  if (existing !== null) {
                    const oldText = String(args.oldText);
                    const newText = String(args.newText);
                    const replaceAll = Boolean(args.replaceAll);
                    const next = replaceAll ? existing.split(oldText).join(newText) : existing.replace(oldText, newText);
                    diff = generateDiff(existing, next, String(args.path));
                  }
                }

                const decision = await this.options.onToolApproval(toolCall.name, args, diff);
                if (decision === "no") {
                  const toolMsg: ChatCompletionMessageParam = {
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: "Tool denied by user.",
                  };
                  this.messages.push(toolMsg);
                  saveMessage(this.sessionId, toolMsg);
                  continue;
                }
                if (decision === "always") {
                  this.alwaysApproved.add(toolCall.name);
                }
              }
            }

            if (toolCall.name === "think") {
              this.options.onThinking?.(String(args.thought ?? ""));
              const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, "(thinking complete)");
              this.messages.push(toolMsg);
              saveMessage(this.sessionId, toolMsg);
              continue;
            }
            if (toolCall.name === "ask_user" && this.options.onAskUser) {
              const answer = await this.options.onAskUser(String(args.question ?? ""));
              const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, answer);
              this.messages.push(toolMsg);
              saveMessage(this.sessionId, toolMsg);
              continue;
            }

            const mcpParsed = parseMCPToolName(toolCall.name);
            let result: string;
            if (mcpParsed) {
              result = await callMCPTool(mcpParsed.serverName, mcpParsed.toolName, args);
            } else {
              result = await this.executeToolWithHooks(toolCall.name, args, this.cwd);
            }
            this.options.onToolResult?.(toolCall.name, result);

            if (this.gitEnabled && this.autoCommitEnabled && ["write_file", "edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
              const path = String(args.path ?? "unknown");
              const committed = autoCommit(this.cwd, path, "write");
              if (committed) {
                this.options.onGitCommit?.(`write ${path}`);
              }
            }

            if (this.autoLintEnabled && this.detectedLinter && ["write_file", "edit_file"].includes(toolCall.name) && result.startsWith("✅")) {
              const filePath = String(args.path ?? "");
              const lintErrors = runLinter(this.detectedLinter, filePath, this.cwd);
              if (lintErrors) {
                this.options.onLintResult?.(filePath, lintErrors);
                const lintMsg: ChatCompletionMessageParam = {
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result + `\n\nLint errors detected in ${filePath}:\n${lintErrors}\nPlease fix these issues.`,
                };
                this.messages.push(lintMsg);
                saveMessage(this.sessionId, lintMsg);
                continue;
              }
            }

            const toolMsg = buildToolResultMessage(toolCall.id, toolCall.name, result);
            this.messages.push(toolMsg);
            saveMessage(this.sessionId, toolMsg);
            this.options.onLoopStatus?.("tool result appended to conversation", {
              iteration: iterations,
              toolName: toolCall.name,
              resultLength: result.length,
            });
          }
        }

        this.options.onLoopStatus?.("opening next model stream", { iteration: iterations + 1 });
      } catch (err: any) {
        // Handle 401 — try refreshing OAuth token before failing
        const is401 = err.status === 401 ||
          (err.message && (err.message.includes("401") || err.message.includes("token_expired") || err.message.includes("token is expired")));

        if (is401) {
          const refreshed = await this.tryRefreshOpenAIToken();
          if (refreshed) {
            // Token refreshed — retry this iteration
            iterations--;
            continue;
          }
          throw new Error("OpenAI OAuth token expired and could not be refreshed. Run /login to re-authenticate.");
        }
        throw err;
      }
    }

    return "Max iterations reached. The agent may be stuck in a loop.";
  }

  /**
   * Switch to a different model mid-session
   */
  /**
   * Get available tools (for UI hints, capabilities display, etc.)
   */
  getTools(): ChatCompletionTool[] {
    return this.tools;
  }

  /**
   * Abort the current generation. Safe to call from any thread.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Check if generation was aborted, and reset the flag.
   */
  isAborted(): boolean {
    return this.aborted;
  }

  private resetAbort(): void {
    this.aborted = false;
  }

  switchModel(model: string, baseUrl?: string, apiKey?: string, providerType?: "openai" | "anthropic"): void {
    this.model = model;
    if (apiKey) this.currentApiKey = apiKey;
    if (baseUrl) this.currentBaseUrl = baseUrl;

    if (providerType) {
      this.providerType = providerType;
      if (providerType === "anthropic") {
        // Always rebuild Anthropic client when switching (token may have changed)
        const key = apiKey || this.currentApiKey || this.options.provider.apiKey;
        if (!key) throw new Error("No API key available for Anthropic");
        this.anthropicClient = createAnthropicClient(key);
      } else {
        this.anthropicClient = null;
      }
    }
    if (baseUrl || apiKey) {
      this.client = new OpenAI({
        baseURL: baseUrl ?? this.currentBaseUrl,
        apiKey: apiKey ?? this.options.provider.apiKey,
      });
    }
    // Re-seed and re-detect for the new model. Static guess updates synchronously
    // so the status bar reflects the change immediately; runtime detection
    // refines it once it returns.
    this.contextWindow = getStaticContextWindow(this.model);
    void this.refreshContextWindow();
  }

  /**
   * Attempt to refresh an expired Anthropic OAuth token.
   * Returns true if refresh succeeded and client was rebuilt.
   */
  private async tryRefreshAnthropicToken(): Promise<boolean> {
    const cred = getCredential("anthropic");
    if (!cred?.refreshToken) return false;

    try {
      const refreshed = await refreshAnthropicOAuthToken(cred.refreshToken);
      // Update stored credential
      cred.apiKey = refreshed.access;
      cred.refreshToken = refreshed.refresh;
      cred.oauthExpires = refreshed.expires;
      saveCredential(cred);
      // Rebuild client with new token
      this.currentApiKey = refreshed.access;
      this.anthropicClient = createAnthropicClient(refreshed.access);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to refresh an expired OpenAI OAuth token.
   * Returns true if refresh succeeded and client was rebuilt.
   */
  private async tryRefreshOpenAIToken(): Promise<boolean> {
    const cred = getCredential("openai");
    if (!cred?.refreshToken) return false;

    try {
      const refreshed = await refreshOpenAICodexToken(cred.refreshToken);
      cred.apiKey = refreshed.access;
      cred.refreshToken = refreshed.refresh;
      cred.oauthExpires = refreshed.expires;
      saveCredential(cred);
      this.currentApiKey = refreshed.access;
      this.client = new OpenAI({
        baseURL: this.currentBaseUrl,
        apiKey: refreshed.access,
      });
      return true;
    } catch {
      return false;
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
   * Force context compression regardless of threshold.
   * Returns { oldTokens, newTokens } or null if nothing to compress.
   */
  async compressContext(): Promise<{ oldTokens: number; newTokens: number } | null> {
    const oldTokens = this.estimateTokens();
    if (this.messages.length <= 11) return null; // system + 10 recent = nothing to compress
    await this.doCompressContext();
    const newTokens = this.estimateTokens();
    return { oldTokens, newTokens };
  }

  /**
   * Check if context needs compression and compress if threshold exceeded
   */
  private async maybeCompressContext(): Promise<void> {
    const currentTokens = this.estimateTokens();
    if (currentTokens < this.compressionThreshold) return;
    await this.doCompressContext();
  }

  private async doCompressContext(): Promise<void> {
    const keepCount = 10;
    if (this.messages.length <= keepCount + 1) return;

    const systemMsg = this.messages[0];
    const middleMessages = this.messages.slice(1, this.messages.length - keepCount);
    const recentMessages = this.messages.slice(this.messages.length - keepCount);

    if (middleMessages.length === 0) return;

    const summaryParts: string[] = [];
    for (const msg of middleMessages) {
      if (msg.role === "user" && typeof msg.content === "string") {
        summaryParts.push(`User: ${msg.content.slice(0, 200)}`);
      } else if (msg.role === "assistant" && typeof msg.content === "string" && msg.content) {
        summaryParts.push(`Assistant: ${msg.content.slice(0, 200)}`);
      }
    }

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

      const oldTokens = this.estimateTokens();
      this.messages = [systemMsg, compressedMsg, ...recentMessages];
      const newTokens = this.estimateTokens();
      this.options.onContextCompressed?.(oldTokens, newTokens);
    } catch {
      const compressedMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: "[Context compressed: Earlier conversation history was removed to stay within token limits.]",
      };
      const oldTokens = this.estimateTokens();
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

  /** Throughput of the most recent assistant completion, or null if not measured yet. */
  getLastTokensPerSecond(): number | null {
    return this.lastTokensPerSecond;
  }

  /**
   * The detected context window for the active model in tokens, or null if
   * neither the static lookup nor runtime detection produced a value.
   * Best-effort: callers should fall back to a sensible default when null.
   */
  getContextWindow(): number | null {
    return this.contextWindow;
  }

  /**
   * True if the active provider is a local inference server (Ollama, LM Studio, llama.cpp, etc).
   * Detected by base URL pointing at loopback / private IPs rather than a public host.
   */
  isLocalProvider(): boolean {
    if (this.providerType === "anthropic") return false;
    try {
      const url = new URL(this.currentBaseUrl);
      const host = url.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
      if (host.endsWith(".local")) return true;
      // Common private network ranges
      if (/^10\./.test(host)) return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Add a file's content as read-only context in the conversation.
   */
  addReadOnlyFile(filePath: string, content: string): void {
    this.messages.push({
      role: "user",
      content: `[Read-only reference file: ${filePath}]\n\`\`\`\n${content}\n\`\`\`\nThis file is provided as read-only context. Do not modify it unless explicitly asked.`,
    });
  }

  setApprovalMode(mode: "suggest" | "auto-edit" | "full-auto"): void {
    this.approvalMode = mode;
    if (mode === "full-auto") {
      this.autoApprove = true;
    } else {
      this.autoApprove = false;
    }
  }

  getApprovalMode(): "suggest" | "auto-edit" | "full-auto" {
    return this.approvalMode;
  }

  /**
   * Check if a tool call needs user approval based on current approval mode.
   */
  private needsApproval(toolName: string): boolean {
    if (this.autoApprove || this.alwaysApproved.has(toolName)) return false;
    if (!DANGEROUS_TOOLS.has(toolName)) return false;
    if (this.approvalMode === "full-auto") return false;
    if (this.approvalMode === "auto-edit" && (toolName === "write_file" || toolName === "edit_file")) return false;
    return true;
  }

  disableSkill(name: string): void {
    this.sessionDisabledSkills.add(name);
  }

  enableSkill(name: string): void {
    this.sessionDisabledSkills.delete(name);
  }

  getSessionDisabledSkills(): Set<string> {
    return this.sessionDisabledSkills;
  }

  getActiveSkillCount(): number {
    return getActiveSkillCount(this.cwd, this.sessionDisabledSkills);
  }

  getCwd(): string {
    return this.cwd;
  }

  /**
   * Switch the agent's working directory mid-session. Tool calls resolve
   * against the new path immediately. Re-detects linter/test runner and
   * git state, reloads project rules for the new directory, and injects
   * a system message into the conversation so the model knows the
   * original system-prompt context (repo map, file tree, old rules) is
   * now stale and to use its tools to explore the new workspace.
   */
  updateCwd(newCwd: string): void {
    this.cwd = newCwd;
    this.gitEnabled = isGitRepo(newCwd);
    this.detectedLinter = detectLinter(newCwd);
    this.detectedTestRunner = detectTestRunner(newCwd);

    // Reload project rules for the new folder
    const rules = loadProjectRules(newCwd);
    this.projectRulesSource = rules?.source ?? null;

    // Peek at the top-level contents so the announcement is useful
    // without paying for a full repo map rebuild.
    let topLevel = "";
    try {
      const IGNORE = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".DS_Store"]);
      const entries = readdirSync(newCwd)
        .filter((e) => !IGNORE.has(e) && !e.startsWith("."))
        .slice(0, 40);
      const lines: string[] = [];
      for (const entry of entries) {
        try {
          const stat = statSync(joinPath(newCwd, entry));
          lines.push(stat.isDirectory() ? `  ${entry}/` : `  ${entry}`);
        } catch {
          // skip
        }
      }
      topLevel = lines.join("\n");
    } catch {
      // ignore — non-fatal
    }

    const parts: string[] = [
      "[WORKSPACE CHANGED]",
      `The user switched the working directory. All future tool calls (read_file, write_file, glob, grep, run_command, etc.) now resolve against this new root instead of the one in your initial system prompt.`,
      `New workspace root: ${newCwd}`,
      `Git: ${this.gitEnabled ? "yes" : "no"}`,
      `Detected linter: ${this.detectedLinter?.name ?? "none"}`,
      `Detected test runner: ${this.detectedTestRunner?.name ?? "none"}`,
    ];
    if (topLevel) {
      parts.push(`\nTop-level entries:\n${topLevel}`);
    }
    parts.push(
      "\nThe repo map, file tree, and project rules from your original system prompt are now STALE — ignore them. Use list_files, glob, and read_file to rebuild your mental model of this new workspace before making changes.",
    );
    if (rules) {
      parts.push(`\n--- New Project Rules (${rules.source}) ---\n${rules.content}\n--- End Project Rules ---`);
    }

    this.messages.push({ role: "system", content: parts.join("\n") });
  }

  getProjectRulesSource(): string | null {
    return this.projectRulesSource;
  }

  setArchitectModel(model: string | null): void {
    this.architectModel = model;
  }

  getArchitectModel(): string | null {
    return this.architectModel;
  }

  setAutoLint(enabled: boolean): void {
    this.autoLintEnabled = enabled;
  }

  isAutoLintEnabled(): boolean {
    return this.autoLintEnabled;
  }

  getDetectedLinter(): { command: string; name: string } | null {
    return this.detectedLinter;
  }

  setDetectedLinter(linter: { command: string; name: string } | null): void {
    this.detectedLinter = linter;
  }

  setAutoTest(enabled: boolean): void {
    this.autoTestEnabled = enabled;
  }

  isAutoTestEnabled(): boolean {
    return this.autoTestEnabled;
  }

  getDetectedTestRunner(): TestRunnerInfo | null {
    return this.detectedTestRunner;
  }

  runProjectTests(): { passed: boolean; output: string } | null {
    if (!this.detectedTestRunner) return null;
    return runTests(this.detectedTestRunner, this.cwd);
  }

  /**
   * Run the architect model to generate a plan, then feed to editor model
   */
  private async architectChat(userMessage: string): Promise<string> {
    const architectSystemPrompt = "You are a senior software architect. Analyze the request and create a detailed implementation plan. List exactly which files to modify, what changes to make, and in what order. Do NOT write code — just plan.";

    let plan = "";

    if (this.providerType === "anthropic" && this.anthropicClient) {
      const response = await this.anthropicClient.messages.create({
        model: this.architectModel!,
        max_tokens: this.maxTokens,
        system: architectSystemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      plan = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const response = await this.client.chat.completions.create({
        model: this.architectModel!,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: architectSystemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      plan = response.choices[0]?.message?.content ?? "(no plan generated)";
    }

    this.options.onArchitectPlan?.(plan);

    // Feed plan + original request to the editor model
    const editorPrompt = `## Architect Plan\n${plan}\n\n## Original Request\n${userMessage}\n\nExecute the plan above. Follow it step by step.`;
    return this.chat(editorPrompt);
  }

  getMCPServerCount(): number {
    return this.mcpServers.length;
  }

  getMCPServers(): ConnectedServer[] {
    return this.mcpServers;
  }

  async disconnectMCP(): Promise<void> {
    await disconnectAll();
    this.mcpServers = [];
    this.tools = FILE_TOOLS;
  }

  async reconnectMCP(): Promise<void> {
    await this.disconnectMCP();
    const mcpConfig = loadMCPConfig(this.cwd);
    if (Object.keys(mcpConfig.mcpServers).length > 0) {
      this.mcpServers = await connectToServers(mcpConfig, this.options.onMCPStatus);
      if (this.mcpServers.length > 0) {
        const mcpTools = getAllMCPTools(this.mcpServers);
        this.tools = [...FILE_TOOLS, ...mcpTools];
      }
    }
  }

  reset(): void {
    const systemMsg = this.messages[0];
    this.messages = [systemMsg];
  }
}
