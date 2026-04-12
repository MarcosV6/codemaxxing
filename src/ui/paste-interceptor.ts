import { EventEmitter } from "events";
import { Transform, type TransformCallback } from "stream";

export interface PasteEvent {
  content: string;
  lines: number;
}

export type PasteEventBus = EventEmitter;

// ── Marker constants ──
const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

/**
 * Transform stream that strips bracketed paste markers from stdin and
 * emits the paste content on a side-channel EventEmitter.
 *
 * Ink v6 reads stdin via the paused-mode readable API
 * (stdin.addListener('readable') + stdin.read()), which bypasses any
 * emit("data") monkey-patch. The only reliable interception point is
 * to sit between the raw TTY and Ink as a Transform stream so ALL
 * consumption paths (read, data, pipe) see filtered output.
 */
class PasteFilterStream extends Transform {
  private streamBuffer = "";
  private bracketedBuffer = "";
  private inBracketedPaste = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  public readonly pasteEvents = new EventEmitter();

  // On Windows the partial-marker hold-back causes intermittent typing
  // corruption — stdin chunks are bursty and the 10ms timer reorders
  // keystrokes. Terminals send bracketed paste markers atomically, so
  // disable hold-back entirely on Windows and accept the rare missed
  // paste chip in exchange for rock-solid typing.
  private static readonly HOLD_PARTIAL_PREFIXES = process.platform !== "win32";

  // Escape sequences (arrow keys etc.) arrive within ~1-2ms.
  // Bracketed paste start markers arrive within ~5ms.
  // If a partial marker prefix sits in the buffer longer than this,
  // it was a real keystroke (e.g. Escape key), not a paste marker.
  private static readonly MARKER_TIMEOUT_MS = 10;

  constructor() {
    super({ encoding: "utf-8", decodeStrings: false });
  }

  /** Flush any held-back partial marker prefix as normal input. */
  private flushHeldBuffer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.streamBuffer) {
      this.push(this.streamBuffer);
      this.streamBuffer = "";
    }
  }

  /** Schedule a flush of the held buffer if no new data arrives soon. */
  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushHeldBuffer();
    }, PasteFilterStream.MARKER_TIMEOUT_MS);
  }

  _transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback): void {
    const incoming = typeof chunk === "string" ? chunk : chunk.toString("utf-8");

    // Cancel any pending flush — we have new data to combine with the buffer.
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.streamBuffer += incoming;
    let data = this.streamBuffer;
    this.streamBuffer = "";
    let forward = "";

    while (data.length > 0) {
      if (!this.inBracketedPaste) {
        const startIdx = data.indexOf(PASTE_START);

        if (startIdx === -1) {
          // Check for partial start-marker prefix at end of chunk —
          // hold it back briefly in case the rest of the marker arrives.
          // Only hold back prefixes that are SPECIFIC to the paste marker
          // (\x1b[2, \x1b[20, \x1b[200). A bare \x1b or \x1b[ are too
          // common (Escape key, arrow keys, function keys) — holding them
          // causes input corruption during fast typing, especially on Windows.
          if (PasteFilterStream.HOLD_PARTIAL_PREFIXES) {
            const markerPrefixes = ["\x1b[2", "\x1b[20", "\x1b[200"];
            const trailingPrefix = markerPrefixes.find((p) => data.endsWith(p));
            if (trailingPrefix) {
              forward += data.slice(0, -trailingPrefix.length);
              this.streamBuffer = trailingPrefix;
              this.scheduleFlush();
            } else {
              forward += data;
            }
          } else {
            forward += data;
          }
          break;
        }

        // Content before the start marker is normal input
        if (startIdx > 0) {
          forward += data.substring(0, startIdx);
        }

        this.inBracketedPaste = true;
        this.bracketedBuffer = "";
        data = data.substring(startIdx + PASTE_START.length);
      } else {
        // Inside bracketed paste — look for end marker
        const endIdx = data.indexOf(PASTE_END);

        if (endIdx === -1) {
          // Check for partial end-marker prefix at end of chunk
          if (PasteFilterStream.HOLD_PARTIAL_PREFIXES) {
            const endPrefixes = ["\x1b[2", "\x1b[20", "\x1b[201"];
            const trailingPrefix = endPrefixes.find((p) => data.endsWith(p));
            if (trailingPrefix) {
              this.bracketedBuffer += data.slice(0, -trailingPrefix.length);
              this.streamBuffer = trailingPrefix;
              // No scheduleFlush here — we're inside a paste, so we wait
              // for the end marker. Paste content arrives fast enough.
            } else {
              this.bracketedBuffer += data;
            }
          } else {
            this.bracketedBuffer += data;
          }
          break;
        }

        // Found end marker — emit the paste
        this.bracketedBuffer += data.substring(0, endIdx);
        this.inBracketedPaste = false;
        this.emitPaste(this.bracketedBuffer);
        this.bracketedBuffer = "";

        data = data.substring(endIdx + PASTE_END.length);
      }
    }

    // Push filtered content downstream (to Ink).
    if (forward) {
      this.push(forward);
    }
    callback();
  }

  private emitPaste(content: string): void {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const visible = normalized.trim();
    if (!visible) return;

    const lineCount = normalized.split("\n").length;
    this.pasteEvents.emit("paste", { content: normalized, lines: lineCount });
  }
}

