import { describe, expect, it } from "vitest";
import { analyzeAppRunIntent, getModelCost, userRequestedAppRun } from "../src/agent.js";

describe("getModelCost", () => {
  it("returns correct cost for known OpenAI models", () => {
    expect(getModelCost("gpt-4o").input).toBe(2.5);
    expect(getModelCost("o3").input).toBe(10);
    expect(getModelCost("o4-mini").input).toBe(1.1);
  });

  it("returns correct cost for known Anthropic models", () => {
    expect(getModelCost("claude-sonnet-4-20250514").input).toBe(3);
    expect(getModelCost("claude-opus-4-20250514").input).toBe(15);
    expect(getModelCost("claude-haiku-4").input).toBe(0.8);
  });

  it("returns correct cost for Gemini models", () => {
    expect(getModelCost("gemini-2.5-pro").input).toBe(1.25);
    expect(getModelCost("gemini-2.0-flash").input).toBe(0.1);
  });

  it("handles provider-prefixed model names", () => {
    expect(getModelCost("openai/gpt-4o").input).toBe(2.5);
    expect(getModelCost("anthropic/claude-3-5-sonnet").input).toBe(3);
    expect(getModelCost("google/gemini-2.5-pro").input).toBe(1.25);
  });

  it("returns zero cost for unknown models without crashing", () => {
    const cost = getModelCost("unknown-model-xyz-9999");
    expect(cost.input).toBe(0);
    expect(cost.output).toBe(0);
  });

  it("does partial prefix matching for versioned model IDs", () => {
    // e.g. "claude-sonnet-4-20250514-beta" should still match "claude-sonnet-4-20250514"
    const cost = getModelCost("claude-sonnet-4-20250514-some-suffix");
    expect(cost.input).toBeGreaterThan(0);
  });
});

describe("app run intent detection", () => {
  it("recognizes when the user explicitly asks to run the app", () => {
    expect(userRequestedAppRun("build me a site and run it for me")).toBe(true);
    expect(userRequestedAppRun("start the dev server after you finish")).toBe(true);
    expect(userRequestedAppRun("run the tests")).toBe(false);
  });

  it("requires an actual start command, not just scaffolding", () => {
    const status = analyzeAppRunIntent("build it and run it", [
      {
        name: "write_file",
        args: { path: "package.json" },
        result: "✅ Wrote 100 bytes to package.json",
      },
      {
        name: "run_command",
        args: { command: "npm install" },
        result: "added 42 packages",
      },
    ]);

    expect(status.requested).toBe(true);
    expect(status.installedDependencies).toBe(true);
    expect(status.startedApp).toBe(false);
  });

  it("treats a successful background dev server as satisfying run intent", () => {
    const status = analyzeAppRunIntent("please run the app", [
      {
        name: "run_background_command",
        args: { command: "npm run dev" },
        result: "✅ Started in background (PID 1234)\n\nEarly output:\nLocal: http://localhost:5173",
      },
    ]);

    expect(status.requested).toBe(true);
    expect(status.startedApp).toBe(true);
  });
});
