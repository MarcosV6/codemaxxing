import type { Key } from "ink";
import { PROVIDERS, getCredentials, openRouterOAuth, anthropicSetupToken, importCodexToken, importQwenToken, copilotDeviceFlow, saveApiKey } from "../utils/auth.js";
import { loginOpenAICodexOAuth } from "../utils/openai-oauth.js";
import { loginAnthropicOAuth } from "../utils/anthropic-oauth.js";
import { listInstalledSkills, installSkill, removeSkill, getRegistrySkills, getActiveSkills } from "../utils/skills.js";
import { listThemes, getTheme, THEMES } from "../themes.js";
import { getSession, loadMessages, deleteSession } from "../utils/sessions.js";
import { deleteModel, stopOllama } from "../utils/ollama.js";
import { loadConfig, saveConfig } from "../config.js";
import type { CodingAgent } from "../agent.js";
import type { Theme } from "../themes.js";
import type { PullProgress } from "../utils/ollama.js";
import type { ScoredModel } from "../utils/models.js";
import type { HardwareInfo } from "../utils/hardware.js";
import type { WizardContext } from "./wizard-types.js";
import { handleWizardScreen } from "./wizard.js";

// ── Context interface ──

export interface InputRouterContext extends WizardContext {
  // Slash command suggestions
  showSuggestionsRef: { current: boolean };
  cmdMatchesRef: { current: Array<{ cmd: string; desc: string }> };
  cmdIndexRef: { current: number };
  setCmdIndex: (fn: (prev: number) => number) => void;
  setInput: (val: string) => void;
  setInputKey: (fn: (prev: number) => number) => void;

  // Login method picker
  loginMethodPicker: { provider: string; methods: string[] } | null;
  loginMethodIndex: number;
  setLoginMethodIndex: (fn: (prev: number) => number) => void;
  setLoginMethodPicker: (val: { provider: string; methods: string[] } | null) => void;

  // Login picker (loginPicker state; setLoginPicker/setLoginPickerIndex inherited from WizardContext)
  loginPicker: boolean;
  loginPickerIndex: number;

  // Skills picker
  skillsPicker: "menu" | "browse" | "installed" | "remove" | null;
  skillsPickerIndex: number;
  setSkillsPickerIndex: (fn: (prev: number) => number) => void;
  setSkillsPicker: (val: "menu" | "browse" | "installed" | "remove" | null) => void;

  // Agent picker
  agentPicker: boolean;
  agentPickerIndex: number;
  setAgentPickerIndex: (fn: (prev: number) => number) => void;
  setAgentPicker: (val: boolean) => void;

  // Schedule picker
  schedulePicker: boolean;
  schedulePickerIndex: number;
  setSchedulePickerIndex: (fn: (prev: number) => number) => void;
  setSchedulePicker: (val: boolean) => void;

  // Orchestrate picker
  orchestratePicker: boolean;
  orchestratePickerIndex: number;
  setOrchestratePickerIndex: (fn: (prev: number) => number) => void;
  setOrchestratePicker: (val: boolean) => void;
  sessionDisabledSkills: Set<string>;
  setSessionDisabledSkills: (fn: (prev: Set<string>) => Set<string>) => void;

  // Provider picker (step 1)
  providerPicker: Array<{ name: string; description: string; authed: boolean }> | null;
  providerPickerIndex: number;
  setProviderPickerIndex: (fn: (prev: number) => number) => void;
  setProviderPicker: (val: Array<{ name: string; description: string; authed: boolean }> | null) => void;
  selectedProvider: string | null;
  setSelectedProvider: (val: string | null) => void;

  // Model picker (step 2)
  modelPickerGroups: { [providerName: string]: Array<{ name: string; baseUrl: string; apiKey: string; providerType: "openai" | "anthropic" }> } | null;
  modelPickerIndex: number;
  setModelPickerIndex: (fn: (prev: number) => number) => void;
  setModelPickerGroups: (val: { [providerName: string]: Array<{ name: string; baseUrl: string; apiKey: string; providerType: "openai" | "anthropic" }> } | null) => void;
  flatModelList: Array<{ name: string; baseUrl: string; apiKey: string; providerType: "openai" | "anthropic" }>;
  setFlatModelList: (val: Array<{ name: string; baseUrl: string; apiKey: string; providerType: "openai" | "anthropic" }>) => void;

  // Ollama delete picker
  ollamaDeletePicker: { models: { name: string; size: number }[] } | null;
  ollamaDeletePickerIndex: number;
  setOllamaDeletePickerIndex: (fn: (prev: number) => number) => void;
  setOllamaDeletePicker: (val: { models: { name: string; size: number }[] } | null) => void;

  // Ollama pull picker
  ollamaPullPicker: boolean;
  ollamaPullPickerIndex: number;
  setOllamaPullPickerIndex: (fn: (prev: number) => number) => void;
  setOllamaPullPicker: (val: boolean) => void;

