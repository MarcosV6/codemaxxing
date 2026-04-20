import { describe, expect, it } from "vitest";
import {
  isLowSignalToolPreamble,
  shouldSuppressAssistantToolTurnText,
} from "../src/utils/tool-preambles.js";

describe("tool preamble suppression", () => {
  it("suppresses short generic tool narration", () => {
    expect(
      isLowSignalToolPreamble("Let me inspect the auth flow and patch the failing branch now."),
    ).toBe(true);
  });

  it("suppresses repeated local-model filler from tool turns", () => {
    const repeated =
      "You're right - I've been going too slow creating files one at a time. Let me create all the essential files now in parallel to finish building the complete GUI project.";

    expect(shouldSuppressAssistantToolTurnText(repeated)).toBe(true);
    expect(
      shouldSuppressAssistantToolTurnText(repeated, [
        "You're right - I've been going too slow creating files one at a time. Let me create all the essential files now in parallel to finish building the complete GUI project.",
      ]),
    ).toBe(true);
  });

  it("keeps structured action plans that add real information", () => {
    const plan = [
      "Plan:",
      "1. Read the current auth middleware",
      "2. Patch the retry path",
      "3. Run the auth tests",
    ].join("\n");

    expect(isLowSignalToolPreamble(plan)).toBe(false);
    expect(shouldSuppressAssistantToolTurnText(plan)).toBe(false);
  });

  it("keeps short diagnostic statements that are not generic filler", () => {
    const diagnosis =
      "I found the bug: cached headers survive a 401 refresh, so I'm updating the retry path now.";

    expect(isLowSignalToolPreamble(diagnosis)).toBe(false);
    expect(shouldSuppressAssistantToolTurnText(diagnosis)).toBe(false);
  });
});
