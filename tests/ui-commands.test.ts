import { afterEach, describe, expect, it, vi } from "vitest";
import { tryHandleUiCommand } from "../src/commands/ui.js";
import * as configModule from "../src/config.js";
import { DEFAULT_THEME, getTheme } from "../src/themes.js";

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

  it("lists saved provider profiles", async () => {
    vi.spyOn(configModule, "loadConfig").mockReturnValue({
      provider: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-5.4",
        type: "openai",
      },
      providers: {
        openai: {
          name: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          model: "gpt-5.4",
          type: "openai",
        },
      },
      defaults: {
        autoApprove: false,
        contextFiles: 20,
        maxTokens: 8192,
      },
    } as any);

    const { addMsg, calls } = makeAddMsg();
    const handled = await tryHandleUiCommand({
      trimmed: "/provider",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      theme: getTheme(DEFAULT_THEME),
      setTheme: vi.fn(),
      setThemePicker: vi.fn(),
      setThemePickerIndex: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(calls.at(-1)?.text).toContain("Provider Profiles");
    expect(calls.at(-1)?.text).toContain("openai");
  });

  it("switches provider profiles and reconnects", async () => {
    vi.spyOn(configModule, "loadConfig").mockReturnValue({
      provider: {
        baseUrl: "http://localhost:1234/v1",
        apiKey: "not-needed",
        model: "auto",
        type: "openai",
      },
      providers: {
        openai: {
          name: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          model: "gpt-5.4",
          type: "openai",
        },
      },
      defaults: {
        autoApprove: false,
        contextFiles: 20,
        maxTokens: 8192,
      },
    } as any);
    const saveConfig = vi.spyOn(configModule, "saveConfig").mockImplementation(() => {});
    const reconnect = vi.fn(async () => {});
    const { addMsg, calls } = makeAddMsg();

    const handled = await tryHandleUiCommand({
      trimmed: "/provider use openai",
      cwd: process.cwd(),
      addMsg,
      agent: null,
      theme: getTheme(DEFAULT_THEME),
      setTheme: vi.fn(),
      setThemePicker: vi.fn(),
      setThemePickerIndex: vi.fn(),
      connectToProvider: reconnect,
    });

    expect(handled).toBe(true);
    expect(saveConfig).toHaveBeenCalled();
    expect(reconnect).toHaveBeenCalledWith(true);
    expect(calls.some((call) => call.text.includes("Switched active provider"))).toBe(true);
  });
});
