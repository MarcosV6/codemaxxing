import { CodingAgent } from "../agent.js";
import { loadConfig, parseCLIArgs, applyOverrides, detectLocalProvider, detectLocalProviderDetailed } from "../config.js";
import { isOllamaRunning } from "../utils/ollama.js";
import { isGitRepo, getBranch, getStatus } from "../utils/git.js";
import type { ConnectionContext } from "./connection-types.js";

/**
 * Build and set the connection banner (provider status + git info).
 * Used for quick refreshes after reconnects / model changes.
 */
export async function refreshConnectionBanner(
  setConnectionInfo: (val: string[]) => void,
): Promise<void> {
  const info: string[] = [];
  const cliArgs = parseCLIArgs();
  const rawConfig = loadConfig();
  const config = applyOverrides(rawConfig, cliArgs);
  const provider = config.provider;

  if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !cliArgs.baseUrl)) {
    const detected = await detectLocalProvider();
    if (detected) {
      info.push(`✔ Connected to ${detected.baseUrl} → ${detected.model}`);
    } else {
      const ollamaUp = await isOllamaRunning();
      info.push(ollamaUp ? "Ollama running (no model loaded)" : "✗ No local LLM server found");
    }
  } else {
    info.push(`Provider: ${provider.baseUrl}`);
    info.push(`Model: ${provider.model}`);
  }

  const cwd = process.cwd();
  if (isGitRepo(cwd)) {
    const branch = getBranch(cwd);
    const status = getStatus(cwd);
    info.push(`Git: ${branch} (${status})`);
  }

  setConnectionInfo(info);
}

/**
 * Connect (or reconnect) to the LLM provider.
 * Handles local detection, wizard triggers, agent creation, and post-connection setup.
 */
