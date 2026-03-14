#!/usr/bin/env node

import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import { EventEmitter } from "events";
import TextInput from "ink-text-input";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider, parseCLIArgs, applyOverrides, listModels } from "./config.js";
import { listSessions, getSession, loadMessages, deleteSession } from "./utils/sessions.js";
import { execSync } from "child_process";
import { isGitRepo, getBranch, getStatus, getDiff, undoLastCommit } from "./utils/git.js";
import { getTheme, listThemes, THEMES, DEFAULT_THEME, type Theme } from "./themes.js";
import { PROVIDERS, getCredentials, openRouterOAuth, anthropicSetupToken, importCodexToken, importQwenToken, copilotDeviceFlow, saveApiKey } from "./utils/auth.js";

const VERSION = "0.1.9";

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
  { cmd: "/quit", desc: "exit" },
];

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

const SPINNER_MESSAGES = [
  "Locking in...", "Cooking...", "Maxxing...", "In the zone...",
  "Yapping...", "Frame mogging...", "Jester gooning...", "Gooning...",
  "Doing back flips...", "Jester maxxing...", "Getting baked...",
  "Blasting tren...", "Pumping...", "Wondering if I should actually do this...",
  "Hacking the main frame...", "Codemaxxing...", "Vibe coding...", "Running a marathon...",
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
  const [approval, setApproval] = useState<{
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
    resolve: (decision: "yes" | "no" | "always") => void;
  } | null>(null);

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
      const detected = await detectLocalProvider();
      if (detected) {
        // Keep CLI model override if specified
        if (cliArgs.model) detected.model = cliArgs.model;
        provider = detected;
        info.push(`✔ Connected to ${provider.baseUrl} → ${provider.model}`);
        setConnectionInfo([...info]);
      } else {
        info.push("✗ No local LLM server found.");
        info.push("  /connect  — retry after starting LM Studio or Ollama");
        info.push("  /login    — authenticate with a cloud provider");
        setConnectionInfo([...info]);
        setReady(true);
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
        if (selected.cmd === "/commit" || selected.cmd === "/model" || selected.cmd === "/session delete") {
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
      exit();
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
        "  /quit      — exit",
      ].join("\n"));
      return;
    }
    if (trimmed.startsWith("/theme")) {
      const themeName = trimmed.replace("/theme", "").trim();
      if (!themeName) {
        const themeKeys = listThemes();
        const currentIdx = themeKeys.indexOf(theme.name.toLowerCase());
        setThemePicker(true);
        setThemePickerIndex(currentIdx >= 0 ? currentIdx : 0);
        return;
      }
      if (!THEMES[themeName]) {
        addMsg("error", `Theme "${themeName}" not found. Use /theme to see available themes.`);
        return;
      }
      setTheme(getTheme(themeName));
      addMsg("info", `✅ Switched to theme: ${THEMES[themeName].name}`);
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
    if (trimmed.startsWith("/model")) {
      const newModel = trimmed.replace("/model", "").trim();
      if (!newModel) {
        addMsg("info", `Current model: ${agent.getModel()}\n  Usage: /model <model-name>`);
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
    if (trimmed === "/diff") {
      const diff = getDiff(process.cwd());
      addMsg("info", diff);
      return;
    }
    if (trimmed === "/undo") {
      const result = undoLastCommit(process.cwd());
      addMsg("info", result.success ? `✅ ${result.message}` : `✗ ${result.message}`);
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
    if (trimmed === "/push") {
      try {
        const output = execSync("git push", { cwd: process.cwd(), encoding: "utf-8", stdio: "pipe" });
        addMsg("info", `✅ Pushed to remote${output.trim() ? "\n" + output.trim() : ""}`);
      } catch (e: any) {
        addMsg("error", `Push failed: ${e.stderr || e.message}`);
      }
      return;
    }
    if (trimmed.startsWith("/commit")) {
      const msg = trimmed.replace("/commit", "").trim();
      if (!msg) {
        addMsg("info", "Usage: /commit your commit message here");
        return;
      }
      try {
        execSync("git add -A", { cwd: process.cwd(), stdio: "pipe" });
        execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: process.cwd(), stdio: "pipe" });
        addMsg("info", `✅ Committed: ${msg}`);
      } catch (e: any) {
        addMsg("error", `Commit failed: ${e.stderr || e.message}`);
      }
      return;
    }

    setLoading(true);
    setStreaming(false);
    setSpinnerMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);

    try {
      // Response is built incrementally via onToken callback
      // chat() returns the final text but we don't need to add it again
      await agent.chat(trimmed);
    } catch (err: any) {
      addMsg("error", `Error: ${err.message}`);
    }

    setLoading(false);
    setStreaming(false);
  }, [agent, exit]);

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
        exit();
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
        ) : ready && !loading ? (
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
// Bracketed paste: \x1b[200~ ... \x1b[201~
let pasteBuffer = "";
let inPaste = false;

const origPush = process.stdin.push.bind(process.stdin);
(process.stdin as any).push = function (chunk: any, encoding?: any) {
  if (chunk === null) return origPush(chunk, encoding);

  let data = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);

  const hasStart = data.includes("\x1b[200~");
  const hasEnd = data.includes("\x1b[201~");

  if (hasStart) {
    inPaste = true;
    data = data.replace(/\x1b\[200~/g, "");
  }

  if (hasEnd) {
    data = data.replace(/\x1b\[201~/g, "");
    pasteBuffer += data;
    inPaste = false;

    const content = pasteBuffer.trim();
    pasteBuffer = "";
    const lineCount = content.split("\n").length;

    if (lineCount > 2) {
      // Multi-line paste → store as chunk, don't send to input
      pasteEvents.emit("paste", { content, lines: lineCount });
      return true;
    }

    // Short paste (1-2 lines) — send as normal input
    const sanitized = content.replace(/\r?\n/g, " ");
    if (sanitized) {
      return origPush(sanitized, "utf-8" as any);
    }
    return true;
  }

  if (inPaste) {
    pasteBuffer += data;
    return true;
  }

  data = data.replace(/\x1b\[20[01]~/g, "");
  return origPush(typeof chunk === "string" ? data : Buffer.from(data), encoding);
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
