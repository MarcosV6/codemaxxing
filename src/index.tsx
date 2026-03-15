#!/usr/bin/env node

import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import { EventEmitter } from "events";
import TextInput from "ink-text-input";
import { consumePendingPasteEndMarkerChunk } from "./utils/paste.js";
import { CodingAgent } from "./agent.js";
import { loadConfig, saveConfig, detectLocalProvider, detectLocalProviderDetailed, parseCLIArgs, applyOverrides, listModels } from "./config.js";
import { listSessions, getSession, loadMessages, deleteSession } from "./utils/sessions.js";
import { isGitRepo, getBranch, getStatus } from "./utils/git.js";
import { tryHandleGitCommand } from "./commands/git.js";
import { tryHandleOllamaCommand } from "./commands/ollama.js";
import { dispatchRegisteredCommands } from "./commands/registry.js";
import { getTheme, listThemes, THEMES, DEFAULT_THEME, type Theme } from "./themes.js";
import { tryHandleUiCommand } from "./commands/ui.js";
import { PROVIDERS, getCredentials, openRouterOAuth, anthropicSetupToken, importCodexToken, importQwenToken, copilotDeviceFlow, saveApiKey } from "./utils/auth.js";
import { listInstalledSkills, installSkill, removeSkill, getRegistrySkills, getActiveSkills, getActiveSkillCount } from "./utils/skills.js";
import { listServers, addServer, removeServer, getAllMCPTools, getConnectedServers } from "./utils/mcp.js";
import { tryHandleSkillsCommand } from "./commands/skills.js";
import { detectHardware, formatBytes, type HardwareInfo } from "./utils/hardware.js";
import { getRecommendations, getRecommendationsWithLlmfit, getFitIcon, isLlmfitAvailable, type ScoredModel } from "./utils/models.js";
import { isOllamaInstalled, isOllamaRunning, getOllamaInstallCommand, startOllama, stopOllama, pullModel, listInstalledModelsDetailed, deleteModel, getGPUMemoryUsage, type PullProgress } from "./utils/ollama.js";

import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const VERSION = _require("../package.json").version;

// ── Helpers ──
function formatTimeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Slash Commands ──
const SLASH_COMMANDS = [
  { cmd: "/help", desc: "show commands" },
  { cmd: "/connect", desc: "retry LLM connection" },
  { cmd: "/login", desc: "set up authentication" },
  { cmd: "/map", desc: "show repository map" },
  { cmd: "/reset", desc: "clear conversation" },
  { cmd: "/context", desc: "show message count" },
  { cmd: "/diff", desc: "show git changes" },
  { cmd: "/undo", desc: "revert last codemaxxing commit" },
  { cmd: "/commit", desc: "commit all changes" },
  { cmd: "/push", desc: "push to remote" },
  { cmd: "/git on", desc: "enable auto-commits" },
  { cmd: "/git off", desc: "disable auto-commits" },
  { cmd: "/models", desc: "list available models" },
  { cmd: "/theme", desc: "switch color theme" },
  { cmd: "/model", desc: "switch model mid-session" },
  { cmd: "/sessions", desc: "list past sessions" },
  { cmd: "/session delete", desc: "delete a session" },
  { cmd: "/resume", desc: "resume a past session" },
  { cmd: "/skills", desc: "manage skill packs" },
  { cmd: "/architect", desc: "toggle architect mode" },
  { cmd: "/lint", desc: "show auto-lint status" },
  { cmd: "/lint on", desc: "enable auto-lint" },
  { cmd: "/lint off", desc: "disable auto-lint" },
  { cmd: "/mcp", desc: "show MCP servers" },
  { cmd: "/mcp tools", desc: "list MCP tools" },
  { cmd: "/mcp add", desc: "add MCP server" },
  { cmd: "/mcp remove", desc: "remove MCP server" },
  { cmd: "/mcp reconnect", desc: "reconnect MCP servers" },
  { cmd: "/ollama", desc: "Ollama status & models" },
  { cmd: "/ollama status", desc: "show Ollama status & models" },
  { cmd: "/ollama list", desc: "list installed models" },
  { cmd: "/ollama start", desc: "start Ollama server" },
  { cmd: "/ollama stop", desc: "stop Ollama server" },
  { cmd: "/ollama pull", desc: "download a model" },
  { cmd: "/ollama delete", desc: "delete a model" },
  { cmd: "/quit", desc: "exit" },
];

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

const SPINNER_MESSAGES = [
  // OG
  "Locking in...", "Cooking...", "Maxxing...", "In the zone...",
  "Yapping...", "Frame mogging...", "Jester gooning...", "Gooning...",
  "Doing back flips...", "Jester maxxing...", "Getting baked...",
  "Blasting tren...", "Pumping...", "Wondering if I should actually do this...",
  "Hacking the main frame...", "Codemaxxing...", "Vibe coding...", "Running a marathon...",
  // Gym/Looksmaxxing
  "Mewing aggressively...", "Looksmaxxing your codebase...", "Hitting a PR on this function...",
  "Eating 4000 calories of code...", "Creatine loading...", "On my bulk arc...",
  "Warming up the deadlift...",
  // Brainrot/Skibidi
  "Going full skibidi...", "Sigma grinding...", "Rizzing up the compiler...",
  "No cap processing...", "Main character coding...", "It's giving implementation...",
  "This code is bussin fr fr...", "Aura check in progress...", "Erm what the sigma...",
  // Deranged/Unhinged
  "Ascending to a higher plane...", "Achieving final form...", "Third eye compiling...",
  "Astral projecting through your repo...", "Becoming one with the codebase...",
  "Having a spiritual awakening...", "Entering the shadow realm...", "Going goblin mode...",
  "Deleting System32... jk...", "Sacrificing tokens to the GPU gods...",
  "Summoning the machine spirit...",
  // Self-aware/Meta
  "Pretending to think really hard...", "Staring at your code judgmentally...",
  "Rethinking my career choices...", "Having an existential crisis...",
  "Hoping this actually works...", "Praying to the stack overflow gods...",
  "Copying from the internet with dignity...",
  // Pure Chaos
  "Doing hot yoga in the terminal...", "Microdosing your dependencies...",
  "Running on 3 hours of sleep...", "Speedrunning your deadline...",
  "Built different rn...", "That's crazy let me cook...",
  "Absolutely feral right now...", "Ong no cap fr fr...",
  "Living rent free in your RAM...", "Ate and left no crumbs...",
];

// ── Neon Spinner ──
function NeonSpinner({ message, colors }: { message: string; colors: Theme['colors'] }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text>
      {"  "}<Text color={colors.spinner}>{SPINNER_FRAMES[frame]}</Text>
      {" "}<Text bold color={colors.secondary}>{message}</Text>
      {" "}<Text color={colors.muted}>[{elapsed}s]</Text>
    </Text>
  );
}

// ── Streaming Indicator (subtle, shows model is still working) ──
const STREAM_DOTS = ["·  ", "·· ", "···", " ··", "  ·", "   "];
function StreamingIndicator({ colors }: { colors: Theme['colors'] }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % STREAM_DOTS.length);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text dimColor>
      {"  "}<Text color={colors.spinner}>{STREAM_DOTS[frame]}</Text>
      {" "}<Text color={colors.muted}>streaming</Text>
    </Text>
  );
}

// ── Message Types ──
interface ChatMessage {
  id: number;
  type: "user" | "response" | "tool" | "tool-result" | "error" | "info";
  text: string;
}

let msgId = 0;

