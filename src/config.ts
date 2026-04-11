import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getCredential } from "./utils/auth.js";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  type?: "openai" | "anthropic";
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
    contextCompressionThreshold?: number;
    architectModel?: string;
    autoLint?: boolean;
    stopOllamaOnExit?: boolean;
    theme?: string;
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
  codemaxxing exec "prompt" [exec-options]

Options:
  -m, --model <model>       Model name to use
  -p, --provider <name>     Provider profile from config (e.g. local, openrouter)
  -k, --api-key <key>       API key for the provider
  -u, --base-url <url>      Base URL for the provider API
  -h, --help                Show this help

Exec options (headless/CI mode):
  --auto-approve            Skip tool approval prompts
  --json                    Output JSON instead of streaming text
  -m, --model <model>       Model to use
  -p, --provider <name>     Provider profile

Examples:
  codemaxxing                                    # Auto-detect local LLM
  codemaxxing -m gpt-4o -u https://api.openai.com/v1 -k sk-...
  codemaxxing -p openrouter                      # Use saved provider profile
  codemaxxing -m qwen3.5-35b                     # Override model only
  codemaxxing exec "fix the failing tests"       # Headless mode
  echo "explain this code" | codemaxxing exec    # Pipe input

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

/** Save config to disk (merges with existing) */
export function saveConfig(updates: Partial<CodemaxxingConfig>): void {
  const current = loadConfig();
  const merged = {
    ...current,
    ...updates,
    defaults: { ...current.defaults, ...(updates.defaults ?? {}) },
  };
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
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
    // Also check auth store for this provider
    const authCred = getCredential(args.provider);
    if (authCred) {
      result.provider.baseUrl = authCred.baseUrl;
      result.provider.apiKey = authCred.apiKey;
    }
    // Detect provider type
    result.provider.type = detectProviderType(args.provider, result.provider.baseUrl);
  }

  // CLI flags override everything
  if (args.model) result.provider.model = args.model;
  if (args.apiKey) result.provider.apiKey = args.apiKey;
  if (args.baseUrl) result.provider.baseUrl = args.baseUrl;

  // Auto-detect type from baseUrl if not set
  if (!result.provider.type && result.provider.baseUrl) {
    result.provider.type = detectProviderType(args.provider || "", result.provider.baseUrl);
  }

  return result;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/** Persist the user's preferred theme. Failures are swallowed — losing the
 *  preference is annoying but never fatal. */
export function saveThemePreference(themeName: string): void {
  try {
    saveConfig({ defaults: { ...loadConfig().defaults, theme: themeName } });
  } catch {
    // ignore — config write is best-effort
  }
}

/**
 * Auto-detect local LLM servers
 */
export type DetectionResult =
  | { status: "connected"; provider: ProviderConfig }
  | { status: "no-models"; serverName: string; baseUrl: string }
  | { status: "no-server" };

export async function detectLocalProviderDetailed(): Promise<DetectionResult> {
  const endpoints = [
    { name: "LM Studio", url: "http://localhost:1234/v1" },
    { name: "Ollama", url: "http://localhost:11434/v1" },
    { name: "vLLM", url: "http://localhost:8000/v1" },
  ];

  let serverFound: { name: string; url: string } | null = null;

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
        if (models.length === 0) {
          // Server is up but no models — remember it but keep looking
          if (!serverFound) serverFound = endpoint;
          continue;
        }
        return {
          status: "connected",
          provider: {
            baseUrl: endpoint.url,
            apiKey: "not-needed",
            model: models[0]!.id,
          },
        };
      }
    } catch {
      // Server not running, try next
    }
  }

  if (serverFound) {
    return { status: "no-models", serverName: serverFound.name, baseUrl: serverFound.url };
  }
  return { status: "no-server" };
}

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
        if (models.length === 0) {
          // Server is up but no models available — don't fake a connection
          continue;
        }
        const model = models[0]!.id;
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
): ProviderConfig | null {
  // Check auth store first
  const authCred = getCredential(providerId);
  if (authCred) {
    return {
      baseUrl: authCred.baseUrl,
      apiKey: authCred.apiKey,
      model: cliArgs.model || "auto",
      type: detectProviderType(providerId, authCred.baseUrl),
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
      type: detectProviderType(providerId, provider.baseUrl),
    };
  }

  return null;
}

/**
 * Detect provider transport type.
 *
 * Important: model family does NOT decide this. OpenRouter, Gemini-compatible,
 * Qwen-compatible, Copilot, LM Studio, Ollama, and custom OpenAI-compatible
 * endpoints should all stay on the OpenAI-compatible transport even when the
 * selected model is Claude.
 */
export function detectProviderType(providerId: string, baseUrl: string): "openai" | "anthropic" {
  const id = providerId.toLowerCase();
  const url = baseUrl.toLowerCase();

  if (id === "anthropic") return "anthropic";

  // Only treat Anthropic's native API as anthropic transport.
  if (url.includes("api.anthropic.com") || url.includes("api.us.anthropic.com")) {
    return "anthropic";
  }

  return "openai";
}
