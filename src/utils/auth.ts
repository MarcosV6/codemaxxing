/**
 * Auth management for Codemaxxing
 *
 * Supports:
 * - OpenRouter OAuth PKCE (browser login, no API key needed)
 * - Anthropic setup-token (via Claude Code CLI)
 * - OpenAI/ChatGPT (via Codex CLI cached token)
 * - Qwen (via Qwen CLI cached credentials)
 * - GitHub Copilot (device flow)
 * - Manual API key entry (any provider)
 *
 * Credentials stored in ~/.codemaxxing/auth.json with 0o600 permissions.
 */

import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes, createHash } from "crypto";
import { execSync, exec } from "child_process";
import { detectOpenAICodexOAuth } from "./openai-oauth.js";

// ── Types ──

export interface AuthCredential {
  provider: string;
  method: "api-key" | "oauth" | "setup-token" | "cached-token";
  apiKey: string;
  baseUrl: string;
  label?: string; // Human-readable label (e.g. "OpenRouter (OAuth)", "Anthropic (Max subscription)")
  expiresAt?: string; // ISO date string, if applicable
  refreshToken?: string; // OAuth refresh token (e.g. OpenAI Codex OAuth)
  oauthExpires?: number; // OAuth token expiry timestamp in ms
  createdAt: string;
}

interface AuthStore {
  version: 1;
  credentials: AuthCredential[];
}

// ── Paths ──

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");

// ── Provider Definitions ──

export interface ProviderDef {
  id: string;
  name: string;
  methods: string[];
  baseUrl: string;
  consoleUrl?: string; // Where to get an API key
  description: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    methods: ["oauth", "api-key"],
    baseUrl: "https://openrouter.ai/api/v1",
    consoleUrl: "https://openrouter.ai/keys",
    description: "200+ models (Claude, GPT, Gemini, Llama, etc.) — one login",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    methods: ["setup-token", "api-key"],
    baseUrl: "https://api.anthropic.com/v1",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    description: "Claude Opus, Sonnet, Haiku — use your subscription or API key",
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    methods: ["oauth", "api-key"],
    baseUrl: "https://api.openai.com/v1",
    consoleUrl: "https://platform.openai.com/api-keys",
    description: "GPT-4o, GPT-5, o1 — use your ChatGPT subscription or API key",
  },
  {
    id: "qwen",
    name: "Qwen",
    methods: ["cached-token", "api-key"],
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    consoleUrl: "https://dashscope.console.aliyun.com/apiKey",
    description: "Qwen 3.5, Qwen Coder — use your Qwen CLI login or API key",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    methods: ["api-key"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    consoleUrl: "https://aistudio.google.com/apikey",
    description: "Gemini 2.5, Gemini Flash",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    methods: ["device-flow"],
    baseUrl: "https://api.githubcopilot.com",
    description: "Use your GitHub Copilot subscription",
  },
  {
    id: "local",
    name: "Local (LM Studio / Ollama)",
    methods: ["none"],
    baseUrl: "http://localhost:1234/v1",
    description: "No auth needed — auto-detected",
  },
  {
    id: "custom",
    name: "Custom Provider",
    methods: ["api-key"],
    baseUrl: "",
    description: "Any OpenAI-compatible API endpoint",
  },
];

// ── Auth Store ──

function loadAuthStore(): AuthStore {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!existsSync(AUTH_FILE)) {
    return { version: 1, credentials: [] };
  }

  try {
    const raw = readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, credentials: [] };
  }
}

function saveAuthStore(store: AuthStore): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  try {
    chmodSync(AUTH_FILE, 0o600);
  } catch {
    // Windows doesn't support chmod — ignore
  }
}

export function getCredentials(): AuthCredential[] {
  return loadAuthStore().credentials;
}

export function getCredential(providerId: string): AuthCredential | undefined {
  return loadAuthStore().credentials.find((c) => c.provider === providerId);
}

export function saveCredential(cred: AuthCredential): void {
  const store = loadAuthStore();
  // Replace existing credential for this provider, or add new
  const idx = store.credentials.findIndex((c) => c.provider === cred.provider);
  if (idx >= 0) {
    store.credentials[idx] = cred;
  } else {
    store.credentials.push(cred);
  }
  saveAuthStore(store);
}

export function removeCredential(providerId: string): boolean {
  const store = loadAuthStore();
  const before = store.credentials.length;
  store.credentials = store.credentials.filter((c) => c.provider !== providerId);
  if (store.credentials.length < before) {
    saveAuthStore(store);
    return true;
  }
  return false;
}