  // Ollama delete confirm
  ollamaDeleteConfirm: { model: string; size: number } | null;
  setOllamaDeleteConfirm: (val: { model: string; size: number } | null) => void;

  // Ollama exit prompt
  ollamaExitPrompt: boolean;
  setOllamaExitPrompt: (val: boolean) => void;

  // Theme picker
  themePicker: boolean;
  themePickerIndex: number;
  setThemePickerIndex: (fn: (prev: number) => number) => void;
  setThemePicker: (val: boolean) => void;
  setTheme: (val: Theme) => void;

  // Session picker
  sessionPicker: Array<{ id: string; display: string }> | null;
  sessionPickerIndex: number;
  setSessionPickerIndex: (fn: (prev: number) => number) => void;
  setSessionPicker: (val: Array<{ id: string; display: string }> | null) => void;

  // Delete session confirm
  deleteSessionConfirm: { id: string; display: string } | null;
  setDeleteSessionConfirm: (val: { id: string; display: string } | null) => void;

  // Delete session picker
  deleteSessionPicker: Array<{ id: string; display: string }> | null;
  deleteSessionPickerIndex: number;
  setDeleteSessionPickerIndex: (fn: (prev: number) => number) => void;
  setDeleteSessionPicker: (val: Array<{ id: string; display: string }> | null) => void;

  // Paste chunks
  input: string;
  pastedChunksRef: { current: Array<{ id: number; lines: number; content: string }> };
  setPastedChunks: (fn: (prev: Array<{ id: number; lines: number; content: string }>) => Array<{ id: number; lines: number; content: string }>) => void;

  // Approval
  approval: {
    tool: string;
    args: Record<string, unknown>;
    diff?: string;
    resolve: (decision: "yes" | "no" | "always") => void;
  } | null;
  setApproval: (val: InputRouterContext["approval"]) => void;

  // Ctrl+C
  ctrlCPressed: boolean;
  setCtrlCPressed: (val: boolean) => void;

  // Agent
  agent: CodingAgent | null;
  setModelName: (val: string) => void;

  // Generation state
  streaming: boolean;
  loading: boolean;

  // Misc (addMsg, setLoading, setSpinnerMsg, connectToProvider, _require inherited from WizardContext)
  exit: () => void;
  refreshConnectionBanner: () => Promise<void>;
  handleSubmit: (value: string) => void;
}

// ── Main router ──

export function routeKeyPress(inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (handleSlashCommandNavigation(inputChar, key, ctx)) return true;
  if (handleLoginMethodPicker(inputChar, key, ctx)) return true;
  if (handleLoginPicker(inputChar, key, ctx)) return true;
  if (handleSkillsPicker(inputChar, key, ctx)) return true;
  if (handleAgentPicker(inputChar, key, ctx)) return true;
  if (handleSchedulePicker(inputChar, key, ctx)) return true;
  if (handleOrchestratePicker(inputChar, key, ctx)) return true;
  if (handleProviderPicker(inputChar, key, ctx)) return true;
  if (handleModelPicker(inputChar, key, ctx)) return true;
  if (handleOllamaDeletePicker(inputChar, key, ctx)) return true;
  if (handleOllamaPullPicker(inputChar, key, ctx)) return true;
  if (handleOllamaDeleteConfirm(inputChar, key, ctx)) return true;
  if (handleOllamaExitPrompt(inputChar, key, ctx)) return true;
  if (handleWizardScreen(inputChar, key, ctx)) return true;
  if (handleThemePicker(inputChar, key, ctx)) return true;
  if (handleSessionPicker(inputChar, key, ctx)) return true;
  if (handleDeleteSessionConfirm(inputChar, key, ctx)) return true;
  if (handleDeleteSessionPicker(inputChar, key, ctx)) return true;
  if (handleBackspaceRemovesPasteChunk(inputChar, key, ctx)) return true;
  if (handleApprovalPrompts(inputChar, key, ctx)) return true;
  // Escape to abort generation (when loading or streaming)
  if (key.escape && (ctx.streaming || ctx.loading) && ctx.agent) {
    ctx.agent.abort();
    ctx.setLoading(false);
    ctx.addMsg("info", "⏹ Generation cancelled.");
    return true;
  }
  if (handleCtrlCExit(inputChar, key, ctx)) return true;
  return false;
}

// ── Handlers ──

function handleSlashCommandNavigation(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.showSuggestionsRef.current) return false;
  const matches = ctx.cmdMatchesRef.current;
  if (key.upArrow) {
    ctx.setCmdIndex((prev) => (prev - 1 + matches.length) % matches.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setCmdIndex((prev) => (prev + 1) % matches.length);
    return true;
  }
  if (key.tab) {
    const selected = matches[ctx.cmdIndexRef.current];
    if (selected) {
      ctx.setInput(selected.cmd + (selected.cmd === "/commit" ? " " : ""));
      ctx.setCmdIndex(() => 0);
      ctx.setInputKey((k) => k + 1);
    }
    return true;
  }
  return false;
}

