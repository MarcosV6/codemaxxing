#!/usr/bin/env node

import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import { sanitizeInputArtifacts } from "./utils/paste.js";
import { setupPasteInterceptor } from "./ui/paste-interceptor.js";
import type { CodingAgent } from "./core/agent.js";
import { loadConfig, saveConfig, listModels } from "./config.js";
import { listSessions, getSession, loadMessages, deleteSession } from "./utils/sessions.js";
import { tryHandleGitCommand } from "./commands/git.js";
import { tryHandleOllamaCommand } from "./commands/ollama.js";
import { dispatchRegisteredCommands } from "./commands/registry.js";
import { getTheme, DEFAULT_THEME, type Theme } from "./themes.js";
import { tryHandleUiCommand } from "./commands/ui.js";
import { listServers, addServer, removeServer, getAllMCPTools, getConnectedServers } from "./bridge/mcp.js";
import { tryHandleSkillsCommand } from "./commands/skills.js";
import { tryHandleBackgroundAgentCommand } from "./commands/background-agents.js";
import { listBackgroundAgents, getBackgroundAgent, startBackgroundAgent } from "./background-agents.js";
import { tryHandleScheduleCommand } from "./commands/schedule.js";
import { tryHandleOrchestrateCommand } from "./commands/orchestrate.js";
import type { HardwareInfo } from "./utils/hardware.js";
import type { ScoredModel } from "./utils/models.js";
import { isOllamaRunning, stopOllama, listInstalledModelsDetailed, type PullProgress } from "./utils/ollama.js";
import { routeKeyPress, type InputRouterContext } from "./ui/input-router.js";
import type { GroupedModels, ModelEntry, ProviderPickerEntry } from "./ui/pickers.js";
import { getCredential } from "./utils/auth.js";
import type { WizardScreen } from "./ui/wizard-types.js";
import { Banner, ConnectionInfo } from "./ui/banner.js";
import { StatusBar } from "./ui/status-bar.js";
import type { ChatMessage } from "./ui/connection-types.js";
import {
  refreshConnectionBanner as refreshConnectionBannerImpl,
  connectToProvider as connectToProviderImpl,
} from "./ui/connection.js";
import {
  CommandSuggestions, LoginPicker, LoginMethodPickerUI, SkillsMenu, SkillsBrowse,
  SkillsInstalled, SkillsRemove, AgentCommandPicker, ScheduleCommandPicker,
  OrchestrateCommandPicker, ThemePickerUI, SessionPicker, DeleteSessionPicker,
  DeleteSessionConfirm, ProviderPicker, ModelPicker, OllamaDeletePicker, OllamaPullPicker,
  OllamaDeleteConfirm, OllamaPullProgress, OllamaExitPrompt, ApprovalPrompt,
  WizardConnection, WizardModels, WizardInstallOllama, WizardPulling,
} from "./ui/pickers.js";

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
  { cmd: "/agent", desc: "background agent management (list, start, pause, delete)" },
  { cmd: "/schedule", desc: "cron job scheduling (add, list, remove)" },
  { cmd: "/orchestrate", desc: "multi-agent collaboration orchestration" },
  { cmd: "/models", desc: "switch model" },
  { cmd: "/theme", desc: "switch color theme" },
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
const STREAM_MESSAGES = [
  "Streaming...",
  "Yapping live...",
  "Typing with intent...",
  "Cooking response...",
  "Locked in...",
  "Spitting tokens...",
  "Channeling the machine spirit...",
  "Vibing through the output...",
  "Absolutely flowing...",
  "Free styling the answer...",
  "Transmitting sauce...",
  "Pushing pixels and prayers...",
  "Deep in the bag right now...",
  "Farming intelligence...",
  "Manifesting the response...",
  "Printing heat...",
  "In my typing arc...",
  "Going word for word...",
  "Generating cinema...",
  "No cap streaming...",
];
function StreamingIndicator({ colors }: { colors: Theme['colors'] }) {
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState(() => STREAM_MESSAGES[Math.floor(Math.random() * STREAM_MESSAGES.length)]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % STREAM_DOTS.length);
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessage(STREAM_MESSAGES[Math.floor(Math.random() * STREAM_MESSAGES.length)]);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text>
      {"  "}<Text color={colors.spinner}>{STREAM_DOTS[frame]}</Text>
      {" "}<Text color={colors.secondary}>{message}</Text>
    </Text>
  );
}

function longestOverlapSuffixPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len--) {
    if (a.slice(-len) === b.slice(0, len)) return len;
  }
  return 0;
}

function dedupeLeakedPasteInput(typedInput: string, pasteText: string): string {
  const typed = typedInput.trim();
  const pasted = pasteText.trim();
  if (!typed || !pasted) return typedInput;

  if (pasted.startsWith(typed)) {
    return "";
  }

  if (typed.includes(pasted)) {
    return typedInput.replace(pasteText, "").trim();
  }

  const overlap = longestOverlapSuffixPrefix(typed, pasted);
  if (overlap >= Math.min(typed.length, 32)) {
    return typedInput.slice(0, typedInput.length - overlap).trimEnd();
  }

  return typedInput;
}


let msgId = 0;
function nextMsgId(): number { return msgId++; }

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
  const [lastActivityAt, setLastActivityAt] = useState(Date.now());
  const [agentStage, setAgentStage] = useState("idle");
  const [lastToolName, setLastToolName] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState(0);
  const activeRequestIdRef = useRef(0);
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

  // Agent/schedule/orchestrate pickers
  const [agentPicker, setAgentPicker] = useState(false);
  const [agentPickerIndex, setAgentPickerIndex] = useState(0);
  const [schedulePicker, setSchedulePicker] = useState(false);
  const [schedulePickerIndex, setSchedulePickerIndex] = useState(0);
  const [orchestratePicker, setOrchestratePicker] = useState(false);
  const [orchestratePickerIndex, setOrchestratePickerIndex] = useState(0);
  const [sessionDisabledSkills, setSessionDisabledSkills] = useState<Set<string>>(new Set());
  const [approval, setApproval] = useState<{
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
    resolve: (decision: "yes" | "no" | "always") => void;
  } | null>(null);

  useEffect(() => {
    if (!loading || !agent) return;
    const requestIdAtStart = activeRequestId;
    let warned = false;

    const interval = setInterval(() => {
      if (warned) return;
      const idleMs = Date.now() - lastActivityAt;
      if (idleMs > 60000 && requestIdAtStart === activeRequestIdRef.current) {
        warned = true;
        const toolSuffix = lastToolName ? ` (${lastToolName})` : "";
        addMsg("error", `⏱️ No model activity for 60s while ${agentStage}${toolSuffix}. Request may be hung.`);
        setLoading(false);
        setStreaming(false);
        setAgentStage("hung");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loading, agent, lastActivityAt, agentStage, lastToolName, activeRequestId]);

  // ── Ollama Management State ──
  const [ollamaDeleteConfirm, setOllamaDeleteConfirm] = useState<{ model: string; size: number } | null>(null);
  const [ollamaPulling, setOllamaPulling] = useState<{ model: string; progress: PullProgress } | null>(null);
  const [ollamaExitPrompt, setOllamaExitPrompt] = useState(false);
  const [ollamaDeletePicker, setOllamaDeletePicker] = useState<{ models: { name: string; size: number }[] } | null>(null);
  const [ollamaDeletePickerIndex, setOllamaDeletePickerIndex] = useState(0);
  const [ollamaPullPicker, setOllamaPullPicker] = useState(false);
  const [ollamaPullPickerIndex, setOllamaPullPickerIndex] = useState(0);
  const [modelPickerGroups, setModelPickerGroups] = useState<GroupedModels | null>(null);
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [flatModelList, setFlatModelList] = useState<ModelEntry[]>([]);
  const [providerPicker, setProviderPicker] = useState<ProviderPickerEntry[] | null>(null);
  const [providerPickerIndex, setProviderPickerIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // ── Setup Wizard State ──
  const [wizardScreen, setWizardScreen] = useState<WizardScreen>(null);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [wizardHardware, setWizardHardware] = useState<HardwareInfo | null>(null);
  const [wizardModels, setWizardModels] = useState<ScoredModel[]>([]);
  const [wizardPullProgress, setWizardPullProgress] = useState<PullProgress | null>(null);
  const [wizardPullError, setWizardPullError] = useState<string | null>(null);
  const [wizardSelectedModel, setWizardSelectedModel] = useState<ScoredModel | null>(null);

  // Listen for paste events from stdin interceptor — all pastes arrive as
  // attachment blocks (never inline) to avoid the ink-text-input reconciliation race.
  useEffect(() => {
    const handler = ({ content, lines }: { content: string; lines: number }) => {
      setPasteCount((c) => {
        const newId = c + 1;
        setPastedChunks((prev) => {
          const next = [...prev, { id: newId, lines, content }];
          return next;
        });
        return newId;
      });
    };
    pasteEvents.on("paste", handler);
    return () => { pasteEvents.off("paste", handler); };
  }, []);

  // Refresh the connection banner to reflect current provider status
  const refreshConnectionBanner = useCallback(async () => {
    await refreshConnectionBannerImpl(setConnectionInfo);
  }, []);

  // Connect/reconnect to LLM provider
  const connectToProvider = useCallback(async (isRetry = false) => {
    await connectToProviderImpl(isRetry, {
      setConnectionInfo,
      setReady,
      setAgent,
      setModelName,
      providerRef,
      setLoading,
      setStreaming,
      setSpinnerMsg,
      setLastActivityAt,
      setAgentStage,
      setLastToolName,
      setMessages,
      addMsg,
      nextMsgId,
      setApproval,
      setWizardScreen,
      setWizardIndex,
      openModelPicker,
    });
  }, []);

  // Initialize agent on mount
  useEffect(() => {
    connectToProvider(false);
  }, []);

  function addMsg(type: ChatMessage["type"], text: string) {
    setMessages((prev) => [...prev, { id: nextMsgId(), type, text }]);
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
  const inputRef = React.useRef(input);
  inputRef.current = input;

  const openModelPicker = useCallback(async () => {
    addMsg("info", "Fetching available models...");
    const groups: GroupedModels = {};
    const providerEntries: ProviderPickerEntry[] = [];

    let localFound = false;
    const localEndpoints = [
      { name: "LM Studio", port: 1234 },
      { name: "Ollama", port: 11434 },
      { name: "vLLM", port: 8000 },
      { name: "LocalAI", port: 8080 },
    ];

    for (const endpoint of localEndpoints) {
      if (localFound) break;
      try {
        const url = `http://localhost:${endpoint.port}/v1`;
        const models = await listModels(url, "local");
        if (models.length > 0) {
          groups["Local LLM"] = models.map(m => ({
            name: m,
            baseUrl: url,
            apiKey: "local",
            providerType: "openai" as const,
          }));
          localFound = true;
        }
      } catch { /* not running */ }
    }

    if (!localFound) {
      try {
        const ollamaModels = await listInstalledModelsDetailed();
        if (ollamaModels.length > 0) {
          groups["Local LLM"] = ollamaModels.map(m => ({
            name: m.name,
            baseUrl: "http://localhost:11434/v1",
            apiKey: "ollama",
            providerType: "openai" as const,
          }));
          localFound = true;
        }
      } catch { /* Ollama not running */ }
    }

    if (localFound) {
      providerEntries.push({ name: "Local LLM", description: "No auth needed — auto-detected", authed: true });
    }

    const anthropicCred = getCredential("anthropic");
    const claudeModels = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"];
    if (anthropicCred) {
      groups["Anthropic (Claude)"] = claudeModels.map(m => ({
        name: m,
        baseUrl: "https://api.anthropic.com",
        apiKey: anthropicCred.apiKey,
        providerType: "anthropic" as const,
      }));
    }
    providerEntries.push({ name: "Anthropic (Claude)", description: "Claude Opus, Sonnet, Haiku — use your subscription or API key", authed: !!anthropicCred });

    const openaiCred = getCredential("openai");
    const openaiModels = ["gpt-5.4", "gpt-5.4-pro", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o4-mini", "gpt-4o"];
    if (openaiCred) {
      const isOAuthToken = openaiCred.method === "oauth" || openaiCred.method === "cached-token" || 
                           (!openaiCred.apiKey.startsWith("sk-") && !openaiCred.apiKey.startsWith("sess-"));
      const baseUrl = isOAuthToken 
        ? "https://chatgpt.com/backend-api" 
        : (openaiCred.baseUrl || "https://api.openai.com/v1");
      groups["OpenAI (ChatGPT)"] = openaiModels.map(m => ({
        name: m,
        baseUrl,
        apiKey: openaiCred.apiKey,
        providerType: "openai" as const,
      }));
    }
    providerEntries.push({ name: "OpenAI (ChatGPT)", description: "GPT-5, GPT-4.1, o3 — use your ChatGPT subscription or API key", authed: !!openaiCred });

    const openrouterCred = getCredential("openrouter");
    if (openrouterCred) {
      try {
        const orModels = await listModels(openrouterCred.baseUrl || "https://openrouter.ai/api/v1", openrouterCred.apiKey);
        if (orModels.length > 0) {
          groups["OpenRouter"] = orModels.slice(0, 20).map(m => ({
            name: m,
            baseUrl: openrouterCred.baseUrl || "https://openrouter.ai/api/v1",
            apiKey: openrouterCred.apiKey,
            providerType: "openai" as const,
          }));
        }
      } catch { /* skip */ }
    }
    providerEntries.push({ name: "OpenRouter", description: "200+ models (Claude, GPT, Gemini, Llama, etc.) — one login", authed: !!openrouterCred });

    const qwenCred = getCredential("qwen");
    if (qwenCred) {
      groups["Qwen"] = ["qwen-max", "qwen-plus", "qwen-turbo"].map(m => ({
        name: m,
        baseUrl: qwenCred.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: qwenCred.apiKey,
        providerType: "openai" as const,
      }));
    }
    providerEntries.push({ name: "Qwen", description: "Qwen 3.5, Qwen Coder — use your Qwen CLI login or API key", authed: !!qwenCred });

    const copilotCred = getCredential("copilot");
    if (copilotCred) {
      groups["GitHub Copilot"] = ["gpt-4o", "claude-3.5-sonnet"].map(m => ({
        name: m,
        baseUrl: copilotCred.baseUrl || "https://api.githubcopilot.com",
        apiKey: copilotCred.apiKey,
        providerType: "openai" as const,
      }));
    }
    providerEntries.push({ name: "GitHub Copilot", description: "Use your GitHub Copilot subscription", authed: !!copilotCred });

    if (providerEntries.length > 0) {
      setModelPickerGroups(groups);
      setProviderPicker(providerEntries);
      setProviderPickerIndex(0);
      setSelectedProvider(null);
      return;
    }

    addMsg("error", "No models available. Download one with /ollama pull or configure a provider.");
  }, [addMsg]);

  const handleSubmit = useCallback(async (value: string) => {
    value = sanitizeInputArtifacts(value);

    // Skip autocomplete if input exactly matches a command (e.g. /models vs /model)
    const isExactCommand = SLASH_COMMANDS.some(c => c.cmd === value.trim());

    // If suggestions are showing and input isn't already an exact command, use autocomplete
    if (showSuggestionsRef.current && !isExactCommand) {
      const matches = cmdMatchesRef.current;
      const idx = cmdIndexRef.current;
      const selected = matches[idx];
      if (selected) {
        // Commands that need args (like /commit, /model) — fill input instead of executing
        if (selected.cmd === "/commit" || selected.cmd === "/session delete" ||
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

    // Combine typed text with any pasted attachment blocks.
    const chunks = pastedChunksRef.current;
    const trimmedValue = value.trim();
    let submittedValue = trimmedValue;
    if (chunks.length > 0) {
      const pasteText = chunks.map(p => p.content).join("\n\n");
      const dedupedInput = dedupeLeakedPasteInput(trimmedValue, pasteText).trim();
      submittedValue = dedupedInput ? `${dedupedInput}\n\n${pasteText}` : pasteText;
    }
    setInput("");
    setPastedChunks([]);
    setPasteCount(0);
    if (!submittedValue.trim()) return;

    const trimmed = submittedValue.trim();
    addMsg("user", submittedValue);

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
    if (trimmed === "/agent") {
      setAgentPicker(true);
      setAgentPickerIndex(0);
      return;
    }
    if (trimmed === "/schedule") {
      setSchedulePicker(true);
      setSchedulePickerIndex(0);
      return;
    }
    if (trimmed === "/orchestrate") {
      setOrchestratePicker(true);
      setOrchestratePickerIndex(0);
      return;
    }
    if (trimmed === "/help") {
      addMsg("info", [
        "Commands:",
        "  /help      — show this",
        "  /connect   — retry LLM connection",
        "  /login     — authentication setup (run codemaxxing login in terminal)",
        "  /models    — switch model",
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
        "  /git on       — enable auto-commits",
        "  /git off      — disable auto-commits",
        "  /agent        — background agent management (list, start, pause, delete)",
        "  /schedule     — cron job scheduling (add, list, remove)",
        "  /orchestrate  — multi-agent collaboration orchestration",
        "  /skills       — manage skill packs",
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
    const config = loadConfig();
    const commandAgentOptions = {
      provider: config.provider,
      cwd: process.cwd(),
      maxTokens: config.defaults.maxTokens ?? 8192,
      autoApprove: config.defaults.autoApprove,
    };

    if (await dispatchRegisteredCommands([
      // Phase B & C: Agent/Schedule/Orchestrate commands
      () => tryHandleBackgroundAgentCommand(trimmed, process.cwd(), addMsg, { setAgentPicker }).then(r => r ?? false),
      () => tryHandleScheduleCommand(trimmed, commandAgentOptions, addMsg, { setSchedulePicker }).then(r => r ?? false),
      () => tryHandleOrchestrateCommand(
        trimmed,
        process.cwd(),
        commandAgentOptions,
        addMsg,
        { setOrchestratePicker }
      ),
      // Existing commands
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

    // Commands that work without an agent (needed for first-time setup)
    // /models and /login are handled below and don't need an agent
    const agentlessCommands = ["/models", "/model", "/login"];
    const isAgentlessCmd = agentlessCommands.some(cmd => trimmed === cmd || trimmed.startsWith(cmd + " "));
    
    if (!agent && !isAgentlessCmd) {
      addMsg("info", "⚠ No LLM connected.\n  Use /login to authenticate, then /models to pick a model.");
      return;
    }
    if (trimmed === "/reset") {
      agent!.reset();
      addMsg("info", "✅ Conversation reset.");
      return;
    }
    if (trimmed === "/context") {
      addMsg("info", `Messages in context: ${agent!.getContextLength()}`);
      return;
    }
    if (trimmed === "/models" || trimmed === "/model") {
      await openModelPicker();
      return;
    }
    if (trimmed.startsWith("/model ")) {
      const newModel = trimmed.replace("/model ", "").trim();
      if (!newModel) {
        addMsg("info", `Current model: ${modelName}\n  Usage: /models`);
        return;
      }
      agent!.switchModel(newModel);
      setModelName(newModel);
      addMsg("info", `✅ Switched to model: ${newModel}`);
      return;
    }
    if (trimmed === "/map") {
      const map = agent!.getRepoMap();
      if (map) {
        addMsg("info", map);
      } else {
        // Map hasn't been built yet, refresh it
        setLoading(true);
        const newMap = await agent!.refreshRepoMap();
        addMsg("info", newMap || "No repository map available.");
        setLoading(false);
      }
      return;
    }
    if (trimmed === "/git on") {
      if (!agent!.isGitEnabled()) {
        addMsg("info", "✗ Not a git repository");
      } else {
        agent!.setAutoCommit(true);
        addMsg("info", "✅ Auto-commits enabled for this session");
      }
      return;
    }
    if (trimmed === "/git off") {
      agent!.setAutoCommit(false);
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
    const requestId = Date.now();
    activeRequestIdRef.current = requestId;
    setActiveRequestId(requestId);
    setLoading(true);
    setStreaming(false);
    setLastActivityAt(Date.now());
    setAgentStage("waiting for first token");
    setLastToolName(null);
    setSpinnerMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);

    try {
      // Response is built incrementally via onToken callback
      // send() routes through architect if enabled, otherwise direct chat
      await agent!.send(trimmed);
    } catch (err: any) {
      addMsg("error", `Error: ${err.message}`);
    }

    if (requestId === activeRequestIdRef.current) {
      setLoading(false);
      setStreaming(false);
      setLastActivityAt(Date.now());
      setAgentStage("idle");
    }
  }, [agent, exit, refreshConnectionBanner]);

  useInput((inputChar, key) => {
    routeKeyPress(inputChar, key, {
      showSuggestionsRef,
      cmdMatchesRef,
      cmdIndexRef,
      setCmdIndex,
      setInput,
      setInputKey,
      loginMethodPicker,
      loginMethodIndex,
      setLoginMethodIndex,
      setLoginMethodPicker,
      loginPicker,
      loginPickerIndex,
      setLoginPickerIndex,
      setLoginPicker,
      skillsPicker,
      skillsPickerIndex,
      setSkillsPickerIndex,
      setSkillsPicker,
      agentPicker,
      agentPickerIndex,
      setAgentPickerIndex,
      setAgentPicker,
      schedulePicker,
      schedulePickerIndex,
      setSchedulePickerIndex,
      setSchedulePicker,
      orchestratePicker,
      orchestratePickerIndex,
      setOrchestratePickerIndex,
      setOrchestratePicker,
      sessionDisabledSkills,
      setSessionDisabledSkills,
      modelPickerGroups,
      modelPickerIndex,
      setModelPickerIndex,
      setModelPickerGroups,
      flatModelList,
      setFlatModelList,
      providerPicker,
      providerPickerIndex,
      setProviderPickerIndex,
      setProviderPicker,
      selectedProvider,
      setSelectedProvider,
      ollamaDeletePicker,
      ollamaDeletePickerIndex,
      setOllamaDeletePickerIndex,
      setOllamaDeletePicker,
      ollamaPullPicker,
      ollamaPullPickerIndex,
      setOllamaPullPickerIndex,
      setOllamaPullPicker,
      ollamaDeleteConfirm,
      setOllamaDeleteConfirm,
      ollamaExitPrompt,
      setOllamaExitPrompt,
      wizardScreen,
      wizardIndex,
      wizardModels,
      wizardHardware,
      wizardPullProgress,
      wizardPullError,
      wizardSelectedModel,
      setWizardScreen,
      setWizardIndex,
      setWizardHardware,
      setWizardModels,
      setWizardPullProgress,
      setWizardPullError,
      setWizardSelectedModel,
      themePicker,
      themePickerIndex,
      setThemePickerIndex,
      setThemePicker,
      setTheme,
      sessionPicker,
      sessionPickerIndex,
      setSessionPickerIndex,
      setSessionPicker,
      deleteSessionConfirm,
      setDeleteSessionConfirm,
      deleteSessionPicker,
      deleteSessionPickerIndex,
      setDeleteSessionPickerIndex,
      setDeleteSessionPicker,
      input,
      pastedChunksRef,
      setPastedChunks,
      approval,
      setApproval,
      ctrlCPressed,
      setCtrlCPressed,
      setLoading,
      setSpinnerMsg,
      agent,
      streaming,
      loading,
      setModelName,
      addMsg,
      exit,
      refreshConnectionBanner,
      connectToProvider,
      openModelPicker,
      handleSubmit,
      _require,
    });
  });

  return (
    <Box flexDirection="column">
      {/* ═══ BANNER BOX ═══ */}
      <Banner version={VERSION} colors={theme.colors} />

      {/* ═══ CONNECTION INFO BOX ═══ */}
      {connectionInfo.length > 0 && (
        <ConnectionInfo connectionInfo={connectionInfo} colors={theme.colors} />
      )}

      {/* ═══ CHAT MESSAGES ═══ */}
      {messages.map((msg) => {
        switch (msg.type) {
          case "user":
            return (
              <Box key={msg.id} marginTop={1} flexDirection="column">
                {msg.text.split("\n").map((line, i) => (
                  <Text key={i} color={theme.colors.userInput} wrap="wrap">
                    {i === 0 ? "  > " : "    "}{line}
                  </Text>
                ))}
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
      {streaming && <StreamingIndicator colors={theme.colors} />}

      {/* ═══ APPROVAL PROMPT ═══ */}
      {approval && (
        <ApprovalPrompt approval={approval} colors={theme.colors} />
      )}

      {/* ═══ LOGIN PICKER ═══ */}
      {loginPicker && (
        <LoginPicker loginPickerIndex={loginPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ LOGIN METHOD PICKER ═══ */}
      {loginMethodPicker && (
        <LoginMethodPickerUI loginMethodPicker={loginMethodPicker} loginMethodIndex={loginMethodIndex} colors={theme.colors} />
      )}

      {/* ═══ SKILLS PICKER ═══ */}
      {skillsPicker === "menu" && (
        <SkillsMenu skillsPickerIndex={skillsPickerIndex} colors={theme.colors} />
      )}
      {skillsPicker === "browse" && (
        <SkillsBrowse skillsPickerIndex={skillsPickerIndex} colors={theme.colors} />
      )}
      {skillsPicker === "installed" && (
        <SkillsInstalled skillsPickerIndex={skillsPickerIndex} sessionDisabledSkills={sessionDisabledSkills} colors={theme.colors} />
      )}
      {skillsPicker === "remove" && (
        <SkillsRemove skillsPickerIndex={skillsPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ AGENT PICKER ═══ */}
      {agentPicker && (
        <AgentCommandPicker selectedIndex={agentPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ SCHEDULE PICKER ═══ */}
      {schedulePicker && (
        <ScheduleCommandPicker selectedIndex={schedulePickerIndex} colors={theme.colors} />
      )}

      {/* ═══ ORCHESTRATE PICKER ═══ */}
      {orchestratePicker && (
        <OrchestrateCommandPicker selectedIndex={orchestratePickerIndex} colors={theme.colors} />
      )}

      {/* ═══ THEME PICKER ═══ */}
      {themePicker && (
        <ThemePickerUI themePickerIndex={themePickerIndex} theme={theme} />
      )}

      {/* ═══ SESSION PICKER ═══ */}
      {sessionPicker && (
        <SessionPicker sessions={sessionPicker} selectedIndex={sessionPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ DELETE SESSION PICKER ═══ */}
      {deleteSessionPicker && (
        <DeleteSessionPicker sessions={deleteSessionPicker} selectedIndex={deleteSessionPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ DELETE SESSION CONFIRM ═══ */}
      {deleteSessionConfirm && (
        <DeleteSessionConfirm session={deleteSessionConfirm} colors={theme.colors} />
      )}

      {/* ═══ MODEL PICKER ═══ */}
      {providerPicker && !selectedProvider && (
        <ProviderPicker providers={providerPicker} selectedIndex={providerPickerIndex} colors={theme.colors} />
      )}
      {selectedProvider && modelPickerGroups && modelPickerGroups[selectedProvider] && (
        <ModelPicker providerName={selectedProvider} models={modelPickerGroups[selectedProvider]} selectedIndex={modelPickerIndex} activeModel={modelName} colors={theme.colors} />
      )}

      {/* ═══ OLLAMA DELETE PICKER ═══ */}
      {ollamaDeletePicker && (
        <OllamaDeletePicker models={ollamaDeletePicker.models} selectedIndex={ollamaDeletePickerIndex} colors={theme.colors} />
      )}

      {/* ═══ OLLAMA PULL PICKER ═══ */}
      {ollamaPullPicker && (
        <OllamaPullPicker selectedIndex={ollamaPullPickerIndex} colors={theme.colors} />
      )}

      {/* ═══ OLLAMA DELETE CONFIRM ═══ */}
      {ollamaDeleteConfirm && (
        <OllamaDeleteConfirm model={ollamaDeleteConfirm.model} size={ollamaDeleteConfirm.size} colors={theme.colors} />
      )}

      {/* ═══ OLLAMA PULL PROGRESS ═══ */}
      {ollamaPulling && (
        <OllamaPullProgress model={ollamaPulling.model} progress={ollamaPulling.progress} colors={theme.colors} />
      )}

      {/* ═══ OLLAMA EXIT PROMPT ═══ */}
      {ollamaExitPrompt && (
        <OllamaExitPrompt colors={theme.colors} />
      )}

      {/* ═══ SETUP WIZARD ═══ */}
      {wizardScreen === "connection" && (
        <WizardConnection wizardIndex={wizardIndex} colors={theme.colors} />
      )}
      {wizardScreen === "models" && wizardHardware && (
        <WizardModels wizardIndex={wizardIndex} wizardHardware={wizardHardware} wizardModels={wizardModels} colors={theme.colors} />
      )}
      {wizardScreen === "install-ollama" && (
        <WizardInstallOllama wizardHardware={wizardHardware} colors={theme.colors} />
      )}
      {wizardScreen === "pulling" && (wizardSelectedModel || wizardPullProgress) && (
        <WizardPulling wizardSelectedModel={wizardSelectedModel} wizardPullProgress={wizardPullProgress} wizardPullError={wizardPullError} colors={theme.colors} />
      )}

      {/* ═══ COMMAND SUGGESTIONS ═══ */}
      {showSuggestions && (
        <CommandSuggestions cmdMatches={cmdMatches} cmdIndex={cmdIndex} colors={theme.colors} />
      )}

      {/* ═══ INPUT BOX (always at bottom) ═══ */}
      <Box borderStyle={process.platform === "win32" && !process.env.WT_SESSION ? "classic" : "single"} borderColor={approval ? theme.colors.warning : theme.colors.border} paddingX={1}>
        <Text color={theme.colors.secondary} bold>{"> "}</Text>
        {approval ? (
          <Text color={theme.colors.warning}>waiting for approval...</Text>
        ) : ready && !loading && !wizardScreen ? (
          <Box flexDirection="column" width="100%">
            {pastedChunks.length > 0 && (
              <Box flexDirection="column" marginBottom={0}>
                {pastedChunks.map((p) => (
                  <Text key={p.id} color={theme.colors.muted}>[Attached paste #{p.id} · {p.lines} lines · Backspace/Esc to remove]</Text>
                ))}
              </Box>
            )}
            <TextInput
              key={inputKey}
              value={input}
              onChange={(v) => {
                setInput(sanitizeInputArtifacts(v));
                setCmdIndex(0);
              }}
              onSubmit={handleSubmit}
            />
          </Box>
        ) : (
          <Text dimColor>{loading ? "waiting for response..." : "initializing..."}</Text>
        )}
      </Box>

      {/* ═══ STATUS BAR ═══ */}
      {agent && (
        <StatusBar agent={agent} modelName={modelName} sessionDisabledSkills={sessionDisabledSkills} />
      )}
    </Box>
  );
}

// Clear screen before render
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

// Set up paste interception (bracketed paste, burst buffering, debris swallowing)
const pasteEvents = setupPasteInterceptor();

// Handle terminal resize — clear ghost artifacts
process.stdout.on("resize", () => {
  process.stdout.write("\x1B[2J\x1B[H");
});

render(<App />, { exitOnCtrlC: false });