export async function connectToProvider(
  isRetry: boolean,
  ctx: ConnectionContext,
): Promise<void> {
  const cliArgs = parseCLIArgs();
  const rawConfig = loadConfig();
  const config = applyOverrides(rawConfig, cliArgs);
  let provider = config.provider;
  const info: string[] = [];

  if (isRetry) {
    info.push("Retrying connection...");
    ctx.setConnectionInfo([...info]);
  }

  if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !cliArgs.baseUrl)) {
    info.push("Detecting local LLM server...");
    ctx.setConnectionInfo([...info]);
    const detection = await detectLocalProviderDetailed();
    if (detection.status === "connected") {
      // Keep CLI model override if specified
      if (cliArgs.model) detection.provider.model = cliArgs.model;
      provider = detection.provider;
      info.push(`✔ Connected to ${provider.baseUrl} → ${provider.model}`);
      ctx.setConnectionInfo([...info]);
    } else if (detection.status === "no-models") {
      info.push(`⚠ ${detection.serverName} is running but has no models. Use /ollama pull to download one.`);
      ctx.setConnectionInfo([...info]);
      ctx.setReady(true);
      return;
    } else {
      info.push("✗ No local LLM server found.");
      ctx.setConnectionInfo([...info]);
      
      // Check if user has saved credentials — if so, auto-show model picker
      const { getCredential } = await import("../utils/auth.js");
      const hasAnyCreds = !!getCredential("anthropic") || !!getCredential("openai") || 
                          !!getCredential("openrouter") || !!getCredential("qwen") || 
                          !!getCredential("copilot");
      
      if (hasAnyCreds) {
        // User has auth'd before — skip wizard, go straight to /models picker
        info.push("✔ Found saved credentials. Use /models to pick a model and start coding.");
        ctx.setConnectionInfo([...info]);
        ctx.setReady(true);
        // The user will run /models, which now works without an agent
        return;
      }
      
      // No creds found — show the setup wizard
      ctx.setReady(true);
      ctx.setWizardScreen("connection");
      ctx.setWizardIndex(0);
      return;
    }
  } else {
    info.push(`Provider: ${provider.baseUrl}`);
    info.push(`Model: ${provider.model}`);
    ctx.setConnectionInfo([...info]);
  }

  const cwd = process.cwd();

  // Git info
  if (isGitRepo(cwd)) {
    const branch = getBranch(cwd);
    const status = getStatus(cwd);
    info.push(`Git: ${branch} (${status})`);
    ctx.setConnectionInfo([...info]);
  }

  const a = new CodingAgent({
    provider,
    cwd,
    maxTokens: config.defaults.maxTokens,
    autoApprove: config.defaults.autoApprove,
    onToken: (token) => {
      // Switch from big spinner to streaming mode
      ctx.setLoading(false);
      ctx.setStreaming(true);

      // Update the current streaming response in-place
      ctx.setMessages((prev) => {
        const lastIdx = prev.length - 1;
        const last = prev[lastIdx];

        if (last && last.type === "response" && (last as any)._streaming) {
          return [
            ...prev.slice(0, lastIdx),
            { ...last, text: last.text + token },
          ];
        }

        // First token of a new response
        return [...prev, { id: ctx.nextMsgId(), type: "response" as const, text: token, _streaming: true } as any];
      });
    },
    onToolCall: (name, args) => {
      ctx.setLoading(true);
      ctx.setSpinnerMsg("Executing tools...");
      const argStr = Object.entries(args)
        .map(([k, v]) => {
          const val = String(v);
          return val.length > 60 ? val.slice(0, 60) + "..." : val;
        })
        .join(", ");
      ctx.addMsg("tool", `${name}(${argStr})`);
    },
    onToolResult: (_name, result) => {
      const numLines = result.split("\n").length;
      const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
      ctx.addMsg("tool-result", `└ ${numLines} lines (${size})`);
    },
    onThinking: (text) => {
      if (text.length > 0) {
        ctx.addMsg("info", `💭 Thought for ${text.split(/\s+/).length} words`);
      }
    },
    onGitCommit: (message) => {
      ctx.addMsg("info", `📝 Auto-committed: ${message}`);
    },
    onContextCompressed: (oldTokens, newTokens) => {
      const saved = oldTokens - newTokens;
      const savedStr = saved >= 1000 ? `${(saved / 1000).toFixed(1)}k` : String(saved);
      ctx.addMsg("info", `📦 Context compressed (~${savedStr} tokens freed)`);
    },
    onArchitectPlan: (plan) => {
      ctx.addMsg("info", `🏗️ Architect Plan:\n${plan}`);
    },
    onLintResult: (file, errors) => {
      ctx.addMsg("info", `🔍 Lint errors in ${file}:\n${errors}`);
    },
    onMCPStatus: (server, status) => {
      ctx.addMsg("info", `🔌 MCP ${server}: ${status}`);
    },
    contextCompressionThreshold: config.defaults.contextCompressionThreshold,
    onToolApproval: (name, args, diff) => {
      return new Promise((resolve) => {
        ctx.setApproval({ tool: name, args, diff, resolve });
        ctx.setLoading(false);
      });
    },
  });

  // Initialize async context (repo map)
  await a.init();

  // Show project rules in banner
  const rulesSource = a.getProjectRulesSource();
  if (rulesSource) {
    info.push(`📋 ${rulesSource} loaded`);
    ctx.setConnectionInfo([...info]);
  }

  // Show MCP server count
  const mcpCount = a.getMCPServerCount();
  if (mcpCount > 0) {
    info.push(`🔌 ${mcpCount} MCP server${mcpCount > 1 ? "s" : ""} connected`);
    ctx.setConnectionInfo([...info]);
  }

  ctx.setAgent(a);
  ctx.setModelName(provider.model);
  ctx.providerRef.current = { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
  ctx.setReady(true);
  if (isRetry) {
    ctx.addMsg("info", `✅ Connected to ${provider.model}`);
  } else {
    // First-time connection — show capabilities hint
    const tools = a.getTools();
    const toolCount = tools.length;
    const toolNames = tools
      .map((t) => t.function.name.replace(/_/g, " "))
      .slice(0, 3)
      .join(", ");
    ctx.addMsg(
      "info",
      `💡 You can: ${toolNames}${toolCount > 3 ? `, +${toolCount - 3} more` : ""}\n` +
      `   Try: "list files in src/" or "read main.ts"`
    );
  }
}
