import { EventEmitter } from "events";

export interface PasteEvent {
  content: string;
  lines: number;
  inline: boolean;
}

export type PasteEventBus = EventEmitter;

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const START_PREFIXES = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[200"];
const END_PREFIXES = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[201"];
const BURST_WINDOW_MS = 35;

function stripAnsiControlSequences(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function classifyPaste(content: string): { content: string; lines: number; inline: boolean } | null {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const cleaned = stripAnsiControlSequences(normalized);
  const trimmed = cleaned.trim();

  if (!trimmed) return null;

  const lines = cleaned.split("\n").length;
  const inline = lines === 1 && trimmed.length < 120;

  return { content: cleaned, lines, inline };
}

function maybeTrailingPrefix(buffer: string, prefixes: string[]): string | null {
  for (let i = prefixes.length - 1; i >= 0; i -= 1) {
    const prefix = prefixes[i];
    if (buffer.endsWith(prefix)) {
      return prefix;
    }
  }
  return null;
}

/**
 * Intercepts stdin at the raw stream layer before Ink consumes it.
 * - Short single-line paste is emitted as inline paste.
 * - Multiline / large paste is emitted as attached paste.
 * - Bracketed paste markers and control junk never reach the UI.
 */
export function setupPasteInterceptor(): PasteEventBus {
  const pasteEvents = new EventEmitter();

  const stdin = process.stdin;
  const stdout = process.stdout;

  const isWindowsLegacyTerminal =
    process.platform === "win32" &&
    !process.env.WT_SESSION &&
    !process.env.TERM_PROGRAM;

  if (isWindowsLegacyTerminal || !stdin.isTTY || !stdout.isTTY) {
    return pasteEvents;
  }

  stdout.write("\x1b[?2004h");

  let streamBuffer = "";
  let bracketedBuffer = "";
  let inBracketedPaste = false;
  let burstBuffer = "";
  let burstTimer: NodeJS.Timeout | null = null;

  const originalEmit = stdin.emit.bind(stdin);

  const flushBurst = (): void => {
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }

    if (!burstBuffer) return;

    const buffered = burstBuffer;
    burstBuffer = "";

    const classified = classifyPaste(buffered);
    if (classified && (classified.lines > 1 || classified.content.length > 1)) {
      pasteEvents.emit("paste", classified);
      return;
    }

    originalEmit("data", buffered);
  };

  const scheduleBurstFlush = (): void => {
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(flushBurst, BURST_WINDOW_MS);
  };

  const emitPaste = (rawContent: string): void => {
    const classified = classifyPaste(rawContent);
    if (!classified) return;
    pasteEvents.emit("paste", classified);
  };

  (stdin as NodeJS.EventEmitter).emit = function patchedEmit(event: string, ...args: unknown[]): boolean {
    if (event !== "data") {
      return originalEmit(event, ...args);
    }

    const chunk = args[0];
    const incoming =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk ?? "");

    if (!incoming) return true;

    streamBuffer += incoming;

    while (streamBuffer.length > 0) {
      if (!inBracketedPaste) {
        const startIdx = streamBuffer.indexOf(PASTE_START);

        if (startIdx === -1) {
          const partialStart = maybeTrailingPrefix(streamBuffer, START_PREFIXES);
          const safeLength = partialStart ? streamBuffer.length - partialStart.length : streamBuffer.length;
          if (safeLength > 0) {
            burstBuffer += streamBuffer.slice(0, safeLength);
            scheduleBurstFlush();
          }
          streamBuffer = partialStart ? partialStart : "";
          break;
        }

        if (startIdx > 0) {
          burstBuffer += streamBuffer.slice(0, startIdx);
          flushBurst();
        }

        inBracketedPaste = true;
        bracketedBuffer = "";
        streamBuffer = streamBuffer.slice(startIdx + PASTE_START.length);
        continue;
      }

      const endIdx = streamBuffer.indexOf(PASTE_END);
      if (endIdx === -1) {
        const partialEnd = maybeTrailingPrefix(streamBuffer, END_PREFIXES);
        const safeLength = partialEnd ? streamBuffer.length - partialEnd.length : streamBuffer.length;
        if (safeLength > 0) {
          bracketedBuffer += streamBuffer.slice(0, safeLength);
        }
        streamBuffer = partialEnd ? partialEnd : "";
        break;
      }

      bracketedBuffer += streamBuffer.slice(0, endIdx);
      emitPaste(bracketedBuffer);
      bracketedBuffer = "";
      inBracketedPaste = false;
      streamBuffer = streamBuffer.slice(endIdx + PASTE_END.length);
    }

    return true;
  } as typeof stdin.emit;

  const restore = (): void => {
    if ((stdin as NodeJS.EventEmitter).emit !== originalEmit) {
      (stdin as NodeJS.EventEmitter).emit = originalEmit as typeof stdin.emit;
    }
    if (burstTimer) {
      clearTimeout(burstTimer);
      burstTimer = null;
    }
    stdout.write("\x1b[?2004l");
  };

  process.once("exit", restore);
  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);

  return pasteEvents;
}
