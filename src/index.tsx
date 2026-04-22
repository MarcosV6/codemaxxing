#!/usr/bin/env node

import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import * as fsSync from "fs";
import {
  reconcileInputWithPendingPasteMarker,
  sanitizeInputArtifacts,
  type PendingPasteEndState,
} from "./utils/paste.js";
import { setupPasteInterceptor } from "./ui/paste-interceptor.js";
import type { CodingAgent } from "./core/agent.js";
import { loadConfig, saveConfig, listModels, getLocalEndpoints } from "./config.js";
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
import { loadHistory, addToHistory, resetHistoryCursor } from "./utils/input-history.js";
import { checkForUpdate } from "./utils/update-check.js";
import { assessModelReliability, formatModelReliabilityLine } from "./utils/provider-health.js";
import type { GroupedModels, ModelEntry, ProviderPickerEntry } from "./ui/pickers.js";
import { getCredential, scrubSecrets } from "./utils/auth.js";
import type { WizardScreen } from "./ui/wizard-types.js";
import { Banner, ConnectionInfo } from "./ui/banner.js";
import { StatusBar } from "./ui/status-bar.js";
import type { ChatMessage } from "./ui/connection-types.js";
import {
  refreshConnectionBanner as refreshConnectionBannerImpl,
  connectToProvider as connectToProviderImpl,
} from "./ui/connection.js";
import { MarkdownText } from "./ui/markdown.js";
import { TaskList } from "./ui/task-list.js";
import { getTasks, onTaskChange, clearTasks, type AgentTask } from "./utils/task-tracker.js";
import {
  CommandSuggestions, LoginPicker, LoginMethodPickerUI, SkillsMenu, SkillsBrowse,
  SkillsInstalled, SkillsRemove, AgentCommandPicker, ScheduleCommandPicker,
  OrchestrateCommandPicker, CwdPicker, ThemePickerUI, SessionPicker, DeleteSessionPicker,
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
  { cmd: "/cd", desc: "change workspace directory" },
  { cmd: "/compact", desc: "compress conversation context" },
  { cmd: "/cost", desc: "show token usage and cost" },
  { cmd: "/read-only", desc: "add file as read-only context" },
  { cmd: "/checkpoint", desc: "save current state as checkpoint" },
  { cmd: "/restore", desc: "restore to a checkpoint" },
  { cmd: "/checkpoints", desc: "list saved checkpoints" },
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
  { cmd: "/provider", desc: "manage saved provider profiles" },
  { cmd: "/sessions", desc: "list past sessions" },
  { cmd: "/session delete", desc: "delete a session" },
  { cmd: "/resume", desc: "resume a past session" },
  { cmd: "/skills", desc: "manage skill packs" },
  { cmd: "/architect", desc: "toggle architect mode" },
  { cmd: "/think", desc: "set reasoning effort (off/low/medium/high/max)" },
  { cmd: "/test", desc: "run project tests" },
  { cmd: "/test on", desc: "enable auto-test after changes" },
  { cmd: "/test off", desc: "disable auto-test" },
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
  { cmd: "/init", desc: "create CODEMAXXING.md project rules" },
  { cmd: "/export", desc: "export conversation to file" },
  { cmd: "/approve", desc: "set approval mode (suggest/auto-edit/full-auto)" },
  { cmd: "/image", desc: "send an image for analysis" },
  { cmd: "/doctor", desc: "run diagnostics" },
  { cmd: "/copy", desc: "copy last response to clipboard" },
  { cmd: "/skills learned", desc: "show auto-learned skills" },
  { cmd: "/skills learned on", desc: "enable learned workflow capture" },
  { cmd: "/skills learned off", desc: "disable learned workflow capture" },
  { cmd: "/skills learned clear", desc: "remove all learned workflows" },
  { cmd: "/hooks", desc: "show configured hooks" },
  { cmd: "/memory", desc: "view persistent memories" },
  { cmd: "/memory search", desc: "search memories" },
  { cmd: "/memory forget", desc: "delete a memory by ID" },
  { cmd: "/memory stats", desc: "show memory statistics" },
  { cmd: "/version", desc: "show codemaxxing version" },
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

// ── Gradient color helpers ──
function lerpHex(hex1: string, hex2: string, t: number): string {
  const parse = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const c = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

// ── Spinner bar: animated gradient pulse ──
const SPINNER_BAR_WIDTH = 20;
const SPINNER_BAR_CHAR = "━";
const SPINNER_BAR_DOT = "●";

function NeonSpinner({ message, colors }: { message: string; colors: Theme['colors'] }) {
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [displayMsg, setDisplayMsg] = useState(message);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 60);
    return () => clearInterval(interval);
  }, []);

  // Rotate through spinner messages every ~3s
  useEffect(() => {
    setDisplayMsg(message);
    const interval = setInterval(() => {
      setDisplayMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);
    }, 3000);
    return () => clearInterval(interval);
  }, [message]);

  const c1 = colors.primary.startsWith("#") ? colors.primary : "#00FFFF";
  const c2 = colors.secondary.startsWith("#") ? colors.secondary : "#FF00FF";

  // Bouncing dot position
  const pos = Math.floor((Math.sin(tick * 0.08) + 1) * 0.5 * (SPINNER_BAR_WIDTH - 1));

  const bar: React.ReactNode[] = [];
  for (let i = 0; i < SPINNER_BAR_WIDTH; i++) {
    const dist = Math.abs(i - pos);
    const glow = Math.max(0, 1 - dist / 4);
    const color = lerpHex(colors.muted.startsWith("#") ? colors.muted : "#444444", c1, glow);
    bar.push(<Text key={i} color={color}>{i === pos ? SPINNER_BAR_DOT : SPINNER_BAR_CHAR}</Text>);
  }

  return (
    <Box marginLeft={2} marginTop={0}>
      <Text>{bar}</Text>
      <Text>{" "}</Text>
      <Text bold color={c2}>{displayMsg}</Text>
      <Text color={colors.muted}>{" "}{elapsed}s</Text>
    </Box>
  );
}

