import { CodingAgent } from "../agent.js";
import { loadConfig, parseCLIArgs, applyOverrides, detectLocalProvider, detectLocalProviderDetailed } from "../config.js";
import { isOllamaRunning } from "../utils/ollama.js";
import { isGitRepo, getBranch, getStatus } from "../utils/git.js";
import { getCredential } from "../utils/auth.js";
import type { ConnectionContext } from "./connection-types.js";

function describeActiveConnection(baseUrl: string, model: string): string {
  const url = baseUrl.toLowerCase();
  if (url.includes("localhost:1234")) return `${model} via LM Studio`;
  if (url.includes("localhost:11434")) return `${model} via Ollama`;
  if (url.includes("localhost:8000")) return `${model} via vLLM`;
  if (url.includes("chatgpt.com")) return `${model} via OpenAI OAuth`;
  if (url.includes("api.openai.com")) return `${model} via OpenAI API`;
  if (url.includes("api.anthropic.com")) return `${model} via Anthropic`;
  if (url.includes("openrouter.ai")) return `${model} via OpenRouter`;
  if (url.includes("dashscope.aliyuncs.com")) return `${model} via Qwen`;
  if (url.includes("githubcopilot.com")) return `${model} via GitHub Copilot`;
  return `${model} via ${baseUrl}`;
}

async function buildAvailabilityLines(activeBaseUrl: string, activeModel: string): Promise<string[]> {
  const localReady: string[] = [];
  const cloudReady: string[] = [];

  const detected = await detectLocalProvider();
  if (detected) {
    const baseUrl = detected.baseUrl.toLowerCase();
    if (baseUrl.includes("localhost:1234")) localReady.push("LM Studio");
    else if (baseUrl.includes("localhost:11434")) localReady.push("Ollama");
    else if (baseUrl.includes("localhost:8000")) localReady.push("vLLM");
    else localReady.push("Local LLM");
  } else if (await isOllamaRunning()) {
    localReady.push("Ollama (no model loaded)");
  }

  if (getCredential("openai")) cloudReady.push("OpenAI OAuth");
  if (getCredential("anthropic")) cloudReady.push("Anthropic");
  if (getCredential("openrouter")) cloudReady.push("OpenRouter");
  if (getCredential("qwen")) cloudReady.push("Qwen");
  if (getCredential("copilot")) cloudReady.push("GitHub Copilot");

  return [
    `Active: ${describeActiveConnection(activeBaseUrl, activeModel)}`,
    `Local Ready: ${localReady.length > 0 ? localReady.join(", ") : "none"}`,
    `Cloud Ready: ${cloudReady.length > 0 ? cloudReady.join(", ") : "none"}`,
  ];
}

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
      info.push(...await buildAvailabilityLines(detected.baseUrl, detected.model));
    } else {
      info.push("Active: not connected");
      info.push(`Local Ready: ${await isOllamaRunning() ? "Ollama (no model loaded)" : "none"}`);
      const cloudReady: string[] = [];
      if (getCredential("openai")) cloudReady.push("OpenAI OAuth");
      if (getCredential("anthropic")) cloudReady.push("Anthropic");
      if (getCredential("openrouter")) cloudReady.push("OpenRouter");
      if (getCredential("qwen")) cloudReady.push("Qwen");
      if (getCredential("copilot")) cloudReady.push("GitHub Copilot");
      info.push(`Cloud Ready: ${cloudReady.length > 0 ? cloudReady.join(", ") : "none"}`);
    }
  } else {
    info.push(...await buildAvailabilityLines(provider.baseUrl, provider.model));
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
  let info: string[] = [];

  if (isRetry) {
    info.push("Retrying connection...");
    ctx.setConnectionInfo([...info]);
  }

  if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !cliArgs.baseUrl)) {
    info.push("Detecting local LLM server...");
    ctx.setConnectionInfo([...info]);
    const detection = await detectLocalProviderDetailed();
    if (detection.status === "connected") {
      if (cliArgs.model) detection.provider.model = cliArgs.model;
      provider = detection.provider;
    } else if (detection.status === "no-models") {
      info = [
        "Active: not connected",
        `Local Ready: ${detection.serverName} (no model loaded)`,
        `Cloud Ready: ${[
          getCredential("openai") ? "OpenAI OAuth" : null,
          getCredential("anthropic") ? "Anthropic" : null,
          getCredential("openrouter") ? "OpenRouter" : null,
          getCredential("qwen") ? "Qwen" : null,
          getCredential("copilot") ? "GitHub Copilot" : null,
        ].filter(Boolean).join(", ") || "none"}`,
        `⚠ ${detection.serverName} is running but has no models. Use /ollama pull to download one.`
      ];
      ctx.setConnectionInfo(info);
      ctx.setReady(true);
      return;
    } else {
      const hasAnyCreds = !!getCredential("anthropic") || !!getCredential("openai") || 
                          !!getCredential("openrouter") || !!getCredential("qwen") || 
                          !!getCredential("copilot");
      info = [
        "Active: not connected",
        "Local Ready: none",
        `Cloud Ready: ${[
          getCredential("openai") ? "OpenAI OAuth" : null,
          getCredential("anthropic") ? "Anthropic" : null,
          getCredential("openrouter") ? "OpenRouter" : null,
          getCredential("qwen") ? "Qwen" : null,
          getCredential("copilot") ? "GitHub Copilot" : null,
        ].filter(Boolean).join(", ") || "none"}`,
      ];
      ctx.setConnectionInfo(info);

      if (hasAnyCreds) {
        info.push("Found saved credentials. Opening model picker...");
        ctx.setConnectionInfo([...info]);
        ctx.setReady(true);
        await ctx.openModelPicker();
        return;
      }

      ctx.setReady(true);
      ctx.setWizardScreen("connection");
      ctx.setWizardIndex(0);
      return;
    }
  }

  info = await buildAvailabilityLines(provider.baseUrl, provider.model);
  ctx.setConnectionInfo([...info]);

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
      ctx.setLastActivityAt(Date.now());
      ctx.setAgentStage("streaming response");
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
      ctx.setLastActivityAt(Date.now());
      ctx.setAgentStage("executing tool");
      ctx.setLastToolName(name);
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
    onToolResult: (name, result) => {
      ctx.setLastActivityAt(Date.now());
      ctx.setAgentStage("waiting after tool result");
      ctx.setLastToolName(name);
      const numLines = result.split("\n").length;
      const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
      ctx.addMsg("tool-result", `└ ${numLines} lines (${size})`);
    },
    onThinking: (text) => {
      ctx.setLastActivityAt(Date.now());
      ctx.setAgentStage("thinking");
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