/**
 * Set up the paste interceptor. Must be called BEFORE Ink renders so
 * that Ink binds to our filtered stream instead of raw process.stdin.
 *
 * Replaces process.stdin with a Transform stream that strips bracketed
 * paste markers and emits paste content on the returned EventEmitter.
 */
let _pasteEventBus: PasteEventBus | null = null;

export function setupPasteInterceptor(): PasteEventBus {
  // Guard against duplicate registration — only set up once
  if (_pasteEventBus) return _pasteEventBus;
  // Windows terminals have inconsistent bracketed paste support.
  // - CMD/conhost: no support at all
  // - PowerShell: ignores \x1b[?2004h, never sends paste markers
  // - Windows Terminal (WT_SESSION): supports bracketed paste
  //
  // Only enable the Transform stream filter on terminals that actually
  // support bracketed paste. On others, the filter adds latency and
  // the partial-marker buffering corrupts fast typing.
  const isWindows = process.platform === "win32";
  const isWindowsTerminal = !!process.env.WT_SESSION;

  if (isWindows && !isWindowsTerminal) {
    _pasteEventBus = new EventEmitter();
    return _pasteEventBus;
  }

  // Enable bracketed paste mode
  process.stdout.write("\x1b[?2004h");

  const filter = new PasteFilterStream();

  // Pipe raw stdin through our filter. The filter strips paste markers
  // and emits paste events on the side channel. Ink will read from the
  // filter stream (which we install as process.stdin below).
  const rawStdin = process.stdin;

  // Preserve TTY properties that Ink checks
  const filteredStdin = Object.assign(filter, {
    isTTY: rawStdin.isTTY,
    isRaw: (rawStdin as any).isRaw,
    setRawMode(mode: boolean) {
      if (typeof (rawStdin as any).setRawMode === "function") {
        (rawStdin as any).setRawMode(mode);
        (filteredStdin as any).isRaw = mode;
      }
      return filteredStdin;
    },
    // Ink calls ref/unref on stdin
    ref() { rawStdin.ref(); return filteredStdin; },
    unref() { rawStdin.unref(); return filteredStdin; },
  });

  // Set encoding on the raw stream so pipe delivers strings
  rawStdin.setEncoding("utf-8");
  rawStdin.pipe(filter);

  // Handle pipe errors gracefully instead of crashing
  filter.on("error", () => { /* swallow — broken pipe or encoding issue */ });
  rawStdin.on("error", () => { /* swallow — stdin closed or encoding issue */ });

  // Replace process.stdin so Ink picks up the filtered stream
  Object.defineProperty(process, "stdin", {
    value: filteredStdin,
    writable: true,
    configurable: true,
  });

  // Disable bracketed paste on exit
  process.on("exit", () => {
    process.stdout.write("\x1b[?2004l");
  });

  _pasteEventBus = filter.pasteEvents;
  return _pasteEventBus;
}
