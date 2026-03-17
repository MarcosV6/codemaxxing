import React from "react";
import { Box, Text } from "ink";
import type { Theme } from "../themes.js";
import { THEMES, listThemes } from "../themes.js";
import { PROVIDERS, getCredentials } from "../utils/auth.js";
import { listInstalledSkills, getRegistrySkills, getActiveSkills } from "../utils/skills.js";
import { formatBytes } from "../utils/hardware.js";
import { getFitIcon, isLlmfitAvailable } from "../utils/models.js";
import { getOllamaInstallCommand } from "../utils/ollama.js";
import type { PullProgress } from "../utils/ollama.js";
import type { HardwareInfo } from "../utils/hardware.js";
import type { ScoredModel } from "../utils/models.js";
import type { WizardScreen } from "./wizard-types.js";

// ── Slash Command Suggestions ──

interface CommandSuggestionsProps {
  cmdMatches: Array<{ cmd: string; desc: string }>;
  cmdIndex: number;
  colors: Theme["colors"];
}

export function CommandSuggestions({ cmdMatches, cmdIndex, colors }: CommandSuggestionsProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.muted} paddingX={1} marginBottom={0}>
      {cmdMatches.slice(0, 6).map((c, i) => (
        <Text key={i}>
          {i === cmdIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === cmdIndex ? colors.suggestion : colors.primary} bold>{c.cmd}</Text>
          <Text color={colors.muted}>{" — "}{c.desc}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Tab select"}</Text>
    </Box>
  );
}

// ── Login Picker ──

interface LoginPickerProps {
  loginPickerIndex: number;
  colors: Theme["colors"];
}

export function LoginPicker({ loginPickerIndex, colors }: LoginPickerProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>💪 Choose a provider:</Text>
      {PROVIDERS.filter((p) => p.id !== "local").map((p, i) => (
        <Text key={p.id}>
          {i === loginPickerIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === loginPickerIndex ? colors.suggestion : colors.primary} bold>{p.name}</Text>
          <Text color={colors.muted}>{" — "}{p.description}</Text>
          {getCredentials().some((c) => c.provider === p.id) ? <Text color={colors.success}> ✓</Text> : null}
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
    </Box>
  );
}

// ── Login Method Picker ──

interface LoginMethodPickerProps {
  loginMethodPicker: { provider: string; methods: string[] };
  loginMethodIndex: number;
  colors: Theme["colors"];
}

export function LoginMethodPickerUI({ loginMethodPicker, loginMethodIndex, colors }: LoginMethodPickerProps) {
  // Provider-specific label overrides
  const providerLabels: Record<string, Record<string, string>> = {
    openai: { "oauth": "🔐 Login with ChatGPT (browser)" },
  };
  const labels: Record<string, string> = {
    "oauth": "🌐 Browser login (OAuth)",
    "setup-token": "🔑 Link subscription (via Claude Code CLI)",
    "cached-token": "📦 Import from existing CLI",
    "api-key": "🔒 Enter API key manually",
    "device-flow": "📱 Device flow (GitHub)",
  };
  const getLabel = (method: string) =>
    providerLabels[loginMethodPicker.provider]?.[method] ?? labels[method] ?? method;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>How do you want to authenticate?</Text>
      {loginMethodPicker.methods.map((method, i) => (
        <Text key={method}>
          {i === loginMethodIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === loginMethodIndex ? colors.suggestion : colors.primary} bold>{getLabel(method)}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter select · Esc back"}</Text>
    </Box>
  );
}

// ── Skills Picker: Menu ──

interface SkillsMenuProps {
  skillsPickerIndex: number;
  colors: Theme["colors"];
}

export function SkillsMenu({ skillsPickerIndex, colors }: SkillsMenuProps) {
  const items = [
    { key: "browse", label: "Browse & Install", icon: "📦" },
    { key: "installed", label: "Installed Skills", icon: "📋" },
    { key: "create", label: "Create Custom Skill", icon: "➕" },
    { key: "remove", label: "Remove Skill", icon: "🗑️" },
  ];
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Skills:</Text>
      {items.map((item, i) => (
        <Text key={item.key}>
          {i === skillsPickerIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === skillsPickerIndex ? colors.suggestion : colors.primary} bold>{item.icon} {item.label}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
    </Box>
  );
}

// ── Skills Picker: Browse ──

interface SkillsBrowseProps {
  skillsPickerIndex: number;
  colors: Theme["colors"];
}

export function SkillsBrowse({ skillsPickerIndex, colors }: SkillsBrowseProps) {
  const registry = getRegistrySkills();
  const installed = listInstalledSkills().map((s) => s.name);
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Browse Skills Registry:</Text>
      {registry.map((s, i) => (
        <Text key={s.name}>
          {i === skillsPickerIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === skillsPickerIndex ? colors.suggestion : colors.primary} bold>{s.name}</Text>
          <Text color={colors.muted}>{" — "}{s.description}</Text>
          {installed.includes(s.name) ? <Text color={colors.success}> ✓</Text> : null}
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter install · Esc back"}</Text>
    </Box>
  );
}

// ── Skills Picker: Installed ──

interface SkillsInstalledProps {
  skillsPickerIndex: number;
  sessionDisabledSkills: Set<string>;
  colors: Theme["colors"];
}

export function SkillsInstalled({ skillsPickerIndex, sessionDisabledSkills, colors }: SkillsInstalledProps) {
  const installed = listInstalledSkills();
  const active = getActiveSkills(process.cwd(), sessionDisabledSkills);
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Installed Skills:</Text>
      {installed.length === 0 ? (
        <Text color={colors.muted}>  No skills installed. Use Browse & Install.</Text>
      ) : installed.map((s, i) => (
        <Text key={s.name}>
          {i === skillsPickerIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === skillsPickerIndex ? colors.suggestion : colors.primary} bold>{s.name}</Text>
          <Text color={colors.muted}>{" — "}{s.description}</Text>
          {active.includes(s.name) ? <Text color={colors.success}> (on)</Text> : <Text color={colors.muted}> (off)</Text>}
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter toggle · Esc back"}</Text>
    </Box>
  );
}

// ── Skills Picker: Remove ──

interface SkillsRemoveProps {
  skillsPickerIndex: number;
  colors: Theme["colors"];
}

export function SkillsRemove({ skillsPickerIndex, colors }: SkillsRemoveProps) {
  const installed = listInstalledSkills();
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.error} paddingX={1} marginBottom={0}>
      <Text bold color={colors.error}>Remove a skill:</Text>
      {installed.map((s, i) => (
        <Text key={s.name}>
          {i === skillsPickerIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === skillsPickerIndex ? colors.suggestion : colors.muted}>{s.name} — {s.description}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter remove · Esc back"}</Text>
    </Box>
  );
}

// ── Theme Picker ──

interface ThemePickerProps {
  themePickerIndex: number;
  theme: Theme;
}

export function ThemePickerUI({ themePickerIndex, theme }: ThemePickerProps) {
  return (
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
  );
}

// ── Session Picker ──

interface SessionPickerProps {
  sessions: Array<{ id: string; display: string }>;
  selectedIndex: number;
  colors: Theme["colors"];
}

export function SessionPicker({ sessions, selectedIndex, colors }: SessionPickerProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.secondary} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Resume a session:</Text>
      {sessions.map((s, i) => (
        <Text key={s.id}>
          {i === selectedIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === selectedIndex ? colors.suggestion : colors.muted}>{s.display}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
    </Box>
  );
}

// ── Delete Session Picker ──

interface DeleteSessionPickerProps {
  sessions: Array<{ id: string; display: string }>;
  selectedIndex: number;
  colors: Theme["colors"];
}

export function DeleteSessionPicker({ sessions, selectedIndex, colors }: DeleteSessionPickerProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.error} paddingX={1} marginBottom={0}>
      <Text bold color={colors.error}>Delete a session:</Text>
      {sessions.map((s, i) => (
        <Text key={s.id}>
          {i === selectedIndex ? <Text color={colors.suggestion} bold>{"▸ "}</Text> : <Text>{"  "}</Text>}
          <Text color={i === selectedIndex ? colors.suggestion : colors.muted}>{s.display}</Text>
        </Text>
      ))}
      <Text dimColor>{"  ↑↓ navigate · Enter select · Esc cancel"}</Text>
    </Box>
  );
}

// ── Delete Session Confirm ──

interface DeleteSessionConfirmProps {
  session: { id: string; display: string };
  colors: Theme["colors"];
}

export function DeleteSessionConfirm({ session, colors }: DeleteSessionConfirmProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.warning} paddingX={1} marginBottom={0}>
      <Text bold color={colors.warning}>Delete session {session.id}?</Text>
      <Text color={colors.muted}>{"  "}{session.display}</Text>
      <Text>
        <Text color={colors.error} bold> [y]</Text><Text>es  </Text>
        <Text color={colors.success} bold>[n]</Text><Text>o</Text>
      </Text>
    </Box>
  );
}

// ── Model Picker (grouped) ──

export interface ModelEntry {
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType: "openai" | "anthropic";
}

export interface GroupedModels {
  [providerName: string]: ModelEntry[];
}

interface GroupedModelPickerProps {
  groups: GroupedModels;
  selectedIndex: number;
  flatList: ModelEntry[];
  activeModel: string;
  colors: Theme["colors"];
}

export function GroupedModelPicker({ groups, selectedIndex, flatList, activeModel, colors }: GroupedModelPickerProps) {
  const providerOrder = Object.keys(groups);
  let flatIdx = 0;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Switch model:</Text>
      <Text>{""}</Text>
      {providerOrder.map((provider) => {
        const models = groups[provider];
        const headerAndModels = (
          <Box key={provider} flexDirection="column">
            <Text color={colors.muted} dimColor>{"  ── "}{provider}{" ──"}</Text>
            {models.map((entry) => {
              const idx = flatIdx++;
              const isSelected = idx === selectedIndex;
              return (
                <Text key={entry.name}>
                  {"  "}{isSelected ? <Text color={colors.primary} bold>{"▸ "}</Text> : "  "}
                  <Text color={isSelected ? colors.primary : undefined}>{entry.name}</Text>
                  {entry.name === activeModel ? <Text color={colors.success}>{" (active)"}</Text> : null}
                </Text>
              );
            })}
          </Box>
        );
        return headerAndModels;
      })}
      <Text>{""}</Text>
      <Text dimColor>{"  ↑↓ navigate · Enter to switch · Esc cancel"}</Text>
    </Box>
  );
}

// ── Ollama Delete Picker ──

interface OllamaDeletePickerProps {
  models: Array<{ name: string; size: number }>;
  selectedIndex: number;
  colors: Theme["colors"];
}

export function OllamaDeletePicker({ models, selectedIndex, colors }: OllamaDeletePickerProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Delete which model?</Text>
      <Text>{""}</Text>
      {models.map((m, i) => (
        <Text key={m.name}>
          {"  "}{i === selectedIndex ? <Text color={colors.primary} bold>{"▸ "}</Text> : "  "}
          <Text color={i === selectedIndex ? colors.primary : undefined}>{m.name}</Text>
          <Text color={colors.muted}>{" ("}{(m.size / (1024 * 1024 * 1024)).toFixed(1)}{" GB)"}</Text>
        </Text>
      ))}
      <Text>{""}</Text>
      <Text dimColor>{"  ↑↓ navigate · Enter to delete · Esc cancel"}</Text>
    </Box>
  );
}

// ── Ollama Pull Picker ──

const PULL_MODELS = [
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "5 GB", desc: "Best balance of speed & quality" },
  { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9 GB", desc: "Higher quality, needs 16GB+ RAM" },
  { id: "qwen2.5-coder:3b", name: "Qwen 2.5 Coder 3B", size: "2 GB", desc: "\u26A0\uFE0F Basic \u2014 may struggle with tool calls" },
  { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "20 GB", desc: "Premium, needs 48GB+" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2", size: "9 GB", desc: "Strong alternative" },
  { id: "codellama:7b", name: "CodeLlama 7B", size: "4 GB", desc: "Meta's coding model" },
  { id: "starcoder2:7b", name: "StarCoder2 7B", size: "4 GB", desc: "Code completion focused" },
];

interface OllamaPullPickerProps {
  selectedIndex: number;
  colors: Theme["colors"];
}

export function OllamaPullPicker({ selectedIndex, colors }: OllamaPullPickerProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Download which model?</Text>
      <Text>{""}</Text>
      {PULL_MODELS.map((m, i) => (
        <Text key={m.id}>
          {"  "}{i === selectedIndex ? <Text color={colors.primary} bold>{"▸ "}</Text> : "  "}
          <Text color={i === selectedIndex ? colors.primary : undefined} bold>{m.name}</Text>
          <Text color={colors.muted}>{" · "}{m.size}{" · "}{m.desc}</Text>
        </Text>
      ))}
      <Text>{""}</Text>
      <Text dimColor>{"  ↑↓ navigate · Enter to download · Esc cancel"}</Text>
    </Box>
  );
}

// ── Ollama Delete Confirm ──

interface OllamaDeleteConfirmProps {
  model: string;
  size: number;
  colors: Theme["colors"];
}

export function OllamaDeleteConfirm({ model, size, colors }: OllamaDeleteConfirmProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.warning} paddingX={1} marginBottom={0}>
      <Text bold color={colors.warning}>Delete {model} ({(size / (1024 * 1024 * 1024)).toFixed(1)} GB)?</Text>
      <Text>
        <Text color={colors.error} bold> [y]</Text><Text>es  </Text>
        <Text color={colors.success} bold>[n]</Text><Text>o</Text>
      </Text>
    </Box>
  );
}

// ── Ollama Pull Progress ──

interface OllamaPullProgressProps {
  model: string;
  progress: PullProgress;
  colors: Theme["colors"];
}

export function OllamaPullProgress({ model, progress, colors }: OllamaPullProgressProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>{"  Downloading "}{model}{"..."}</Text>
      {progress.status === "downloading" || progress.percent > 0 ? (
        <Text>
          {"  "}
          <Text color={colors.primary}>
            {"\u2588".repeat(Math.floor(progress.percent / 5))}
            {"\u2591".repeat(20 - Math.floor(progress.percent / 5))}
          </Text>
          {"  "}<Text bold>{progress.percent}%</Text>
          {progress.completed != null && progress.total != null ? (
            <Text color={colors.muted}>{" \u00B7 "}{formatBytes(progress.completed)}{" / "}{formatBytes(progress.total)}</Text>
          ) : null}
        </Text>
      ) : (
        <Text color={colors.muted}>{"  "}{progress.status}...</Text>
      )}
    </Box>
  );
}

// ── Ollama Exit Prompt ──

interface OllamaExitPromptProps {
  colors: Theme["colors"];
}

export function OllamaExitPrompt({ colors }: OllamaExitPromptProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.warning} paddingX={1} marginBottom={0}>
      <Text bold color={colors.warning}>Ollama is still running.</Text>
      <Text color={colors.muted}>Stop it to free GPU memory?</Text>
      <Text>
        <Text color={colors.success} bold> [y]</Text><Text>es  </Text>
        <Text color={colors.error} bold>[n]</Text><Text>o  </Text>
        <Text color={colors.primary} bold>[a]</Text><Text>lways</Text>
      </Text>
    </Box>
  );
}

// ── Approval Prompt ──

interface ApprovalPromptProps {
  approval: {
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
  };
  colors: Theme["colors"];
}

export function ApprovalPrompt({ approval, colors }: ApprovalPromptProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.warning} paddingX={1} marginTop={1}>
      <Text bold color={colors.warning}>⚠ Approve {approval.tool}?</Text>
      {approval.tool === "write_file" && approval.args.path ? (
        <Text color={colors.muted}>{"  📄 "}{String(approval.args.path)}</Text>
      ) : null}
      {approval.tool === "write_file" && approval.args.content ? (
        <Text color={colors.muted}>{"  "}{String(approval.args.content).split("\n").length}{" lines, "}{String(approval.args.content).length}{"B"}</Text>
      ) : null}
      {approval.diff ? (
        <Box flexDirection="column" marginTop={0} marginLeft={2}>
          {approval.diff.split("\n").slice(0, 40).map((line, i) => (
            <Text key={i} color={
              line.startsWith("+") ? colors.success :
              line.startsWith("-") ? colors.error :
              line.startsWith("@@") ? colors.primary :
              colors.muted
            }>{line}</Text>
          ))}
          {approval.diff.split("\n").length > 40 ? (
            <Text color={colors.muted}>... ({approval.diff.split("\n").length - 40} more lines)</Text>
          ) : null}
        </Box>
      ) : null}
      {approval.tool === "run_command" && approval.args.command ? (
        <Text color={colors.muted}>{"  $ "}{String(approval.args.command)}</Text>
      ) : null}
      <Text>
        <Text color={colors.success} bold> [y]</Text><Text>es  </Text>
        <Text color={colors.error} bold>[n]</Text><Text>o  </Text>
        <Text color={colors.primary} bold>[a]</Text><Text>lways</Text>
      </Text>
    </Box>
  );
}

