import { type Dispatch, type SetStateAction } from "react";
import type { CodingAgent } from "../agent.js";
import {
  detectProviderType,
  getActiveProviderProfileKey,
  listProviderProfiles,
  loadConfig,
  saveConfig,
  saveThemePreference,
} from "../config.js";
import { THEMES, getTheme, listThemes, type Theme } from "../themes.js";
import { formatModelReliabilityLine } from "../utils/provider-health.js";
import type { AddMsg } from "./types.js";

interface HandleUiCommandOptions {
  trimmed: string;
  cwd: string;
  addMsg: AddMsg;
  agent: CodingAgent | null;
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  setThemePicker: Dispatch<SetStateAction<boolean>>;
  setThemePickerIndex: Dispatch<SetStateAction<number>>;
  connectToProvider?: (isRetry?: boolean) => Promise<void>;
}

export async function tryHandleUiCommand(options: HandleUiCommandOptions): Promise<boolean> {
  const {
    trimmed,
    cwd,
    addMsg,
    agent,
    theme,
    setTheme,
    setThemePicker,
    setThemePickerIndex,
    connectToProvider,
  } = options;

  if (trimmed.startsWith("/theme")) {
    const themeName = trimmed.replace("/theme", "").trim();
    if (!themeName) {
      const themeKeys = listThemes();
      const currentIdx = themeKeys.indexOf(theme.name.toLowerCase());
      setThemePicker(true);
      setThemePickerIndex(currentIdx >= 0 ? currentIdx : 0);
      return true;
    }
    if (!THEMES[themeName]) {
      addMsg("error", `Theme "${themeName}" not found. Use /theme to see available themes.`);
      return true;
    }
    setTheme(getTheme(themeName));
    saveThemePreference(themeName);
    addMsg("info", `✅ Switched to theme: ${THEMES[themeName].name} (saved as default)`);
    return true;
  }

  if (trimmed === "/provider" || trimmed === "/provider list" || trimmed === "/provider current") {
    const config = loadConfig();
    const profiles = listProviderProfiles(config);
    const activeKey = getActiveProviderProfileKey(config);
    const currentModel = agent?.getModel() || config.provider.model;
    const currentBaseUrl = agent?.getBaseUrl?.() || config.provider.baseUrl;
    const currentType = agent?.getProviderType?.() || config.provider.type || detectProviderType(activeKey || "custom", currentBaseUrl);

    const lines: string[] = [
      "🔌 Provider Profiles",
      `  Current: ${currentModel} @ ${currentBaseUrl} (${currentType})`,
      `  ${formatModelReliabilityLine(currentModel, currentBaseUrl)}`,
    ];

    if (profiles.length === 0) {
      lines.push("  Saved profiles: none");
      lines.push("  Save current settings: /provider save <name>");
    } else {
      lines.push("  Saved profiles:");
      for (const entry of profiles) {
        lines.push(`  ${entry.active ? "●" : "○"} ${entry.key} — ${entry.profile.model} @ ${entry.profile.baseUrl}`);
      }
      lines.push("  Use one: /provider use <name>");
      lines.push("  Save current settings: /provider save <name>");
      lines.push("  Remove one: /provider remove <name>");
    }

    addMsg("info", lines.join("\n"));
    return true;
  }

  if (trimmed.startsWith("/provider use ")) {
    const key = trimmed.replace("/provider use ", "").trim();
    const config = loadConfig();
    const profile = config.providers?.[key];

    if (!key) {
      addMsg("info", "Usage: /provider use <name>");
      return true;
    }
    if (!profile) {
      addMsg("error", `Provider profile "${key}" not found.`);
      return true;
    }

    saveConfig({
      provider: {
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        type: profile.type || detectProviderType(key, profile.baseUrl),
      },
    });
    addMsg("info", `✅ Switched active provider to ${key} (${profile.model})`);
    if (connectToProvider) {
      addMsg("info", "🔄 Reconnecting with saved provider profile...");
      await connectToProvider(true);
    }
    return true;
  }

  if (trimmed.startsWith("/provider save ")) {
    const key = trimmed.replace("/provider save ", "").trim();
    if (!key) {
      addMsg("info", "Usage: /provider save <name>");
      return true;
    }

    const config = loadConfig();
    const currentBaseUrl = agent?.getBaseUrl?.() || config.provider.baseUrl;
    const currentModel = agent?.getModel() || config.provider.model;
    const currentType = agent?.getProviderType?.() || config.provider.type || detectProviderType(key, currentBaseUrl);
    const currentApiKey = config.provider.apiKey;

    saveConfig({
      providers: {
        ...(config.providers ?? {}),
        [key]: {
          name: key,
          baseUrl: currentBaseUrl,
          apiKey: currentApiKey,
          model: currentModel,
          type: currentType,
        },
      },
    });
    addMsg("info", `✅ Saved provider profile "${key}" (${currentModel} @ ${currentBaseUrl})`);
    return true;
  }

  if (trimmed.startsWith("/provider remove ")) {
    const key = trimmed.replace("/provider remove ", "").trim();
    if (!key) {
      addMsg("info", "Usage: /provider remove <name>");
      return true;
    }

    const config = loadConfig();
    if (!config.providers?.[key]) {
      addMsg("error", `Provider profile "${key}" not found.`);
      return true;
    }

    const nextProviders = { ...(config.providers ?? {}) };
    delete nextProviders[key];
    saveConfig({ providers: nextProviders });
    addMsg("info", `✅ Removed provider profile "${key}"`);
    return true;
  }

  if (trimmed === "/architect") {
    if (!agent) {
      addMsg("info", "🏗️ Architect mode: no agent connected. Connect first with /login or /connect.");
      return true;
    }
    const current = agent.getArchitectModel();
    if (current) {
      agent.setArchitectModel(null);
      addMsg("info", "🏗️ Architect mode OFF");
    } else {
      const defaultModel = loadConfig().defaults.architectModel || agent.getModel();
      agent.setArchitectModel(defaultModel);
      addMsg("info", `🏗️ Architect mode ON (planner: ${defaultModel})`);
    }
    return true;
  }

  if (trimmed.startsWith("/architect ")) {
    const model = trimmed.replace("/architect ", "").trim();
    if (!model) {
      addMsg("info", "Usage: /architect <model> or /architect to toggle");
      return true;
    }
    if (agent) {
      agent.setArchitectModel(model);
      addMsg("info", `🏗️ Architect mode ON (planner: ${model})`);
    } else {
      addMsg("info", "⚠ No agent connected. Connect first.");
    }
    return true;
  }

  if (trimmed === "/lint") {
    const { detectLinter } = await import("../utils/lint.js");
    const linter = detectLinter(cwd);
    const enabled = agent ? agent.isAutoLintEnabled() : true;
    if (linter) {
      addMsg("info", `🔍 Auto-lint: ${enabled ? "ON" : "OFF"}\n  Detected: ${linter.name}\n  Command: ${linter.command} <file>`);
    } else {
      addMsg("info", `🔍 Auto-lint: ${enabled ? "ON" : "OFF"}\n  No linter detected in this project.`);
    }
    return true;
  }

  if (trimmed === "/lint on") {
    if (agent) agent.setAutoLint(true);
    addMsg("info", "🔍 Auto-lint ON");
    return true;
  }

  if (trimmed === "/lint off") {
    if (agent) agent.setAutoLint(false);
    addMsg("info", "🔍 Auto-lint OFF");
    return true;
  }

  if (trimmed === "/test") {
    if (!agent) { addMsg("error", "Not connected."); return true; }
    const runner = agent.getDetectedTestRunner();
    const enabled = agent.isAutoTestEnabled();
    if (runner) {
      addMsg("info", `🧪 Running tests with ${runner.name}...`);
      const result = agent.runProjectTests();
      if (result) {
        addMsg(result.passed ? "info" : "error", `🧪 ${result.passed ? "PASSED" : "FAILED"}\n${result.output}`);
      }
    } else {
      addMsg("info", `🧪 Auto-test: ${enabled ? "ON" : "OFF"}\n  No test runner detected in this project.`);
    }
    return true;
  }

  if (trimmed === "/test on") {
    if (agent) agent.setAutoTest(true);
    addMsg("info", "🧪 Auto-test ON — tests will run after file changes");
    return true;
  }

  if (trimmed === "/test off") {
    if (agent) agent.setAutoTest(false);
    addMsg("info", "🧪 Auto-test OFF");
    return true;
  }

  return false;
}
