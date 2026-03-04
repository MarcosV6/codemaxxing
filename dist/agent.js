import OpenAI from "openai";
import { FILE_TOOLS, executeTool } from "./tools/files.js";
import { buildProjectContext, getSystemPrompt } from "./utils/context.js";
export class CodingAgent {
    options;
    client;
    messages = [];
    tools = FILE_TOOLS;
    cwd;
    maxTokens;
    autoApprove;
    model;
    constructor(options) {
        this.options = options;
        this.client = new OpenAI({
            baseURL: options.provider.baseUrl,
            apiKey: options.provider.apiKey,
        });
        this.cwd = options.cwd;
        this.maxTokens = options.maxTokens;
        this.autoApprove = options.autoApprove;
        this.model = options.provider.model;
        // Build initial context
        const context = buildProjectContext(this.cwd);
        const systemPrompt = getSystemPrompt(context);
        this.messages = [
            { role: "system", content: systemPrompt },
        ];
    }
    /**
     * Send a user message and get the agent's response
     * Handles tool calls in a loop until the agent responds with text
     */
    async chat(userMessage) {
        this.messages.push({ role: "user", content: userMessage });
        let iterations = 0;
        const MAX_ITERATIONS = 20;
        while (iterations < MAX_ITERATIONS) {
            iterations++;
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: this.messages,
                tools: this.tools,
                max_tokens: this.maxTokens,
                stream: false,
            });
            const choice = response.choices[0];
            if (!choice)
                return "No response from model.";
            const message = choice.message;
            this.messages.push(message);
            // If no tool calls, return the text response
            if (!message.tool_calls || message.tool_calls.length === 0) {
                return message.content ?? "(empty response)";
            }
            // Process tool calls
            for (const toolCall of message.tool_calls) {
                const name = toolCall.function.name;
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments);
                }
                catch {
                    args = {};
                }
                this.options.onToolCall?.(name, args);
                // Execute the tool
                const result = await executeTool(name, args, this.cwd);
                this.options.onToolResult?.(name, result);
                // Add tool result to messages
                this.messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: result,
                });
            }
            // Continue the loop — model will process tool results and either
            // call more tools or respond with text
        }
        return "Max iterations reached. The agent may be stuck in a loop.";
    }
    /**
     * Get message history length (for context tracking)
     */
    getContextLength() {
        return this.messages.length;
    }
    /**
     * Reset conversation (keep system prompt)
     */
    reset() {
        const systemMsg = this.messages[0];
        this.messages = [systemMsg];
    }
}
