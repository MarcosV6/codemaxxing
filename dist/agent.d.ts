import type { ProviderConfig } from "./config.js";
export interface AgentOptions {
    provider: ProviderConfig;
    cwd: string;
    maxTokens: number;
    autoApprove: boolean;
    onToken?: (token: string) => void;
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    onToolResult?: (name: string, result: string) => void;
}
export declare class CodingAgent {
    private options;
    private client;
    private messages;
    private tools;
    private cwd;
    private maxTokens;
    private autoApprove;
    private model;
    constructor(options: AgentOptions);
    /**
     * Send a user message and get the agent's response
     * Handles tool calls in a loop until the agent responds with text
     */
    chat(userMessage: string): Promise<string>;
    /**
     * Get message history length (for context tracking)
     */
    getContextLength(): number;
    /**
     * Reset conversation (keep system prompt)
     */
    reset(): void;
}
