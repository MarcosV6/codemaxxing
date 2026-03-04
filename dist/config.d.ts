export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}
export interface PierreConfig {
    provider: ProviderConfig;
    defaults: {
        autoApprove: boolean;
        contextFiles: number;
        maxTokens: number;
    };
}
export declare function loadConfig(): PierreConfig;
export declare function getConfigPath(): string;
/**
 * Auto-detect local LLM servers
 */
export declare function detectLocalProvider(): Promise<ProviderConfig | null>;
