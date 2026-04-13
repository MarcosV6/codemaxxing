import { afterEach, describe, expect, it, vi } from "vitest";
import { tryHandleSkillsCommand } from "../src/commands/skills.js";
import * as configModule from "../src/config.js";
import * as skillLearnerModule from "../src/utils/skill-learner.js";

function makeAddMsg() {
  const calls: Array<{ type: string; text: string }> = [];
  return {
    addMsg: (type: any, text: string) => calls.push({ type, text }),
    calls,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tryHandleSkillsCommand", () => {
  it("opens the skills menu for bare /skills", () => {
    const { addMsg, calls } = makeAddMsg();
    let picker: string | null = null;
    let pickerIndex = -1;

    const handled = tryHandleSkillsCommand({
      trimmed: "/skills",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      sessionDisabledSkills: new Set(),
      setSkillsPicker: (value) => { picker = typeof value === "function" ? value(picker) : value; },
      setSkillsPickerIndex: (value) => { pickerIndex = typeof value === "function" ? value(pickerIndex) : value; },
      setSessionDisabledSkills: vi.fn(),
      setInput: vi.fn(),
      setInputKey: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(picker).toBe("menu");
    expect(pickerIndex).toBe(0);
    expect(calls.length).toBe(0);
  });

  it("shows usage for bare /skills on", () => {
    const { addMsg, calls } = makeAddMsg();

    const handled = tryHandleSkillsCommand({
      trimmed: "/skills on",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      sessionDisabledSkills: new Set(),
      setSkillsPicker: vi.fn(),
      setSkillsPickerIndex: vi.fn(),
      setSessionDisabledSkills: vi.fn(),
      setInput: vi.fn(),
      setInputKey: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(calls.at(-1)?.text).toContain("Usage: /skills on <name>");
  });

  it("prompts create mode when using /skills create without a name", () => {
    const { addMsg, calls } = makeAddMsg();
    let input = "";
    let inputKey = 0;

    const handled = tryHandleSkillsCommand({
      trimmed: "/skills create",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      sessionDisabledSkills: new Set(),
      setSkillsPicker: vi.fn(),
      setSkillsPickerIndex: vi.fn(),
      setSessionDisabledSkills: vi.fn(),
      setInput: (value) => { input = typeof value === "function" ? value(input) : value; },
      setInputKey: (value) => { inputKey = typeof value === "function" ? value(inputKey) : value; },
    });

    expect(handled).toBe(true);
    expect(input).toBe("/skills create ");
    expect(inputKey).toBe(1);
    expect(calls.length).toBe(0);
  });

  it("shows learned-skill status and saved workflows", () => {
    vi.spyOn(configModule, "loadConfig").mockReturnValue({
      provider: { baseUrl: "http://localhost:1234/v1", apiKey: "not-needed", model: "auto" },
      defaults: { autoApprove: false, contextFiles: 20, maxTokens: 8192, autoLearnSkills: false },
    } as any);
    vi.spyOn(skillLearnerModule, "listLearnedSkills").mockReturnValue([
      {
        name: "node-edit-build-app",
        description: "Repeatable node workflow that updated 2 files and ran 1 command.",
        trigger: "Use for node tasks involving editing project files and building the project.",
        steps: [],
        tools_used: ["write_file", "run_command"],
        created_at: "2026-01-01T00:00:00.000Z",
        times_applied: 0,
      },
    ]);

    const { addMsg, calls } = makeAddMsg();
    const handled = tryHandleSkillsCommand({
      trimmed: "/skills learned",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      sessionDisabledSkills: new Set(),
      setSkillsPicker: vi.fn(),
      setSkillsPickerIndex: vi.fn(),
      setSessionDisabledSkills: vi.fn(),
      setInput: vi.fn(),
      setInputKey: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(calls.at(-1)?.text).toContain("Learned skills: OFF");
    expect(calls.at(-1)?.text).toContain("node-edit-build-app");
  });

  it("toggles learned-skill capture on", () => {
    const saveConfig = vi.spyOn(configModule, "saveConfig").mockImplementation(() => {});
    const { addMsg, calls } = makeAddMsg();

    const handled = tryHandleSkillsCommand({
      trimmed: "/skills learned on",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      sessionDisabledSkills: new Set(),
      setSkillsPicker: vi.fn(),
      setSkillsPickerIndex: vi.fn(),
      setSessionDisabledSkills: vi.fn(),
      setInput: vi.fn(),
      setInputKey: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(saveConfig).toHaveBeenCalledWith({ defaults: { autoLearnSkills: true } });
    expect(calls.at(-1)?.text).toContain("Learned skills ON");
  });
});
