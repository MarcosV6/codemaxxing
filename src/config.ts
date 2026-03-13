import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getCredential, type AuthCredential } from "./utils/auth.js";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderProfile extends ProviderConfig {
  name: string;
}

export interface CodemaxxingConfig {
  provider: ProviderConfig;
  providers?: Record<string, ProviderProfile>;
  defaults: {
    autoApprove: boolean;
    contextFiles: number;
    maxTokens: number;
  };
}

export interface CLIArgs {
  model?: string;
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const CONFIG_FILE = join(CONFIG_DIR, "settings.json");

const DEFAULT_CONFIG: CodemaxxingConfig = {
  provider: {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "auto",
  },
  providers: {
    local: {
      name: "Local (LM Studio/Ollama)",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "not-needed",
      model: "auto",
    },
  },
  defaults: {
    autoApprove: false,
    contextFiles: 20,
    maxTokens: 8192,
  },
};

/**
 * Parse CLI arguments
 */
export function parseCLIArgs(): CLIArgs {
  const args: CLIArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === "--model" || arg === "-m") && next) {
      args.model = next;
      i++;
    } else if ((arg === "--provider" || arg === "-p") && next) {
      args.provider = next;
      i++;
    } else if ((arg === "--api-key" || arg === "-k") && next) {
      args.apiKey = next;
      i++;
    } else if ((arg === "--base-url" || arg === "-u") && next) {
      args.baseUrl = next;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
codemaxxing — your code. your model. no excuses.

Usage:
  codemaxxing [options]

Options:
  -m, --model <model>       Model name to use
  -p, --provider <name>     Provider profile from config (e.g. local, openrouter)
  -k, --api-key <key>       API key for the provider
  -u, --base-url <url>      Base URL for the provider API
  -h, --help                Show this help

Examples:
  codemaxxing                                    # Auto-detect local LLM
  codemaxxing -m gpt-4o -u https://api.openai.com/v1 -k sk-...
  codemaxxing -p openrouter                      # Use saved provider profile
  codemaxxing -m qwen3.5-35b                     # Override model only

Config: ~/.codemaxxing/settings.json
`);
      process.exit(0);
    }
  }

  return args;
}

export function loadConfig(): CodemaxxingConfig {
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

/**
 * Apply CLI overrides to a provider config
 */
export function applyOverrides(config: CodemaxxingConfig, args: CLIArgs): CodemaxxingConfig {
  const result = { ...config, provider: { ...config.provider } };

  // If a named provider profile is specified, use it as the base
  if (args.provider && config.providers?.[args.provider]) {
    const profile = config.providers[args.provider];
    result.provider = { ...profile };
  }

  // CLI flags override everything
  if (args.model) result.provider.model = args.model;
  if (args.apiKey) result.provider.apiKey = args.apiKey;
  if (args.baseUrl) result.provider.baseUrl = args.baseUrl;

  return result;
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

/**
 * List available models from a provider endpoint
 */
export async function listModels(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const headers: Record<string, string> = {};
    if (apiKey && apiKey !== "not-needed") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return (data.data ?? []).map(m => m.id);
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Resolve provider configuration from auth store or config file
 * Priority: CLI args > auth store > config file > auto-detect
 */
export function resolveProvider(
  providerId: string,
  cliArgs: CLIArgs
): { baseUrl: string; apiKey: string; model: string } | null {
  // Check auth store first
  const authCred = getCredential(providerId);
  if (authCred) {
    return {
      baseUrl: authCred.baseUrl,
      apiKey: authCred.apiKey,
      model: cliArgs.model || "auto",
    };
  }

  // Fall back to config file
  const config = loadConfig();
  const provider = config.providers?.[providerId];
  if (provider) {
    return {
      baseUrl: provider.baseUrl,
      apiKey: cliArgs.apiKey || provider.apiKey,
      model: cliArgs.model || provider.model,
    };
  }

  return null;
}
