/**
 * OpenAI Codex Responses API handler
 *
 * Uses the ChatGPT backend endpoint (https://chatgpt.com/backend-api/codex/responses)
 * which is what Codex CLI, OpenClaw, and other tools use with ChatGPT Plus OAuth tokens.
 *
 * This endpoint supports the Responses API format but is separate from api.openai.com.
 * Standard API keys use api.openai.com/v1/responses; Codex OAuth tokens use this.
 */

import { repairToolArgs } from "./repair-tool-args.js";

export interface ResponsesAPIOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: any[];
  tools: any[];
  reasoningEffort?: "low" | "medium" | "high";
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface PartialToolCall {
  key: string;
  id: string;
  name: string;
  argumentsBuffer: string;
}

function getToolCallKey(event: any, item?: any, fallback?: string | null): string | null {
  if (typeof item?.id === "string" && item.id) return item.id;
  if (typeof event?.item_id === "string" && event.item_id) return event.item_id;
  if (typeof item?.call_id === "string" && item.call_id) return item.call_id;
  if (typeof event?.call_id === "string" && event.call_id) return event.call_id;
  if (typeof event?.output_index === "number") return `output_${event.output_index}`;
  return fallback ?? null;
}

function ensurePartialToolCall(
  partials: Map<string, PartialToolCall>,
  key: string,
  item?: any,
): PartialToolCall {
  const existing = partials.get(key);
  if (existing) {
    if (item?.id) existing.id = item.id;
    if (item?.call_id && !existing.id) existing.id = item.call_id;
    if (item?.name) existing.name = item.name;
    return existing;
  }

  const created: PartialToolCall = {
    key,
    id: item?.id || item?.call_id || key,
    name: item?.name || "",
    argumentsBuffer: "",
  };
  partials.set(key, created);
  return created;
}

/**
 * Execute a chat request using the Codex Responses API endpoint
 * Streams text + handles tool calls
 */
