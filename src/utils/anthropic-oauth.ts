/**
 * Anthropic OAuth PKCE flow
 *
 * Lets users log in with their Claude Pro/Max subscription (no API key needed).
 * Uses the same OAuth flow as Claude Code CLI.
 */

import { createServer } from "http";
import { randomBytes, createHash } from "crypto";
import { execFile } from "child_process";
import { saveCredential, type AuthCredential } from "./auth.js";

// ── Constants ──

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

// ── PKCE helpers ──

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

// ── Browser opener ──

function openBrowser(url: string): void {
  const opener = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];
  execFile(opener, args, () => {});
}

// ── Token refresh ──

export async function refreshAnthropicOAuthToken(
  refreshToken: string,
): Promise<{ access: string; refresh: string; expires: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
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

export async function loginAnthropicOAuth(
  onStatus?: (msg: string) => void,
): Promise<AuthCredential> {
  const { verifier, challenge } = generatePKCE();

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    const cleanup = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } };
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<h1>Error: No authorization code received</h1><p>Please try again.</p>",
        );
        cleanup();
        server.close();
        reject(new Error("No authorization code received"));
        return;
      }

      // state should match verifier
      if (returnedState !== verifier) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Error: State mismatch</h1><p>Please try again.</p>");
        cleanup();
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      onStatus?.("Exchanging code for tokens...");

      try {
        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            state: verifier,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          throw new Error(
            `Token exchange failed (${tokenRes.status}): ${errText}`,
          );
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body style=\"font-family:monospace;background:#1a1a2e;color:#0ff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h1>Authenticated!</h1><p>You can close this tab and return to Codemaxxing.</p></div></body></html>",
        );

        server.close();

        const expiresAt = Date.now() + tokenData.expires_in * 1000;

        const cred: AuthCredential = {
          provider: "anthropic",
          method: "oauth",
          apiKey: tokenData.access_token,
          baseUrl: "https://api.anthropic.com",
          label: "Anthropic (Claude Pro/Max)",
          refreshToken: tokenData.refresh_token,
          oauthExpires: expiresAt,
          createdAt: new Date().toISOString(),
        };

        saveCredential(cred);
        cleanup();
        resolve(cred);
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Error</h1><p>${err.message}</p>`);
        cleanup();
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      const params = new URLSearchParams({
        code: "true",
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: verifier,
      });

      const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;

      onStatus?.("Opening browser for Claude login...");

      try {
        openBrowser(authUrl);
      } catch {
        onStatus?.(`Could not open browser. Please visit:\n${authUrl}`);
      }

      onStatus?.("Waiting for authorization...");

      // Timeout after 120 seconds
      timeoutId = setTimeout(() => {
        timeoutId = null;
        server.close();
        reject(new Error("OAuth timed out after 120 seconds"));
      }, 120 * 1000);
    });

    server.on("error", (err: any) => {
      cleanup();
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${CALLBACK_PORT} is already in use. Close other auth flows and try again.`,
          ),
        );
      } else {
        reject(err);
      }
    });
  });
}
