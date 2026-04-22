/**
 * Auth management for Codemaxxing
 *
 * Supports:
 * - OpenRouter OAuth PKCE (browser login, no API key needed)
 * - Anthropic setup-token (via Claude Code CLI)
 * - OpenAI/ChatGPT (via Codex CLI cached token)
 * - Qwen (via API key)
 * - Manual API key entry (any provider)
 *
 * Credentials stored in ~/.codemaxxing/auth.json with 0o600 permissions.
 */

import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { randomBytes, createHash } from "crypto";
import { execSync, exec, execFile } from "child_process";
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
    methods: ["oauth", "api-key"],
    baseUrl: "https://api.anthropic.com",
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
    methods: ["api-key"],
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    consoleUrl: "https://dashscope.console.aliyun.com/apiKey",
    description: "Qwen 3.5, Qwen Coder — use your DashScope API key",
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
  } catch (err: any) {
    process.stderr.write(`Warning: Failed to load auth store (${err instanceof Error ? err.message : String(err)}). Starting with empty credentials.\n`);
    return { version: 1, credentials: [] };
  }
}

function saveAuthStore(store: AuthStore): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  // Atomic write: write to tmp with mode 0600, chmod, then rename. If we crash
  // mid-write the original auth.json stays intact instead of being truncated.
  const tmp = `${AUTH_FILE}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    try { chmodSync(tmp, 0o600); } catch { /* Windows */ }
    renameSync(tmp, AUTH_FILE);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* best-effort */ }
    throw err;
  }
  try { chmodSync(AUTH_FILE, 0o600); } catch { /* Windows */ }
}

/**
 * Strip sensitive substrings (API keys, refresh tokens, access tokens) from a
 * message before showing it to the user or logging it. Used to scrub provider
 * error responses that often echo the request payload verbatim.
 */
export function scrubSecrets(msg: string): string {
  if (!msg) return msg;
  let out = msg;
  try {
    const store = loadAuthStore();
    for (const c of store.credentials) {
      if (c.apiKey && c.apiKey.length >= 8) out = out.split(c.apiKey).join("[REDACTED]");
      if (c.refreshToken && c.refreshToken.length >= 8) out = out.split(c.refreshToken).join("[REDACTED]");
    }
  } catch { /* ignore — scrubbing is best-effort */ }
  // Also scrub common bearer-token shapes in case the caller has a fresh token
  // that hasn't been persisted yet.
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/g, "Bearer [REDACTED]");
  out = out.replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[REDACTED]");
  out = out.replace(/ghp_[A-Za-z0-9]{20,}/g, "ghp_[REDACTED]");
  out = out.replace(/gho_[A-Za-z0-9]{20,}/g, "gho_[REDACTED]");
  return out;
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
    let handled = false; // Guard against duplicate callbacks
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const renderBridgePage = () => `
      <html>
        <body style="font-family: monospace; background: #1a1a2e; color: #0ff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center; max-width: 40rem; padding: 2rem;">
            <h1>Waiting for OpenRouter…</h1>
            <p id="status">Finishing authorization…</p>
          </div>
          <script>
            (() => {
              const params = new URLSearchParams(window.location.search);
              const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
              const code = params.get("code") || hash.get("code");
              const error = params.get("error") || hash.get("error");
              const errorDescription = params.get("error_description") || hash.get("error_description");
              if (code || error) {
                const next = new URL("/callback/complete", window.location.origin);
                if (code) next.searchParams.set("code", code);
                if (error) next.searchParams.set("error", error);
                if (errorDescription) next.searchParams.set("error_description", errorDescription);
                window.location.replace(next.toString());
                return;
              }
              document.getElementById("status").textContent = "No authorization code was visible yet. If this page does not continue automatically, try the login again.";
            })();
          </script>
        </body>
      </html>
    `;

    const finishAuth = async (code: string | null, error: string | null, errorDescription: string | null, res: ServerResponse) => {
      if (handled) {
        res.writeHead(409, { "Content-Type": "text/html" });
        res.end("<h1>Authorization already handled</h1><p>You can close this tab.</p>");
        return;
      }

      if (error) {
        handled = true;
        const message = errorDescription || error;
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Error</h1><p>${message}</p>`);
        if (timeoutId) clearTimeout(timeoutId);
        server.close();
        reject(new Error(message));
        return;
      }

      if (!code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(renderBridgePage());
        return;
      }

      handled = true;
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
          if (exchangeRes.status === 409) {
            throw new Error(`OpenRouter returned 409 (Conflict) — this usually means the auth code was already used. Please try /login again.`);
          }
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

        if (timeoutId) clearTimeout(timeoutId);
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
        if (timeoutId) clearTimeout(timeoutId);
        server.close();
        reject(err);
      }
    };

    // Start local callback server
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost`);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      if (pathname === "/callback" || pathname === "/callback/complete") {
        await finishAuth(
          url.searchParams.get("code"),
          url.searchParams.get("error"),
          url.searchParams.get("error_description"),
          res,
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>Not found</h1>");
    });

    // Handle server errors (port conflict, etc.) instead of crashing
    server.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(new Error(`OAuth callback server failed: ${err.message}`));
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
      const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callbackUrl)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;

      onStatus?.(`Opening browser for OpenRouter login...`);

      // Open browser
      try {
        const opener = process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
        const openerArgs = process.platform === "win32"
          ? ["/c", "start", "", authUrl]
          : [authUrl];
        execFile(opener, openerArgs, () => {});
      } catch {
        onStatus?.(`Could not open browser. Please visit:\n${authUrl}`);
      }

      onStatus?.("Waiting for authorization...");

      // Timeout after 5 minutes
      timeoutId = setTimeout(() => {
        if (!handled) {
          server.close();
          reject(new Error("OAuth timed out after 5 minutes"));
        }
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

  // Codex CLI v0.18+ stores tokens in macOS Keychain. Queries run sequentially
  // because `security` may prompt — but with a tight 1s timeout each so a
  // misconfigured keychain doesn't block startup for 12s.
  if (process.platform === "darwin") {
    const keychainQueries = [
      ["security", "find-generic-password", "-s", "codex", "-w"],
      ["security", "find-generic-password", "-a", "openai", "-s", "codex", "-w"],
      ["security", "find-generic-password", "-s", "openai-codex", "-w"],
      ["security", "find-generic-password", "-l", "codex", "-w"],
    ];
    for (const args of keychainQueries) {
      try {
        const token = execSync(args.join(" "), { stdio: "pipe", timeout: 1000 }).toString().trim();
        if (token) return token;
      } catch {
        continue;
      }
    }
  }

  // Final fallback: env var, but ONLY if it looks like a Codex JWT.
  // A regular sk-* key would otherwise get imported with the chatgpt.com base URL
  // and fail every request.
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey.startsWith("eyJ")) return envKey;

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
