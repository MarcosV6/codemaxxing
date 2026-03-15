import { describe, expect, it } from "vitest";
import { consumePendingPasteEndMarkerChunk } from "../src/utils/paste.js";

const idle = { active: false, buffer: "" };
const armed = { active: true, buffer: "" };

describe("consumePendingPasteEndMarkerChunk", () => {
  it("passes through normally when not armed", () => {
    const result = consumePendingPasteEndMarkerChunk("hello", idle);
    expect(result.remaining).toBe("hello");
    expect(result.nextState.active).toBe(false);
    expect(result.swallowed).toBe(false);
  });

  // ── Full markers in one chunk ──────────────────────────────────────────────

  it("swallows full \\x1b[201~ when armed", () => {
    const result = consumePendingPasteEndMarkerChunk("\x1b[201~", armed);
    expect(result.remaining).toBe("");
    expect(result.swallowed).toBe(true);
    expect(result.nextState.active).toBe(false);
  });

  it("swallows partial [201~ (no ESC) when armed", () => {
    const result = consumePendingPasteEndMarkerChunk("[201~", armed);
    expect(result.remaining).toBe("");
    expect(result.swallowed).toBe(true);
  });

  it("swallows bare 201~ when armed", () => {
    const result = consumePendingPasteEndMarkerChunk("201~", armed);
    expect(result.remaining).toBe("");
    expect(result.swallowed).toBe(true);
  });

  // ── Fragment-by-fragment (the actual failure mode) ─────────────────────────

  it("accumulates [ without forwarding", () => {
    const r1 = consumePendingPasteEndMarkerChunk("[", armed);
    expect(r1.remaining).toBe("");
    expect(r1.nextState.active).toBe(true);
    expect(r1.nextState.buffer).toBe("[");
  });

  it("accumulates [2 without forwarding", () => {
    const r1 = consumePendingPasteEndMarkerChunk("[", armed);
    const r2 = consumePendingPasteEndMarkerChunk("2", r1.nextState);
    expect(r2.remaining).toBe("");
    expect(r2.nextState.buffer).toBe("[2");
  });

  it("accumulates [20 without forwarding", () => {
    let s = armed;
    for (const c of ["[", "2", "0"]) {
      const r = consumePendingPasteEndMarkerChunk(c, s);
      expect(r.remaining).toBe("");
      s = r.nextState;
    }
    expect(s.buffer).toBe("[20");
  });

  it("swallows [201~ arriving one char at a time", () => {
    let s = armed;
    for (const c of ["[", "2", "0", "1", "~"]) {
      const r = consumePendingPasteEndMarkerChunk(c, s);
      s = r.nextState;
    }
    expect(s.active).toBe(false);
    expect(s.buffer).toBe("");
  });

  it("swallows full \\x1b[201~ arriving one char at a time", () => {
    let s = armed;
    for (const c of ["\x1b", "[", "2", "0", "1", "~"]) {
      const r = consumePendingPasteEndMarkerChunk(c, s);
      s = r.nextState;
    }
    expect(s.active).toBe(false);
    expect(s.buffer).toBe("");
  });

  // ── Non-marker real text after paste ──────────────────────────────────────

  it("releases non-marker content and disarms", () => {
    // First char looks like it could be a prefix — '[' — but next char breaks it
    const r1 = consumePendingPasteEndMarkerChunk("[", armed);
    expect(r1.remaining).toBe("");          // still buffering
    const r2 = consumePendingPasteEndMarkerChunk("z", r1.nextState);
    expect(r2.remaining).toBe("[z");        // flushed through — was NOT a marker
    expect(r2.nextState.active).toBe(false);
  });

  it("releases plain text directly when armed and content is not a prefix", () => {
    const result = consumePendingPasteEndMarkerChunk("hello world", armed);
    expect(result.remaining).toBe("hello world");
    expect(result.nextState.active).toBe(false);
  });
});
