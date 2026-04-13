import { type Dispatch, type SetStateAction } from "react";
import type { CodingAgent } from "../agent.js";
import {
  listInstalledSkills,
  installSkill,
  removeSkill,
  searchRegistry,
  createSkillScaffold,
  getActiveSkills,
} from "../utils/skills.js";
import {
  deleteLearnedSkill,
  listLearnedSkills,
} from "../utils/skill-learner.js";
import {
  isAutoLearnSkillsEnabled,
  loadConfig,
  saveConfig,
} from "../config.js";
import type { AddMsg } from "./types.js";

type SkillsPickerMode = "menu" | "browse" | "installed" | "remove" | null;

interface HandleSkillsCommandOptions {
  trimmed: string;
  cwd: string;
  addMsg: AddMsg;
  agent: CodingAgent | null;
  sessionDisabledSkills: Set<string>;
  setSkillsPicker: Dispatch<SetStateAction<SkillsPickerMode>>;
  setSkillsPickerIndex: Dispatch<SetStateAction<number>>;
  setSessionDisabledSkills: Dispatch<SetStateAction<Set<string>>>;
  setInput: Dispatch<SetStateAction<string>>;
  setInputKey: Dispatch<SetStateAction<number>>;
}

export function tryHandleSkillsCommand(options: HandleSkillsCommandOptions): boolean {
  const {
    trimmed,
    cwd,
    addMsg,
    agent,
    sessionDisabledSkills,
    setSkillsPicker,
    setSkillsPickerIndex,
    setSessionDisabledSkills,
    setInput,
    setInputKey,
  } = options;

  if (trimmed === "/skills") {
    setSkillsPicker("menu");
    setSkillsPickerIndex(0);
    return true;
  }

  if (trimmed === "/skills learned") {
    const config = loadConfig();
    const enabled = isAutoLearnSkillsEnabled(config);
    const skills = listLearnedSkills();

    if (skills.length === 0) {
      addMsg(
        "info",
        `🧠 Learned skills: ${enabled ? "ON" : "OFF"}\n` +
        `  No learned workflows saved.\n` +
        `  Toggle: /skills learned on | /skills learned off`,
      );
      return true;
    }

    const lines = skills.map((skill) =>
      `  • ${skill.name} (used ${skill.times_applied}x)\n` +
      `    ${skill.description}\n` +
      `    Trigger: ${skill.trigger}\n` +
      `    Tools: ${skill.tools_used.join(", ")}`
    );
    addMsg(
      "info",
      `🧠 Learned skills: ${enabled ? "ON" : "OFF"}\n` +
      `  Prompt injection updates apply on the next reconnect/new session.\n` +
      `${lines.join("\n")}`,
    );
    return true;
  }

  if (trimmed === "/skills learned on" || trimmed === "/skills learned off") {
    const enabled = trimmed.endsWith(" on");
    saveConfig({ defaults: { autoLearnSkills: enabled } });
    addMsg(
      "info",
      enabled
        ? "🧠 Learned skills ON. Future qualifying workflows can be saved. Prompt injection updates apply on the next reconnect/new session."
        : "🧠 Learned skills OFF. Future workflows will not be auto-saved or injected. Prompt injection updates apply on the next reconnect/new session.",
    );
    return true;
  }

  if (trimmed === "/skills learned clear") {
    const skills = listLearnedSkills();
    if (skills.length === 0) {
      addMsg("info", "🧠 No learned skills to clear.");
      return true;
    }
    let removed = 0;
    for (const skill of skills) {
      if (deleteLearnedSkill(skill.name)) removed++;
    }
    addMsg("info", `🧠 Removed ${removed} learned skill${removed === 1 ? "" : "s"}.`);
    return true;
  }

  if (trimmed.startsWith("/skills learned delete ")) {
    const name = trimmed.replace("/skills learned delete ", "").trim();
    if (!name) {
      addMsg("info", "Usage: /skills learned delete <name>");
      return true;
    }
    const removed = deleteLearnedSkill(name);
    addMsg(removed ? "info" : "error", removed ? `🧠 Removed learned skill: ${name}` : `Learned skill "${name}" not found.`);
    return true;
  }

  if (trimmed.startsWith("/skills install ")) {
    const name = trimmed.replace("/skills install ", "").trim();
    const result = installSkill(name);
    addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
    return true;
  }

  if (trimmed.startsWith("/skills remove ")) {
    const name = trimmed.replace("/skills remove ", "").trim();
    const result = removeSkill(name);
    addMsg(result.ok ? "info" : "error", result.ok ? `✅ ${result.message}` : `✗ ${result.message}`);
    return true;
  }

  if (trimmed === "/skills list") {
    const installed = listInstalledSkills();
    if (installed.length === 0) {
      addMsg("info", "No skills installed. Use /skills to browse & install.");
    } else {
      const active = getActiveSkills(cwd, sessionDisabledSkills);
      const lines = installed.map((skill) => {
        const isActive = active.includes(skill.name);
        const disabledBySession = sessionDisabledSkills.has(skill.name);
        const status = disabledBySession ? " (off)" : isActive ? " (on)" : "";
        return `  ${isActive ? "●" : "○"} ${skill.name} — ${skill.description}${status}`;
      });
      addMsg("info", `Installed skills:\n${lines.join("\n")}`);
    }
    return true;
  }

  if (trimmed === "/skills search") {
    addMsg("info", "Usage: /skills search <query>");
    return true;
  }

  if (trimmed.startsWith("/skills search ")) {
    const query = trimmed.replace("/skills search ", "").trim();
    if (!query) {
      addMsg("info", "Usage: /skills search <query>");
      return true;
    }
    const results = searchRegistry(query);
    if (results.length === 0) {
      addMsg("info", `No skills found matching "${query}".`);
    } else {
      const installed = listInstalledSkills().map((skill) => skill.name);
      const lines = results.map((skill) => {
        const mark = installed.includes(skill.name) ? " ✓" : "";
        return `  ${skill.name} — ${skill.description}${mark}`;
      });
      addMsg("info", `Registry matches:\n${lines.join("\n")}`);
    }
    return true;
  }

  if (trimmed.startsWith("/skills create ")) {
    const name = trimmed.replace("/skills create ", "").trim();
    if (!name) {
      addMsg("info", "Usage: /skills create <name>");
      return true;
    }
    const result = createSkillScaffold(name);
    addMsg(
      result.ok ? "info" : "error",
      result.ok ? `✅ ${result.message}\n  Edit: ${result.path}/prompt.md` : `✗ ${result.message}`,
    );
    return true;
  }

  if (trimmed === "/skills on") {
    addMsg("info", "Usage: /skills on <name>");
    return true;
  }

  if (trimmed.startsWith("/skills on ")) {
    const name = trimmed.replace("/skills on ", "").trim();
    const installed = listInstalledSkills().map((skill) => skill.name);
    if (!installed.includes(name)) {
      addMsg("error", `Skill "${name}" is not installed.`);
      return true;
    }
    setSessionDisabledSkills((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    if (agent) agent.enableSkill(name);
    addMsg("info", `✅ Enabled skill: ${name}`);
    return true;
  }

  if (trimmed === "/skills off") {
    addMsg("info", "Usage: /skills off <name>");
    return true;
  }

  if (trimmed.startsWith("/skills off ")) {
    const name = trimmed.replace("/skills off ", "").trim();
    const installed = listInstalledSkills().map((skill) => skill.name);
    if (!installed.includes(name)) {
      addMsg("error", `Skill "${name}" is not installed.`);
      return true;
    }
    setSessionDisabledSkills((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    if (agent) agent.disableSkill(name);
    addMsg("info", `✅ Disabled skill: ${name} (session only)`);
    return true;
  }

  if (trimmed.startsWith("/skills create")) {
    setSkillsPicker(null);
    setInput("/skills create ");
    setInputKey((key) => key + 1);
    return true;
  }

  return false;
}