function handleLoginMethodPicker(inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.loginMethodPicker) return false;
  const methods = ctx.loginMethodPicker.methods;
  if (key.upArrow) {
    ctx.setLoginMethodIndex((prev: number) => (prev - 1 + methods.length) % methods.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setLoginMethodIndex((prev: number) => (prev + 1) % methods.length);
    return true;
  }
  if (key.escape) {
    ctx.setLoginMethodPicker(null);
    ctx.setLoginPicker(true);
    return true;
  }
  if (key.return) {
    const method = methods[ctx.loginMethodIndex];
    const providerId = ctx.loginMethodPicker.provider;
    ctx.setLoginMethodPicker(null);

    if (method === "oauth" && providerId === "openrouter") {
      ctx.addMsg("info", "Starting OpenRouter OAuth — opening browser...");
      ctx.setLoading(true);
      ctx.setSpinnerMsg("Waiting for authorization...");
      openRouterOAuth((msg: string) => ctx.addMsg("info", msg))
        .then(async () => {
          ctx.addMsg("info", `✅ OpenRouter authenticated! Access to 200+ models.\n  Opening model picker...`);
          ctx.setLoading(false);
          await ctx.openModelPicker();
        })
        .catch((err: any) => { ctx.addMsg("error", `OAuth failed: ${err.message}`); ctx.setLoading(false); });
    } else if (method === "oauth" && providerId === "anthropic") {
      ctx.addMsg("info", "Opening browser for Claude login...");
      ctx.setLoading(true);
      ctx.setSpinnerMsg("Waiting for Anthropic authorization...");
      loginAnthropicOAuth((msg: string) => ctx.addMsg("info", msg))
        .then(async (cred) => { 
          ctx.addMsg("info", `✅ Anthropic authenticated! (${cred.label})\n  Opening model picker...`); 
          ctx.setLoading(false); 
          await ctx.openModelPicker();
        })
        .catch((err: any) => {
          ctx.addMsg("error", `OAuth failed: ${err.message}\n  Fallback: set your key via CLI:  codemaxxing auth api-key anthropic <your-key>\n  Or set ANTHROPIC_API_KEY env var and restart.\n  Get key at: console.anthropic.com/settings/keys`);
          ctx.setLoading(false);
        });
    } else if (method === "oauth" && providerId === "openai") {
      // Try cached Codex token first as a quick path
      const imported = importCodexToken((msg: string) => ctx.addMsg("info", msg));
      if (imported) {
        ctx.addMsg("info", `✅ Imported Codex credentials! (${imported.label})\n  Opening model picker...`);
        void ctx.openModelPicker();
      } else {
        // Primary flow: browser OAuth
        ctx.addMsg("info", "Opening browser for ChatGPT login...");
        ctx.setLoading(true);
        ctx.setSpinnerMsg("Waiting for OpenAI authorization...");
        loginOpenAICodexOAuth((msg: string) => ctx.addMsg("info", msg))
          .then(async (cred) => {
            ctx.addMsg("info", `✅ OpenAI authenticated! (${cred.label})\n  Opening model picker...`);
            ctx.setLoading(false);
            await ctx.openModelPicker();
          })
          .catch((err: any) => {
            ctx.addMsg("error", `OAuth failed: ${err.message}\n  Fallback: set your key via CLI:  codemaxxing auth api-key openai <your-key>\n  Or set OPENAI_API_KEY env var and restart.\n  Get key at: platform.openai.com/api-keys`);
            ctx.setLoading(false);
          });
      }
    } else if (method === "cached-token" && providerId === "qwen") {
      const imported = importQwenToken((msg: string) => ctx.addMsg("info", msg));
      if (imported) { ctx.addMsg("info", `✅ Imported Qwen credentials! (${imported.label})\n  Opening model picker...`); void ctx.openModelPicker(); }
      else { ctx.addMsg("info", "No Qwen CLI found. Install Qwen CLI and sign in first."); }
    } else if (method === "device-flow") {
      ctx.addMsg("info", "Starting GitHub Copilot device flow...");
      ctx.setLoading(true);
      ctx.setSpinnerMsg("Waiting for GitHub authorization...");
      copilotDeviceFlow((msg: string) => ctx.addMsg("info", msg))
        .then(async () => { ctx.addMsg("info", `✅ GitHub Copilot authenticated!\n  Opening model picker...`); ctx.setLoading(false); await ctx.openModelPicker(); })
        .catch((err: any) => { ctx.addMsg("error", `Copilot auth failed: ${err.message}`); ctx.setLoading(false); });
    } else if (method === "api-key") {
      const provider = PROVIDERS.find((p) => p.id === providerId);
      ctx.addMsg("info", `Enter your API key via CLI:\n  codemaxxing auth api-key ${providerId} <your-key>\n  Get key at: ${provider?.consoleUrl ?? "your provider's dashboard"}`);
    }
    return true;
  }
  return true; // absorb all keys when picker is active
}

function handleLoginPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.loginPicker) return false;
  const loginProviders = PROVIDERS.filter((p) => p.id !== "local");
  if (key.upArrow) {
    ctx.setLoginPickerIndex((prev: number) => (prev - 1 + loginProviders.length) % loginProviders.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setLoginPickerIndex((prev: number) => (prev + 1) % loginProviders.length);
    return true;
  }
  if (key.return) {
    const selected = loginProviders[ctx.loginPickerIndex];
    ctx.setLoginPicker(false);

    const methods = selected.methods.filter((m) => m !== "none");

    if (methods.length === 1) {
      ctx.setLoginMethodPicker({ provider: selected.id, methods });
      ctx.setLoginMethodIndex(() => 0);
      if (methods[0] === "oauth" && selected.id === "openrouter") {
        ctx.setLoginMethodPicker(null);
        ctx.addMsg("info", "Starting OpenRouter OAuth — opening browser...");
        ctx.setLoading(true);
        ctx.setSpinnerMsg("Waiting for authorization...");
        openRouterOAuth((msg: string) => ctx.addMsg("info", msg))
          .then(async () => { ctx.addMsg("info", `✅ OpenRouter authenticated! Access to 200+ models.\n  Opening model picker...`); ctx.setLoading(false); await ctx.openModelPicker(); })
          .catch((err: any) => { ctx.addMsg("error", `OAuth failed: ${err.message}`); ctx.setLoading(false); });
      } else if (methods[0] === "device-flow") {
        ctx.setLoginMethodPicker(null);
        ctx.addMsg("info", "Starting GitHub Copilot device flow...");
        ctx.setLoading(true);
        ctx.setSpinnerMsg("Waiting for GitHub authorization...");
        copilotDeviceFlow((msg: string) => ctx.addMsg("info", msg))
          .then(async () => { ctx.addMsg("info", `✅ GitHub Copilot authenticated!\n  Opening model picker...`); ctx.setLoading(false); await ctx.openModelPicker(); })
          .catch((err: any) => { ctx.addMsg("error", `Copilot auth failed: ${err.message}`); ctx.setLoading(false); });
      } else if (methods[0] === "api-key") {
        ctx.setLoginMethodPicker(null);
        ctx.addMsg("info", `Enter your API key via CLI:\n  codemaxxing auth api-key ${selected.id} <your-key>\n  Get key at: ${selected.consoleUrl ?? "your provider's dashboard"}`);
      }
    } else {
      ctx.setLoginMethodPicker({ provider: selected.id, methods });
      ctx.setLoginMethodIndex(() => 0);
    }
    return true;
  }
  if (key.escape) {
    ctx.setLoginPicker(false);
    return true;
  }
  return true; // absorb all keys when picker is active
}

function handleSkillsPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.skillsPicker) return false;

  if (ctx.skillsPicker === "menu") {
    const menuItems = ["browse", "installed", "create", "remove"];
    if (key.upArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev + 1) % menuItems.length);
      return true;
    }
    if (key.escape) {
      ctx.setSkillsPicker(null);
      return true;
    }
    if (key.return) {
      const selected = menuItems[ctx.skillsPickerIndex];
      if (selected === "browse") {
        ctx.setSkillsPicker("browse");
        ctx.setSkillsPickerIndex(() => 0);
      } else if (selected === "installed") {
        ctx.setSkillsPicker("installed");
        ctx.setSkillsPickerIndex(() => 0);
      } else if (selected === "create") {
        ctx.setSkillsPicker(null);
        ctx.setInput("/skills create ");
        ctx.setInputKey((k) => k + 1);
      } else if (selected === "remove") {
        const installed = listInstalledSkills();
        if (installed.length === 0) {
          ctx.setSkillsPicker(null);
          ctx.addMsg("info", "No skills installed to remove.");
        } else {
          ctx.setSkillsPicker("remove");
          ctx.setSkillsPickerIndex(() => 0);
        }
      }
      return true;
    }
    return true;
  }

  if (ctx.skillsPicker === "browse") {
    const registry = getRegistrySkills();
    if (key.upArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev - 1 + registry.length) % registry.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev + 1) % registry.length);
      return true;
    }
    if (key.escape) {
      ctx.setSkillsPicker("menu");
      ctx.setSkillsPickerIndex(() => 0);
      return true;
    }
    if (key.return) {
      const selected = registry[ctx.skillsPickerIndex];
      if (selected) {
        const result = installSkill(selected.name);
        ctx.addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
      }
      ctx.setSkillsPicker(null);
      return true;
    }
    return true;
  }

  if (ctx.skillsPicker === "installed") {
    const installed = listInstalledSkills();
    if (installed.length === 0) {
      ctx.setSkillsPicker("menu");
      ctx.setSkillsPickerIndex(() => 0);
      ctx.addMsg("info", "No skills installed.");
      return true;
    }
    if (key.upArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev - 1 + installed.length) % installed.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev + 1) % installed.length);
      return true;
    }
    if (key.escape) {
      ctx.setSkillsPicker("menu");
      ctx.setSkillsPickerIndex(() => 0);
      return true;
    }
    if (key.return) {
      const selected = installed[ctx.skillsPickerIndex];
      if (selected) {
        const isDisabled = ctx.sessionDisabledSkills.has(selected.name);
        if (isDisabled) {
          ctx.setSessionDisabledSkills((prev) => { const next = new Set(prev); next.delete(selected.name); return next; });
          if (ctx.agent) ctx.agent.enableSkill(selected.name);
          ctx.addMsg("info", `✅ Enabled: ${selected.name}`);
        } else {
          ctx.setSessionDisabledSkills((prev) => { const next = new Set(prev); next.add(selected.name); return next; });
          if (ctx.agent) ctx.agent.disableSkill(selected.name);
          ctx.addMsg("info", `✅ Disabled: ${selected.name} (session only)`);
        }
      }
      ctx.setSkillsPicker(null);
      return true;
    }
    return true;
  }

  if (ctx.skillsPicker === "remove") {
    const installed = listInstalledSkills();
    if (installed.length === 0) {
      ctx.setSkillsPicker(null);
      return true;
    }
    if (key.upArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev - 1 + installed.length) % installed.length);
      return true;
    }
    if (key.downArrow) {
      ctx.setSkillsPickerIndex((prev) => (prev + 1) % installed.length);
      return true;
    }
    if (key.escape) {
      ctx.setSkillsPicker("menu");
      ctx.setSkillsPickerIndex(() => 0);
      return true;
    }
    if (key.return) {
      const selected = installed[ctx.skillsPickerIndex];
      if (selected) {
        const result = removeSkill(selected.name);
        ctx.addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
      }
      ctx.setSkillsPicker(null);
      return true;
    }
    return true;
  }

  return true; // absorb all keys when skills picker is active
}

function queueCommand(ctx: InputRouterContext, command: string): void {
  ctx.setInput(command);
  ctx.setInputKey((k) => k + 1);
  setTimeout(() => {
    ctx.setInput("");
    ctx.handleSubmit(command);
  }, 50);
}

function handleAgentPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.agentPicker) return false;
  const commands = ["list", "pause", "delete"];
  if (key.upArrow) {
    ctx.setAgentPickerIndex((prev) => (prev - 1 + commands.length) % commands.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setAgentPickerIndex((prev) => (prev + 1) % commands.length);
    return true;
  }
  if (key.escape) {
    ctx.setAgentPicker(false);
    ctx.setAgentPickerIndex(() => 0);
    return true;
  }
  if (key.return) {
    const selected = commands[ctx.agentPickerIndex];
    ctx.setAgentPicker(false);
    ctx.setAgentPickerIndex(() => 0);
    if (selected === "list") {
      queueCommand(ctx, "/agent list");
    } else {
      ctx.setInput(`/agent ${selected} `);
      ctx.setInputKey((k) => k + 1);
    }
    return true;
  }
  return true;
}

function handleSchedulePicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.schedulePicker) return false;
  const commands = ["list", "disable", "delete", "history"];
  if (key.upArrow) {
    ctx.setSchedulePickerIndex((prev) => (prev - 1 + commands.length) % commands.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setSchedulePickerIndex((prev) => (prev + 1) % commands.length);
    return true;
  }
  if (key.escape) {
    ctx.setSchedulePicker(false);
    ctx.setSchedulePickerIndex(() => 0);
    return true;
  }
  if (key.return) {
    const selected = commands[ctx.schedulePickerIndex];
    ctx.setSchedulePicker(false);
    ctx.setSchedulePickerIndex(() => 0);
    if (selected === "list") {
      queueCommand(ctx, "/schedule list");
    } else {
      ctx.setInput(`/schedule ${selected} `);
      ctx.setInputKey((k) => k + 1);
    }
    return true;
  }
  return true;
}

function handleOrchestratePicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.orchestratePicker) return false;
  const commands = ["fullstack", "review", "custom"];
  if (key.upArrow) {
    ctx.setOrchestratePickerIndex((prev) => (prev - 1 + commands.length) % commands.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setOrchestratePickerIndex((prev) => (prev + 1) % commands.length);
    return true;
  }
  if (key.escape) {
    ctx.setOrchestratePicker(false);
    ctx.setOrchestratePickerIndex(() => 0);
    return true;
  }
  if (key.return) {
    const selected = commands[ctx.orchestratePickerIndex];
    ctx.setOrchestratePicker(false);
    ctx.setOrchestratePickerIndex(() => 0);
    if (selected === "review") {
      queueCommand(ctx, "/orchestrate review");
    } else if (selected === "custom") {
      ctx.setInput("/orchestrate ");
      ctx.setInputKey((k) => k + 1);
    } else {
      ctx.setInput(`/orchestrate ${selected} `);
      ctx.setInputKey((k) => k + 1);
    }
    return true;
  }
  return true;
}

function handleProviderPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.providerPicker || ctx.selectedProvider) return false;
  const len = ctx.providerPicker.length;
  if (key.upArrow) {
    ctx.setProviderPickerIndex((prev) => (prev - 1 + len) % len);
    return true;
  }
  if (key.downArrow) {
    ctx.setProviderPickerIndex((prev) => (prev + 1) % len);
    return true;
  }
  if (key.escape) {
    ctx.setProviderPicker(null);
    if (!ctx.agent) {
      ctx.addMsg("info", "Model selection cancelled. Use /login for cloud providers or choose local setup from the startup menu.");
    }
    return true;
  }
  if (key.return) {
    const selected = ctx.providerPicker[ctx.providerPickerIndex];
    ctx.setSelectedProvider(selected.name);
    ctx.setModelPickerIndex(() => 0);
    return true;
  }
  return true;
}

function handleModelPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.selectedProvider || !ctx.modelPickerGroups) return false;
  const models = ctx.modelPickerGroups[ctx.selectedProvider];
  if (!models) return false;
  const len = models.length;
  if (key.upArrow) {
    ctx.setModelPickerIndex((prev) => (prev - 1 + len) % len);
    return true;
  }
  if (key.downArrow) {
    ctx.setModelPickerIndex((prev) => (prev + 1) % len);
    return true;
  }
  if (key.escape) {
    ctx.setSelectedProvider(null);
    ctx.setModelPickerIndex(() => 0);
    return true;
  }
  if (key.return) {
    const selected = models[ctx.modelPickerIndex];
    if (selected && ctx.agent) {
      ctx.agent.switchModel(selected.name, selected.baseUrl, selected.apiKey, selected.providerType);
      ctx.setModelName(selected.name);
      ctx.addMsg("info", `✅ Switched to: ${selected.name}`);
      ctx.refreshConnectionBanner();
    } else if (selected && !ctx.agent) {
      // First-time: save model selection to config, then reconnect
      ctx.addMsg("info", `Initializing with ${selected.name}...`);
      
      // Save selected model to config so connectToProvider picks it up
      import("../config.js").then(({ loadConfig, saveConfig }) => {
        const config = loadConfig();
        config.provider = {
          baseUrl: selected.baseUrl,
          apiKey: selected.apiKey,
          model: selected.name,
          type: selected.providerType === "anthropic" ? "anthropic" : "openai",
        };
        saveConfig(config);
        // Now reconnect with the saved config
        ctx.connectToProvider?.(false);
      }).catch((err: any) => {
        ctx.addMsg("error", `Failed to initialize: ${err.message}`);
      });
    }
    ctx.setModelPickerGroups(null);
    ctx.setProviderPicker(null);
    ctx.setSelectedProvider(null);
    ctx.setModelPickerIndex(() => 0);
    ctx.setProviderPickerIndex(() => 0);
    return true;
  }
  return true;
}

function handleOllamaDeletePicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.ollamaDeletePicker) return false;
  if (key.upArrow) {
    ctx.setOllamaDeletePickerIndex((prev) => (prev - 1 + ctx.ollamaDeletePicker!.models.length) % ctx.ollamaDeletePicker!.models.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setOllamaDeletePickerIndex((prev) => (prev + 1) % ctx.ollamaDeletePicker!.models.length);
    return true;
  }
  if (key.escape) {
    ctx.setOllamaDeletePicker(null);
    return true;
  }
  if (key.return) {
    const selected = ctx.ollamaDeletePicker.models[ctx.ollamaDeletePickerIndex];
    if (selected) {
      ctx.setOllamaDeletePicker(null);
      ctx.setOllamaDeleteConfirm({ model: selected.name, size: selected.size });
    }
    return true;
  }
  return true;
}

function handleOllamaPullPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.ollamaPullPicker) return false;
  const pullModels = [
    { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9 GB", desc: "Recommended default for coding if your machine can handle it" },
    { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2 16B", size: "9 GB", desc: "Strong higher-quality alternative" },
    { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "5 GB", desc: "Fallback for mid-range machines" },
    { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "20 GB", desc: "Premium quality, needs lots of RAM" },
    { id: "codellama:7b", name: "CodeLlama 7B", size: "4 GB", desc: "Older fallback coding model" },
    { id: "starcoder2:7b", name: "StarCoder2 7B", size: "4 GB", desc: "Completion-focused fallback" },
    { id: "qwen2.5-coder:3b", name: "Qwen 2.5 Coder 3B", size: "2 GB", desc: "⚠️ Last resort — may struggle with tool calls" },
  ];
  if (key.upArrow) {
    ctx.setOllamaPullPickerIndex((prev) => (prev - 1 + pullModels.length) % pullModels.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setOllamaPullPickerIndex((prev) => (prev + 1) % pullModels.length);
    return true;
  }
  if (key.escape) {
    ctx.setOllamaPullPicker(false);
    return true;
  }
  if (key.return) {
    const selected = pullModels[ctx.ollamaPullPickerIndex];
    if (selected) {
      ctx.setOllamaPullPicker(false);
      ctx.setInput(`/ollama pull ${selected.id}`);
      ctx.setInputKey((k) => k + 1);
      setTimeout(() => {
        const submitInput = `/ollama pull ${selected.id}`;
        ctx.setInput("");
        ctx.handleSubmit(submitInput);
      }, 50);
    }
    return true;
  }
  return true;
}

function handleOllamaDeleteConfirm(inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.ollamaDeleteConfirm) return false;
  if (inputChar === "y" || inputChar === "Y") {
    const model = ctx.ollamaDeleteConfirm.model;
    ctx.setOllamaDeleteConfirm(null);
    const result = deleteModel(model);
    ctx.addMsg(result.ok ? "info" : "error", result.ok ? `\u2705 ${result.message}` : `\u274C ${result.message}`);
    return true;
  }
  if (inputChar === "n" || inputChar === "N" || key.escape) {
    ctx.setOllamaDeleteConfirm(null);
    ctx.addMsg("info", "Delete cancelled.");
    return true;
  }
  return true;
}

function handleOllamaExitPrompt(inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.ollamaExitPrompt) return false;
  if (inputChar === "y" || inputChar === "Y") {
    ctx.setOllamaExitPrompt(false);
    stopOllama().then(() => ctx.exit());
    return true;
  }
  if (inputChar === "n" || inputChar === "N") {
    ctx.setOllamaExitPrompt(false);
    ctx.exit();
    return true;
  }
  if (inputChar === "a" || inputChar === "A") {
    ctx.setOllamaExitPrompt(false);
    saveConfig({ defaults: { ...loadConfig().defaults, stopOllamaOnExit: true } });
    ctx.addMsg("info", "Saved preference: always stop Ollama on exit.");
    stopOllama().then(() => ctx.exit());
    return true;
  }
  if (key.escape) {
    ctx.setOllamaExitPrompt(false);
    return true;
  }
  return true;
}

function handleThemePicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.themePicker) return false;
  const themeKeys = listThemes();
  if (key.upArrow) {
    ctx.setThemePickerIndex((prev) => (prev - 1 + themeKeys.length) % themeKeys.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setThemePickerIndex((prev) => (prev + 1) % themeKeys.length);
    return true;
  }
  if (key.return) {
    const selected = themeKeys[ctx.themePickerIndex];
    ctx.setTheme(getTheme(selected));
    ctx.setThemePicker(false);
    ctx.addMsg("info", `✅ Switched to theme: ${THEMES[selected].name}`);
    return true;
  }
  if (key.escape) {
    ctx.setThemePicker(false);
    return true;
  }
  return true;
}

function handleSessionPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.sessionPicker) return false;
  if (key.upArrow) {
    ctx.setSessionPickerIndex((prev) => (prev - 1 + ctx.sessionPicker!.length) % ctx.sessionPicker!.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setSessionPickerIndex((prev) => (prev + 1) % ctx.sessionPicker!.length);
    return true;
  }
  if (key.return) {
    const selected = ctx.sessionPicker[ctx.sessionPickerIndex];
    if (selected && ctx.agent) {
      const session = getSession(selected.id);
      if (session) {
        ctx.agent.resume(selected.id).then(() => {
          const dir = session.cwd.split("/").pop() || session.cwd;
          const msgs = loadMessages(selected.id);
          const lastUserMsg = [...msgs].reverse().find(m => m.role === "user");
          const lastText = lastUserMsg && typeof lastUserMsg.content === "string"
            ? lastUserMsg.content.slice(0, 80) + (lastUserMsg.content.length > 80 ? "..." : "")
            : null;
          let info = `✅ Resumed session ${selected.id} (${dir}/, ${session.message_count} messages)`;
          if (lastText) info += `\n  Last: "${lastText}"`;
          ctx.addMsg("info", info);
        }).catch((e: any) => {
          ctx.addMsg("error", `Failed to resume: ${e.message}`);
        });
      }
    }
    ctx.setSessionPicker(null);
    ctx.setSessionPickerIndex(() => 0);
    return true;
  }
  if (key.escape) {
    ctx.setSessionPicker(null);
    ctx.setSessionPickerIndex(() => 0);
    ctx.addMsg("info", "Resume cancelled.");
    return true;
  }
  return true; // Ignore other keys during session picker
}

