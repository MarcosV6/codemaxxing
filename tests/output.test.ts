import { describe, expect, it } from "vitest";
import { compactCommandOutput, getCommandErrorMessage } from "../src/commands/output.js";

describe("command output helpers", () => {
  it("compacts multiline output into a single line", () => {
    const input = "line one\n\nline two\r\nline three";
    expect(compactCommandOutput(input)).toBe("line one | line two | line three");
  });

  it("truncates very long output", () => {
    const input = "a".repeat(300);
    const result = compactCommandOutput(input, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith("…")).toBe(true);
  });

  it("prefers stderr/stdout/message when building command errors", () => {
    expect(getCommandErrorMessage({ stderr: "bad stderr\nnext line" })).toContain("bad stderr | next line");
    expect(getCommandErrorMessage({ stdout: "bad stdout" })).toBe("bad stdout");
    expect(getCommandErrorMessage({ message: "plain message" })).toBe("plain message");
  });
});
