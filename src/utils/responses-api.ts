/**
 * OpenAI Codex Responses API handler
 *
 * Uses the ChatGPT backend endpoint (https://chatgpt.com/backend-api/codex/responses)
 * which is what Codex CLI, OpenClaw, and other tools use with ChatGPT Plus OAuth tokens.
 *
 * This endpoint supports the Responses API format but is separate from api.openai.com.
 * Standard API keys use api.openai.com/v1/responses; Codex OAuth tokens use this.
 */

export interface ResponsesAPIOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: any[];
  tools: any[];
  onToken?: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
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
    onToken,
    onToolCall,
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
    max_output_tokens: maxTokens,
  };

  if (responseTools.length > 0) {
    body.tools = responseTools;
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
  let currentToolCallId = "";
  let currentToolCallName = "";
  let toolArgumentsBuffer = "";

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
          currentToolCallId = item.id || item.call_id || `tool_${Date.now()}`;
          currentToolCallName = item.name || "";
          toolArgumentsBuffer = "";
        }
      }

      // Function call arguments streaming
      if (eventType === "response.function_call_arguments.delta") {
        const delta = event.delta;
        if (delta) {
          toolArgumentsBuffer += delta;
        }
      }

      // Function call arguments done
      if (eventType === "response.function_call_arguments.done") {
        try {
          const args = JSON.parse(event.arguments || toolArgumentsBuffer);
          toolCalls.push({
            id: currentToolCallId,
            name: currentToolCallName,
            input: args,
          });
          onToolCall?.(currentToolCallName, args);
        } catch {
          // Try buffer if event.arguments isn't set
          try {
            const args = JSON.parse(toolArgumentsBuffer);
            toolCalls.push({
              id: currentToolCallId,
              name: currentToolCallName,
              input: args,
            });
            onToolCall?.(currentToolCallName, args);
          } catch {
            // Skip malformed tool call
          }
        }
        toolArgumentsBuffer = "";
      }

      // Output item done (alternative tool call completion)
      if (eventType === "response.output_item.done") {
        const item = event.item;
        if (item?.type === "function_call" && item.arguments) {
          // Check if we already captured this from arguments.done
          const alreadyCaptured = toolCalls.some(tc => tc.id === (item.id || item.call_id));
          if (!alreadyCaptured) {
            try {
              const args = JSON.parse(item.arguments);
              toolCalls.push({
                id: item.id || item.call_id || currentToolCallId,
                name: item.name || currentToolCallName,
                input: args,
              });
              onToolCall?.(item.name || currentToolCallName, args);
            } catch {
              // Skip
            }
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
export function shouldUseResponsesAPI(model: string): boolean {
  const lower = model.toLowerCase();
  // GPT-5.x and Codex models need Responses API for OAuth tokens
  if (lower.startsWith("gpt-5")) return true;
  if (lower.includes("codex")) return true;
  // o-series reasoning models also work with Responses API
  if (lower === "o3" || lower === "o3-mini" || lower === "o4-mini") return true;
  // gpt-4.1 works on both but Responses API is better for OAuth
  if (lower.startsWith("gpt-4.1")) return true;
  return false;
}