function handleDeleteSessionConfirm(inputChar: string, _key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.deleteSessionConfirm) return false;
  if (inputChar === "y" || inputChar === "Y") {
    const deleted = deleteSession(ctx.deleteSessionConfirm.id);
    if (deleted) {
      ctx.addMsg("info", `✅ Deleted session ${ctx.deleteSessionConfirm.id}`);
    } else {
      ctx.addMsg("error", `Failed to delete session ${ctx.deleteSessionConfirm.id}`);
    }
    ctx.setDeleteSessionConfirm(null);
    return true;
  }
  if (inputChar === "n" || inputChar === "N" || _key.escape) {
    ctx.addMsg("info", "Delete cancelled.");
    ctx.setDeleteSessionConfirm(null);
    return true;
  }
  return true;
}

function handleDeleteSessionPicker(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.deleteSessionPicker) return false;
  if (key.upArrow) {
    ctx.setDeleteSessionPickerIndex((prev) => (prev - 1 + ctx.deleteSessionPicker!.length) % ctx.deleteSessionPicker!.length);
    return true;
  }
  if (key.downArrow) {
    ctx.setDeleteSessionPickerIndex((prev) => (prev + 1) % ctx.deleteSessionPicker!.length);
    return true;
  }
  if (key.return) {
    const selected = ctx.deleteSessionPicker[ctx.deleteSessionPickerIndex];
    if (selected) {
      ctx.setDeleteSessionPicker(null);
      ctx.setDeleteSessionPickerIndex(() => 0);
      ctx.setDeleteSessionConfirm(selected);
    }
    return true;
  }
  if (key.escape) {
    ctx.setDeleteSessionPicker(null);
    ctx.setDeleteSessionPickerIndex(() => 0);
    ctx.addMsg("info", "Delete cancelled.");
    return true;
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatPastedTextRef(id: number, lines: number): string {
  return lines <= 1 ? `[Pasted text #${id}]` : `[Pasted text #${id} +${lines - 1} lines]`;
}

function removeTrailingPasteRef(input: string, removed: { id: number; lines: number; content: string }): string {
  const ref = formatPastedTextRef(removed.id, removed.lines);
  const pattern = new RegExp(`(?:\\s*${escapeRegExp(ref)})\\s*$`);
  if (pattern.test(input)) {
    return input.replace(pattern, "").trimEnd();
  }
  return input;
}

function handleBackspaceRemovesPasteChunk(_inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if ((key.backspace || key.delete) && ctx.input === "" && ctx.pastedChunksRef.current.length > 0) {
    const removed = ctx.pastedChunksRef.current[ctx.pastedChunksRef.current.length - 1];
    if (removed) {
      ctx.setInput(removeTrailingPasteRef(ctx.input, removed));
    }
    ctx.setPastedChunks((prev) => prev.slice(0, -1));
    return true;
  }

  if (key.escape && ctx.input === "" && ctx.pastedChunksRef.current.length > 0) {
    const removed = ctx.pastedChunksRef.current[ctx.pastedChunksRef.current.length - 1];
    if (removed) {
      ctx.setInput(removeTrailingPasteRef(ctx.input, removed));
    }
    ctx.setPastedChunks((prev) => prev.slice(0, -1));
    ctx.addMsg("info", "Removed latest pasted block.");
    return true;
  }

  return false;
}

function handleApprovalPrompts(inputChar: string, _key: Key, ctx: InputRouterContext): boolean {
  if (!ctx.approval) return false;
  if (inputChar === "y" || inputChar === "Y") {
    const r = ctx.approval.resolve;
    ctx.setApproval(null);
    ctx.setLoading(true);
    ctx.setSpinnerMsg("Executing...");
    r("yes");
    return true;
  }
  if (inputChar === "n" || inputChar === "N") {
    const r = ctx.approval.resolve;
    ctx.setApproval(null);
    ctx.addMsg("info", "✗ Denied");
    r("no");
    return true;
  }
  if (inputChar === "a" || inputChar === "A") {
    const r = ctx.approval.resolve;
    ctx.setApproval(null);
    ctx.setLoading(true);
    ctx.setSpinnerMsg("Executing...");
    ctx.addMsg("info", `✔ Always allow ${ctx.approval.tool} for this session`);
    r("always");
    return true;
  }
  return true; // Ignore other keys during approval
}

function handleCtrlCExit(inputChar: string, key: Key, ctx: InputRouterContext): boolean {
  if (key.ctrl && inputChar === "c") {
    if (ctx.ctrlCPressed) {
      const config = loadConfig();
      if (config.defaults.stopOllamaOnExit) {
        stopOllama().finally(() => ctx.exit());
      } else {
        ctx.exit();
      }
    } else {
      ctx.setCtrlCPressed(true);
      ctx.addMsg("info", "Press Ctrl+C again to exit.");
      setTimeout(() => ctx.setCtrlCPressed(false), 3000);
    }
    return true;
  }
  return false;
}
