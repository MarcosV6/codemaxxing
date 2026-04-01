import { EventEmitter } from "events";
import { appendFileSync } from "node:fs";

export interface PasteEvent {
  content: string;
  lines: number;
}

export type PasteEventBus = EventEmitter;

/**
 * Bracketed paste interceptor for terminal input.
 *
 * Strategy: detect \x1b[200~ ... \x1b[201~ boundaries FIRST,
 * extract the content between them, and emit it as a paste event.
 * Never let marker bytes reach Ink's input handler.
 *
 * For terminals without bracketed paste support, falls back to
 * burst-buffering rapid stdin chunks.
 */
export function setupPasteInterceptor(): PasteEventBus {
  const pasteEvents = new EventEmitter();

  // Windows CMD/conhost don't support bracketed paste
  const isWindowsLegacyTerminal =
    process.platform === "win32" &&
    !process.env.WT_SESSION &&
    !process.env.TERM_PROGRAM;

  if (isWindowsLegacyTerminal) {
    return pasteEvents;
  }

  // Enable bracketed paste mode
  process.stdout.write("\x1b[?2004h");

  // ── State ──
  let bracketedBuffer = "";
  let inBracketedPaste = false;
  let burstBuffer = "";
  let burstTimer: NodeJS.Timeout | null = null;
  const BURST_WINDOW_MS = 50;

  // Debug: set CODEMAXXING_DEBUG_PASTE=1
  const PASTE_DEBUG = process.env.CODEMAXXING_DEBUG_PASTE === "1";
  function pasteLog(msg: string): void {
    if (!PASTE_DEBUG) return;
    const escaped = msg
      .replace(/\x1b/g, "\\x1b")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
    try {
      appendFileSync("/tmp/codemaxxing-paste-debug.log", `[${Date.now()}] ${escaped}\n`);
    } catch {}
  }

  const origEmit = process.stdin.emit.bind(process.stdin);

  // ── Marker constants ──
  const PASTE_START = "\x1b[200~";
  const PASTE_END = "\x1b[201~";

  function emitPaste(content: string): void {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const visible = normalized.trim();
    if (!visible) return;

    const lineCount = normalized.split("\n").length;
    const isAttachment = lineCount >= 2 || visible.length >= 120;

    if (isAttachment) {
      pasteLog(`PASTE EMIT attachment lines=${lineCount} len=${visible.length}`);
      pasteEvents.emit("paste", { content: normalized, lines: lineCount });
    } else {
      // Short single-line paste → forward as normal typed input
      pasteLog(`PASTE EMIT inline len=${visible.length}`);
      origEmit("data", visible);
    }
  }

  function looksLikeMultilinePaste(data: string): boolean {
    const clean = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
    const normalized = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const newlines = (normalized.match(/\n/g) ?? []).length;
    const printable = normalized.replace(/\n/g, "").trim().length;
    return newlines >= 2 || (newlines >= 1 && printable >= 40);
  }

  function flushBurst(): void {
    if (!burstBuffer) return;
    const buffered = burstBuffer;
    burstBuffer = "";

    if (!buffered.trim()) return;

    if (looksLikeMultilinePaste(buffered)) {
      pasteLog(`BURST → paste len=${buffered.length}`);
      emitPaste(buffered);
    } else {
      pasteLog(`BURST → forward len=${buffered.length}`);
      origEmit("data", buffered);
    }
  }

  /**
   * Core data handler. Processes every stdin chunk through a simple
   * state machine:
   *
   *   IDLE → see PASTE_START → enter BRACKETED, buffer content
   *   BRACKETED → see PASTE_END → emit paste, return to IDLE
   *   BRACKETED → no end marker → keep buffering
   *   IDLE → no markers → burst-buffer for non-bracketed paste detection
   *
   * Key insight: we parse markers structurally instead of regex-stripping
   * them. This avoids the old bug where stripping happened before the
   * state transition, causing content to leak into both paths.
   */
  (process.stdin as any).emit = function (event: string, ...args: any[]): boolean {
    if (event !== "data") {
      return origEmit(event, ...args);
    }

    const chunk = args[0];
    let data =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf-8")
          : String(chunk);

    pasteLog(`CHUNK len=${data.length} inBracketed=${inBracketedPaste}`);

    // ── Process the chunk, potentially containing multiple markers ──
    while (data.length > 0) {
      if (!inBracketedPaste) {
        // Look for paste start marker
        const startIdx = data.indexOf(PASTE_START);

        if (startIdx === -1) {
          // No marker — this is normal input or non-bracketed paste
          // Flush any burst timer and buffer it
          burstBuffer += data;
          if (burstTimer) clearTimeout(burstTimer);
          burstTimer = setTimeout(() => {
            burstTimer = null;
            flushBurst();
          }, BURST_WINDOW_MS);
          break;
        }

        // There's a start marker. Anything before it is normal input.
        if (startIdx > 0) {
          const before = data.substring(0, startIdx);
          pasteLog(`PRE-MARKER normal input len=${before.length}`);
          origEmit("data", before);
        }

        // Enter bracketed paste mode
        inBracketedPaste = true;
        bracketedBuffer = "";
        data = data.substring(startIdx + PASTE_START.length);
        pasteLog("ENTERED bracketed paste");

        // Flush any pending burst — we're now in paste territory
        if (burstTimer) {
          clearTimeout(burstTimer);
          burstTimer = null;
        }
        flushBurst();

      } else {
        // We're inside a bracketed paste — look for end marker
        const endIdx = data.indexOf(PASTE_END);

        if (endIdx === -1) {
          // No end marker yet — buffer everything
          bracketedBuffer += data;
          pasteLog(`BUFFERING total=${bracketedBuffer.length}`);
          break;
        }

        // Found end marker — extract content before it
        bracketedBuffer += data.substring(0, endIdx);
        inBracketedPaste = false;

        pasteLog(`BRACKETED COMPLETE len=${bracketedBuffer.length}`);
        emitPaste(bracketedBuffer);
        bracketedBuffer = "";

        // Continue processing anything after the end marker
        // (could be more input or even another paste)
        data = data.substring(endIdx + PASTE_END.length);
      }
    }

    return true;
  };

  // Disable bracketed paste on exit
  process.on("exit", () => {
    process.stdout.write("\x1b[?2004l");
  });

  return pasteEvents;
}
