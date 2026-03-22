import { EventEmitter } from "events";
import { appendFileSync } from "node:fs";
import { consumePendingPasteEndMarkerChunk, shouldSwallowPostPasteDebris } from "../utils/paste.js";
import type { PendingPasteEndState } from "../utils/paste.js";

export interface PasteEvent {
  content: string;
  lines: number;
}

export type PasteEventBus = EventEmitter;

/**
 * Sets up the full paste interception pipeline on process.stdin:
 *
 * - Enables bracketed paste mode on the terminal
 * - Patches stdin emit('data') to intercept all incoming data
 * - Detects multiline pastes via bracketed paste escape sequences
 * - Falls back to burst buffering for terminals without bracketed paste
 * - Strips paste marker artifacts from all chunks
 * - Emits "paste" events on the returned EventEmitter for multiline content
 * - Forwards short pastes (1-2 lines) as normal stdin data
 * - Registers an exit handler to disable bracketed paste mode
 *
 * Returns the EventEmitter that fires "paste" events with { content, lines }.
 */
export function setupPasteInterceptor(): PasteEventBus {
  const pasteEvents = new EventEmitter();

  // Detect Windows CMD/conhost — these don't support bracketed paste or ANSI sequences well.
  // On these terminals, skip paste interception entirely to avoid eating keystrokes.
  const isWindowsLegacyTerminal = process.platform === "win32" && (
    !process.env.WT_SESSION && // Not Windows Terminal
    !process.env.TERM_PROGRAM   // Not a modern terminal emulator
  );

  if (isWindowsLegacyTerminal) {
    // Just return a dummy event bus — no interception, no burst buffering
    return pasteEvents;
  }

  // Enable bracketed paste mode — terminal wraps pastes in escape sequences
  process.stdout.write("\x1b[?2004h");

  // ── Internal state ──
  let bracketedBuffer = "";
  let inBracketedPaste = false;
  let burstBuffer = "";
  let burstTimer: NodeJS.Timeout | null = null;
  let pendingPasteEndMarker: PendingPasteEndState = { active: false, buffer: "" };
  let swallowPostPasteDebrisUntil = 0;
  const BURST_WINDOW_MS = 50; // Long enough for slow terminals to finish delivering paste
  const POST_PASTE_DEBRIS_WINDOW_MS = 1200;

  // Debug paste: set CODEMAXXING_DEBUG_PASTE=1 to log all stdin chunks to /tmp/codemaxxing-paste-debug.log
  const PASTE_DEBUG = process.env.CODEMAXXING_DEBUG_PASTE === "1";
  function pasteLog(msg: string): void {
    if (!PASTE_DEBUG) return;
    const escaped = msg.replace(/\x1b/g, "\\x1b").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    try { appendFileSync("/tmp/codemaxxing-paste-debug.log", `[${Date.now()}] ${escaped}\n`); } catch {}
  }

  const origEmit = process.stdin.emit.bind(process.stdin);

  function handlePasteContent(content: string): void {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const visible = normalized.trim();
    if (!visible) return;

    const lineCount = normalized.split("\n").length;
    const isAttachmentPaste = lineCount >= 2 || visible.length >= 120;
    if (isAttachmentPaste) {
      // Multiline / large paste → treat as a first-class attachment block.
      // Some terminals dribble the closing bracketed-paste marker (`[201~`)
      // one character at a time *after* the paste payload. Arm a tiny
      // swallow-state so those trailing fragments never leak into the input.
      pendingPasteEndMarker = { active: true, buffer: "" };
      swallowPostPasteDebrisUntil = Date.now() + POST_PASTE_DEBRIS_WINDOW_MS;
      pasteEvents.emit("paste", { content: normalized, lines: lineCount });
      return;
    }

    // Short single-line paste → forward as normal input.
    origEmit("data", visible);
  }

  function looksLikeMultilinePaste(data: string): boolean {
    const clean = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); // Strip all ANSI escapes
    // Count \r\n, \n, and bare \r as line breaks (macOS terminals often use bare \r)
    const normalized = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const newlines = (normalized.match(/\n/g) ?? []).length;
    const printable = normalized.replace(/\n/g, "").trim().length;

    return newlines >= 2 || (newlines >= 1 && printable >= 40);
  }

  function flushBurst(): void {
    if (!burstBuffer) return;
    let buffered = burstBuffer;
    burstBuffer = "";

    // Strip any bracketed paste marker fragments that accumulated across
    // individual character chunks (terminal sends [, 2, 0, 1, ~ separately)
    buffered = buffered.replace(/\x1b?\[?20[01]~/g, "");
    buffered = buffered.replace(/20[01]~/g, "");

    if (!buffered || !buffered.trim()) {
      pasteLog("BURST FLUSH stripped to empty — swallowed marker");
      return;
    }

    const isMultiline = looksLikeMultilinePaste(buffered);
    pasteLog(`BURST FLUSH len=${buffered.length} multiline=${isMultiline}`);

    if (isMultiline) {
      handlePasteContent(buffered);
    } else {
      // Normal typing — forward to Ink
      origEmit("data", buffered);
    }
  }

  // Patch emit('data') — the ONE path all data must travel through to reach
  // Ink's listeners, regardless of how the TTY/stream delivers it internally.
  //
  // Two detection layers:
  // 1. Bracketed paste escape sequences (\x1b[200~ ... \x1b[201~)
  // 2. Burst buffering — accumulate rapid-fire chunks over a short window and check
  //    whether the combined content looks like a multiline paste.
  (process.stdin as any).emit = function (event: string, ...args: any[]): boolean {
    // Pass through non-data events untouched
    if (event !== "data") {
      return origEmit(event, ...args);
    }

    const chunk = args[0];
    let data = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);

    pasteLog(`CHUNK len=${data.length} raw=${data.substring(0, 200)}`);

    const pendingResult = consumePendingPasteEndMarkerChunk(data, pendingPasteEndMarker);
    pendingPasteEndMarker = pendingResult.nextState;
    data = pendingResult.remaining;
    if (!data) {
      pasteLog("PENDING END MARKER swallowed chunk");
      return true;
    }

    if (Date.now() < swallowPostPasteDebrisUntil && shouldSwallowPostPasteDebris(data)) {
      pasteLog(`POST-PASTE DEBRIS swallowed raw=${data}`);
      return true;
    }

    // Aggressively strip ALL bracketed paste escape sequences from every chunk,
    // regardless of context. Some terminals split markers across chunks or send
    // them in unexpected positions. We never want \x1b[200~ or \x1b[201~ (or
    // partial fragments like [200~ / [201~) to reach the input component.
    const hadStart = data.includes("\x1b[200~") || data.includes("[200~") || data.includes("200~");
    const hadEnd = data.includes("\x1b[201~") || data.includes("[201~") || data.includes("201~");

    pasteLog(`MARKERS start=${hadStart} end=${hadEnd} inBracketed=${inBracketedPaste}`);

    // Strip full and partial bracketed paste markers — catch every possible fragment
    // Full: \x1b[200~ / \x1b[201~  Partial: [200~ / [201~  Bare: 200~ / 201~
    data = data.replace(/\x1b?\[?20[01]~/g, "");
    // Belt-and-suspenders: catch any residual marker fragments with multiple passes
    data = data.replace(/\[20[01]~/g, "");      // [200~ or [201~
    data = data.replace(/20[01]~/g, "");        // 200~ or 201~
    data = data.replace(/\[\d01~/g, "");        // any [Xdigit01~
    // Final paranoia pass: remove anything that looks like a closing bracket-tilde
    if (data.includes("[201") || data.includes("[200")) {
      data = data.replace(/\[[0-9]*0?[01]~?/g, "");
    }

    // ── Bracketed paste handling ──
    if (hadStart) {
      // Flush any pending burst before entering bracketed mode
      if (burstTimer) { clearTimeout(burstTimer); burstTimer = null; }
      flushBurst();

      inBracketedPaste = true;
      pasteLog("ENTERED bracketed paste mode");
    }

    if (hadEnd) {
      bracketedBuffer += data;
      inBracketedPaste = false;

      const content = bracketedBuffer;
      bracketedBuffer = "";
      pasteLog(`BRACKETED COMPLETE len=${content.length} lines=${content.split("\\n").length}`);
      handlePasteContent(content);
      return true;
    }

    if (inBracketedPaste) {
      bracketedBuffer += data;
      pasteLog(`BRACKETED BUFFERING total=${bracketedBuffer.length}`);
      return true;
    }

    // ── Burst buffering for non-bracketed paste ──

    burstBuffer += data;
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(() => {
      burstTimer = null;
      flushBurst();
    }, BURST_WINDOW_MS);

    return true;
  };

  // Disable bracketed paste on exit
  process.on("exit", () => {
    process.stdout.write("\x1b[?2004l");
  });

  return pasteEvents;
}
