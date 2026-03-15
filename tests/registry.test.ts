import { describe, expect, it } from "vitest";
import { dispatchRegisteredCommands } from "../src/commands/registry.js";

describe("dispatchRegisteredCommands", () => {
  it("stops at the first handler that returns true", async () => {
    const calls: string[] = [];
    const result = await dispatchRegisteredCommands([
      async () => {
        calls.push("first");
        return false;
      },
      async () => {
        calls.push("second");
        return true;
      },
      async () => {
        calls.push("third");
        return true;
      },
    ], { trimmed: "/test" });

    expect(result).toBe(true);
    expect(calls).toEqual(["first", "second"]);
  });

  it("returns false when no handler matches", async () => {
    const result = await dispatchRegisteredCommands([
      () => false,
      async () => false,
    ], { trimmed: "/test" });

    expect(result).toBe(false);
  });
});
