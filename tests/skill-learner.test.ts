import { describe, expect, it } from "vitest";
import { generateSkillFromTrace, shouldLearnSkill } from "../src/utils/skill-learner.js";

describe("shouldLearnSkill", () => {
  it("rejects low-signal install-only workflows", () => {
    const trace = {
      toolCalls: [
        { name: "read_file", args: { path: "package.json" }, result: "{}" },
        { name: "write_file", args: { path: "package.json" }, result: "ok" },
        { name: "run_command", args: { command: "npm install" }, result: "ok" },
        { name: "read_file", args: { path: "package-lock.json" }, result: "{}" },
      ],
      userMessage: "go even harder",
      hadError: false,
      errorRecovered: false,
      userCorrection: true,
      totalIterations: 4,
    };

    expect(shouldLearnSkill(trace)).toBe(false);
  });

  it("accepts file-changing workflows that also build or run verification", () => {
    const trace = {
      toolCalls: [
        { name: "read_file", args: { path: "package.json" }, result: "{}" },
        { name: "list_files", args: { path: "src" }, result: "App.tsx" },
        { name: "write_file", args: { path: "src/App.tsx" }, result: "ok" },
        { name: "edit_file", args: { path: "package.json" }, result: "ok" },
        { name: "run_command", args: { command: "npm run build" }, result: "ok" },
        { name: "run_command", args: { command: "npm run test" }, result: "ok" },
      ],
      userMessage: "wow good job now",
      hadError: false,
      errorRecovered: false,
      userCorrection: false,
      totalIterations: 6,
    };

    expect(shouldLearnSkill(trace)).toBe(true);
  });
});

describe("generateSkillFromTrace", () => {
  it("uses workflow patterns instead of raw chat text for naming", () => {
    const trace = {
      toolCalls: [
        { name: "read_file", args: { path: "package.json" }, result: "{}" },
        { name: "write_file", args: { path: "src/App.tsx" }, result: "ok" },
        { name: "run_command", args: { command: "npm run build" }, result: "ok" },
      ],
      userMessage: "wow good job now",
      hadError: false,
      errorRecovered: false,
      userCorrection: false,
      totalIterations: 3,
    };

    const skill = generateSkillFromTrace(trace);

    expect(skill.name).toBe("node-edit-build-app");
    expect(skill.description).toContain("Repeatable node workflow");
    expect(skill.trigger).toContain("building the project");
    expect(skill.trigger).not.toContain("wow good job now");
    expect(skill.steps[0]).toContain("package.json");
    expect(skill.steps[1]).toContain("App.tsx");
  });
});