// ── Wizard: Connection Screen ──

interface WizardConnectionProps {
  wizardIndex: number;
  colors: Theme["colors"];
}

export function WizardConnection({ wizardIndex, colors }: WizardConnectionProps) {
  const items = [
    { key: "local",      icon: "\uD83D\uDDA5\uFE0F",  label: "Set up a local model", desc: "free, runs on your machine" },
    { key: "openrouter", icon: "\uD83C\uDF10", label: "OpenRouter", desc: "200+ cloud models, browser login" },
    { key: "apikey",     icon: "\uD83D\uDD11", label: "Enter API key manually", desc: "" },
    { key: "existing",   icon: "\u2699\uFE0F",  label: "I already have a server running", desc: "" },
  ];
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>No LLM detected. How do you want to connect?</Text>
      <Text>{""}</Text>
      {items.map((item, i) => (
        <Text key={item.key}>
          {i === wizardIndex ? <Text color={colors.suggestion} bold>{"  \u25B8 "}</Text> : <Text>{"    "}</Text>}
          <Text color={i === wizardIndex ? colors.suggestion : colors.primary} bold>{item.icon}  {item.label}</Text>
          {item.desc ? <Text color={colors.muted}>{" ("}{item.desc}{")"}</Text> : null}
        </Text>
      ))}
      <Text>{""}</Text>
      <Text dimColor>{"  \u2191\u2193 navigate \u00B7 Enter to select"}</Text>
    </Box>
  );
}