export async function chatWithResponsesAPI(options: ResponsesAPIOptions): Promise<{
  contentText: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
}> {
  const {
    baseUrl,
    apiKey,
    model,
    maxTokens,
    systemPrompt,
    messages,
    tools,
    reasoningEffort,
    onToken,
    signal,
  } = options;

  // Build input items from message history
  const inputItems: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      inputItems.push({
        type: "message",
        role: "user",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) || "",
      });
    } else if (msg.role === "assistant") {
      if ((msg as any).tool_calls?.length > 0) {
        if (msg.content) {
          inputItems.push({
            type: "message",
            role: "assistant",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          });
        }
        for (const tc of (msg as any).tool_calls) {
          inputItems.push({
            type: "function_call",
            id: tc.id,
            call_id: tc.id,
            name: tc.function?.name || tc.name || "",
            arguments: typeof tc.function?.arguments === "string"
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.input || {}),
          });
        }
      } else {
        inputItems.push({
          type: "message",
          role: "assistant",
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) || "",
        });
      }
    } else if (msg.role === "tool") {
      inputItems.push({
        type: "function_call_output",
        call_id: (msg as any).tool_call_id || "",
        output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) || "",
      });
    }
  }

  // Build tools in Responses API format
  const responseTools: any[] = tools
    .filter((t: any) => t.type === "function")
    .map((t: any) => ({
      type: "function" as const,
      name: t.function?.name || "",
      description: t.function?.description || "",
      parameters: t.function?.parameters || { type: "object", properties: {} },
    }));

  // Determine the endpoint URL
  // OAuth tokens (JWTs, not sk- keys) must use ChatGPT backend
  const isOAuthToken = !apiKey.startsWith("sk-") && !apiKey.startsWith("sess-");
  let effectiveBaseUrl = baseUrl;
  if (isOAuthToken && !baseUrl.includes("chatgpt.com")) {
    effectiveBaseUrl = "https://chatgpt.com/backend-api";
  }

  let endpoint: string;
  if (effectiveBaseUrl.includes("chatgpt.com/backend-api")) {
    endpoint = effectiveBaseUrl.replace(/\/$/, "") + "/codex/responses";
  } else {
    endpoint = effectiveBaseUrl.replace(/\/$/, "") + "/responses";
  }

  // Build request body
  const body: any = {
    model,
    instructions: systemPrompt,
    input: inputItems.length > 0 ? inputItems : "",
    stream: true,
    store: false,
  };

  if (responseTools.length > 0) {
    body.tools = responseTools;
  }

  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  // Make the streaming request
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": "codemaxxing/1.0",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Responses API error (${response.status}): ${errText}`);
  }

  // Parse SSE stream
  let contentText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCalls: ToolCall[] = [];
  const partialToolCalls = new Map<string, PartialToolCall>();
  const finalizedToolCallIds = new Set<string>();
  let lastToolCallKey: string | null = null;

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      let event: any;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      const eventType = event.type;

      // Hard errors → throw. But `response.incomplete` is a soft signal — the
      // provider ran out of budget (max_output_tokens, context, rate-limited
      // mid-stream). We want to keep whatever content/tool calls we managed to
      // collect, mark it, and let the caller's loop continue rather than
      // discarding a potentially useful partial response.
      if (
        eventType === "error" ||
        eventType === "response.failed" ||
        eventType === "response.error"
      ) {
        const detail = event.error?.message ?? event.message ?? event.response?.error?.message ?? JSON.stringify(event);
        throw new Error(`Responses API stream error: ${detail}`);
      }
      if (eventType === "response.incomplete") {
        const reason = event.response?.incomplete_details?.reason ?? event.reason ?? "unknown";
        // Append a visible marker to the content so the orchestrator can see
        // this wasn't a clean end. Don't throw.
        contentText += contentText
          ? `\n\n[response incomplete: ${reason}]`
          : `[response incomplete: ${reason}]`;
        // Fall through — stream will end shortly with response.completed or
        // the connection will close.
        continue;
      }

      // Text content delta
      if (eventType === "response.output_text.delta") {
        const delta = event.delta;
        if (delta) {
          contentText += delta;
          onToken?.(delta);
        }
      }

      // Also handle the simpler delta format
      if (eventType === "response.text_delta") {
        const delta = event.delta;
        if (delta) {
          contentText += delta;
          onToken?.(delta);
        }
      }

      // Function call item added
      if (eventType === "response.output_item.added") {
        const item = event.item;
        if (item?.type === "function_call") {
          const key = getToolCallKey(event, item, `tool_${toolCalls.length + partialToolCalls.size}`);
          if (key) {
            ensurePartialToolCall(partialToolCalls, key, item);
            lastToolCallKey = key;
          }
        }
      }

      // Function call arguments streaming
      if (eventType === "response.function_call_arguments.delta") {
        const delta = event.delta;
        if (delta) {
          const key = getToolCallKey(event, undefined, lastToolCallKey);
          if (key) {
            const partial = ensurePartialToolCall(partialToolCalls, key);
            partial.argumentsBuffer += delta;
            lastToolCallKey = key;
          }
        }
      }

      // Function call arguments done
      if (eventType === "response.function_call_arguments.done") {
        const key = getToolCallKey(event, undefined, lastToolCallKey);
        if (key) {
          const partial = ensurePartialToolCall(partialToolCalls, key);
          const rawArgs = typeof event.arguments === "string" && event.arguments
            ? event.arguments
            : partial.argumentsBuffer;

          try {
            // Run through repairToolArgs first — Codex has been observed to
            // truncate the final closing brace when it hits max_output_tokens,
            // and local-model proxies sometimes strip trailing commas.
            const args = JSON.parse(repairToolArgs(rawArgs || "{}") || "{}");
            if (!finalizedToolCallIds.has(partial.id)) {
              toolCalls.push({
                id: partial.id,
                name: partial.name,
                input: args,
              });
              finalizedToolCallIds.add(partial.id);
            }
          } catch {
            // Skip malformed tool call
          } finally {
            partial.argumentsBuffer = "";
            lastToolCallKey = key;
          }
        }
      }

      // Output item done (alternative tool call completion)
      if (eventType === "response.output_item.done") {
        const item = event.item;
        if (item?.type === "function_call" && item.arguments) {
          const key = getToolCallKey(event, item, lastToolCallKey);
          if (key) {
            const partial = ensurePartialToolCall(partialToolCalls, key, item);
            try {
              const args = JSON.parse(repairToolArgs(item.arguments) || "{}");
              if (!finalizedToolCallIds.has(partial.id)) {
                toolCalls.push({
                  id: partial.id,
                  name: partial.name,
                  input: args,
                });
                finalizedToolCallIds.add(partial.id);
              }
            } catch {
              // Skip
            }
            lastToolCallKey = key;
          }
        }
      }

      // Response completed — extract usage
      if (eventType === "response.completed") {
        const resp = event.response;
        const usage = resp?.usage || event.usage;
        if (usage) {
          promptTokens = usage.input_tokens || usage.prompt_tokens || 0;
          completionTokens = usage.output_tokens || usage.completion_tokens || 0;
        }
      }
    }
  }

  return {
    contentText,
    toolCalls,
    promptTokens,
    completionTokens,
  };
}

/**
 * Determine if a model should use the Responses API
 */
export function shouldUseResponsesAPI(model: string, baseUrl?: string): boolean {
  const lower = model.toLowerCase();
  const url = (baseUrl || "").toLowerCase();

  // Only route to Responses API for actual OpenAI / ChatGPT endpoints.
  // Other OpenAI-compatible providers like Copilot, OpenRouter, Qwen, LM Studio,
  // and Ollama may expose /models + /chat/completions but not a compatible
  // /responses implementation.
  const supportsResponsesApi =
    url.includes("chatgpt.com/backend-api") ||
    url.includes("api.openai.com");

  if (!supportsResponsesApi) return false;

  // GPT-5.x and Codex models need Responses API for OAuth tokens
  if (lower.startsWith("gpt-5")) return true;
  if (lower.includes("codex")) return true;
  // o-series reasoning models also work with Responses API
  if (lower === "o3" || lower === "o3-mini" || lower === "o4-mini") return true;
  // gpt-4.1 works on both but Responses API is better for OAuth
  if (lower.startsWith("gpt-4.1")) return true;
  return false;
}
