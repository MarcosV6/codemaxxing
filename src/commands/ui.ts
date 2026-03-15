import { type Dispatch, type SetStateAction } from "react";
import type { CodingAgent } from "../agent.js";
import { loadConfig } from "../config.js";
import { THEMES, getTheme, listThemes, type Theme } from "../themes.js";
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
    addMsg("info", `✅ Switched to theme: ${THEMES[themeName].name}`);
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

  return false;
}
