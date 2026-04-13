import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithResponsesAPI } from "../src/utils/responses-api.js";

function sseResponse(events: unknown[]): Response {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("chatWithResponsesAPI", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps interleaved tool calls associated with the right function", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      sseResponse([
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "read_file" },
        },
        {
          type: "response.output_item.added",
          output_index: 1,
          item: { type: "function_call", id: "fc_2", call_id: "call_2", name: "glob" },
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 0,
          item_id: "fc_1",
          delta: "{\"path\":\"src/index.tsx\"}",
        },
        {
          type: "response.function_call_arguments.delta",
          output_index: 1,
          item_id: "fc_2",
          delta: "{\"pattern\":\"src/**/*.ts\"}",
        },
        {
          type: "response.function_call_arguments.done",
          output_index: 1,
          item_id: "fc_2",
          arguments: "{\"pattern\":\"src/**/*.ts\"}",
        },
        {
          type: "response.function_call_arguments.done",
          output_index: 0,
          item_id: "fc_1",
          arguments: "{\"path\":\"src/index.tsx\"}",
        },
        {
          type: "response.completed",
          response: { usage: { input_tokens: 12, output_tokens: 7 } },
        },
      ]),
    ));

    const result = await chatWithResponsesAPI({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.4",
      maxTokens: 1024,
      systemPrompt: "test",
      messages: [],
      tools: [],
    });

    expect(result.toolCalls).toEqual([
      { id: "fc_2", name: "glob", input: { pattern: "src/**/*.ts" } },
      { id: "fc_1", name: "read_file", input: { path: "src/index.tsx" } },
    ]);
    expect(result.promptTokens).toBe(12);
    expect(result.completionTokens).toBe(7);
  });
});
