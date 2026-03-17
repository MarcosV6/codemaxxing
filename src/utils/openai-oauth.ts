/**
 * OpenAI Codex OAuth PKCE flow
 *
 * Lets users log in with their ChatGPT Plus/Pro subscription (no API key needed).
 * Uses the same OAuth flow as OpenAI's Codex CLI.
 */

import { createServer } from "http";
import { randomBytes, createHash } from "crypto";
import { exec } from "child_process";
import { readFileSync, readdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { saveCredential, type AuthCredential } from "./auth.js";

// ── Constants ──

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";

// ── PKCE helpers ──

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// ── JWT decode (no verification — just extract payload) ──

function decodeJwtPayload(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
}

// ── Browser opener ──

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

// ── Detect existing OpenClaw auth-profiles ──

export function detectOpenAICodexOAuth(): {
  access: string;
  refresh: string;
  expires: number;
  accountId: string;
} | null {
  const openclawBase = join(homedir(), ".openclaw", "agents");
  if (!existsSync(openclawBase)) return null;

  try {
    const agents = readdirSync(openclawBase);
    for (const agent of agents) {
      const profilePath = join(openclawBase, agent, "agent", "auth-profiles.json");
      if (!existsSync(profilePath)) continue;

      try {
        const data = JSON.parse(readFileSync(profilePath, "utf-8"));
        // auth-profiles.json has { profiles: { "openai-codex:default": { ... }, ... } }
        const profileEntries = data?.profiles ? Object.values(data.profiles) : (Array.isArray(data) ? data : Object.values(data));
        for (const profile of profileEntries) {
          if ((profile as any)?.provider === "openai-codex" && (profile as any).access) {
            const p = profile as any;
            return {
              access: p.access,
              refresh: p.refresh ?? "",
              expires: p.expires ?? 0,
              accountId: p.accountId ?? "",
            };
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ── Token refresh ──

export async function refreshOpenAICodexToken(
  refreshToken: string,
): Promise<{ access: string; refresh: string; expires: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    access: data.access_token,
    refresh: data.refresh_token ?? refreshToken,
    expires: Date.now() + data.expires_in * 1000,
  };
}

// ── Main OAuth login flow ──

export async function loginOpenAICodexOAuth(
  onStatus?: (msg: string) => void,
): Promise<AuthCredential> {
  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Error: No authorization code received</h1><p>Please try again.</p>");
        server.close();
        reject(new Error("No authorization code received"));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Error: State mismatch</h1><p>Please try again.</p>");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      onStatus?.("Exchanging code for tokens...");

      try {
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: REDIRECT_URI,
          }).toString(),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };

        // Extract accountId from JWT
        let accountId = "";
        try {
          const payload = decodeJwtPayload(tokenData.access_token);
          const authClaim = payload["https://api.openai.com/auth"];
          if (authClaim?.chatgpt_account_id) {
            accountId = authClaim.chatgpt_account_id;
          }
        } catch {
          // non-fatal — accountId is optional
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body style="font-family: monospace; background: #1a1a2e; color: #0ff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
              <div style="text-align: center;">
                <h1>Authenticated!</h1>
                <p>You can close this tab and return to Codemaxxing.</p>
              </div>
            </body>
          </html>
        `);

        server.close();

        const expiresAt = Date.now() + tokenData.expires_in * 1000;

        const cred: AuthCredential = {
          provider: "openai",
          method: "oauth",
          apiKey: tokenData.access_token,
          baseUrl: "https://chatgpt.com/backend-api",
          label: "OpenAI (ChatGPT subscription)",
          refreshToken: tokenData.refresh_token,
          oauthExpires: expiresAt,
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
    });

    server.listen(1455, "127.0.0.1", () => {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "codemaxxing",
      });

      const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;

      onStatus?.("Opening browser for ChatGPT login...");

      try {
        openBrowser(authUrl);
      } catch {
        onStatus?.(`Could not open browser. Please visit:\n${authUrl}`);
      }

      onStatus?.("Waiting for authorization...");

      // Timeout after 60 seconds
      setTimeout(() => {
        server.close();
        reject(new Error("OAuth timed out after 60 seconds"));
      }, 60 * 1000);
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error("Port 1455 is already in use. Close other auth flows and try again."));
      } else {
        reject(err);
      }
    });
  });
}
