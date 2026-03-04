import type { ChatCompletionTool } from "openai/resources/chat/completions";
/**
 * Tool definitions for the OpenAI function calling API
 */
export declare const FILE_TOOLS: ChatCompletionTool[];
/**
 * Execute a tool call and return the result
 */
export declare function executeTool(name: string, args: Record<string, unknown>, cwd: string): Promise<string>;
