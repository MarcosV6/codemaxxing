import { EventEmitter } from "events";
import { appendFileSync } from "node:fs";
import { consumePendingPasteEndMarkerChunk } from "../utils/paste.js";

export interface PasteEvent {
  content: string;
  lines: number;
  inline?: boolean;
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
  let streamBuffer = "";
  let bracketedBuffer = "";
  let inBracketedPaste = false;
  let burstBuffer = "";
  let burstTimer: NodeJS.Timeout | null = null;
  let pendingPasteEndState = { active: false, buffer: "" };
  const BURST_WINDOW_MS = 50;

  const PASTE_DEBUG = process.env.CODEMAXXING_PASTE_DEBUG === "1";
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
    pasteLog(`PASTE PAYLOAD RAW lines=${lineCount} len=${normalized.length} json=${JSON.stringify(normalized)}`);

    if (isAttachment) {
      pasteLog(`PASTE EMIT attachment lines=${lineCount} len=${visible.length}`);
      pasteEvents.emit("paste", { content: normalized, lines: lineCount, inline: false });
    } else {
      // Treat short single-line paste as a paste block too. It's slightly less fancy,
      // but much more reliable than trying to inject synthetic keystrokes into Ink.
      pasteLog(`PASTE EMIT single-line block len=${visible.length}`);
      pasteEvents.emit("paste", { content: normalized, lines: lineCount, inline: false });
    }
  }

  function classifyBurstPaste(data: string): { isPaste: boolean } {
    const clean = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
    const normalized = clean.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const compact = normalized.replace(/\n/g, "");
    const printableOnly = compact.replace(/[^\x20-\x7E]/g, "");
    const nonPrintableCount = compact.length - printableOnly.length;
    const newlines = (normalized.match(/\n/g) ?? []).length;
    const printable = printableOnly.trim().length;

    // If the chunk is mostly control bytes / escape debris, do not classify it as paste.
    if (nonPrintableCount > 0 && printable < Math.max(2, nonPrintableCount)) {
      return { isPaste: false };
    }

    if (newlines >= 2 || (newlines >= 1 && printable >= 40)) {
      return { isPaste: true };
    }

    // Accept short single-line paste only when it is genuinely printable text.
    if (newlines === 0 && printable >= 2 && nonPrintableCount === 0) {
      return { isPaste: true };
    }

    return { isPaste: false };
  }

  function flushBurst(): void {
    if (!burstBuffer) return;
    const buffered = burstBuffer;
    burstBuffer = "";

    if (!buffered.trim()) return;

    const classification = classifyBurstPaste(buffered);
    if (classification.isPaste) {
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
    const incomingRaw =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf-8")
          : String(chunk);

    const consumed = consumePendingPasteEndMarkerChunk(incomingRaw, pendingPasteEndState);
    pendingPasteEndState = consumed.nextState;
    if (consumed.swallowed && !consumed.remaining) {
      pasteLog(`SWALLOWED trailing paste-end debris json=${JSON.stringify(incomingRaw)}`);
      return true;
    }

    const incoming = consumed.remaining;
    if (!incoming) {
      return true;
    }

    // Important: do NOT strip bracketed-paste markers before parsing.
    // The state machine below needs to see the real \x1b[200~ / \x1b[201~
    // boundaries so one user paste gesture becomes one paste event.
    streamBuffer += incoming;

    // Log raw bytes in hex for debugging marker fragments
    const hexPreview = incoming.substring(0, 50).split('').map(c => c.charCodeAt(0).toString(16)).join(' ');
    pasteLog(`CHUNK len=${incoming.length} inBracketed=${inBracketedPaste} buffered=${streamBuffer.length} hex=${hexPreview}`);

    let data = streamBuffer;
    streamBuffer = "";

    // ── Process the buffered stream, potentially containing multiple markers ──
    while (data.length > 0) {
      if (!inBracketedPaste) {
        // Look for paste start marker
        const startIdx = data.indexOf(PASTE_START);

        if (startIdx === -1) {
          // No marker yet. If the current buffered data looks like the start of a
          // bracketed paste marker fragment, keep it in the stream buffer until the
          // next chunk arrives instead of misclassifying it as ordinary input.
          const markerPrefixes = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[200", "\x1b[200~"];
          const trailingPrefix = markerPrefixes.find((prefix) => data.endsWith(prefix) && prefix !== "\x1b[200~");
          if (trailingPrefix) {
            const safe = data.slice(0, -trailingPrefix.length);
            if (safe) {
              burstBuffer += safe;
              if (burstTimer) clearTimeout(burstTimer);
              burstTimer = setTimeout(() => {
                burstTimer = null;
                flushBurst();
              }, BURST_WINDOW_MS);
            }
            streamBuffer = trailingPrefix;
            break;
          }

          // No marker — this is normal input or non-bracketed paste
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
          burstBuffer += before;
          if (burstTimer) clearTimeout(burstTimer);
          burstTimer = setTimeout(() => {
            burstTimer = null;
            flushBurst();
          }, BURST_WINDOW_MS);
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
          // No end marker yet — if the chunk ends with a partial end-marker prefix,
          // keep that fragment in the stream buffer for the next read.
          const endPrefixes = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[201", "\x1b[201~"];
          const trailingPrefix = endPrefixes.find((prefix) => data.endsWith(prefix) && prefix !== "\x1b[201~");
          if (trailingPrefix) {
            bracketedBuffer += data.slice(0, -trailingPrefix.length);
            streamBuffer = trailingPrefix;
          } else {
            bracketedBuffer += data;
          }
          pasteLog(`BUFFERING total=${bracketedBuffer.length}`);
          break;
        }

        // Found end marker — extract content before it
        bracketedBuffer += data.substring(0, endIdx);
        inBracketedPaste = false;

        pasteLog(`BRACKETED COMPLETE len=${bracketedBuffer.length}`);
        emitPaste(bracketedBuffer);
        bracketedBuffer = "";
        pendingPasteEndState = { active: true, buffer: "" };

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