// ── Streaming Indicator: pulsing dots with gradient ──
// Uses the same SPINNER_MESSAGES so users see the fun messages while streaming too

function StreamingIndicator({ colors }: { colors: Theme['colors'] }) {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState(() => SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessage(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const c1 = colors.primary.startsWith("#") ? colors.primary : "#00FFFF";
  const c2 = colors.secondary.startsWith("#") ? colors.secondary : "#FF00FF";

  // Three pulsing dots with staggered phase
  const dots = [0, 1, 2].map((i) => {
    const phase = (tick + i * 3) % 12;
    const brightness = phase < 6 ? phase / 6 : (12 - phase) / 6;
    const color = lerpHex(colors.muted.startsWith("#") ? colors.muted : "#444444", c1, brightness);
    return <Text key={i} color={color} bold>{"●"}</Text>;
  });

  return (
    <Box marginLeft={2}>
      <Text>{dots[0]} {dots[1]} {dots[2]}</Text>
      <Text>{" "}</Text>
      <Text color={c2}>{message}</Text>
    </Box>
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


// ── Tool icons for visual flair ──
function getToolIcon(toolText: string): string {
  const t = toolText.toLowerCase();
  if (t.includes("read_file") || t.includes("read file")) return "\u{1F4C4}";
  if (t.includes("write_file") || t.includes("write file") || t.includes("create_file")) return "\u270F\uFE0F";
  if (t.includes("edit_file") || t.includes("edit file") || t.includes("apply_diff") || t.includes("replace")) return "\u2702\uFE0F";
  if (t.includes("run_command") || t.includes("bash") || t.includes("execute") || t.includes("shell")) return "\u{1F4BB}";
  if (t.includes("search") || t.includes("grep") || t.includes("find") || t.includes("glob")) return "\u{1F50D}";
  if (t.includes("list_dir") || t.includes("list dir") || t.includes("directory")) return "\u{1F4C1}";
  if (t.includes("web_search") || t.includes("web search") || t.includes("browse")) return "\u{1F310}";
  if (t.includes("ask_user") || t.includes("ask user")) return "\u{1F4AC}";
  if (t.includes("git")) return "\u{1F33F}";
  if (t.includes("test")) return "\u{1F9EA}";
  return "\u2699\uFE0F";
}

interface ChatMessageRowProps {
  msg: ChatMessage;
  prevType: ChatMessage["type"] | null;
  modelName: string;
  colors: Theme["colors"];
  termWidth: number;
}

const ChatMessageRow = React.memo(function ChatMessageRow({
  msg,
  prevType,
  modelName,
  colors,
  termWidth,
}: ChatMessageRowProps) {
  const needsSep = msg.type === "user" && prevType !== null && prevType !== "user";

  switch (msg.type) {
    case "user":
      return (
        <Box flexDirection="column" marginTop={needsSep ? 1 : 0}>
          {needsSep && <Text color={colors.muted}>{"  "}{"\u2500".repeat(Math.max(0, Math.min(termWidth - 6, 50)))}</Text>}
          <Box marginTop={0}>
            <Text color={colors.userInput} bold>{"  \u276f "}</Text>
            <Box flexDirection="column" flexShrink={1}>
              {msg.text.split("\n").map((line, i) => (
                <Text key={i} color={colors.userInput} wrap="wrap">{line}</Text>
              ))}
            </Box>
          </Box>
        </Box>
      );
    case "response":
      return (
        <Box flexDirection="column" marginLeft={2} marginBottom={1} marginTop={0}>
          <Box>
            <Text color={colors.response} bold>{"\u25cf "}</Text>
            <Text color={colors.muted} dimColor>{modelName || "assistant"}</Text>
          </Box>
          <Box marginLeft={2}>
            <MarkdownText text={msg.text} colors={colors} />
          </Box>
        </Box>
      );
    case "tool": {
      const toolIcon = getToolIcon(msg.text);
      return (
        <Box marginLeft={2}>
          <Text color={colors.tool}>{`  ${toolIcon} `}</Text>
          <Text bold color={colors.tool}>{msg.text}</Text>
        </Box>
      );
    }
    case "tool-result": {
      const maxLen = 200;
      const display = msg.text.length > maxLen ? msg.text.slice(0, maxLen) + "\u2026" : msg.text;
      return (
        <Box marginLeft={2}>
          <Text color={colors.toolResult}>{"    \u2514\u2500 "}{display}</Text>
        </Box>
      );
    }
    case "diff": {
      const diffLines = msg.text.split("\n");
      const filePath = diffLines[0] || "";
      const stats = diffLines[1] || "";
      const addCount = stats.match(/\+(\d+)/)?.[1] || "0";
      const removeCount = stats.match(/-(\d+)/)?.[1] || "0";
      const codeLines = diffLines.slice(2).filter((line) => !line.startsWith("---") && !line.startsWith("+++"));
      const maxLines = 30;
      const isNew = removeCount === "0";
      return (
        <Box flexDirection="column" marginLeft={4}>
          <Box>
            <Text color={colors.primary} bold>{isNew ? "+" : "\u2666"} {isNew ? "Write" : "Update"}({filePath})</Text>
            <Text color={colors.muted}>{" "}</Text>
            <Text color="#4ADE80" bold>+{addCount}</Text>
            <Text color={colors.muted}>{" "}</Text>
            <Text color="#F87171" bold>-{removeCount}</Text>
          </Box>
          {codeLines.slice(0, maxLines).map((line, i) => {
            if (line.startsWith("@@")) {
              return (
                <Box key={i}>
                  <Text color={colors.muted}>{" \u2500\u2500 "}{line}</Text>
                </Box>
              );
            }
            const isAdd = line.startsWith("+");
            const isRemove = line.startsWith("-");
            const lineContent = (isAdd || isRemove) ? line.slice(1) : line.startsWith(" ") ? line.slice(1) : line;
            const lineColor = isAdd ? "#4ADE80" : isRemove ? "#F87171" : colors.muted;
            const marker = isAdd ? "+" : isRemove ? "-" : " ";
            return (
              <Box key={i}>
                <Text color={lineColor}>{" "}{marker} {lineContent}</Text>
              </Box>
            );
          })}
          {codeLines.length > maxLines && (
            <Box>
              <Text color={colors.muted}>{"   ... "}{codeLines.length - maxLines} more lines</Text>
            </Box>
          )}
        </Box>
      );
    }
    case "error":
      return (
        <Box marginLeft={2}>
          <Text color={colors.error} bold>{"  \u2718 "}</Text>
          <Text color={colors.error}>{msg.text}</Text>
        </Box>
      );
    case "info":
      return (
        <Box marginLeft={2}>
          <Text color={colors.muted}>{"  \u25cb "}{msg.text}</Text>
        </Box>
      );
    default:
      return <Text>{msg.text}</Text>;
  }
}, (prev, next) =>
  prev.msg === next.msg &&
  prev.prevType === next.prevType &&
  prev.modelName === next.modelName &&
  prev.colors === next.colors &&
  prev.termWidth === next.termWidth,
);

interface ChatTranscriptProps {
  messages: ChatMessage[];
  modelName: string;
  colors: Theme["colors"];
  termWidth: number;
}

// Keep the scrollback out of keystroke-driven rerenders. Long sessions get
// expensive fast once Markdown output starts stacking up.
const ChatTranscript = React.memo(function ChatTranscript({
  messages,
  modelName,
  colors,
  termWidth,
}: ChatTranscriptProps) {
  return (
    <>
      {messages.map((msg, idx) => (
        <ChatMessageRow
          key={msg.id}
          msg={msg}
          prevType={idx > 0 ? messages[idx - 1]?.type ?? null : null}
          modelName={modelName}
          colors={colors}
          termWidth={termWidth}
        />
      ))}
    </>
  );
}, (prev, next) =>
  prev.messages === next.messages &&
  prev.modelName === next.modelName &&
  prev.colors === next.colors &&
  prev.termWidth === next.termWidth,
);

let msgId = 0;
function nextMsgId(): number { return msgId++; }

// List subdirectories of a path, sorted alphabetically. Always prepends
// "." (select current) and ".." (go to parent) entries. Hidden folders
// (starting with ".") are excluded. Returns empty-safe even on EPERM.
function loadCwdEntries(dir: string): string[] {
  const entries: string[] = [".", ".."];
  try {
    const items = fsSync.readdirSync(dir, { withFileTypes: true });
    const subdirs = items
      .filter((i) => i.isDirectory() && !i.name.startsWith("."))
      .map((i) => i.name)
      .sort((a, b) => a.localeCompare(b));
    entries.push(...subdirs);
  } catch {
    // unreadable directory — just offer ./.. navigation
  }
  return entries;
}

// ── Main App ──
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // Track terminal width reactively. Ink's useStdout() snapshots columns at
  // mount, so we listen for the stdout "resize" event (SIGWINCH) and re-render.
  //
  // Two subtleties:
  // 1. Ink erases its previous render by cursor-moving up N lines based on the
  //    OLD wrap width. After a resize the wrapping is different, so the erase
  //    misses lines and we see stacked banner fragments. Hard-clearing the
  //    screen (\x1b[2J + \x1b[H) forces Ink to start fresh at the new size.
  // 2. Dragging the window fires "resize" dozens of times. Debounce so we only
  //    clear+redraw once the drag settles.
  const [termWidth, setTermWidth] = useState(stdout?.columns ?? 80);
  useEffect(() => {
    if (!stdout) return;
    let pending: NodeJS.Timeout | null = null;
    const onResize = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        try { stdout.write("\x1b[2J\x1b[H"); } catch { /* pipe closed */ }
        setTermWidth(stdout.columns ?? 80);
        pending = null;
      }, 80);
    };
    stdout.on("resize", onResize);
    return () => {
      if (pending) clearTimeout(pending);
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  const [input, setInput] = useState("");
  const [pastedChunks, setPastedChunks] = useState<Array<{ id: number; lines: number; content: string }>>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [spinnerMsg, setSpinnerMsg] = useState("");
  const [lastActivityAt, setLastActivityAt] = useState(Date.now());
  const lastActivityAtRef = useRef(Date.now());
  const [agentStage, setAgentStage] = useState("idle");
  const [lastToolName, setLastToolName] = useState<string | null>(null);
  const lastToolNameRef = useRef<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState(0);
  const activeRequestIdRef = useRef(0);
  const [agent, setAgent] = useState<CodingAgent | null>(null);
  const [modelName, setModelName] = useState("");
  const [cwdDisplay, setCwdDisplay] = useState(process.cwd());
  const [cwdPicker, setCwdPicker] = useState(false);
  const [cwdPickerPath, setCwdPickerPath] = useState(process.cwd());
  const [cwdPickerIndex, setCwdPickerIndex] = useState(0);
  const [cwdPickerEntries, setCwdPickerEntries] = useState<string[]>([]);
  const [thinkLevel, setThinkLevel] = useState<"low" | "medium" | "high" | "max" | null>(null);
  const [thinkPicker, setThinkPicker] = useState(false);
  const [thinkPickerIndex, setThinkPickerIndex] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => {
    // Honor the persisted preference from settings.json so the user's choice
    // survives restarts. Falls back to DEFAULT_THEME if unset or invalid.
    try {
      const savedName = loadConfig().defaults.theme;
      if (savedName) return getTheme(savedName);
    } catch {
      // ignore — config read is best-effort
    }
    return getTheme(DEFAULT_THEME);
  });
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
  const askUserResolveRef = useRef<((answer: string) => void) | null>(null);

  // Keep refs in sync so the heartbeat interval below can read current values
  // without re-arming itself on every token.
  useEffect(() => { lastActivityAtRef.current = lastActivityAt; }, [lastActivityAt]);
  useEffect(() => { lastToolNameRef.current = lastToolName; }, [lastToolName]);

  useEffect(() => {
    if (!loading || !agent) return;
    const requestIdAtStart = activeRequestId;
    let warned = false;

    // Heads-up only — large local models can legitimately take 2+ minutes for the
    // first token on a fresh load. Don't tear down state; just let the user know
    // it's still working so they can decide whether to wait or Ctrl+C.
    const interval = setInterval(() => {
      if (warned) return;
      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs > 120000 && requestIdAtStart === activeRequestIdRef.current) {
        warned = true;
        const toolSuffix = lastToolNameRef.current ? ` (${lastToolNameRef.current})` : "";
        addMsg("info", `still waiting on the model… ${Math.round(idleMs / 1000)}s since last activity${toolSuffix}. Press Ctrl+C twice to cancel.`);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loading, agent, activeRequestId]);

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

  // ── Agent Task Progress ──
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  useEffect(() => {
    onTaskChange(() => setAgentTasks(getTasks()));
  }, []);
  // Clear completed tasks a few seconds after loading stops
  const prevLoading = useRef(false);
  useEffect(() => {
    if (prevLoading.current && !loading && agentTasks.length > 0) {
      const timer = setTimeout(() => clearTasks(), 3000);
      return () => clearTimeout(timer);
    }
    prevLoading.current = loading;
  }, [loading, agentTasks.length]);

  // Listen for paste events from stdin interceptor — all pastes arrive as
  // attachment blocks (never inline) to avoid the ink-text-input reconciliation race.
  useEffect(() => {
    const handler = ({ content, lines }: { content: string; lines: number }) => {
      pendingPasteEndMarkerRef.current = { active: true, buffer: "" };
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

  // Load input history on mount
  useEffect(() => { loadHistory(); }, []);

  // Check for updates (non-blocking)
  useEffect(() => {
    checkForUpdate(VERSION).then((latest) => {
      if (latest) {
        addMsg("info", `📦 Update available: v${VERSION} → v${latest}\n   Run: npm i -g codemaxxing@latest`);
      }
    });
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
      setAskUserResolve: (fn: () => (answer: string) => void) => {
        askUserResolveRef.current = fn();
      },
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
    // Scrub persisted API keys / tokens out of any message before it renders.
    // Provider error bodies frequently echo the request Authorization header
    // verbatim, and we'd rather not leak that to the user's scrollback.
    const safe = type === "error" || type === "info" ? scrubSecrets(text) : text;
    setMessages((prev) => [...prev, { id: nextMsgId(), type, text: safe }]);
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
  const pendingPasteEndMarkerRef = React.useRef<PendingPasteEndState>({ active: false, buffer: "" });

  const openModelPicker = useCallback(async () => {
    addMsg("info", "Fetching available models...");
    const groups: GroupedModels = {};
    const providerEntries: ProviderPickerEntry[] = [];

    let localFound = false;
    let localLabel = "Local LLM";

    for (const endpoint of getLocalEndpoints()) {
      if (localFound) break;
      try {
        const models = await listModels(endpoint.url, "local");
        if (models.length > 0) {
          localLabel = endpoint.name === "Local (env)" ? `Local LLM (${endpoint.url})` : endpoint.name;
          groups[localLabel] = models.map(m => ({
            name: m,
            baseUrl: endpoint.url,
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
          localLabel = "Ollama";
          groups[localLabel] = ollamaModels.map(m => ({
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
      providerEntries.push({ name: localLabel, description: "No auth needed — auto-detected", authed: true });
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
      const qwenBaseUrl = qwenCred.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      const qwenModels = await listModels(qwenBaseUrl, qwenCred.apiKey);
      if (qwenModels.length > 0) {
        groups["Qwen"] = qwenModels.map(m => ({
          name: m,
          baseUrl: qwenBaseUrl,
          apiKey: qwenCred.apiKey,
          providerType: "openai" as const,
        }));
      }
    }
    providerEntries.push({ name: "Qwen", description: "Qwen 3.5, Qwen Coder — use your DashScope API key", authed: !!qwenCred });

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
    pendingPasteEndMarkerRef.current = { active: false, buffer: "" };
    setInput("");
    setPastedChunks([]);
    setPasteCount(0);
    resetHistoryCursor();
    if (!submittedValue.trim()) return;

    const trimmed = submittedValue.trim();
    addToHistory(trimmed);

    // If the agent is waiting for a user answer (ask_user tool), resolve it
    if (askUserResolveRef.current) {
      const resolve = askUserResolveRef.current;
      askUserResolveRef.current = null;
      addMsg("user", submittedValue);
      setLoading(true);
      setSpinnerMsg("Processing...");
      resolve(trimmed);
      return;
    }

    addMsg("user", submittedValue);

    if (trimmed === "/init") {
      const fs = await import("fs");
      const path = await import("path");
      const rulesPath = path.join(process.cwd(), "CODEMAXXING.md");
      if (fs.existsSync(rulesPath)) {
        addMsg("info", `CODEMAXXING.md already exists. Edit it directly to update project rules.`);
        return;
      }
      // Detect project info for the template
      let projectName = "my-project";
      let projectDesc = "";
      const pkgPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          if (pkg.name) projectName = pkg.name;
          if (pkg.description) projectDesc = pkg.description;
        } catch {}
      }
      const template = [
        `# ${projectName}`,
        "",
        projectDesc ? `${projectDesc}\n` : "",
        "## Project Guidelines",
        "",
        "<!-- Add project-specific instructions for the AI agent here. -->",
        "<!-- These rules are loaded into every conversation automatically. -->",
        "",
        "### Code Style",
        "- Follow existing code conventions in this project",
        "- Use TypeScript strict mode where applicable",
        "",
        "### Testing",
        "- Write tests for new functionality",
        "- Run tests before committing",
        "",
        "### Git",
        "- Use conventional commit messages",
        "- Keep PRs focused and small",
        "",
        "### Do NOT",
        "- Modify files outside the project root",
        "- Commit sensitive credentials",
        "- Skip existing tests",
        "",
      ].join("\n");
      fs.writeFileSync(rulesPath, template, "utf-8");
      addMsg("info", `📋 Created CODEMAXXING.md — edit it to customize agent behavior for this project.`);
      return;
    }
    if (trimmed === "/export" || trimmed.startsWith("/export ")) {
      const outPath = trimmed.replace("/export", "").trim() || `codemaxxing-chat-${Date.now()}.md`;
      const fs = await import("fs");
      const path = await import("path");
      const resolved = path.resolve(outPath);
      const lines: string[] = [`# Codemaxxing Chat Export\n`, `Date: ${new Date().toISOString()}`, `Model: ${modelName}\n`, "---\n"];
      for (const msg of messages) {
        if (msg.type === "user") lines.push(`## User\n${msg.text}\n`);
        else if (msg.type === "response") lines.push(`## Assistant\n${msg.text}\n`);
        else if (msg.type === "tool") lines.push(`> Tool: ${msg.text}\n`);
        else if (msg.type === "tool-result") lines.push(`> ${msg.text}\n`);
        else if (msg.type === "diff") lines.push(`\`\`\`diff\n${msg.text}\n\`\`\`\n`);
        else if (msg.type === "error") lines.push(`**Error:** ${msg.text}\n`);
        else if (msg.type === "info") lines.push(`*${msg.text}*\n`);
      }
      try {
        fs.writeFileSync(resolved, lines.join("\n"), "utf-8");
        addMsg("info", `📝 Exported ${messages.length} messages to ${resolved}`);
      } catch (err: any) {
        addMsg("error", `Export failed: ${err.message}`);
      }
      return;
    }
    if (trimmed === "/approve" || trimmed.startsWith("/approve ")) {
      if (!agent) { addMsg("error", "Not connected."); return; }
      const mode = trimmed.replace("/approve", "").trim();
      if (!mode) {
        const current = agent.getApprovalMode();
        addMsg("info",
          `🔒 Approval mode: ${current}\n` +
          `  /approve suggest    — ask before all dangerous tools (default)\n` +
          `  /approve auto-edit  — auto-approve file edits, ask for commands\n` +
          `  /approve full-auto  — auto-approve everything (yolo mode)`
        );
        return;
      }
      if (mode === "suggest" || mode === "auto-edit" || mode === "full-auto") {
        if (mode === "full-auto") {
          // Full-auto runs arbitrary shell commands the model chooses — in an
          // untrusted repo this is a foot-gun. Require the user to type the
          // exact phrase so a fat-finger on autocomplete can't trip it.
          addMsg("info",
            "⚠️  Full-auto disables ALL prompts, including shell commands and file writes.\n" +
            "Only use this in a trusted, sandboxed environment (container, VM, scratch dir).\n" +
            "To confirm, type exactly:  I understand"
          );
          const answer = await new Promise<string>((resolve) => {
            askUserResolveRef.current = resolve;
          });
          if (answer.trim() !== "I understand") {
            addMsg("info", "Full-auto not enabled (phrase did not match). Approval mode unchanged.");
            return;
          }
        }
        agent.setApprovalMode(mode);
        const labels: Record<string, string> = {
          "suggest": "🔒 Suggest — all dangerous tools require approval",
          "auto-edit": "🔓 Auto-edit — file edits auto-approved, commands need approval",
          "full-auto": "⚡ Full-auto — everything auto-approved (yolo mode)",
        };
        addMsg("info", `Approval mode: ${labels[mode]}`);
      } else {
        addMsg("error", `Unknown mode: ${mode}. Use: suggest, auto-edit, or full-auto`);
      }
      return;
    }
    if (trimmed.startsWith("/image")) {
      const imgPath = trimmed.replace("/image", "").trim();
      if (!imgPath) {
        addMsg("info", "Usage: /image <file-path> [question]\n  Send an image for the model to analyze.\n  Example: /image screenshot.png what's wrong with this UI?");
        return;
      }
      // Split path and optional question
      const parts = imgPath.split(/\s+/);
      const filePath = parts[0];
      const question = parts.slice(1).join(" ") || "Describe this image in detail.";

      const fs = await import("fs");
      const path = await import("path");
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        addMsg("error", `Image not found: ${resolved}`);
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      const supportedExts: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
      };
      if (!supportedExts[ext]) {
        addMsg("error", `Unsupported image format: ${ext}. Supported: ${Object.keys(supportedExts).join(", ")}`);
        return;
      }
      const data = fs.readFileSync(resolved);
      const base64 = data.toString("base64");
      const sizeKB = (data.length / 1024).toFixed(1);
      addMsg("info", `🖼️ Sending image: ${resolved} (${sizeKB}KB)`);
      setLoading(true);
      setSpinnerMsg("Analyzing image...");
      try {
        const response = await agent!.send(question, [{ mime: supportedExts[ext], base64 }]);
        setLoading(false);
        setStreaming(false);
        if (!response.startsWith("(")) {
          // Response was already streamed via onToken
        }
      } catch (err: any) {
        setLoading(false);
        addMsg("error", `Image analysis failed: ${err.message}`);
      }
      return;
    }
    if (trimmed === "/hooks") {
      const { getHooksSummary } = await import("./utils/hooks.js");
      addMsg("info", `\u{1FA9D} Hooks:\n${getHooksSummary(process.cwd())}`);
      return;
    }
    if (trimmed === "/memory" || trimmed.startsWith("/memory ")) {
      const { getMemories, recall, forget, getMemoryStats } = await import("./utils/memory.js");
      const sub = trimmed.replace("/memory", "").trim();

      if (sub === "stats") {
        const stats = getMemoryStats();
        const typeLines = Object.entries(stats.byType).map(([t, c]) => `  ${t}: ${c}`).join("\n");
        const scopeLines = Object.entries(stats.byScope).map(([s, c]) => `  ${s}: ${c}`).join("\n");
        addMsg("info", `\u{1F9E0} Memory Stats\n  Total: ${stats.total}\n\nBy type:\n${typeLines}\n\nBy scope:\n${scopeLines}`);
        return;
      }

      if (sub.startsWith("search ")) {
        const query = sub.replace("search ", "").trim();
        if (!query) { addMsg("info", "Usage: /memory search <query>"); return; }
        const results = recall(query, { limit: 15 });
        if (results.length === 0) { addMsg("info", "No memories found."); return; }
        const lines = results.map(m => `  #${m.id} [${m.type}] ${m.key}: ${m.content}`);
        addMsg("info", `\u{1F9E0} Found ${results.length} memories:\n${lines.join("\n")}`);
        return;
      }

      if (sub.startsWith("forget ")) {
        const idStr = sub.replace("forget ", "").trim();
        const id = parseInt(idStr, 10);
        if (isNaN(id)) { addMsg("error", "Usage: /memory forget <id>"); return; }
        const ok = forget(id);
        addMsg(ok ? "info" : "error", ok ? `\u2713 Memory #${id} deleted.` : `Memory #${id} not found.`);
        return;
      }

      // Default: show all memories
      const mems = getMemories({ limit: 30 });
      if (mems.length === 0) {
        addMsg("info", "\u{1F9E0} No memories yet. The agent will automatically save useful information as you work together.");
        return;
      }
      const lines = mems.map(m => `  #${m.id} [${m.type}] ${m.key}: ${m.content} (importance: ${m.importance})`);
      addMsg("info", `\u{1F9E0} ${mems.length} memories:\n${lines.join("\n")}`);
      return;
    }
    if (trimmed === "/doctor") {
      const lines: string[] = ["🩺 Diagnostics:"];
      // Node version
      lines.push(`  Node.js: ${process.version}`);
      lines.push(`  Platform: ${process.platform} ${process.arch}`);
      lines.push(`  CWD: ${process.cwd()}`);
      // Git
      const { isGitRepo: isGit, getBranch: getBr, getStatus: getSt } = await import("./utils/git.js");
      if (isGit(process.cwd())) {
        lines.push(`  Git: ${getBr(process.cwd())} (${getSt(process.cwd())})`);
      } else {
        lines.push("  Git: not a git repo");
      }
      // Connection
      if (agent) {
        lines.push(`  Model: ${modelName}`);
        lines.push(`  Base URL: ${agent.getBaseUrl()}`);
        lines.push(`  Transport: ${agent.getProviderType()}`);
        lines.push(`  ${formatModelReliabilityLine(agent.getModel(), agent.getBaseUrl())}`);
        const reliability = assessModelReliability(agent.getModel(), agent.getBaseUrl());
        if (reliability.reasons.length > 0) {
          lines.push(`  Reliability notes: ${reliability.reasons.join("; ")}`);
        }
        const cost = agent.getCostInfo();
        lines.push(`  Session tokens: ${cost.promptTokens + cost.completionTokens}`);
        const linter = agent.getDetectedLinter();
        lines.push(`  Linter: ${linter ? `${linter.name} (${agent.isAutoLintEnabled() ? "ON" : "OFF"})` : "none detected"}`);
        const testRunner = agent.getDetectedTestRunner();
        lines.push(`  Test runner: ${testRunner ? `${testRunner.name} (auto: ${agent.isAutoTestEnabled() ? "ON" : "OFF"})` : "none detected"}`);
        lines.push(`  Context: ${agent.getContextLength()} messages, ~${agent.estimateTokens()} tokens`);
        const mcpCount = agent.getMCPServerCount();
        lines.push(`  MCP servers: ${mcpCount}`);
      } else {
        lines.push("  Agent: not connected");
      }
      // Check Ollama
      const ollamaUp = await isOllamaRunning();
      lines.push(`  Ollama: ${ollamaUp ? "running" : "not running"}`);
      // Credentials
      const creds: string[] = [];
      if (getCredential("openai")) creds.push("OpenAI");
      if (getCredential("anthropic")) creds.push("Anthropic");
      if (getCredential("openrouter")) creds.push("OpenRouter");
      if (getCredential("qwen")) creds.push("Qwen");
      lines.push(`  Credentials: ${creds.length > 0 ? creds.join(", ") : "none"}`);
      addMsg("info", lines.join("\n"));
      return;
    }
    if (trimmed === "/copy") {
      // Find last response message
      const lastResponse = [...messages].reverse().find((m) => m.type === "response");
      if (lastResponse) {
        const { execSync: cpExec } = await import("child_process");
        try {
          if (process.platform === "darwin") {
            cpExec("pbcopy", { input: lastResponse.text });
          } else if (process.platform === "win32") {
            cpExec("clip", { input: lastResponse.text });
          } else {
            cpExec("xclip -selection clipboard", { input: lastResponse.text });
          }
          addMsg("info", "📋 Last response copied to clipboard.");
        } catch {
          addMsg("error", "Failed to copy — clipboard tool not available.");
        }
      } else {
        addMsg("info", "No response to copy.");
      }
      return;
    }
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
      // Rendered from SLASH_COMMANDS so adding a command in one place keeps
      // /help and autocomplete in sync. Longest command name determines
      // column width.
      const longest = SLASH_COMMANDS.reduce((n, c) => Math.max(n, c.cmd.length), 0);
      const lines = ["Commands:"];
      for (const c of SLASH_COMMANDS) {
        lines.push(`  ${c.cmd.padEnd(longest + 2)}— ${c.desc}`);
      }
      addMsg("info", lines.join("\n"));
      return;
    }
    if (trimmed === "/version") {
      try {
        const pkg = await import("../package.json", { with: { type: "json" } } as any).catch(async () => {
          const fs = await import("fs");
          const url = await import("url");
          const path = await import("path");
          const here = path.dirname(url.fileURLToPath(import.meta.url));
          const candidates = [
            path.join(here, "..", "package.json"),
            path.join(here, "..", "..", "package.json"),
          ];
          for (const p of candidates) {
            try { return { default: JSON.parse(fs.readFileSync(p, "utf-8")) }; } catch { /* try next */ }
          }
          return { default: { version: "unknown" } };
        });
        const version = (pkg as any).default?.version ?? (pkg as any).version ?? "unknown";
        addMsg("info", `codemaxxing v${version}`);
      } catch (err: any) {
        addMsg("info", `codemaxxing (version lookup failed: ${err.message})`);
      }
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
      () => tryHandleBackgroundAgentCommand(trimmed, process.cwd(), addMsg, { setAgentPicker, agentOptions: commandAgentOptions }).then(r => r ?? false),
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
        connectToProvider,
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
    if (trimmed === "/cd" || trimmed.startsWith("/cd ")) {
      const raw = trimmed.slice(3).trim();
      if (!raw) {
        // Open interactive folder picker rooted at current cwd
        const start = process.cwd();
        const entries = loadCwdEntries(start);
        setCwdPickerPath(start);
        setCwdPickerEntries(entries);
        setCwdPickerIndex(0);
        setCwdPicker(true);
        return;
      }
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      // Expand ~ and resolve relative to current cwd
      let target = raw;
      if (target === "~") target = os.homedir();
      else if (target.startsWith("~/")) target = path.join(os.homedir(), target.slice(2));
      target = path.resolve(process.cwd(), target);
      if (!fs.existsSync(target)) {
        addMsg("error", `Path does not exist: ${target}`);
        return;
      }
      if (!fs.statSync(target).isDirectory()) {
        addMsg("error", `Not a directory: ${target}`);
        return;
      }
      try {
        process.chdir(target);
        agent?.updateCwd(target);
        setCwdDisplay(target);
        addMsg("info", `📁 Workspace changed to ${target}\n  (Project rules from the original folder remain in context until next session.)`);
      } catch (err: any) {
        addMsg("error", `Failed to change directory: ${err.message}`);
      }
      return;
    }
    if (trimmed === "/think" || trimmed.startsWith("/think ")) {
      const arg = trimmed.replace("/think", "").trim().toLowerCase();
      if (!arg) {
        addMsg("info", "🧠 Usage: /think off|low|medium|high|max");
        return;
      }
      if (arg === "off" || arg === "none") {
        agent!.setReasoningEffort(null);
        setThinkLevel(null);
        addMsg("info", "🧠 Thinking effort: off");
        return;
      }
      if (arg === "low" || arg === "medium" || arg === "high" || arg === "max") {
        agent!.setReasoningEffort(arg);
        setThinkLevel(arg);
        addMsg("info", `🧠 Thinking effort: ${arg}`);
        return;
      }
      addMsg("info", "Usage: /think [off|low|medium|high|max]\n  Or use keywords in your message: 'think', 'think hard', 'ultrathink'");
      return;
    }
    if (trimmed === "/compact") {
      const tokens = agent!.estimateTokens();
      const msgs = agent!.getContextLength();
      if (msgs <= 11) {
        addMsg("info", `Context too small to compress (${msgs} messages, ~${tokens} tokens).`);
        return;
      }
      setLoading(true);
      setSpinnerMsg("Compressing context...");
      const result = await agent!.compressContext();
      setLoading(false);
      if (result) {
        const saved = result.oldTokens - result.newTokens;
        const savedStr = saved >= 1000 ? `${(saved / 1000).toFixed(1)}k` : String(saved);
        addMsg("info", `📦 Context compressed: ~${savedStr} tokens freed (${result.oldTokens} → ${result.newTokens})`);
      } else {
        addMsg("info", "Nothing to compress.");
      }
      return;
    }
    if (trimmed === "/cost") {
      const cost = agent!.getCostInfo();
      const promptStr = cost.promptTokens >= 1000 ? `${(cost.promptTokens / 1000).toFixed(1)}k` : String(cost.promptTokens);
      const compStr = cost.completionTokens >= 1000 ? `${(cost.completionTokens / 1000).toFixed(1)}k` : String(cost.completionTokens);
      const totalTokens = cost.promptTokens + cost.completionTokens;
      const totalStr = totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens);
      const costStr = cost.totalCost < 0.01 ? `$${cost.totalCost.toFixed(4)}` : `$${cost.totalCost.toFixed(2)}`;
      addMsg("info",
        `💰 Session Cost\n` +
        `  Prompt tokens:     ${promptStr}\n` +
        `  Completion tokens: ${compStr}\n` +
        `  Total tokens:      ${totalStr}\n` +
        `  Estimated cost:    ${costStr}`
      );
      return;
    }
    if (trimmed.startsWith("/read-only")) {
      const filePath = trimmed.replace("/read-only", "").trim();
      if (!filePath) {
        addMsg("info", "Usage: /read-only <file-path>\n  Adds a file as read-only context for the LLM.");
        return;
      }
      const fs = await import("fs");
      const path = await import("path");
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        addMsg("error", `File not found: ${resolved}`);
        return;
      }
      try {
        const content = fs.readFileSync(resolved, "utf-8");
        const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
        agent!.addReadOnlyFile(resolved, content);
        addMsg("info", `📎 Added as read-only context: ${resolved} (${sizeKB}KB)`);
      } catch (err: any) {
        addMsg("error", `Failed to read file: ${err.message}`);
      }
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
      thinkPicker,
      thinkPickerIndex,
      setThinkPicker,
      setThinkPickerIndex,
      onThinkSelected: (level: "low" | "medium" | "high" | "max" | null) => {
        setThinkLevel(level);
        try { agent?.setReasoningEffort(level); } catch {}
        addMsg("info", level ? `🧠 Thinking level: ${level}` : "🧠 Thinking: off");
      },
      cwdPicker,
      cwdPickerPath,
      cwdPickerEntries,
      cwdPickerIndex,
      setCwdPicker,
      setCwdPickerPath,
      setCwdPickerEntries,
      setCwdPickerIndex,
      onCwdSelected: (newCwd: string) => {
        try {
          process.chdir(newCwd);
          agent?.updateCwd(newCwd);
          setCwdDisplay(newCwd);
          addMsg("info", `📁 Workspace changed to ${newCwd}\n  (Project rules from the original folder remain in context until next session.)`);
        } catch (err: any) {
          addMsg("error", `Failed to change directory: ${err.message}`);
        }
      },
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
      <Banner version={VERSION} colors={theme.colors} width={termWidth} />

      {/* ═══ CONNECTION INFO BOX ═══ */}
      {connectionInfo.length > 0 && (
        <ConnectionInfo connectionInfo={connectionInfo} colors={theme.colors} />
      )}

      {/* ═══ CHAT MESSAGES ═══ */}
      <ChatTranscript
        messages={messages}
        modelName={modelName}
        colors={theme.colors}
        termWidth={termWidth}
      />

      {/* ═══ TASK PROGRESS ═══ */}
      {agentTasks.length > 0 && (
        <TaskList tasks={agentTasks} colors={theme.colors} />
      )}

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

      {/* ═══ WORKSPACE (CWD) PICKER ═══ */}
      {cwdPicker && (
        <CwdPicker
          currentPath={cwdPickerPath}
          entries={cwdPickerEntries}
          selectedIndex={cwdPickerIndex}
          colors={theme.colors}
        />
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

      {/* ═══ INPUT AREA ═══ */}
      <Box flexDirection="column" marginTop={0}>
        <Box
          borderStyle="round"
          borderColor={approval ? theme.colors.warning : theme.colors.border}
          paddingX={1}
          width="100%"
        >
          <Text color={approval ? theme.colors.warning : theme.colors.primary} bold>{"\u276f "}</Text>
          {approval ? (
            <Text color={theme.colors.warning} italic>waiting for approval...</Text>
          ) : ready && !loading && !wizardScreen ? (
            <Box flexDirection="column" width="100%">
              {pastedChunks.length > 0 && (
                <Box flexDirection="column" marginBottom={0}>
                  {pastedChunks.map((p) => (
                    <Text key={p.id} color={theme.colors.muted}>
                      {`\u{1F4CE} paste #${p.id} \u00b7 ${p.lines} lines `}
                      <Text dimColor>(Backspace to remove)</Text>
                    </Text>
                  ))}
                </Box>
              )}
              <TextInput
                key={inputKey}
                value={input}
                onChange={(v) => {
                  let nextValue = sanitizeInputArtifacts(v);
                  const prevValue = inputRef.current;
                  const pending = pendingPasteEndMarkerRef.current;

                  if (pending.active) {
                    const reconciled = reconcileInputWithPendingPasteMarker(prevValue, nextValue, pending);
                    pendingPasteEndMarkerRef.current = reconciled.nextState;
                    nextValue = reconciled.value;
                  }

                  setInput(nextValue);
                  setCmdIndex(0);
                }}
                onSubmit={handleSubmit}
              />
            </Box>
          ) : (
            <Text dimColor italic>{loading ? "thinking..." : "connecting..."}</Text>
          )}
        </Box>
      </Box>

      {/* ═══ STATUS BAR ═══ */}
      {agent && (
        <StatusBar agent={agent} modelName={modelName} sessionDisabledSkills={sessionDisabledSkills} cwd={cwdDisplay} />
      )}
    </Box>
  );
}

// The interactive Ink UI requires a real TTY (cursor control, raw input). If
// someone pipes output (`codemaxxing | grep`) or runs under a non-TTY CI
// runner, Ink silently renders nothing and the user thinks we hung. Bail with
// a hint pointing at the non-interactive `exec` subcommand instead.
if (!process.stdout.isTTY || !process.stdin.isTTY) {
  const why = !process.stdout.isTTY ? "stdout is not a TTY (is output being piped?)" : "stdin is not a TTY";
  process.stderr.write(
    `codemaxxing: interactive mode requires a terminal (${why}).\n` +
    `For non-interactive use, run:\n` +
    `  codemaxxing exec "<your prompt>"\n` +
    `See \`codemaxxing exec --help\` for options.\n`
  );
  process.exit(1);
}

// Clear the terminal once on startup before Ink takes over.
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

// Set up paste interception (bracketed paste, burst buffering, debris swallowing)
const pasteEvents = setupPasteInterceptor();

render(<App />, { exitOnCtrlC: false });