// ── Main App ──
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  const [input, setInput] = useState("");
  const [pastedChunks, setPastedChunks] = useState<Array<{ id: number; lines: number; content: string }>>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [spinnerMsg, setSpinnerMsg] = useState("");
  const [agent, setAgent] = useState<CodingAgent | null>(null);
  const [modelName, setModelName] = useState("");
  const [theme, setTheme] = useState<Theme>(getTheme(DEFAULT_THEME));
  const providerRef = React.useRef<{ baseUrl: string; apiKey: string }>({ baseUrl: "", apiKey: "" });
  const [ready, setReady] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<string[]>([]);
  const [ctrlCPressed, setCtrlCPressed] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [sessionPicker, setSessionPicker] = useState<Array<{ id: string; display: string }> | null>(null);
  const [sessionPickerIndex, setSessionPickerIndex] = useState(0);
  const [themePicker, setThemePicker] = useState(false);
  const [themePickerIndex, setThemePickerIndex] = useState(0);
  const [deleteSessionPicker, setDeleteSessionPicker] = useState<Array<{ id: string; display: string }> | null>(null);
  const [deleteSessionPickerIndex, setDeleteSessionPickerIndex] = useState(0);
  const [deleteSessionConfirm, setDeleteSessionConfirm] = useState<{ id: string; display: string } | null>(null);
  const [loginPicker, setLoginPicker] = useState(false);
  const [loginPickerIndex, setLoginPickerIndex] = useState(0);
  const [loginMethodPicker, setLoginMethodPicker] = useState<{ provider: string; methods: string[] } | null>(null);
  const [loginMethodIndex, setLoginMethodIndex] = useState(0);
  const [skillsPicker, setSkillsPicker] = useState<"menu" | "browse" | "installed" | "remove" | null>(null);
  const [skillsPickerIndex, setSkillsPickerIndex] = useState(0);
  const [sessionDisabledSkills, setSessionDisabledSkills] = useState<Set<string>>(new Set());
  const [approval, setApproval] = useState<{
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
    resolve: (decision: "yes" | "no" | "always") => void;
  } | null>(null);

  // ── Ollama Management State ──
  const [ollamaDeleteConfirm, setOllamaDeleteConfirm] = useState<{ model: string; size: number } | null>(null);
  const [ollamaPulling, setOllamaPulling] = useState<{ model: string; progress: PullProgress } | null>(null);
  const [ollamaExitPrompt, setOllamaExitPrompt] = useState(false);
  const [ollamaDeletePicker, setOllamaDeletePicker] = useState<{ models: { name: string; size: number }[] } | null>(null);
  const [ollamaDeletePickerIndex, setOllamaDeletePickerIndex] = useState(0);
  const [ollamaPullPicker, setOllamaPullPicker] = useState(false);
  const [ollamaPullPickerIndex, setOllamaPullPickerIndex] = useState(0);
  const [modelPicker, setModelPicker] = useState<string[] | null>(null);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);

  // ── Setup Wizard State ──
  type WizardScreen = "connection" | "models" | "install-ollama" | "pulling" | null;
  const [wizardScreen, setWizardScreen] = useState<WizardScreen>(null);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [wizardHardware, setWizardHardware] = useState<HardwareInfo | null>(null);
  const [wizardModels, setWizardModels] = useState<ScoredModel[]>([]);
  const [wizardPullProgress, setWizardPullProgress] = useState<PullProgress | null>(null);
  const [wizardPullError, setWizardPullError] = useState<string | null>(null);
  const [wizardSelectedModel, setWizardSelectedModel] = useState<ScoredModel | null>(null);

  // Listen for paste events from stdin interceptor
  useEffect(() => {
    const handler = ({ content, lines }: { content: string; lines: number }) => {
      setPasteCount((c) => {
        const newId = c + 1;
        setPastedChunks((prev) => [...prev, { id: newId, lines, content }]);
        return newId;
      });
    };
    pasteEvents.on("paste", handler);
    return () => { pasteEvents.off("paste", handler); };
  }, []);

  // Refresh the connection banner to reflect current provider status
  const refreshConnectionBanner = useCallback(async () => {
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
  }, []);

  // Connect/reconnect to LLM provider
  const connectToProvider = useCallback(async (isRetry = false) => {
    const cliArgs = parseCLIArgs();
    const rawConfig = loadConfig();
    const config = applyOverrides(rawConfig, cliArgs);
    let provider = config.provider;
    const info: string[] = [];

    if (isRetry) {
      info.push("Retrying connection...");
      setConnectionInfo([...info]);
    }

    if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !cliArgs.baseUrl)) {
      info.push("Detecting local LLM server...");
      setConnectionInfo([...info]);
      const detection = await detectLocalProviderDetailed();
      if (detection.status === "connected") {
        // Keep CLI model override if specified
        if (cliArgs.model) detection.provider.model = cliArgs.model;
        provider = detection.provider;
        info.push(`✔ Connected to ${provider.baseUrl} → ${provider.model}`);
        setConnectionInfo([...info]);
      } else if (detection.status === "no-models") {
        info.push(`⚠ ${detection.serverName} is running but has no models. Use /ollama pull to download one.`);
        setConnectionInfo([...info]);
        setReady(true);
        return;
      } else {
        info.push("✗ No local LLM server found.");
        setConnectionInfo([...info]);
        setReady(true);
        // Show the setup wizard on first run
        setWizardScreen("connection");
        setWizardIndex(0);
        return;
      }
    } else {
      info.push(`Provider: ${provider.baseUrl}`);
      info.push(`Model: ${provider.model}`);
      setConnectionInfo([...info]);
    }

    const cwd = process.cwd();

    // Git info
    if (isGitRepo(cwd)) {
      const branch = getBranch(cwd);
      const status = getStatus(cwd);
      info.push(`Git: ${branch} (${status})`);
      setConnectionInfo([...info]);
    }

    const a = new CodingAgent({
      provider,
      cwd,
      maxTokens: config.defaults.maxTokens,
      autoApprove: config.defaults.autoApprove,
      onToken: (token) => {
        // Switch from big spinner to streaming mode
        setLoading(false);
        setStreaming(true);

        // Update the current streaming response in-place
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];

          if (last && last.type === "response" && (last as any)._streaming) {
            return [
              ...prev.slice(0, lastIdx),
              { ...last, text: last.text + token },
            ];
          }

          // First token of a new response
          return [...prev, { id: msgId++, type: "response" as const, text: token, _streaming: true } as any];
        });
      },
      onToolCall: (name, args) => {
        setLoading(true);
        setSpinnerMsg("Executing tools...");
        const argStr = Object.entries(args)
          .map(([k, v]) => {
            const val = String(v);
            return val.length > 60 ? val.slice(0, 60) + "..." : val;
          })
          .join(", ");
        addMsg("tool", `${name}(${argStr})`);
      },
      onToolResult: (_name, result) => {
        const numLines = result.split("\n").length;
        const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
        addMsg("tool-result", `└ ${numLines} lines (${size})`);
      },
      onThinking: (text) => {
        if (text.length > 0) {
          addMsg("info", `💭 Thought for ${text.split(/\s+/).length} words`);
        }
      },
      onGitCommit: (message) => {
        addMsg("info", `📝 Auto-committed: ${message}`);
      },
      onContextCompressed: (oldTokens, newTokens) => {
        const saved = oldTokens - newTokens;
        const savedStr = saved >= 1000 ? `${(saved / 1000).toFixed(1)}k` : String(saved);
        addMsg("info", `📦 Context compressed (~${savedStr} tokens freed)`);
      },
      onArchitectPlan: (plan) => {
        addMsg("info", `🏗️ Architect Plan:\n${plan}`);
      },
      onLintResult: (file, errors) => {
        addMsg("info", `🔍 Lint errors in ${file}:\n${errors}`);
      },
      onMCPStatus: (server, status) => {
        addMsg("info", `🔌 MCP ${server}: ${status}`);
      },
      contextCompressionThreshold: config.defaults.contextCompressionThreshold,
      onToolApproval: (name, args, diff) => {
        return new Promise((resolve) => {
          setApproval({ tool: name, args, diff, resolve });
          setLoading(false);
        });
      },
    });

    // Initialize async context (repo map)
    await a.init();

    // Show project rules in banner
    const rulesSource = a.getProjectRulesSource();
    if (rulesSource) {
      info.push(`📋 ${rulesSource} loaded`);
      setConnectionInfo([...info]);
    }

    // Show MCP server count
    const mcpCount = a.getMCPServerCount();
    if (mcpCount > 0) {
      info.push(`🔌 ${mcpCount} MCP server${mcpCount > 1 ? "s" : ""} connected`);
      setConnectionInfo([...info]);
    }

    setAgent(a);
    setModelName(provider.model);
    providerRef.current = { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
    setReady(true);
    if (isRetry) {
      addMsg("info", `✅ Connected to ${provider.model}`);
    }
  }, []);

  // Initialize agent on mount
  useEffect(() => {
    connectToProvider(false);
  }, []);

  function addMsg(type: ChatMessage["type"], text: string) {
    setMessages((prev) => [...prev, { id: msgId++, type, text }]);
  }

  // Compute matching commands for suggestions
  const cmdMatches = input.startsWith("/")
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase()))
    : [];
  const showSuggestions = cmdMatches.length > 0 && !loading && !approval && input !== cmdMatches[0]?.cmd;

  // Refs to avoid stale closures in handleSubmit
  const cmdIndexRef = React.useRef(cmdIndex);
  cmdIndexRef.current = cmdIndex;
  const cmdMatchesRef = React.useRef(cmdMatches);
  cmdMatchesRef.current = cmdMatches;
  const showSuggestionsRef = React.useRef(showSuggestions);
  showSuggestionsRef.current = showSuggestions;
  const pastedChunksRef = React.useRef(pastedChunks);
  pastedChunksRef.current = pastedChunks;

  const handleSubmit = useCallback(async (value: string) => {
    // Skip autocomplete if input exactly matches a command (e.g. /models vs /model)
    const isExactCommand = SLASH_COMMANDS.some(c => c.cmd === value.trim());

    // If suggestions are showing and input isn't already an exact command, use autocomplete
    if (showSuggestionsRef.current && !isExactCommand) {
      const matches = cmdMatchesRef.current;
      const idx = cmdIndexRef.current;
      const selected = matches[idx];
      if (selected) {
        // Commands that need args (like /commit, /model) — fill input instead of executing
        if (selected.cmd === "/commit" || selected.cmd === "/model" || selected.cmd === "/session delete" ||
            selected.cmd === "/architect") {
          setInput(selected.cmd + " ");
          setCmdIndex(0);
          setInputKey((k) => k + 1);
          return;
        }
        // Execute the selected command directly
        value = selected.cmd;
        setCmdIndex(0);
      }
    }

    // Combine typed text with any pasted chunks
    const chunks = pastedChunksRef.current;
    let fullValue = value;
    if (chunks.length > 0) {
      const pasteText = chunks.map(p => p.content).join("\n\n");
      fullValue = value ? `${value}\n\n${pasteText}` : pasteText;
    }
    const trimmed = fullValue.trim();
    setInput("");
    setPastedChunks([]);
    setPasteCount(0);
    if (!trimmed) return;

    addMsg("user", trimmed);

    if (trimmed === "/quit" || trimmed === "/exit") {
      // Check if Ollama is running and offer to stop it
      const ollamaUp = await isOllamaRunning();
      if (ollamaUp) {
        const config = loadConfig();
        if (config.defaults.stopOllamaOnExit) {
          addMsg("info", "Stopping Ollama...");
          await stopOllama();
          exit();
        } else {
          setOllamaExitPrompt(true);
        }
      } else {
        exit();
      }
      return;
    }
    if (trimmed === "/login" || trimmed === "/auth") {
      setLoginPicker(true);
      setLoginPickerIndex(0);
      return;
    }
    if (trimmed === "/connect") {
      addMsg("info", "🔄 Reconnecting...");
      await connectToProvider(true);
      return;
    }
    if (trimmed === "/help") {
      addMsg("info", [
        "Commands:",
        "  /help      — show this",
        "  /connect   — retry LLM connection",
        "  /login     — authentication setup (run codemaxxing login in terminal)",
        "  /model     — switch model mid-session",
        "  /models    — list available models",
        "  /map       — show repository map",
        "  /sessions  — list past sessions",
        "  /session delete — delete a session",
        "  /resume    — resume a past session",
        "  /reset     — clear conversation",
        "  /context   — show message count",
        "  /diff      — show git changes",
        "  /undo      — revert last codemaxxing commit",
        "  /commit    — commit all changes",
        "  /push      — push to remote",
        "  /git on    — enable auto-commits",
        "  /git off   — disable auto-commits",
        "  /skills    — manage skill packs",
        "  /architect — toggle architect mode (plan then execute)",
        "  /lint      — show auto-lint status & detected linter",
        "  /lint on   — enable auto-lint",
        "  /lint off  — disable auto-lint",
        "  /mcp       — show MCP servers & status",
        "  /mcp tools — list all MCP tools",
        "  /mcp add   — add MCP server to global config",
        "  /mcp remove — remove MCP server",
        "  /mcp reconnect — reconnect all MCP servers",
        "  /ollama    — Ollama status, models & GPU usage",
        "  /ollama list — list installed models with sizes",
        "  /ollama start — start Ollama server",
        "  /ollama stop — stop Ollama server (frees GPU RAM)",
        "  /ollama pull <model> — download a model",
        "  /ollama delete <model> — delete a model from disk",
        "  /quit      — exit",
      ].join("\n"));
      return;
    }
    if (await dispatchRegisteredCommands([
      () => tryHandleSkillsCommand({
        trimmed,
        cwd: process.cwd(),
        addMsg,
        agent,
        sessionDisabledSkills,
        setSkillsPicker,
        setSkillsPickerIndex,
        setSessionDisabledSkills,
        setInput,
        setInputKey,
      }),
      () => tryHandleOllamaCommand({
        trimmed,
        addMsg,
        refreshConnectionBanner,
        setOllamaPullPicker,
        setOllamaPullPickerIndex,
        setOllamaPulling,
        setOllamaDeletePicker,
        setOllamaDeletePickerIndex,
        setOllamaDeleteConfirm,
      }),
      () => tryHandleGitCommand(trimmed, process.cwd(), addMsg),
      () => tryHandleUiCommand({
        trimmed,
        cwd: process.cwd(),
        addMsg,
        agent,
        theme,
        setTheme,
        setThemePicker,
        setThemePickerIndex,
      }),
    ], { trimmed })) {
      return;
    }

    // ── MCP commands (partially work without agent) ──
    if (trimmed === "/mcp" || trimmed === "/mcp list") {
      const servers = listServers(process.cwd());
      if (servers.length === 0) {
        addMsg("info", "🔌 No MCP servers configured.\n  Add one: /mcp add <name> <command> [args...]");
      } else {
        const lines = servers.map((s) => {
          const status = s.connected ? `✔ connected (${s.toolCount} tools)` : "✗ not connected";
          return `  ${s.connected ? "●" : "○"} ${s.name} [${s.source}] — ${s.command}\n    ${status}`;
        });
        addMsg("info", `🔌 MCP Servers:\n${lines.join("\n")}`);
      }
      return;
    }
    if (trimmed === "/mcp tools") {
      const servers = getConnectedServers();
      if (servers.length === 0) {
        addMsg("info", "🔌 No MCP servers connected.");
        return;
      }
      const lines: string[] = [];
      for (const server of servers) {
        lines.push(`${server.name} (${server.tools.length} tools):`);
        for (const tool of server.tools) {
          lines.push(`  • ${tool.name} — ${tool.description ?? "(no description)"}`);
        }
      }
      addMsg("info", `🔌 MCP Tools:\n${lines.join("\n")}`);
      return;
    }
    if (trimmed.startsWith("/mcp add ")) {
      const parts = trimmed.replace("/mcp add ", "").trim().split(/\s+/);
      if (parts.length < 2) {
        addMsg("info", "Usage: /mcp add <name> <command> [args...]\n  Example: /mcp add github npx -y @modelcontextprotocol/server-github");
        return;
      }
      const [name, command, ...cmdArgs] = parts;
      const result = addServer(name, { command, args: cmdArgs.length > 0 ? cmdArgs : undefined });
      addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
      return;
    }
    if (trimmed.startsWith("/mcp remove ")) {
      const name = trimmed.replace("/mcp remove ", "").trim();
      if (!name) {
        addMsg("info", "Usage: /mcp remove <name>");
        return;
      }
      const result = removeServer(name);
      addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
      return;
    }
    if (trimmed === "/mcp reconnect") {
      if (!agent) {
        addMsg("info", "⚠ No agent connected. Connect first.");
        return;
      }
      addMsg("info", "🔌 Reconnecting MCP servers...");
      await agent.reconnectMCP();
      const count = agent.getMCPServerCount();
      addMsg("info", count > 0
        ? `✅ ${count} MCP server${count > 1 ? "s" : ""} reconnected.`
        : "No MCP servers connected.");
      return;
    }

    // Commands below require an active LLM connection
    if (!agent) {
      addMsg("info", "⚠ No LLM connected. Use /login to authenticate with a provider, or start a local server.");
      return;
    }
    if (trimmed === "/reset") {
      agent.reset();
      addMsg("info", "✅ Conversation reset.");
      return;
    }
    if (trimmed === "/context") {
      addMsg("info", `Messages in context: ${agent.getContextLength()}`);
      return;
    }
    if (trimmed === "/models") {
      addMsg("info", "Fetching available models...");
      const { baseUrl, apiKey } = providerRef.current;
      const models = await listModels(baseUrl, apiKey);
      if (models.length === 0) {
        addMsg("info", "No models found or couldn't reach provider.");
      } else {
        addMsg("info", "Available models:\n" + models.map(m => `  ${m}`).join("\n"));
      }
      return;
    }
    if (trimmed === "/model") {
      // Show picker of available models
      addMsg("info", "Fetching available models...");
      try {
        const ollamaModels = await listInstalledModelsDetailed();
        if (ollamaModels.length > 0) {
          setModelPicker(ollamaModels.map(m => m.name));
          setModelPickerIndex(0);
          return;
        }
      } catch (err) {
        // Ollama not available or failed, try provider
      }
      
      // Fallback: try provider's model list
      if (providerRef.current?.baseUrl && providerRef.current.baseUrl !== "auto") {
        try {
          const providerModels = await listModels(providerRef.current.baseUrl, providerRef.current.apiKey || "");
          if (providerModels.length > 0) {
            setModelPicker(providerModels);
            setModelPickerIndex(0);
            return;
          }
        } catch (err) {
          // Provider fetch failed
        }
      }
      
      // No models found anywhere
      addMsg("error", "No models available. Download one with /ollama pull or configure a provider.");
      return;
    }
    if (trimmed.startsWith("/model ")) {
      const newModel = trimmed.replace("/model ", "").trim();
      if (!newModel) {
        addMsg("info", `Current model: ${modelName}\n  Usage: /model <model-name>`);
        return;
      }
      agent.switchModel(newModel);
      setModelName(newModel);
      addMsg("info", `✅ Switched to model: ${newModel}`);
      return;
    }
    if (trimmed === "/map") {
      const map = agent.getRepoMap();
      if (map) {
        addMsg("info", map);
      } else {
        // Map hasn't been built yet, refresh it
        setLoading(true);
        const newMap = await agent.refreshRepoMap();
        addMsg("info", newMap || "No repository map available.");
        setLoading(false);
      }
      return;
    }
    if (trimmed === "/git on") {
      if (!agent.isGitEnabled()) {
        addMsg("info", "✗ Not a git repository");
      } else {
        agent.setAutoCommit(true);
        addMsg("info", "✅ Auto-commits enabled for this session");
      }
      return;
    }
    if (trimmed === "/git off") {
      agent.setAutoCommit(false);
      addMsg("info", "✅ Auto-commits disabled");
      return;
    }
    if (trimmed === "/sessions") {
      const sessions = listSessions(10);
      if (sessions.length === 0) {
        addMsg("info", "No past sessions found.");
      } else {
        const lines = sessions.map((s, i) => {
          const date = new Date(s.updated_at + "Z");
          const ago = formatTimeAgo(date);
          const dir = s.cwd.split("/").pop() || s.cwd;
          const tokens = s.token_estimate >= 1000
            ? `${(s.token_estimate / 1000).toFixed(1)}k`
            : String(s.token_estimate);
          const cost = s.estimated_cost > 0
            ? `$${s.estimated_cost < 0.01 ? s.estimated_cost.toFixed(4) : s.estimated_cost.toFixed(2)}`
            : "";
          return `  ${s.id}  ${dir}/  ${s.message_count} msgs  ~${tokens} tok${cost ? `  ${cost}` : ""}  ${ago}  ${s.model}`;
        });
        addMsg("info", "Recent sessions:\n" + lines.join("\n") + "\n\n  Use /resume <id> to continue a session");
      }
      return;
    }
    if (trimmed.startsWith("/session delete")) {
      const idArg = trimmed.replace("/session delete", "").trim();
      if (idArg) {
        // Direct delete by ID
        const session = getSession(idArg);
        if (!session) {
          addMsg("error", `Session "${idArg}" not found.`);
          return;
        }
        const dir = session.cwd.split("/").pop() || session.cwd;
        setDeleteSessionConfirm({ id: idArg, display: `${idArg}  ${dir}/  ${session.message_count} msgs  ${session.model}` });
        return;
      }
      // Show picker
      const sessions = listSessions(10);
      if (sessions.length === 0) {
        addMsg("info", "No sessions to delete.");
        return;
      }
      const items = sessions.map((s) => {
        const date = new Date(s.updated_at + "Z");
        const ago = formatTimeAgo(date);
        const dir = s.cwd.split("/").pop() || s.cwd;
        const tokens = s.token_estimate >= 1000
          ? `${(s.token_estimate / 1000).toFixed(1)}k`
          : String(s.token_estimate);
        return {
          id: s.id,
          display: `${s.id}  ${dir}/  ${s.message_count} msgs  ~${tokens} tok  ${ago}  ${s.model}`,
        };
      });
      setDeleteSessionPicker(items);
      setDeleteSessionPickerIndex(0);
      return;
    }
    if (trimmed === "/resume") {
      const sessions = listSessions(10);
      if (sessions.length === 0) {
        addMsg("info", "No past sessions to resume.");
        return;
      }
      const items = sessions.map((s) => {
        const date = new Date(s.updated_at + "Z");
        const ago = formatTimeAgo(date);
        const dir = s.cwd.split("/").pop() || s.cwd;
        const tokens = s.token_estimate >= 1000
          ? `${(s.token_estimate / 1000).toFixed(1)}k`
          : String(s.token_estimate);
        return {
          id: s.id,
          display: `${s.id}  ${dir}/  ${s.message_count} msgs  ~${tokens} tok  ${ago}  ${s.model}`,
        };
      });
      setSessionPicker(items);
      setSessionPickerIndex(0);
      return;
    }
    setLoading(true);
    setStreaming(false);
    setSpinnerMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);

    try {
      // Response is built incrementally via onToken callback
      // send() routes through architect if enabled, otherwise direct chat
      await agent.send(trimmed);
    } catch (err: any) {
      addMsg("error", `Error: ${err.message}`);
    }

    setLoading(false);
    setStreaming(false);
  }, [agent, exit, refreshConnectionBanner]);

  useInput((inputChar, key) => {
    // Handle slash command navigation
    if (showSuggestionsRef.current) {
      const matches = cmdMatchesRef.current;
      if (key.upArrow) {
        setCmdIndex((prev) => (prev - 1 + matches.length) % matches.length);
        return;
      }
      if (key.downArrow) {
        setCmdIndex((prev) => (prev + 1) % matches.length);
        return;
      }
      if (key.tab) {
        const selected = matches[cmdIndexRef.current];
        if (selected) {
          setInput(selected.cmd + (selected.cmd === "/commit" ? " " : ""));
          setCmdIndex(0);
          setInputKey((k) => k + 1);
        }
        return;
      }
    }

    // Login method picker navigation (second level — pick auth method)
    if (loginMethodPicker) {
      const methods = loginMethodPicker.methods;
      if (key.upArrow) {
        setLoginMethodIndex((prev: number) => (prev - 1 + methods.length) % methods.length);
        return;
      }
      if (key.downArrow) {
        setLoginMethodIndex((prev: number) => (prev + 1) % methods.length);
        return;
      }
      if (key.escape) {
        setLoginMethodPicker(null);
        setLoginPicker(true); // go back to provider picker
        return;
      }
      if (key.return) {
        const method = methods[loginMethodIndex];
        const providerId = loginMethodPicker.provider;
        setLoginMethodPicker(null);

        if (method === "oauth" && providerId === "openrouter") {
          addMsg("info", "Starting OpenRouter OAuth — opening browser...");
          setLoading(true);
          setSpinnerMsg("Waiting for authorization...");
          openRouterOAuth((msg: string) => addMsg("info", msg))
            .then(() => {
              addMsg("info", `✅ OpenRouter authenticated! Access to 200+ models.`);
              setLoading(false);
            })
            .catch((err: any) => { addMsg("error", `OAuth failed: ${err.message}`); setLoading(false); });
        } else if (method === "setup-token") {
          addMsg("info", "Starting setup-token flow — browser will open...");
          setLoading(true);
          setSpinnerMsg("Waiting for Claude Code auth...");
          anthropicSetupToken((msg: string) => addMsg("info", msg))
            .then((cred) => { addMsg("info", `✅ Anthropic authenticated! (${cred.label})`); setLoading(false); })
            .catch((err: any) => { addMsg("error", `Auth failed: ${err.message}`); setLoading(false); });
        } else if (method === "cached-token" && providerId === "openai") {
          const imported = importCodexToken((msg: string) => addMsg("info", msg));
          if (imported) { addMsg("info", `✅ Imported Codex credentials! (${imported.label})`); }
          else { addMsg("info", "No Codex CLI found. Install Codex CLI and sign in first."); }
        } else if (method === "cached-token" && providerId === "qwen") {
          const imported = importQwenToken((msg: string) => addMsg("info", msg));
          if (imported) { addMsg("info", `✅ Imported Qwen credentials! (${imported.label})`); }
          else { addMsg("info", "No Qwen CLI found. Install Qwen CLI and sign in first."); }
        } else if (method === "device-flow") {
          addMsg("info", "Starting GitHub Copilot device flow...");
          setLoading(true);
          setSpinnerMsg("Waiting for GitHub authorization...");
          copilotDeviceFlow((msg: string) => addMsg("info", msg))
            .then(() => { addMsg("info", `✅ GitHub Copilot authenticated!`); setLoading(false); })
            .catch((err: any) => { addMsg("error", `Copilot auth failed: ${err.message}`); setLoading(false); });
        } else if (method === "api-key") {
          const provider = PROVIDERS.find((p) => p.id === providerId);
          addMsg("info", `Enter your API key via CLI:\n  codemaxxing auth api-key ${providerId} <your-key>\n  Get key at: ${provider?.consoleUrl ?? "your provider's dashboard"}`);
        }
        return;
      }
      return;
    }

    // Login picker navigation (first level — pick provider)
    if (loginPicker) {
      const loginProviders = PROVIDERS.filter((p) => p.id !== "local");
      if (key.upArrow) {
        setLoginPickerIndex((prev: number) => (prev - 1 + loginProviders.length) % loginProviders.length);
        return;
      }
      if (key.downArrow) {
        setLoginPickerIndex((prev: number) => (prev + 1) % loginProviders.length);
        return;
      }
      if (key.return) {
        const selected = loginProviders[loginPickerIndex];
        setLoginPicker(false);

        // Get available methods for this provider (filter out 'none')
        const methods = selected.methods.filter((m) => m !== "none");

        if (methods.length === 1) {
          // Only one method — execute it directly
          setLoginMethodPicker({ provider: selected.id, methods });
          setLoginMethodIndex(0);
          // Simulate Enter press on the single method
          if (methods[0] === "oauth" && selected.id === "openrouter") {
            setLoginMethodPicker(null);
            addMsg("info", "Starting OpenRouter OAuth — opening browser...");
            setLoading(true);
            setSpinnerMsg("Waiting for authorization...");
            openRouterOAuth((msg: string) => addMsg("info", msg))
              .then(() => { addMsg("info", `✅ OpenRouter authenticated! Access to 200+ models.`); setLoading(false); })
              .catch((err: any) => { addMsg("error", `OAuth failed: ${err.message}`); setLoading(false); });
          } else if (methods[0] === "device-flow") {
            setLoginMethodPicker(null);
            addMsg("info", "Starting GitHub Copilot device flow...");
            setLoading(true);
            setSpinnerMsg("Waiting for GitHub authorization...");
            copilotDeviceFlow((msg: string) => addMsg("info", msg))
              .then(() => { addMsg("info", `✅ GitHub Copilot authenticated!`); setLoading(false); })
              .catch((err: any) => { addMsg("error", `Copilot auth failed: ${err.message}`); setLoading(false); });
          } else if (methods[0] === "api-key") {
            setLoginMethodPicker(null);
            addMsg("info", `Enter your API key via CLI:\n  codemaxxing auth api-key ${selected.id} <your-key>\n  Get key at: ${selected.consoleUrl ?? "your provider's dashboard"}`);
          }
        } else {
          // Multiple methods — show submenu
          setLoginMethodPicker({ provider: selected.id, methods });
          setLoginMethodIndex(0);
        }
        return;
      }
      if (key.escape) {
        setLoginPicker(false);
        return;
      }
      return;
    }

    // Skills picker navigation
    if (skillsPicker) {
      if (skillsPicker === "menu") {
        const menuItems = ["browse", "installed", "create", "remove"];
        if (key.upArrow) {
          setSkillsPickerIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
          return;
        }
        if (key.downArrow) {
          setSkillsPickerIndex((prev) => (prev + 1) % menuItems.length);
          return;
        }
        if (key.escape) {
          setSkillsPicker(null);
          return;
        }
        if (key.return) {
          const selected = menuItems[skillsPickerIndex];
          if (selected === "browse") {
            setSkillsPicker("browse");
            setSkillsPickerIndex(0);
          } else if (selected === "installed") {
            setSkillsPicker("installed");
            setSkillsPickerIndex(0);
          } else if (selected === "create") {
            setSkillsPicker(null);
            setInput("/skills create ");
            setInputKey((k) => k + 1);
          } else if (selected === "remove") {
            const installed = listInstalledSkills();
            if (installed.length === 0) {
              setSkillsPicker(null);
              addMsg("info", "No skills installed to remove.");
            } else {
              setSkillsPicker("remove");
              setSkillsPickerIndex(0);
            }
          }
          return;
        }
        return;
      }
      if (skillsPicker === "browse") {
        const registry = getRegistrySkills();
        if (key.upArrow) {
          setSkillsPickerIndex((prev) => (prev - 1 + registry.length) % registry.length);
          return;
        }
        if (key.downArrow) {
          setSkillsPickerIndex((prev) => (prev + 1) % registry.length);
          return;
        }
        if (key.escape) {
          setSkillsPicker("menu");
          setSkillsPickerIndex(0);
          return;
        }
        if (key.return) {
          const selected = registry[skillsPickerIndex];
          if (selected) {
            const result = installSkill(selected.name);
            addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
          }
          setSkillsPicker(null);
          return;
        }
        return;
      }
      if (skillsPicker === "installed") {
        const installed = listInstalledSkills();
        if (installed.length === 0) {
          setSkillsPicker("menu");
          setSkillsPickerIndex(0);
          addMsg("info", "No skills installed.");
          return;
        }
        if (key.upArrow) {
          setSkillsPickerIndex((prev) => (prev - 1 + installed.length) % installed.length);
          return;
        }
        if (key.downArrow) {
          setSkillsPickerIndex((prev) => (prev + 1) % installed.length);
          return;
        }
        if (key.escape) {
          setSkillsPicker("menu");
          setSkillsPickerIndex(0);
          return;
        }
        if (key.return) {
          // Toggle on/off for session
          const selected = installed[skillsPickerIndex];
          if (selected) {
            const isDisabled = sessionDisabledSkills.has(selected.name);
            if (isDisabled) {
              setSessionDisabledSkills((prev) => { const next = new Set(prev); next.delete(selected.name); return next; });
              if (agent) agent.enableSkill(selected.name);
              addMsg("info", `✅ Enabled: ${selected.name}`);
            } else {
              setSessionDisabledSkills((prev) => { const next = new Set(prev); next.add(selected.name); return next; });
              if (agent) agent.disableSkill(selected.name);
              addMsg("info", `✅ Disabled: ${selected.name} (session only)`);
            }
          }
          setSkillsPicker(null);
          return;
        }
        return;
      }
      if (skillsPicker === "remove") {
        const installed = listInstalledSkills();
        if (installed.length === 0) {
          setSkillsPicker(null);
          return;
        }
        if (key.upArrow) {
          setSkillsPickerIndex((prev) => (prev - 1 + installed.length) % installed.length);
          return;
        }
        if (key.downArrow) {
          setSkillsPickerIndex((prev) => (prev + 1) % installed.length);
          return;
        }
        if (key.escape) {
          setSkillsPicker("menu");
          setSkillsPickerIndex(0);
          return;
        }
        if (key.return) {
          const selected = installed[skillsPickerIndex];
          if (selected) {
            const result = removeSkill(selected.name);
            addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
          }
          setSkillsPicker(null);
          return;
        }
        return;
      }
      return;
    }

    // ── Model picker ──
    if (modelPicker) {
      if (key.upArrow) {
        setModelPickerIndex((prev) => (prev - 1 + modelPicker.length) % modelPicker.length);
        return;
      }
      if (key.downArrow) {
        setModelPickerIndex((prev) => (prev + 1) % modelPicker.length);
        return;
      }
      if (key.escape) {
        setModelPicker(null);
        return;
      }
      if (key.return) {
        const selected = modelPicker[modelPickerIndex];
        if (selected && agent) {
          agent.switchModel(selected);
          setModelName(selected);
          addMsg("info", `✅ Switched to: ${selected}`);
          refreshConnectionBanner();
        }
        setModelPicker(null);
        return;
      }
      return;
    }

    // ── Ollama delete picker ──
    if (ollamaDeletePicker) {
      if (key.upArrow) {
        setOllamaDeletePickerIndex((prev) => (prev - 1 + ollamaDeletePicker.models.length) % ollamaDeletePicker.models.length);
        return;
      }
      if (key.downArrow) {
        setOllamaDeletePickerIndex((prev) => (prev + 1) % ollamaDeletePicker.models.length);
        return;
      }
      if (key.escape) {
        setOllamaDeletePicker(null);
        return;
      }
      if (key.return) {
        const selected = ollamaDeletePicker.models[ollamaDeletePickerIndex];
        if (selected) {
          setOllamaDeletePicker(null);
          setOllamaDeleteConfirm({ model: selected.name, size: selected.size });
        }
        return;
      }
      return;
    }

    // ── Ollama pull picker ──
    if (ollamaPullPicker) {
      const pullModels = [
        { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "5 GB", desc: "Best balance of speed & quality" },
        { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9 GB", desc: "Higher quality, needs 16GB+ RAM" },
        { id: "qwen2.5-coder:3b", name: "Qwen 2.5 Coder 3B", size: "2 GB", desc: "\u26A0\uFE0F Basic \u2014 may struggle with tool calls" },
        { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "20 GB", desc: "Premium quality, needs 48GB+" },
        { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2", size: "9 GB", desc: "Strong alternative" },
        { id: "codellama:7b", name: "CodeLlama 7B", size: "4 GB", desc: "Meta's coding model" },
        { id: "starcoder2:7b", name: "StarCoder2 7B", size: "4 GB", desc: "Code completion focused" },
      ];
      if (key.upArrow) {
        setOllamaPullPickerIndex((prev) => (prev - 1 + pullModels.length) % pullModels.length);
        return;
      }
      if (key.downArrow) {
        setOllamaPullPickerIndex((prev) => (prev + 1) % pullModels.length);
        return;
      }
      if (key.escape) {
        setOllamaPullPicker(false);
        return;
      }
      if (key.return) {
        const selected = pullModels[ollamaPullPickerIndex];
        if (selected) {
          setOllamaPullPicker(false);
          // Trigger the pull
          setInput(`/ollama pull ${selected.id}`);
          setInputKey((k) => k + 1);
          // Submit it
          setTimeout(() => {
            const submitInput = `/ollama pull ${selected.id}`;
            setInput("");
            handleSubmit(submitInput);
          }, 50);
        }
        return;
      }
      return;
    }

    // ── Ollama delete confirmation ──
    if (ollamaDeleteConfirm) {
      if (inputChar === "y" || inputChar === "Y") {
        const model = ollamaDeleteConfirm.model;
        setOllamaDeleteConfirm(null);
        const result = deleteModel(model);
        addMsg(result.ok ? "info" : "error", result.ok ? `\u2705 ${result.message}` : `\u274C ${result.message}`);
        return;
      }
      if (inputChar === "n" || inputChar === "N" || key.escape) {
        setOllamaDeleteConfirm(null);
        addMsg("info", "Delete cancelled.");
        return;
      }
      return;
    }

    // ── Ollama exit prompt ──
    if (ollamaExitPrompt) {
      if (inputChar === "y" || inputChar === "Y") {
        setOllamaExitPrompt(false);
        stopOllama().then(() => exit());
        return;
      }
      if (inputChar === "n" || inputChar === "N") {
        setOllamaExitPrompt(false);
        exit();
        return;
      }
      if (inputChar === "a" || inputChar === "A") {
        setOllamaExitPrompt(false);
        saveConfig({ defaults: { ...loadConfig().defaults, stopOllamaOnExit: true } });
        addMsg("info", "Saved preference: always stop Ollama on exit.");
        stopOllama().then(() => exit());
        return;
      }
      if (key.escape) {
        setOllamaExitPrompt(false);
        return;
      }
      return;
    }

    // ── Setup Wizard Navigation ──
    if (wizardScreen) {
      if (wizardScreen === "connection") {
        const items = ["local", "openrouter", "apikey", "existing"];
        if (key.upArrow) {
          setWizardIndex((prev) => (prev - 1 + items.length) % items.length);
          return;
        }
        if (key.downArrow) {
          setWizardIndex((prev) => (prev + 1) % items.length);
          return;
        }
        if (key.escape) {
          setWizardScreen(null);
          return;
        }
        if (key.return) {
          const selected = items[wizardIndex];
          if (selected === "local") {
            // Scan hardware and show model picker (use llmfit if available)
            const hw = detectHardware();
            setWizardHardware(hw);
            const { models: recs } = getRecommendationsWithLlmfit(hw);
            setWizardModels(recs.filter(m => m.fit !== "skip"));
            setWizardScreen("models");
            setWizardIndex(0);
          } else if (selected === "openrouter") {
            setWizardScreen(null);
            addMsg("info", "Starting OpenRouter OAuth — opening browser...");
            setLoading(true);
            setSpinnerMsg("Waiting for authorization...");
            openRouterOAuth((msg: string) => addMsg("info", msg))
              .then(() => {
                addMsg("info", "✅ OpenRouter authenticated! Use /connect to connect.");
                setLoading(false);
              })
              .catch((err: any) => { addMsg("error", `OAuth failed: ${err.message}`); setLoading(false); });
          } else if (selected === "apikey") {
            setWizardScreen(null);
            setLoginPicker(true);
            setLoginPickerIndex(0);
          } else if (selected === "existing") {
            setWizardScreen(null);
            addMsg("info", "Start your LLM server, then type /connect to retry.");
          }
          return;
        }
        return;
      }

      if (wizardScreen === "models") {
        const models = wizardModels;
        if (key.upArrow) {
          setWizardIndex((prev) => (prev - 1 + models.length) % models.length);
          return;
        }
        if (key.downArrow) {
          setWizardIndex((prev) => (prev + 1) % models.length);
          return;
        }
        if (key.escape) {
          setWizardScreen("connection");
          setWizardIndex(0);
          return;
        }
        if (key.return) {
          const selected = models[wizardIndex];
          if (selected) {
            setWizardSelectedModel(selected);
            // Check if Ollama is installed
            if (!isOllamaInstalled()) {
              setWizardScreen("install-ollama");
            } else {
              // Start pulling the model
              setWizardScreen("pulling");
              setWizardPullProgress({ status: "starting", percent: 0 });
              setWizardPullError(null);

              (async () => {
                try {
                  // Ensure ollama is running
                  const running = await isOllamaRunning();
                  if (!running) {
                    setWizardPullProgress({ status: "Starting Ollama server...", percent: 0 });
                    startOllama();
                    // Wait for it to come up
                    for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 1000));
                      if (await isOllamaRunning()) break;
                    }
                    if (!(await isOllamaRunning())) {
                      setWizardPullError("Could not start Ollama server. Run 'ollama serve' manually, then press Enter.");
                      return;
                    }
                  }

                  await pullModel(selected.ollamaId, (p) => {
                    setWizardPullProgress(p);
                  });

                  setWizardPullProgress({ status: "success", percent: 100 });

                  // Wait briefly then connect
                  await new Promise(r => setTimeout(r, 500));
                  setWizardScreen(null);
                  setWizardPullProgress(null);
                  setWizardSelectedModel(null);
                  addMsg("info", `✅ ${selected.name} installed! Connecting...`);
                  await connectToProvider(true);
                } catch (err: any) {
                  setWizardPullError(err.message);
                }
              })();
            }
          }
          return;
        }
        return;
      }

      if (wizardScreen === "install-ollama") {
        if (key.escape) {
          setWizardScreen("models");
          setWizardIndex(0);
          return;
        }
        if (key.return) {
          // Auto-install Ollama if not present
          if (!isOllamaInstalled()) {
            setLoading(true);
            setSpinnerMsg("Installing Ollama... this may take a minute");

            // Run install async so the UI can update
            const installCmd = getOllamaInstallCommand(wizardHardware?.os ?? "linux");
            (async () => {
              try {
                const { exec } = _require("child_process");
                await new Promise<void>((resolve, reject) => {
                  exec(installCmd, { timeout: 180000 }, (err: any, _stdout: string, stderr: string) => {
                    if (err) reject(new Error(stderr || err.message));
                    else resolve();
                  });
                });
                addMsg("info", "✅ Ollama installed! Proceeding to model download...");
                setLoading(false);
                // Small delay for PATH to update on Windows
                await new Promise(r => setTimeout(r, 2000));
                // Go back to models screen so user can pick and it'll proceed to pull
                setWizardScreen("models");
              } catch (e: any) {
                addMsg("error", `Install failed: ${e.message}`);
                addMsg("info", `Try manually in a separate terminal: ${installCmd}`);
                setLoading(false);
                setWizardScreen("install-ollama");
              }
            })();
            return;
          }
          // Ollama already installed — proceed to pull
          {
            const selected = wizardSelectedModel;
            if (selected) {
              setWizardScreen("pulling");
              setWizardPullProgress({ status: "starting", percent: 0 });
              setWizardPullError(null);

              (async () => {
                try {
                  const running = await isOllamaRunning();
                  if (!running) {
                    setWizardPullProgress({ status: "Starting Ollama server...", percent: 0 });
                    startOllama();
                    for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 1000));
                      if (await isOllamaRunning()) break;
                    }
                    if (!(await isOllamaRunning())) {
                      setWizardPullError("Could not start Ollama server. Run 'ollama serve' manually, then press Enter.");
                      return;
                    }
                  }
                  await pullModel(selected.ollamaId, (p) => setWizardPullProgress(p));
                  setWizardPullProgress({ status: "success", percent: 100 });
                  await new Promise(r => setTimeout(r, 500));
                  setWizardScreen(null);
                  setWizardPullProgress(null);
                  setWizardSelectedModel(null);
                  addMsg("info", `✅ ${selected.name} installed! Connecting...`);
                  await connectToProvider(true);
                } catch (err: any) {
                  setWizardPullError(err.message);
                }
              })();
            }
          }
          return;
        }
        return;
      }

      if (wizardScreen === "pulling") {
        // Allow retry on error
        if (wizardPullError && key.return) {
          const selected = wizardSelectedModel;
          if (selected) {
            setWizardPullError(null);
            setWizardPullProgress({ status: "retrying", percent: 0 });
            (async () => {
              try {
                const running = await isOllamaRunning();
                if (!running) {
                  startOllama();
                  for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    if (await isOllamaRunning()) break;
                  }
                }
                await pullModel(selected.ollamaId, (p) => setWizardPullProgress(p));
                setWizardPullProgress({ status: "success", percent: 100 });
                await new Promise(r => setTimeout(r, 500));
                setWizardScreen(null);
                setWizardPullProgress(null);
                setWizardSelectedModel(null);
                addMsg("info", `✅ ${selected.name} installed! Connecting...`);
                await connectToProvider(true);
              } catch (err: any) {
                setWizardPullError(err.message);
              }
            })();
          }
          return;
        }
        if (wizardPullError && key.escape) {
          setWizardScreen("models");
          setWizardIndex(0);
          setWizardPullError(null);
          setWizardPullProgress(null);
          return;
        }
        return; // Ignore keys while pulling
      }

      return;
    }

    // Theme picker navigation
    if (themePicker) {
      const themeKeys = listThemes();
      if (key.upArrow) {
        setThemePickerIndex((prev) => (prev - 1 + themeKeys.length) % themeKeys.length);
        return;
      }
      if (key.downArrow) {
        setThemePickerIndex((prev) => (prev + 1) % themeKeys.length);
        return;
      }
      if (key.return) {
        const selected = themeKeys[themePickerIndex];
        setTheme(getTheme(selected));
        setThemePicker(false);
        addMsg("info", `✅ Switched to theme: ${THEMES[selected].name}`);
        return;
      }
      if (key.escape) {
        setThemePicker(false);
        return;
      }
      return;
    }

    // Session picker navigation
    if (sessionPicker) {
      if (key.upArrow) {
        setSessionPickerIndex((prev) => (prev - 1 + sessionPicker.length) % sessionPicker.length);
        return;
      }
      if (key.downArrow) {
        setSessionPickerIndex((prev) => (prev + 1) % sessionPicker.length);
        return;
      }
      if (key.return) {
        const selected = sessionPicker[sessionPickerIndex];
        if (selected && agent) {
          const session = getSession(selected.id);
          if (session) {
            agent.resume(selected.id).then(() => {
              const dir = session.cwd.split("/").pop() || session.cwd;
              // Find last user message for context
              const msgs = loadMessages(selected.id);
              const lastUserMsg = [...msgs].reverse().find(m => m.role === "user");
              const lastText = lastUserMsg && typeof lastUserMsg.content === "string"
                ? lastUserMsg.content.slice(0, 80) + (lastUserMsg.content.length > 80 ? "..." : "")
                : null;
              let info = `✅ Resumed session ${selected.id} (${dir}/, ${session.message_count} messages)`;
              if (lastText) info += `\n  Last: "${lastText}"`;
              addMsg("info", info);
            }).catch((e: any) => {
              addMsg("error", `Failed to resume: ${e.message}`);
            });
          }
        }
        setSessionPicker(null);
        setSessionPickerIndex(0);
        return;
      }
      if (key.escape) {
        setSessionPicker(null);
        setSessionPickerIndex(0);
        addMsg("info", "Resume cancelled.");
        return;
      }
      return; // Ignore other keys during session picker
    }

    // Delete session confirmation (y/n)
    if (deleteSessionConfirm) {
      if (inputChar === "y" || inputChar === "Y") {
        const deleted = deleteSession(deleteSessionConfirm.id);
        if (deleted) {
          addMsg("info", `✅ Deleted session ${deleteSessionConfirm.id}`);
        } else {
          addMsg("error", `Failed to delete session ${deleteSessionConfirm.id}`);
        }
        setDeleteSessionConfirm(null);
        return;
      }
      if (inputChar === "n" || inputChar === "N" || key.escape) {
        addMsg("info", "Delete cancelled.");
        setDeleteSessionConfirm(null);
        return;
      }
      return;
    }

    // Delete session picker navigation
    if (deleteSessionPicker) {
      if (key.upArrow) {
        setDeleteSessionPickerIndex((prev) => (prev - 1 + deleteSessionPicker.length) % deleteSessionPicker.length);
        return;
      }
      if (key.downArrow) {
        setDeleteSessionPickerIndex((prev) => (prev + 1) % deleteSessionPicker.length);
        return;
      }
      if (key.return) {
        const selected = deleteSessionPicker[deleteSessionPickerIndex];
        if (selected) {
          setDeleteSessionPicker(null);
          setDeleteSessionPickerIndex(0);
          setDeleteSessionConfirm(selected);
        }
        return;
      }
      if (key.escape) {
        setDeleteSessionPicker(null);
        setDeleteSessionPickerIndex(0);
        addMsg("info", "Delete cancelled.");
        return;
      }
      return;
    }

    // Backspace with empty input → remove last paste chunk
    if (key.backspace || key.delete) {
      if (input === "" && pastedChunksRef.current.length > 0) {
        setPastedChunks((prev) => prev.slice(0, -1));
        return;
      }
    }

    // Handle approval prompts
    if (approval) {
      if (inputChar === "y" || inputChar === "Y") {
        const r = approval.resolve;
        setApproval(null);
        setLoading(true);
        setSpinnerMsg("Executing...");
        r("yes");
        return;
      }
      if (inputChar === "n" || inputChar === "N") {
        const r = approval.resolve;
        setApproval(null);
        addMsg("info", "✗ Denied");
        r("no");
        return;
      }
      if (inputChar === "a" || inputChar === "A") {
        const r = approval.resolve;
        setApproval(null);
        setLoading(true);
        setSpinnerMsg("Executing...");
        addMsg("info", `✔ Always allow ${approval.tool} for this session`);
        r("always");
        return;
      }
      return; // Ignore other keys during approval
    }

    if (key.ctrl && inputChar === "c") {
      if (ctrlCPressed) {
        // Force quit on second Ctrl+C — don't block
        const config = loadConfig();
        if (config.defaults.stopOllamaOnExit) {
          stopOllama().finally(() => exit());
        } else {
          exit();
        }
      } else {
        setCtrlCPressed(true);
        addMsg("info", "Press Ctrl+C again to exit.");
        setTimeout(() => setCtrlCPressed(false), 3000);
      }
    }
  });

  // CODE banner lines
  const codeLines = [
    "                     _(`-')    (`-')  _ ",
    " _             .->  ( (OO ).-> ( OO).-/ ",
    " \\-,-----.(`-')----. \\    .'_ (,------. ",
    "  |  .--./( OO).-.  ''`'-..__) |  .---' ",
    " /_) (`-')( _) | |  ||  |  ' |(|  '--.  ",
    " ||  |OO ) \\|  |)|  ||  |  / : |  .--'  ",
    "(_'  '--'\\  '  '-'  '|  '-'  / |  `---. ",
    "   `-----'   `-----' `------'  `------' ",
  ];
  const maxxingLines = [
    "<-. (`-')   (`-')  _  (`-')      (`-')      _     <-. (`-')_            ",
    "   \\(OO )_  (OO ).-/  (OO )_.->  (OO )_.-> (_)       \\( OO) )    .->    ",
    ",--./  ,-.) / ,---.   (_| \\_)--. (_| \\_)--.,-(`-'),--./ ,--/  ,---(`-') ",
    "|   `.'   | | \\ /`.\\  \\  `.'  /  \\  `.'  / | ( OO)|   \\ |  | '  .-(OO ) ",
    "|  |'.'|  | '-'|_.' |  \\    .')   \\    .') |  |  )|  . '|  |)|  | .-, \\ ",
    "|  |   |  |(|  .-.  |  .'    \\    .'    \\ (|  |_/ |  |\\    | |  | '.(_/ ",
    "|  |   |  | |  | |  | /  .'.  \\  /  .'.  \\ |  |'->|  | \\   | |  '-'  |  ",
    "`--'   `--' `--' `--'`--'   '--'`--'   '--'`--'   `--'  `--'  `-----'   ",
  ];

  return (
    <Box flexDirection="column">
      {/* ═══ BANNER BOX ═══ */}
      <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.border} paddingX={1}>
        {codeLines.map((line, i) => (
          <Text key={`c${i}`} color={theme.colors.primary}>{line}</Text>
        ))}
        {maxxingLines.map((line, i) => (
          <Text key={`m${i}`} color={theme.colors.secondary}>{line}</Text>
        ))}
        <Text>
          <Text color={theme.colors.muted}>{"                            v" + VERSION}</Text>
          {"  "}<Text color={theme.colors.primary}>💪</Text>
          {"  "}<Text dimColor>your code. your model. no excuses.</Text>
        </Text>
        <Text dimColor>{"  Type "}<Text color={theme.colors.muted}>/help</Text>{" for commands · "}<Text color={theme.colors.muted}>Ctrl+C</Text>{" twice to exit"}</Text>
      </Box>

      {/* ═══ CONNECTION INFO BOX ═══ */}
      {connectionInfo.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.muted} paddingX={1} marginBottom={1}>
          {connectionInfo.map((line, i) => (
            <Text key={i} color={line.startsWith("✔") ? theme.colors.primary : line.startsWith("✗") ? theme.colors.error : theme.colors.muted}>{line}</Text>
          ))}
        </Box>
      )}

      {/* ═══ CHAT MESSAGES ═══ */}
      {messages.map((msg) => {
        switch (msg.type) {
          case "user":
            return (
              <Box key={msg.id} marginTop={1}>
                <Text color={theme.colors.userInput}>{"  > "}{msg.text}</Text>
              </Box>
            );
          case "response":
            return (
              <Box key={msg.id} flexDirection="column" marginLeft={2} marginBottom={1}>
                {msg.text.split("\n").map((l, i) => (
                  <Text key={i} wrap="wrap">
                    {i === 0 ? <Text color={theme.colors.response}>● </Text> : <Text>  </Text>}
                    {l.startsWith("```") ? <Text color={theme.colors.muted}>{l}</Text> :
                     l.startsWith("# ") || l.startsWith("## ") ? <Text bold color={theme.colors.secondary}>{l}</Text> :
                     l.startsWith("**") ? <Text bold>{l}</Text> :
                     <Text>{l}</Text>}
                  </Text>
                ))}
              </Box>
            );
          case "tool":
            return (
              <Box key={msg.id}>
                <Text><Text color={theme.colors.response}>  ● </Text><Text bold color={theme.colors.tool}>{msg.text}</Text></Text>
              </Box>
            );
          case "tool-result":
            return <Text key={msg.id} color={theme.colors.toolResult}>    {msg.text}</Text>;
          case "error":
            return <Text key={msg.id} color={theme.colors.error}>  {msg.text}</Text>;
          case "info":
            return <Text key={msg.id} color={theme.colors.muted}>  {msg.text}</Text>;
          default:
            return <Text key={msg.id}>{msg.text}</Text>;
        }
      })}

      {/* ═══ SPINNER ═══ */}
      {loading && !approval && !streaming && <NeonSpinner message={spinnerMsg} colors={theme.colors} />}
      {streaming && !loading && <StreamingIndicator colors={theme.colors} />}

      {/* ═══ APPROVAL PROMPT ═══ */}
      {approval && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginTop={1}>
          <Text bold color={theme.colors.warning}>⚠ Approve {approval.tool}?</Text>
          {approval.tool === "write_file" && approval.args.path ? (
            <Text color={theme.colors.muted}>{"  📄 "}{String(approval.args.path)}</Text>
          ) : null}
          {approval.tool === "write_file" && approval.args.content ? (
            <Text color={theme.colors.muted}>{"  "}{String(approval.args.content).split("\n").length}{" lines, "}{String(approval.args.content).length}{"B"}</Text>
          ) : null}
          {approval.diff ? (
            <Box flexDirection="column" marginTop={0} marginLeft={2}>
              {approval.diff.split("\n").slice(0, 40).map((line, i) => (
                <Text key={i} color={
                  line.startsWith("+") ? theme.colors.success :
                  line.startsWith("-") ? theme.colors.error :
                  line.startsWith("@@") ? theme.colors.primary :
                  theme.colors.muted
                }>{line}</Text>
              ))}
              {approval.diff.split("\n").length > 40 ? (
                <Text color={theme.colors.muted}>... ({approval.diff.split("\n").length - 40} more lines)</Text>
              ) : null}
            </Box>
          ) : null}
          {approval.tool === "run_command" && approval.args.command ? (
            <Text color={theme.colors.muted}>{"  $ "}{String(approval.args.command)}</Text>
          ) : null}
          <Text>
            <Text color={theme.colors.success} bold> [y]</Text><Text>es  </Text>
            <Text color={theme.colors.error} bold>[n]</Text><Text>o  </Text>
            <Text color={theme.colors.primary} bold>[a]</Text><Text>lways</Text>
          </Text>
        </Box>
      )}

      {/* ═══ LOGIN PICKER ═══ */}
      {loginPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>💪 Choose a provider:</Text>
          {PROVIDERS.filter((p) => p.id !== "local").map((p, i) => (
            <Text key={p.id}>
              {i === loginPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === loginPickerIndex ? theme.colors.suggestion : theme.colors.primary} bold>{p.name}</Text>
              <Text color={theme.colors.muted}>{" — "}{p.description}</Text>
              {getCredentials().some((c) => c.provider === p.id) ? <Text color={theme.colors.success}> ✓</Text> : null}
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ LOGIN METHOD PICKER ═══ */}
      {loginMethodPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>How do you want to authenticate?</Text>
          {loginMethodPicker.methods.map((method, i) => {
            const labels: Record<string, string> = {
              "oauth": "🌐 Browser login (OAuth)",
              "setup-token": "🔑 Link subscription (via Claude Code CLI)",
              "cached-token": "📦 Import from existing CLI",
              "api-key": "🔒 Enter API key manually",
              "device-flow": "📱 Device flow (GitHub)",
            };
            return (
              <Text key={method}>
                {i === loginMethodIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
                <Text color={i === loginMethodIndex ? theme.colors.suggestion : theme.colors.primary} bold>{labels[method] ?? method}</Text>
              </Text>
            );
          })}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc back"}</Text>
        </Box>
      )}

      {/* ═══ SKILLS PICKER ═══ */}
      {skillsPicker === "menu" && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Skills:</Text>
          {[
            { key: "browse", label: "Browse & Install", icon: "📦" },
            { key: "installed", label: "Installed Skills", icon: "📋" },
            { key: "create", label: "Create Custom Skill", icon: "➕" },
            { key: "remove", label: "Remove Skill", icon: "🗑️" },
          ].map((item, i) => (
            <Text key={item.key}>
              {i === skillsPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === skillsPickerIndex ? theme.colors.suggestion : theme.colors.primary} bold>{item.icon} {item.label}</Text>
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
        </Box>
      )}
      {skillsPicker === "browse" && (() => {
        const registry = getRegistrySkills();
        const installed = listInstalledSkills().map((s) => s.name);
        return (
          <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
            <Text bold color={theme.colors.secondary}>Browse Skills Registry:</Text>
            {registry.map((s, i) => (
              <Text key={s.name}>
                {i === skillsPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
                <Text color={i === skillsPickerIndex ? theme.colors.suggestion : theme.colors.primary} bold>{s.name}</Text>
                <Text color={theme.colors.muted}>{" — "}{s.description}</Text>
                {installed.includes(s.name) ? <Text color={theme.colors.success}> ✓</Text> : null}
              </Text>
            ))}
            <Text dimColor>{"  ↑↓ navigate · Enter install · Esc back"}</Text>
          </Box>
        );
      })()}
      {skillsPicker === "installed" && (() => {
        const installed = listInstalledSkills();
        const active = getActiveSkills(process.cwd(), sessionDisabledSkills);
        return (
          <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
            <Text bold color={theme.colors.secondary}>Installed Skills:</Text>
            {installed.length === 0 ? (
              <Text color={theme.colors.muted}>  No skills installed. Use Browse & Install.</Text>
            ) : installed.map((s, i) => (
              <Text key={s.name}>
                {i === skillsPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
                <Text color={i === skillsPickerIndex ? theme.colors.suggestion : theme.colors.primary} bold>{s.name}</Text>
                <Text color={theme.colors.muted}>{" — "}{s.description}</Text>
                {active.includes(s.name) ? <Text color={theme.colors.success}> (on)</Text> : <Text color={theme.colors.muted}> (off)</Text>}
              </Text>
            ))}
            <Text dimColor>{"  ↑↓ navigate · Enter toggle · Esc back"}</Text>
          </Box>
        );
      })()}
      {skillsPicker === "remove" && (() => {
        const installed = listInstalledSkills();
        return (
          <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.error} paddingX={1} marginBottom={0}>
            <Text bold color={theme.colors.error}>Remove a skill:</Text>
            {installed.map((s, i) => (
              <Text key={s.name}>
                {i === skillsPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
                <Text color={i === skillsPickerIndex ? theme.colors.suggestion : theme.colors.muted}>{s.name} — {s.description}</Text>
              </Text>
            ))}
            <Text dimColor>{"  ↑↓ navigate · Enter remove · Esc back"}</Text>
          </Box>
        );
      })()}

      {/* ═══ THEME PICKER ═══ */}
      {themePicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Choose a theme:</Text>
          {listThemes().map((key, i) => (
            <Text key={key}>
              {i === themePickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === themePickerIndex ? theme.colors.suggestion : theme.colors.primary} bold>{key}</Text>
              <Text color={theme.colors.muted}>{" — "}{THEMES[key].description}</Text>
              {key === theme.name.toLowerCase() ? <Text color={theme.colors.muted}> (current)</Text> : null}
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ SESSION PICKER ═══ */}
      {sessionPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.secondary} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Resume a session:</Text>
          {sessionPicker.map((s, i) => (
            <Text key={s.id}>
              {i === sessionPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === sessionPickerIndex ? theme.colors.suggestion : theme.colors.muted}>{s.display}</Text>
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ DELETE SESSION PICKER ═══ */}
      {deleteSessionPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.error} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.error}>Delete a session:</Text>
          {deleteSessionPicker.map((s, i) => (
            <Text key={s.id}>
              {i === deleteSessionPickerIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === deleteSessionPickerIndex ? theme.colors.suggestion : theme.colors.muted}>{s.display}</Text>
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ DELETE SESSION CONFIRM ═══ */}
      {deleteSessionConfirm && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.warning}>Delete session {deleteSessionConfirm.id}?</Text>
          <Text color={theme.colors.muted}>{"  "}{deleteSessionConfirm.display}</Text>
          <Text>
            <Text color={theme.colors.error} bold> [y]</Text><Text>es  </Text>
            <Text color={theme.colors.success} bold>[n]</Text><Text>o</Text>
          </Text>
        </Box>
      )}

      {/* ═══ MODEL PICKER ═══ */}
      {modelPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Switch model:</Text>
          <Text>{""}</Text>
          {modelPicker.map((m, i) => (
            <Text key={m}>
              {"  "}{i === modelPickerIndex ? <Text color={theme.colors.primary} bold>{"▸ "}</Text> : "  "}
              <Text color={i === modelPickerIndex ? theme.colors.primary : undefined}>{m}</Text>
              {m === modelName ? <Text color={theme.colors.success}>{" (active)"}</Text> : null}
            </Text>
          ))}
          <Text>{""}</Text>
          <Text dimColor>{"  ↑↓ navigate · Enter to switch · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ OLLAMA DELETE PICKER ═══ */}
      {ollamaDeletePicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Delete which model?</Text>
          <Text>{""}</Text>
          {ollamaDeletePicker.models.map((m, i) => (
            <Text key={m.name}>
              {"  "}{i === ollamaDeletePickerIndex ? <Text color={theme.colors.primary} bold>{"▸ "}</Text> : "  "}
              <Text color={i === ollamaDeletePickerIndex ? theme.colors.primary : undefined}>{m.name}</Text>
              <Text color={theme.colors.muted}>{" ("}{(m.size / (1024 * 1024 * 1024)).toFixed(1)}{" GB)"}</Text>
            </Text>
          ))}
          <Text>{""}</Text>
          <Text dimColor>{"  ↑↓ navigate · Enter to delete · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ OLLAMA PULL PICKER ═══ */}
      {ollamaPullPicker && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Download which model?</Text>
          <Text>{""}</Text>
          {[
            { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "5 GB", desc: "Best balance of speed & quality" },
            { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9 GB", desc: "Higher quality, needs 16GB+ RAM" },
            { id: "qwen2.5-coder:3b", name: "Qwen 2.5 Coder 3B", size: "2 GB", desc: "\u26A0\uFE0F Basic \u2014 may struggle with tool calls" },
            { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "20 GB", desc: "Premium, needs 48GB+" },
            { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2", size: "9 GB", desc: "Strong alternative" },
            { id: "codellama:7b", name: "CodeLlama 7B", size: "4 GB", desc: "Meta's coding model" },
            { id: "starcoder2:7b", name: "StarCoder2 7B", size: "4 GB", desc: "Code completion focused" },
          ].map((m, i) => (
            <Text key={m.id}>
              {"  "}{i === ollamaPullPickerIndex ? <Text color={theme.colors.primary} bold>{"▸ "}</Text> : "  "}
              <Text color={i === ollamaPullPickerIndex ? theme.colors.primary : undefined} bold>{m.name}</Text>
              <Text color={theme.colors.muted}>{" · "}{m.size}{" · "}{m.desc}</Text>
            </Text>
          ))}
          <Text>{""}</Text>
          <Text dimColor>{"  ↑↓ navigate · Enter to download · Esc cancel"}</Text>
        </Box>
      )}

      {/* ═══ OLLAMA DELETE CONFIRM ═══ */}
      {ollamaDeleteConfirm && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.warning}>Delete {ollamaDeleteConfirm.model} ({(ollamaDeleteConfirm.size / (1024 * 1024 * 1024)).toFixed(1)} GB)?</Text>
          <Text>
            <Text color={theme.colors.error} bold> [y]</Text><Text>es  </Text>
            <Text color={theme.colors.success} bold>[n]</Text><Text>o</Text>
          </Text>
        </Box>
      )}

      {/* ═══ OLLAMA PULL PROGRESS ═══ */}
      {ollamaPulling && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>{"  Downloading "}{ollamaPulling.model}{"..."}</Text>
          {ollamaPulling.progress.status === "downloading" || ollamaPulling.progress.percent > 0 ? (
            <Text>
              {"  "}
              <Text color={theme.colors.primary}>
                {"\u2588".repeat(Math.floor(ollamaPulling.progress.percent / 5))}
                {"\u2591".repeat(20 - Math.floor(ollamaPulling.progress.percent / 5))}
              </Text>
              {"  "}<Text bold>{ollamaPulling.progress.percent}%</Text>
              {ollamaPulling.progress.completed != null && ollamaPulling.progress.total != null ? (
                <Text color={theme.colors.muted}>{" \u00B7 "}{formatBytes(ollamaPulling.progress.completed)}{" / "}{formatBytes(ollamaPulling.progress.total)}</Text>
              ) : null}
            </Text>
          ) : (
            <Text color={theme.colors.muted}>{"  "}{ollamaPulling.progress.status}...</Text>
          )}
        </Box>
      )}

      {/* ═══ OLLAMA EXIT PROMPT ═══ */}
      {ollamaExitPrompt && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.warning}>Ollama is still running.</Text>
          <Text color={theme.colors.muted}>Stop it to free GPU memory?</Text>
          <Text>
            <Text color={theme.colors.success} bold> [y]</Text><Text>es  </Text>
            <Text color={theme.colors.error} bold>[n]</Text><Text>o  </Text>
            <Text color={theme.colors.primary} bold>[a]</Text><Text>lways</Text>
          </Text>
        </Box>
      )}

      {/* ═══ SETUP WIZARD ═══ */}
      {wizardScreen === "connection" && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>No LLM detected. How do you want to connect?</Text>
          <Text>{""}</Text>
          {[
            { key: "local",      icon: "\uD83D\uDDA5\uFE0F",  label: "Set up a local model", desc: "free, runs on your machine" },
            { key: "openrouter", icon: "\uD83C\uDF10", label: "OpenRouter", desc: "200+ cloud models, browser login" },
            { key: "apikey",     icon: "\uD83D\uDD11", label: "Enter API key manually", desc: "" },
            { key: "existing",   icon: "\u2699\uFE0F",  label: "I already have a server running", desc: "" },
          ].map((item, i) => (
            <Text key={item.key}>
              {i === wizardIndex ? <Text color={theme.colors.suggestion} bold>{"  \u25B8 "}</Text> : <Text>{"    "}</Text>}
              <Text color={i === wizardIndex ? theme.colors.suggestion : theme.colors.primary} bold>{item.icon}  {item.label}</Text>
              {item.desc ? <Text color={theme.colors.muted}>{" ("}{item.desc}{")"}</Text> : null}
            </Text>
          ))}
          <Text>{""}</Text>
          <Text dimColor>{"  \u2191\u2193 navigate \u00B7 Enter to select"}</Text>
        </Box>
      )}

      {wizardScreen === "models" && wizardHardware && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.secondary}>Your hardware:</Text>
          <Text color={theme.colors.muted}>{"  CPU: "}{wizardHardware.cpu.name}{" ("}{wizardHardware.cpu.cores}{" cores)"}</Text>
          <Text color={theme.colors.muted}>{"  RAM: "}{formatBytes(wizardHardware.ram)}</Text>
          {wizardHardware.gpu ? (
            <Text color={theme.colors.muted}>{"  GPU: "}{wizardHardware.gpu.name}{wizardHardware.gpu.vram > 0 ? ` (${formatBytes(wizardHardware.gpu.vram)})` : ""}</Text>
          ) : (
            <Text color={theme.colors.muted}>{"  GPU: none detected"}</Text>
          )}
          {!isLlmfitAvailable() && (
            <Text dimColor>{"  Tip: Install llmfit for smarter recommendations: brew install llmfit"}</Text>
          )}
          <Text>{""}</Text>
          <Text bold color={theme.colors.secondary}>Recommended models:</Text>
          <Text>{""}</Text>
          {wizardModels.map((m, i) => (
            <Text key={m.ollamaId}>
              {i === wizardIndex ? <Text color={theme.colors.suggestion} bold>{"  \u25B8 "}</Text> : <Text>{"    "}</Text>}
              <Text>{getFitIcon(m.fit)} </Text>
              <Text color={i === wizardIndex ? theme.colors.suggestion : theme.colors.primary} bold>{m.name}</Text>
              <Text color={theme.colors.muted}>{"     ~"}{m.size}{" GB \u00B7 "}{m.quality === "best" ? "Best" : m.quality === "great" ? "Great" : "Good"}{" quality \u00B7 "}{m.speed}</Text>
            </Text>
          ))}
          {wizardModels.length === 0 && (
            <Text color={theme.colors.error}>{"  No suitable models found for your hardware."}</Text>
          )}
          <Text>{""}</Text>
          <Text dimColor>{"  \u2191\u2193 navigate \u00B7 Enter to install \u00B7 Esc back"}</Text>
        </Box>
      )}

      {wizardScreen === "install-ollama" && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.warning} paddingX={1} marginBottom={0}>
          <Text bold color={theme.colors.warning}>Ollama is required for local models.</Text>
          <Text>{""}</Text>
          <Text color={theme.colors.primary}>{"  Press Enter to install Ollama automatically"}</Text>
          <Text dimColor>{"  Or install manually: "}<Text>{getOllamaInstallCommand(wizardHardware?.os ?? "linux")}</Text></Text>
          <Text>{""}</Text>
          <Text dimColor>{"  Enter to install · Esc to go back"}</Text>
        </Box>
      )}

      {wizardScreen === "pulling" && (wizardSelectedModel || wizardPullProgress) && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.border} paddingX={1} marginBottom={0}>
          {wizardPullError ? (
            <>
              <Text color={theme.colors.error} bold>{"  \u274C Error: "}{wizardPullError}</Text>
              <Text>{""}</Text>
              <Text dimColor>{"  Press Enter to retry \u00B7 Esc to go back"}</Text>
            </>
          ) : wizardPullProgress ? (
            <>
              <Text bold color={theme.colors.secondary}>{"  "}{wizardSelectedModel ? `Downloading ${wizardSelectedModel.name}...` : wizardPullProgress?.status || "Working..."}</Text>
              {wizardPullProgress.status === "downloading" || wizardPullProgress.percent > 0 ? (
                <>
                  <Text>
                    {"  "}
                    <Text color={theme.colors.primary}>
                      {"\u2588".repeat(Math.floor(wizardPullProgress.percent / 5))}
                      {"\u2591".repeat(20 - Math.floor(wizardPullProgress.percent / 5))}
                    </Text>
                    {"  "}<Text bold>{wizardPullProgress.percent}%</Text>
                    {wizardPullProgress.completed != null && wizardPullProgress.total != null ? (
                      <Text color={theme.colors.muted}>{" \u00B7 "}{formatBytes(wizardPullProgress.completed)}{" / "}{formatBytes(wizardPullProgress.total)}</Text>
                    ) : null}
                  </Text>
                </>
              ) : (
                <Text color={theme.colors.muted}>{"  "}{wizardPullProgress.status}...</Text>
              )}
            </>
          ) : null}
        </Box>
      )}

      {/* ═══ COMMAND SUGGESTIONS ═══ */}
      {showSuggestions && (
        <Box flexDirection="column" borderStyle="single" borderColor={theme.colors.muted} paddingX={1} marginBottom={0}>
          {cmdMatches.slice(0, 6).map((c, i) => (
            <Text key={i}>
              {i === cmdIndex ? <Text color={theme.colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
              <Text color={i === cmdIndex ? theme.colors.suggestion : theme.colors.primary} bold>{c.cmd}</Text>
              <Text color={theme.colors.muted}>{" — "}{c.desc}</Text>
            </Text>
          ))}
          <Text dimColor>{"  ↑↓ navigate · Tab select"}</Text>
        </Box>
      )}

      {/* ═══ INPUT BOX (always at bottom) ═══ */}
      <Box borderStyle="single" borderColor={approval ? theme.colors.warning : theme.colors.border} paddingX={1}>
        <Text color={theme.colors.secondary} bold>{"> "}</Text>
        {approval ? (
          <Text color={theme.colors.warning}>waiting for approval...</Text>
        ) : ready && !loading && !wizardScreen ? (
          <Box>
            {pastedChunks.map((p) => (
              <Text key={p.id} color={theme.colors.muted}>[Pasted text #{p.id} +{p.lines} lines]</Text>
            ))}
            <TextInput
              key={inputKey}
              value={input}
              onChange={(v) => { setInput(v); setCmdIndex(0); }}
              onSubmit={handleSubmit}
            />
          </Box>
        ) : (
          <Text dimColor>{loading ? "waiting for response..." : "initializing..."}</Text>
        )}
      </Box>

      {/* ═══ STATUS BAR ═══ */}
      {agent && (
        <Box paddingX={2}>
          <Text dimColor>
            {"💬 "}{agent.getContextLength()}{" messages · ~"}
            {(() => {
              const tokens = agent.estimateTokens();
              return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
            })()}
            {" tokens"}
            {(() => {
              const { totalCost } = agent.getCostInfo();
              if (totalCost > 0) {
                return ` · 💰 $${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}`;
              }
              return "";
            })()}
            {modelName ? ` · 🤖 ${modelName}` : ""}
            {(() => {
              const count = getActiveSkillCount(process.cwd(), sessionDisabledSkills);
              return count > 0 ? ` · 🧠 ${count} skill${count !== 1 ? "s" : ""}` : "";
            })()}
            {agent.getArchitectModel() ? " · 🏗️ architect" : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Clear screen before render
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

// Paste event bus — communicates between stdin interceptor and React
const pasteEvents = new EventEmitter();

// Enable bracketed paste mode — terminal wraps pastes in escape sequences
process.stdout.write("\x1b[?2004h");

// Intercept stdin to handle pasted content
// Strategy: patch emit('data') instead of push() — this is the ONE path all data
// must travel through to reach Ink's listeners, regardless of how the TTY/stream
// delivers it internally.
//
// Two detection layers:
// 1. Bracketed paste escape sequences (\x1b[200~ ... \x1b[201~)
// 2. Burst buffering — accumulate rapid-fire chunks over a short window and check
//    whether the combined content looks like a multiline paste.

let bracketedBuffer = "";
let inBracketedPaste = false;
let burstBuffer = "";
let burstTimer: NodeJS.Timeout | null = null;
let pendingPasteEndMarker = { active: false, buffer: "" };
const BURST_WINDOW_MS = 50; // Long enough for slow terminals to finish delivering paste

// Debug paste: set CODEMAXXING_DEBUG_PASTE=1 to log all stdin chunks to /tmp/codemaxxing-paste-debug.log
const PASTE_DEBUG = process.env.CODEMAXXING_DEBUG_PASTE === "1";
function pasteLog(msg: string): void {
  if (!PASTE_DEBUG) return;
  const { appendFileSync } = require("node:fs");
  const escaped = msg.replace(/\x1b/g, "\\x1b").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  try { appendFileSync("/tmp/codemaxxing-paste-debug.log", `[${Date.now()}] ${escaped}\n`); } catch {}
}

const origEmit = process.stdin.emit.bind(process.stdin);

function handlePasteContent(content: string): void {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return;

  const lineCount = normalized.split("\n").length;
  if (lineCount > 2) {
    // Real multiline paste → badge it
    // Some terminals dribble the closing bracketed-paste marker (`[201~`)
    // one character at a time *after* the paste payload. Arm a tiny
    // swallow-state so those trailing fragments never leak into the input.
    pendingPasteEndMarker = { active: true, buffer: "" };
    pasteEvents.emit("paste", { content: normalized, lines: lineCount });
    return;
  }

  // Short paste (1-2 lines) → collapse to single line and forward as normal input
  const sanitized = normalized.replace(/\n/g, " ");
  if (sanitized) {
    origEmit("data", sanitized);
  }
}

function looksLikeMultilinePaste(data: string): boolean {
  const clean = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); // Strip all ANSI escapes
  // Count \r\n, \n, and bare \r as line breaks (macOS terminals often use bare \r)
  const normalized = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlines = (normalized.match(/\n/g) ?? []).length;
  const printable = normalized.replace(/\n/g, "").trim().length;

  return newlines >= 2 || (newlines >= 1 && printable >= 40);
}

function flushBurst(): void {
  if (!burstBuffer) return;
  let buffered = burstBuffer;
  burstBuffer = "";

  // Strip any bracketed paste marker fragments that accumulated across
  // individual character chunks (terminal sends [, 2, 0, 1, ~ separately)
  buffered = buffered.replace(/\x1b?\[?20[01]~/g, "");
  buffered = buffered.replace(/20[01]~/g, "");

  if (!buffered || !buffered.trim()) {
    pasteLog("BURST FLUSH stripped to empty — swallowed marker");
    return;
  }

  const isMultiline = looksLikeMultilinePaste(buffered);
  pasteLog(`BURST FLUSH len=${buffered.length} multiline=${isMultiline}`);

  if (isMultiline) {
    handlePasteContent(buffered);
  } else {
    // Normal typing — forward to Ink
    origEmit("data", buffered);
  }
}

(process.stdin as any).emit = function (event: string, ...args: any[]): boolean {
  // Pass through non-data events untouched
  if (event !== "data") {
    return origEmit(event, ...args);
  }

  const chunk = args[0];
  let data = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);

  pasteLog(`CHUNK len=${data.length} raw=${data.substring(0, 200)}`);

  const pendingResult = consumePendingPasteEndMarkerChunk(data, pendingPasteEndMarker);
  pendingPasteEndMarker = pendingResult.nextState;
  data = pendingResult.remaining;
  if (!data) {
    pasteLog("PENDING END MARKER swallowed chunk");
    return true;
  }

  // Aggressively strip ALL bracketed paste escape sequences from every chunk,
  // regardless of context. Some terminals split markers across chunks or send
  // them in unexpected positions. We never want \x1b[200~ or \x1b[201~ (or
  // partial fragments like [200~ / [201~) to reach the input component.
  const hadStart = data.includes("\x1b[200~") || data.includes("[200~") || data.includes("200~");
  const hadEnd = data.includes("\x1b[201~") || data.includes("[201~") || data.includes("201~");

  pasteLog(`MARKERS start=${hadStart} end=${hadEnd} inBracketed=${inBracketedPaste}`);

  // Strip full and partial bracketed paste markers — catch every possible fragment
  // Full: \x1b[200~ / \x1b[201~  Partial: [200~ / [201~  Bare: 200~ / 201~
  data = data.replace(/\x1b?\[?20[01]~/g, "");
  // Belt-and-suspenders: catch any residual marker fragments with multiple passes
  data = data.replace(/\[20[01]~/g, "");      // [200~ or [201~
  data = data.replace(/20[01]~/g, "");        // 200~ or 201~
  data = data.replace(/\[\d01~/g, "");        // any [Xdigit01~
  // Final paranoia pass: remove anything that looks like a closing bracket-tilde
  if (data.includes("[201") || data.includes("[200")) {
    data = data.replace(/\[[0-9]*0?[01]~?/g, "");
  }

  // ── Bracketed paste handling ──
  if (hadStart) {
    // Flush any pending burst before entering bracketed mode
    if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
    flushBurst();

    inBracketedPaste = true;
    pasteLog("ENTERED bracketed paste mode");
  }

  if (hadEnd) {
    bracketedBuffer += data;
    inBracketedPaste = false;

    const content = bracketedBuffer;
    bracketedBuffer = "";
    pasteLog(`BRACKETED COMPLETE len=${content.length} lines=${content.split("\\n").length}`);
    handlePasteContent(content);
    return true;
  }

  if (inBracketedPaste) {
    bracketedBuffer += data;
    pasteLog(`BRACKETED BUFFERING total=${bracketedBuffer.length}`);
    return true;
  }

  // ── Burst buffering for non-bracketed paste ──

  burstBuffer += data;
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = setTimeout(() => {
    burstTimer = null;
    flushBurst();
  }, BURST_WINDOW_MS);

  return true;
};

// Disable bracketed paste on exit
process.on("exit", () => {
  process.stdout.write("\x1b[?2004l");
});

// Handle terminal resize — clear ghost artifacts
process.stdout.on("resize", () => {
  process.stdout.write("\x1B[2J\x1B[H");
});

render(<App />, { exitOnCtrlC: false });
