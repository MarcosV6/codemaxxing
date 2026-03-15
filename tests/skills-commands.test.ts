import { describe, expect, it, vi } from "vitest";
import { tryHandleSkillsCommand } from "../src/commands/skills.js";

function makeAddMsg() {
  const calls: Array<{ type: string; text: string }> = [];
  return {
    addMsg: (type: any, text: string) => calls.push({ type, text }),
    calls,
  };
}

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
});
