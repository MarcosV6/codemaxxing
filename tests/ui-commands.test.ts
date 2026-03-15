import { describe, expect, it, vi } from "vitest";
import { tryHandleUiCommand } from "../src/commands/ui.js";
import { DEFAULT_THEME, getTheme } from "../src/themes.js";

function makeAddMsg() {
  const calls: Array<{ type: string; text: string }> = [];
  return {
    addMsg: (type: any, text: string) => calls.push({ type, text }),
    calls,
  };
}

describe("tryHandleUiCommand", () => {
  it("opens the theme picker for bare /theme", async () => {
    const { addMsg, calls } = makeAddMsg();
    let pickerOpen = false;
    let pickerIndex = -1;

    const handled = await tryHandleUiCommand({
      trimmed: "/theme",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      theme: getTheme(DEFAULT_THEME),
      setTheme: vi.fn(),
      setThemePicker: (value) => { pickerOpen = typeof value === "function" ? value(pickerOpen) : value; },
      setThemePickerIndex: (value) => { pickerIndex = typeof value === "function" ? value(pickerIndex) : value; },
    });

    expect(handled).toBe(true);
    expect(pickerOpen).toBe(true);
    expect(calls.length).toBe(0);
    expect(pickerIndex).toBeGreaterThanOrEqual(0);
  });

  it("enables architect mode with the current model when toggled on", async () => {
    const { addMsg, calls } = makeAddMsg();
    const agent = {
      getArchitectModel: () => null,
      getModel: () => "gpt-4o",
      setArchitectModel: vi.fn(),
      isAutoLintEnabled: () => true,
      setAutoLint: vi.fn(),
    } as any;

    const handled = await tryHandleUiCommand({
      trimmed: "/architect",
      cwd: process.cwd(),
      addMsg,
      agent,
      theme: getTheme(DEFAULT_THEME),
      setTheme: vi.fn(),
      setThemePicker: vi.fn(),
      setThemePickerIndex: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(agent.setArchitectModel).toHaveBeenCalled();
    expect(calls.at(-1)?.text).toContain("Architect mode ON");
  });

  it("toggles auto-lint on", async () => {
    const { addMsg, calls } = makeAddMsg();
    const agent = {
      getArchitectModel: () => null,
      getModel: () => "gpt-4o",
      setArchitectModel: vi.fn(),
      isAutoLintEnabled: () => false,
      setAutoLint: vi.fn(),
    } as any;

    const handled = await tryHandleUiCommand({
      trimmed: "/lint on",
      cwd: process.cwd(),
      addMsg,
      agent,
      theme: getTheme(DEFAULT_THEME),
      setTheme: vi.fn(),
      setThemePicker: vi.fn(),
      setThemePickerIndex: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(agent.setAutoLint).toHaveBeenCalledWith(true);
    expect(calls.at(-1)?.text).toContain("Auto-lint ON");
  });
});
