import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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

const CONFIG_DIR = join(homedir(), ".pierre");
const CONFIG_FILE = join(CONFIG_DIR, "settings.json");

const DEFAULT_CONFIG: PierreConfig = {
  provider: {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "auto",
  },
  defaults: {
    autoApprove: false,
    contextFiles: 20,
    maxTokens: 8192,
  },
};

export function loadConfig(): PierreConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Auto-detect local LLM servers
 */
export async function detectLocalProvider(): Promise<ProviderConfig | null> {
  const endpoints = [
    { name: "LM Studio", url: "http://localhost:1234/v1" },
    { name: "Ollama", url: "http://localhost:11434/v1" },
    { name: "vLLM", url: "http://localhost:8000/v1" },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${endpoint.url}/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        const models = data.data ?? [];
        const model = models[0]?.id ?? "auto";
        return {
          baseUrl: endpoint.url,
          apiKey: "not-needed",
          model,
        };
      }
    } catch {
      // Server not running, try next
    }
  }

  return null;
}