// ── Wizard: Models Screen ──

interface WizardModelsProps {
  wizardIndex: number;
  wizardHardware: HardwareInfo;
  wizardModels: ScoredModel[];
  colors: Theme["colors"];
}

export function WizardModels({ wizardIndex, wizardHardware, wizardModels, colors }: WizardModelsProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      <Text bold color={colors.secondary}>Your hardware:</Text>
      <Text color={colors.muted}>{"  CPU: "}{wizardHardware.cpu.name}{" ("}{wizardHardware.cpu.cores}{" cores)"}</Text>
      <Text color={colors.muted}>{"  RAM: "}{formatBytes(wizardHardware.ram)}</Text>
      {wizardHardware.gpu ? (
        <Text color={colors.muted}>{"  GPU: "}{wizardHardware.gpu.name}{wizardHardware.gpu.vram > 0 ? ` (${formatBytes(wizardHardware.gpu.vram)})` : ""}</Text>
      ) : (
        <Text color={colors.muted}>{"  GPU: none detected"}</Text>
      )}
      {!isLlmfitAvailable() && (
        <Text dimColor>{"  Tip: Install llmfit for smarter recommendations: brew install llmfit"}</Text>
      )}
      <Text>{""}</Text>
      <Text bold color={colors.secondary}>Recommended models:</Text>
      <Text>{""}</Text>
      {wizardModels.map((m, i) => (
        <Text key={m.ollamaId}>
          {i === wizardIndex ? <Text color={colors.suggestion} bold>{"  \u25B8 "}</Text> : <Text>{"    "}</Text>}
          <Text>{getFitIcon(m.fit)} </Text>
          <Text color={i === wizardIndex ? colors.suggestion : colors.primary} bold>{m.name}</Text>
          <Text color={colors.muted}>{"     ~"}{m.size}{" GB \u00B7 "}{m.quality === "best" ? "Best" : m.quality === "great" ? "Great" : "Good"}{" quality \u00B7 "}{m.speed}</Text>
        </Text>
      ))}
      {wizardModels.length === 0 && (
        <Text color={colors.error}>{"  No suitable models found for your hardware."}</Text>
      )}
      <Text>{""}</Text>
      <Text dimColor>{"  \u2191\u2193 navigate \u00B7 Enter to install \u00B7 Esc back"}</Text>
    </Box>
  );
}