// ── OpenRouter OAuth PKCE ──

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function openRouterOAuth(onStatus?: (msg: string) => void): Promise<AuthCredential> {
  const { verifier, challenge } = generatePKCE();

  return new Promise((resolve, reject) => {
    // Start local callback server
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>Error: No code received</h1><p>Please try again.</p>");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }

        // Exchange code for API key
        onStatus?.("Exchanging code for API key...");

        try {
          const exchangeRes = await fetch("https://openrouter.ai/api/v1/auth/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              code_verifier: verifier,
              code_challenge_method: "S256",
            }),
          });

          if (!exchangeRes.ok) {
            const errText = await exchangeRes.text();
            throw new Error(`Exchange failed (${exchangeRes.status}): ${errText}`);
          }

          const data = (await exchangeRes.json()) as { key: string };

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: monospace; background: #1a1a2e; color: #0ff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1>💪 Authenticated!</h1>
                  <p>You can close this tab and return to Codemaxxing.</p>
                </div>
              </body>
            </html>
          `);

          server.close();

          const cred: AuthCredential = {
            provider: "openrouter",
            method: "oauth",
            apiKey: data.key,
            baseUrl: "https://openrouter.ai/api/v1",
            label: "OpenRouter (OAuth)",
            createdAt: new Date().toISOString(),
          };

          saveCredential(cred);
          resolve(cred);
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${err.message}</p>`);
          server.close();
          reject(err);
        }
      }
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start callback server"));
        return;
      }

      const port = addr.port;
      const callbackUrl = `http://localhost:${port}/callback`;
      const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${challenge}&code_challenge_method=S256`;

      onStatus?.(`Opening browser for OpenRouter login...`);

      // Open browser
      try {
        const cmd = process.platform === "darwin"
          ? `open "${authUrl}"`
          : process.platform === "win32"
          ? `start "" "${authUrl}"`
          : `xdg-open "${authUrl}"`;
        exec(cmd);
      } catch {
        onStatus?.(`Could not open browser. Please visit:\n${authUrl}`);
      }

      onStatus?.("Waiting for authorization...");

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("OAuth timed out after 5 minutes"));
      }, 5 * 60 * 1000);
    });
  });
}

// ── Anthropic Setup Token (via Claude Code CLI) ──

export function detectClaudeCLI(): boolean {
  try {
    execSync("which claude 2>/dev/null || where claude 2>nul", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function anthropicSetupToken(onStatus?: (msg: string) => void): Promise<AuthCredential> {
  if (!detectClaudeCLI()) {
    throw new Error(
      "Claude Code CLI not found.\n" +
      "Install it first: curl -fsSL https://claude.ai/install.sh | bash\n" +
      "Then run: claude setup-token"
    );
  }

  onStatus?.("Running 'claude setup-token'...");
  onStatus?.("A browser window will open — log in with your Anthropic account.");

  return new Promise((resolve, reject) => {
    const child = exec("claude setup-token", { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`setup-token failed: ${stderr || err.message}`));
        return;
      }

      // The output should contain the token
      const token = stdout.trim();
      if (!token) {
        reject(new Error("No token received from claude setup-token"));
        return;
      }

      const cred: AuthCredential = {
        provider: "anthropic",
        method: "setup-token",
        apiKey: token,
        baseUrl: "https://api.anthropic.com/v1",
        label: "Anthropic (Claude subscription)",
        createdAt: new Date().toISOString(),
      };

      saveCredential(cred);
      resolve(cred);
    });

    // Forward stdout in real-time for the interactive flow
    child.stdout?.on("data", (data) => {
      const text = data.toString().trim();
      if (text) onStatus?.(text);
    });
  });
}

// ── OpenAI / Codex CLI Cached Token ──

export function detectCodexToken(): string | null {
  // Check OpenClaw auth-profiles first (for Codex OAuth tokens)
  try {
    const oauthCreds = detectOpenAICodexOAuth();
    if (oauthCreds?.access) {
      return oauthCreds.access;
    }
  } catch {
    // detection failed, fall through
  }

  // Codex CLI stores OAuth tokens — check common locations
  const locations = [
    join(homedir(), ".codex", "auth.json"),
    join(homedir(), ".config", "codex", "auth.json"),
    join(homedir(), ".codex-cli", "auth.json"),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      try {
        const data = JSON.parse(readFileSync(loc, "utf-8"));
        // Look for an API key or access token
        if (data.api_key) return data.api_key;
        if (data.access_token) return data.access_token;
        if (data.token) return data.token;
      } catch {
        continue;
      }
    }
  }

  // Codex CLI v0.18+ stores tokens in macOS Keychain
  if (process.platform === "darwin") {
    const keychainQueries = [
      ["security", "find-generic-password", "-s", "codex", "-w"],
      ["security", "find-generic-password", "-a", "openai", "-s", "codex", "-w"],
      ["security", "find-generic-password", "-s", "openai-codex", "-w"],
      ["security", "find-generic-password", "-l", "codex", "-w"],
    ];
    for (const args of keychainQueries) {
      try {
        const token = execSync(args.join(" "), { stdio: "pipe", timeout: 3000 }).toString().trim();
        if (token) return token;
      } catch {
        continue;
      }
    }
  }

  // Final fallback: environment variable
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  return null;
}

export function importCodexToken(onStatus?: (msg: string) => void): AuthCredential | null {
  const token = detectCodexToken();
  if (!token) return null;

  onStatus?.("Found existing Codex CLI credentials — importing...");

  const cred: AuthCredential = {
    provider: "openai",
    method: "cached-token",
    apiKey: token,
    baseUrl: "https://api.openai.com/v1",
    label: "OpenAI (from Codex CLI)",
    createdAt: new Date().toISOString(),
  };

  saveCredential(cred);
  return cred;
}

// ── Qwen CLI Cached Credentials ──

export function detectQwenToken(): string | null {
  const qwenAuth = join(homedir(), ".qwen", "oauth_creds.json");
  if (existsSync(qwenAuth)) {
    try {
      const data = JSON.parse(readFileSync(qwenAuth, "utf-8"));
      if (data.access_token) return data.access_token;
      if (data.token) return data.token;
      if (data.api_key) return data.api_key;
    } catch {
      // ignore
    }
  }
  return null;
}

export function importQwenToken(onStatus?: (msg: string) => void): AuthCredential | null {
  const token = detectQwenToken();
  if (!token) return null;

  onStatus?.("Found existing Qwen CLI credentials — importing...");

  const cred: AuthCredential = {
    provider: "qwen",
    method: "cached-token",
    apiKey: token,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    label: "Qwen (from Qwen CLI)",
    createdAt: new Date().toISOString(),
  };

  saveCredential(cred);
  return cred;
}

// ── GitHub Copilot Device Flow ──

export async function copilotDeviceFlow(onStatus?: (msg: string) => void): Promise<AuthCredential> {
  // Step 1: Request device code
  onStatus?.("Starting GitHub Copilot device flow...");

  const deviceRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      client_id: "Iv1.b507a08c87ecfe98", // GitHub Copilot's public client_id
      scope: "copilot",
    }),
  });

  if (!deviceRes.ok) {
    throw new Error(`Device code request failed: ${deviceRes.status}`);
  }

  const deviceData = (await deviceRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  onStatus?.(`\nGo to: ${deviceData.verification_uri}`);
  onStatus?.(`Enter code: ${deviceData.user_code}\n`);

  // Try to open browser
  try {
    const cmd = process.platform === "darwin"
      ? `open "${deviceData.verification_uri}"`
      : process.platform === "win32"
      ? `start "" "${deviceData.verification_uri}"`
      : `xdg-open "${deviceData.verification_uri}"`;
    exec(cmd);
  } catch { /* ignore */ }

  // Step 2: Poll for token
  const interval = (deviceData.interval || 5) * 1000;
  const expiresAt = Date.now() + deviceData.expires_in * 1000;

  onStatus?.("Waiting for authorization...");

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: "Iv1.b507a08c87ecfe98",
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      const cred: AuthCredential = {
        provider: "copilot",
        method: "oauth",
        apiKey: tokenData.access_token,
        baseUrl: "https://api.githubcopilot.com",
        label: "GitHub Copilot",
        createdAt: new Date().toISOString(),
      };

      saveCredential(cred);
      return cred;
    }

    if (tokenData.error === "authorization_pending") {
      continue;
    }

    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    throw new Error(`Authorization failed: ${tokenData.error}`);
  }

  throw new Error("Device flow timed out");
}

// ── Manual API Key ──

export function saveApiKey(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  label?: string,
): AuthCredential {
  const providerDef = PROVIDERS.find((p) => p.id === providerId);

  const cred: AuthCredential = {
    provider: providerId,
    method: "api-key",
    apiKey,
    baseUrl: baseUrl ?? providerDef?.baseUrl ?? "",
    label: label ?? providerDef?.name ?? providerId,
    createdAt: new Date().toISOString(),
  };

  saveCredential(cred);
  return cred;
}

// ── Auto-Detection ──

/**
 * Check which provider CLIs / cached tokens are available on this machine
 */
export function detectAvailableAuth(): Array<{ provider: string; method: string; description: string }> {
  const available: Array<{ provider: string; method: string; description: string }> = [];

  if (detectClaudeCLI()) {
    available.push({
      provider: "anthropic",
      method: "setup-token",
      description: "Claude Code CLI detected — can link your Anthropic subscription",
    });
  }

  // OpenAI: always offer OAuth login, and note if cached tokens exist
  available.push({
    provider: "openai",
    method: "oauth",
    description: "Log in with your ChatGPT subscription (browser OAuth)",
  });

  if (detectCodexToken()) {
    available.push({
      provider: "openai",
      method: "cached-token",
      description: "Codex CLI credentials found — can import your ChatGPT subscription",
    });
  }

  if (detectQwenToken()) {
    available.push({
      provider: "qwen",
      method: "cached-token",
      description: "Qwen CLI credentials found — can import your Qwen access",
    });
  }

  return available;
}

/**
 * Resolve provider config: check auth store first, then fall back to config
 */
export function resolveProviderAuth(providerId: string): { apiKey: string; baseUrl: string } | null {
  const cred = getCredential(providerId);
  if (cred) {
    return { apiKey: cred.apiKey, baseUrl: cred.baseUrl };
  }
  return null;
}
