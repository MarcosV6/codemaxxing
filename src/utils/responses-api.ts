/**
 * OpenAI Responses API handler for GPT-5.4 + Codex OAuth token support
 *
 * The Responses API (/v1/responses) supports Codex OAuth tokens from ChatGPT Plus,
 * enabling GPT-5.4, GPT-5, and other frontier models that Chat Completions API doesn't support.
 *
 * Key differences:
 * - Input: single string or ResponseInput (not messages array)
 * - Output: ResponseStreamEvent types (not ChatCompletionChunk)
 * - Tools: ResponseFunctionToolCall items (not tool_use)
 */

import OpenAI from "openai";
import type { Stream } from "openai/streaming";

export interface ResponsesAPIOptions {
  client: OpenAI;
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
 * Execute a chat request using the Responses API
 * Streams text + handles tool calls similar to Chat Completions
 */
export async function chatWithResponsesAPI(options: ResponsesAPIOptions): Promise<{
  contentText: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
}> {
  const {
    client,
    model,
    maxTokens,
    systemPrompt,
    messages,
    tools,
    onToken,
    onToolCall,
  } = options;

  // Build the instruction (system prompt + context)
  const instruction = systemPrompt;

  // Build input: convert message history to ResponseInput format
  // For stateless operation, we pass the full history as input items
  const inputItems: any[] = [];

  // Add conversation history (skip system messages)
  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      inputItems.push({
        type: "message",
        role: "user",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) || "",
      });
    } else if (msg.role === "assistant") {
      // Handle assistant messages that may contain tool calls
      if ((msg as any).tool_calls?.length > 0) {
        // First add the text content as a message if present
        if (msg.content) {
          inputItems.push({
            type: "message",
            role: "assistant",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          });
        }
        // Then add each tool call as a function_call item
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
      // Tool result → function_call_output
      inputItems.push({
        type: "function_call_output",
        call_id: (msg as any).tool_call_id || "",
        output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) || "",
      });
    }
  }

  // If no input items, use the last message or empty
  const input = inputItems.length > 0 ? inputItems : (messages[messages.length - 1]?.content || "");

  // Build tools for Responses API
  // Convert from Chat Completions format to Responses API format
  const responseTools: any[] = tools
    .filter((t) => t.type === "function")
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.function?.name || "",
        description: t.function?.description || "",
        parameters: t.function?.parameters || { type: "object", properties: {} },
      },
    }));

  // Stream the response
  let contentText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const toolCalls: ToolCall[] = [];
  let currentToolCall: Partial<ToolCall> | null = null;
  let toolArgumentsBuffer = "";

  const stream = await client.responses.create({
    model,
    instructions: instruction,
    input,
    tools: responseTools.length > 0 ? responseTools : undefined,
    stream: true,
    max_output_tokens: maxTokens,
  });

  // Type the stream properly
  const typedStream = stream as any;

  for await (const event of typedStream) {
    // Text delta events
    if (event.type === "response.text_delta") {
      const delta = (event as any).delta;
      if (delta) {
        contentText += delta;
        onToken?.(delta);
      }
    }

    // Tool call start
    if (event.type === "response.function_call_arguments_delta") {
      const delta = (event as any).delta;
      if (delta) {
        toolArgumentsBuffer += delta;
      }
    }

    // Tool call done
    if (event.type === "response.function_call_arguments_done") {
      try {
        const args = JSON.parse(toolArgumentsBuffer);
        if (currentToolCall) {
          currentToolCall.input = args;
        }
        toolArgumentsBuffer = "";
      } catch {
        // Ignore parse errors
      }
    }

    // Function call item added (start of tool call)
    if (event.type === "response.output_item_added") {
      const item = (event as any).item;
      if (item?.type === "function_call") {
        currentToolCall = {
          id: item.id || `tool_${Date.now()}`,
          name: item.name || "",
          input: {},
        };
      }
    }

    // Function call done
    if (event.type === "response.output_item_done") {
      const item = (event as any).item;
      if (item?.type === "function_call" && currentToolCall) {
        toolCalls.push({
          id: currentToolCall.id!,
          name: currentToolCall.name!,
          input: currentToolCall.input || {},
        });
        onToolCall?.(currentToolCall.name!, currentToolCall.input || {});
        currentToolCall = null;
      }
    }

    // Track usage (if available)
    if (event.type === "response.completed") {
      const response = (event as any).response;
      const usage = response?.usage || (event as any).usage;
      if (usage) {
        promptTokens = usage.input_tokens || usage.prompt_tokens || 0;
        completionTokens = usage.output_tokens || usage.completion_tokens || 0;
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
 * Codex models and GPT-5.x work best with Responses API for Codex OAuth tokens
 */
export function shouldUseResponsesAPI(model: string): boolean {
  const responsesModels = [
    "gpt-5",
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5.3-codex",
    "gpt-5-codex",
    "gpt-5.3",
    "gpt-5-mini",
    "gpt-5-nano",
    "o3",
    "o3-mini",
  ];
  return responsesModels.some((m) => model.toLowerCase().includes(m.toLowerCase()));
}