// ── Wizard: Install Ollama Screen ──

interface WizardInstallOllamaProps {
  wizardHardware: HardwareInfo | null;
  colors: Theme["colors"];
}

export function WizardInstallOllama({ wizardHardware, colors }: WizardInstallOllamaProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.warning} paddingX={1} marginBottom={0}>
      <Text bold color={colors.warning}>Ollama is required for local models.</Text>
      <Text>{""}</Text>
      <Text color={colors.primary}>{"  Press Enter to install Ollama automatically"}</Text>
      <Text dimColor>{"  Or install manually: "}<Text>{getOllamaInstallCommand(wizardHardware?.os ?? "linux")}</Text></Text>
      <Text>{""}</Text>
      <Text dimColor>{"  Enter to install · Esc to go back"}</Text>
    </Box>
  );
}

// ── Wizard: Pulling Screen ──

interface WizardPullingProps {
  wizardSelectedModel: ScoredModel | null;
  wizardPullProgress: PullProgress | null;
  wizardPullError: string | null;
  colors: Theme["colors"];
}

export function WizardPulling({ wizardSelectedModel, wizardPullProgress, wizardPullError, colors }: WizardPullingProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={0}>
      {wizardPullError ? (
        <>
          <Text color={colors.error} bold>{"  \u274C Error: "}{wizardPullError}</Text>
          <Text>{""}</Text>
          <Text dimColor>{"  Press Enter to retry \u00B7 Esc to go back"}</Text>
        </>
      ) : wizardPullProgress ? (
        <>
          <Text bold color={colors.secondary}>{"  "}{wizardSelectedModel ? `Downloading ${wizardSelectedModel.name}...` : wizardPullProgress?.status || "Working..."}</Text>
          {wizardPullProgress.status === "downloading" || wizardPullProgress.percent > 0 ? (
            <>
              <Text>
                {"  "}
                <Text color={colors.primary}>
                  {"\u2588".repeat(Math.floor(wizardPullProgress.percent / 5))}
                  {"\u2591".repeat(20 - Math.floor(wizardPullProgress.percent / 5))}
                </Text>
                {"  "}<Text bold>{wizardPullProgress.percent}%</Text>
                {wizardPullProgress.completed != null && wizardPullProgress.total != null ? (
                  <Text color={colors.muted}>{" \u00B7 "}{formatBytes(wizardPullProgress.completed)}{" / "}{formatBytes(wizardPullProgress.total)}</Text>
                ) : null}
              </Text>
            </>
          ) : (
            <Text color={colors.muted}>{"  "}{wizardPullProgress.status}...</Text>
          )}
        </>
      ) : null}
    </Box>
  );
}
