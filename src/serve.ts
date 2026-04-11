/**
 * Codemaxxing HTTP Server Mode
 *
 * Exposes the coding agent over HTTP with SSE streaming.
 * External agents (OpenClaw, Hermes, etc.) can connect and use codemaxxing
 * as a tool-using coding backend.
 *
 * Usage: codemaxxing serve [--port 3141] [--model <model>] [--auto-approve]
 *
 * Endpoints:
 *   POST /v1/chat     — Send a message, get SSE-streamed response
 *   POST /v1/exec     — One-shot prompt, returns full response as JSON
 *   GET  /v1/tools    — List available tools
 *   GET  /v1/status   — Server status and model info
 *   POST /v1/abort    — Abort current generation
 *   POST /v1/reset    — Reset conversation
 *   POST /v1/compact  — Compress context
 *   GET  /v1/cost     — Get session cost info
 *   GET  /health      — Health check
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { CodingAgent, type AgentOptions } from "./core/agent.js";
import { loadConfig, applyOverrides, detectLocalProvider } from "./config.js";
import { getCredential } from "./utils/auth.js";
import { disconnectAll } from "./bridge/mcp.js";

interface ServeArgs {
  port: number;
  autoApprove: boolean;
  model?: string;
  provider?: string;
  cors: boolean;
}

function parseServeArgs(argv: string[]): ServeArgs {
  const args: ServeArgs = {
    port: 3141,
    autoApprove: false,
    cors: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--port" || arg === "-p") && next) { args.port = parseInt(next, 10); i++; }
    else if (arg === "--auto-approve") { args.autoApprove = true; }
    else if (arg === "--no-cors") { args.cors = false; }
    else if ((arg === "--model" || arg === "-m") && next) { args.model = next; i++; }
    else if (arg === "--provider") { args.provider = next; i++; }
  }

  return args;
}

function setCors(res: ServerResponse, cors: boolean): void {
  if (!cors) return;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
  });
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function runServe(argv: string[]): Promise<void> {
  const args = parseServeArgs(argv);

  // Resolve provider
  const rawConfig = loadConfig();
  const cliArgs = { model: args.model, provider: args.provider };
  const config = applyOverrides(rawConfig, cliArgs);
  let provider = config.provider;

  if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !args.provider)) {
    const detected = await detectLocalProvider();
    if (detected) {
      if (args.model) detected.model = args.model;
      provider = detected;
    } else if (!args.provider) {
      // Try cloud providers
      if (getCredential("anthropic")) {
        provider = { baseUrl: "https://api.anthropic.com", apiKey: getCredential("anthropic")!.apiKey, model: args.model || "claude-sonnet-4-6", type: "anthropic" };
      } else if (getCredential("openai")) {
        provider = { baseUrl: "https://api.openai.com/v1", apiKey: getCredential("openai")!.apiKey, model: args.model || "gpt-4o", type: "openai" };
      } else {
        console.error("Error: No LLM provider found. Start a local server or configure credentials.");
        process.exit(1);
      }
    }
  }

  // Create the agent
  const cwd = process.cwd();
  let currentlyStreaming = false;

  const agent = new CodingAgent({
    provider,
    cwd,
    maxTokens: config.defaults.maxTokens,
    autoApprove: args.autoApprove,
    onMCPStatus: (server, status) => {
      console.log(`  MCP ${server}: ${status}`);
    },
  });

  await agent.init();

  const toolCount = agent.getTools().length;
  const mcpCount = agent.getMCPServerCount();

  console.log(`\n  codemaxxing serve`);
  console.log(`  Model:    ${provider.model}`);
  console.log(`  Provider: ${provider.baseUrl}`);
  console.log(`  Tools:    ${toolCount}${mcpCount > 0 ? ` (+${mcpCount} MCP)` : ""}`);
  console.log(`  CWD:      ${cwd}`);
  console.log(`  Approve:  ${args.autoApprove ? "auto" : "manual (denied in server mode)"}`);
  console.log(`  CORS:     ${args.cors ? "enabled" : "disabled"}`);
  console.log(`\n  Listening on http://localhost:${args.port}\n`);

  const server = createServer(async (req, res) => {
    setCors(res, args.cors);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || "/";
    const method = req.method || "GET";

    try {
      // ── Health ──
      if (url === "/health" && method === "GET") {
        sendJSON(res, 200, { status: "ok", model: provider.model });
        return;
      }

      // ── Status ──
      if (url === "/v1/status" && method === "GET") {
        const cost = agent.getCostInfo();
        sendJSON(res, 200, {
          model: provider.model,
          provider: provider.baseUrl,
          tools: toolCount,
          mcp_servers: mcpCount,
          context_messages: agent.getContextLength(),
          context_tokens: agent.estimateTokens(),
          cost,
          streaming: currentlyStreaming,
          auto_approve: args.autoApprove,
        });
        return;
      }

      // ── Tools ──
      if (url === "/v1/tools" && method === "GET") {
        const tools = agent.getTools().map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        }));
        sendJSON(res, 200, { tools });
        return;
      }

      // ── Cost ──
      if (url === "/v1/cost" && method === "GET") {
        sendJSON(res, 200, agent.getCostInfo());
        return;
      }

      // ── Abort ──
      if (url === "/v1/abort" && method === "POST") {
        agent.abort();
        sendJSON(res, 200, { status: "aborted" });
        return;
      }

      // ── Reset ──
      if (url === "/v1/reset" && method === "POST") {
        agent.reset();
        sendJSON(res, 200, { status: "reset" });
        return;
      }

      // ── Compact ──
      if (url === "/v1/compact" && method === "POST") {
        const result = await agent.compressContext();
        sendJSON(res, 200, result || { status: "nothing_to_compress" });
        return;
      }

      // ── Chat (SSE streaming) ──
      if (url === "/v1/chat" && method === "POST") {
        if (currentlyStreaming) {
          sendJSON(res, 429, { error: "Agent is currently processing a request. Wait or POST /v1/abort." });
          return;
        }

        const body = await readBody(req);
        let parsed: { message: string; images?: Array<{ mime: string; base64: string }> };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJSON(res, 400, { error: "Invalid JSON. Expected: { \"message\": \"your prompt\" }" });
          return;
        }

        if (!parsed.message) {
          sendJSON(res, 400, { error: "Missing 'message' field." });
          return;
        }

        // Set up SSE
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...(args.cors ? { "Access-Control-Allow-Origin": "*" } : {}),
        });

        currentlyStreaming = true;
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const toolResults: Array<{ name: string; lines: number; size: number }> = [];

        // Temporarily override callbacks for this request
        const origOnToken = (agent as any).options.onToken;
        const origOnToolCall = (agent as any).options.onToolCall;
        const origOnToolResult = (agent as any).options.onToolResult;

        (agent as any).options.onToken = (token: string) => {
          res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
        };
        (agent as any).options.onToolCall = (name: string, tcArgs: Record<string, unknown>) => {
          toolCalls.push({ name, args: tcArgs });
          res.write(`data: ${JSON.stringify({ type: "tool_call", name, args: tcArgs })}\n\n`);
        };
        (agent as any).options.onToolResult = (name: string, result: string) => {
          const lines = result.split("\n").length;
          toolResults.push({ name, lines, size: result.length });
          res.write(`data: ${JSON.stringify({ type: "tool_result", name, lines, size: result.length, preview: result.slice(0, 200) })}\n\n`);
        };

        try {
          const response = await agent.send(parsed.message, parsed.images);

          // Send completion event
          const cost = agent.getCostInfo();
          res.write(`data: ${JSON.stringify({
            type: "done",
            response,
            tool_calls: toolCalls.length,
            tool_results: toolResults.length,
            cost,
          })}\n\n`);
        } catch (err: any) {
          res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
        } finally {
          // Restore original callbacks
          (agent as any).options.onToken = origOnToken;
          (agent as any).options.onToolCall = origOnToolCall;
          (agent as any).options.onToolResult = origOnToolResult;
          currentlyStreaming = false;
          res.end();
        }
        return;
      }

      // ── Exec (one-shot, full JSON response) ──
      if (url === "/v1/exec" && method === "POST") {
        if (currentlyStreaming) {
          sendJSON(res, 429, { error: "Agent is busy." });
          return;
        }

        const body = await readBody(req);
        let parsed: { message: string; reset?: boolean };
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJSON(res, 400, { error: "Invalid JSON." });
          return;
        }

        if (!parsed.message) {
          sendJSON(res, 400, { error: "Missing 'message' field." });
          return;
        }

        if (parsed.reset) {
          agent.reset();
        }

        currentlyStreaming = true;
        let fullResponse = "";
        const origOnToken = (agent as any).options.onToken;
        (agent as any).options.onToken = (token: string) => { fullResponse += token; };

        try {
          await agent.send(parsed.message);
          const cost = agent.getCostInfo();
          sendJSON(res, 200, {
            response: fullResponse,
            cost,
            context_messages: agent.getContextLength(),
            context_tokens: agent.estimateTokens(),
          });
        } catch (err: any) {
          sendJSON(res, 500, { error: err.message });
        } finally {
          (agent as any).options.onToken = origOnToken;
          currentlyStreaming = false;
        }
        return;
      }

      // ── 404 ──
      sendJSON(res, 404, {
        error: "Not found",
        endpoints: [
          "POST /v1/chat   — SSE streaming chat",
          "POST /v1/exec   — One-shot JSON response",
          "GET  /v1/tools  — List tools",
          "GET  /v1/status — Server status",
          "POST /v1/abort  — Abort generation",
          "POST /v1/reset  — Reset conversation",
          "POST /v1/compact — Compress context",
          "GET  /v1/cost   — Session cost",
          "GET  /health    — Health check",
        ],
      });
    } catch (err: any) {
      console.error(`Error handling ${method} ${url}:`, err.message);
      if (!res.headersSent) {
        sendJSON(res, 500, { error: err.message });
      }
    }
  });

  server.listen(args.port);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    server.close();
    await Promise.race([disconnectAll(), new Promise((r) => setTimeout(r, 3000))]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
