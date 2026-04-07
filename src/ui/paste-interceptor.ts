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
  public readonly pasteEvents = new EventEmitter();

  constructor() {
    super({ encoding: "utf-8", decodeStrings: false });
  }

  _transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback): void {
    const incoming = typeof chunk === "string" ? chunk : chunk.toString("utf-8");

    this.streamBuffer += incoming;
    let data = this.streamBuffer;
    this.streamBuffer = "";
    let forward = "";

    while (data.length > 0) {
      if (!this.inBracketedPaste) {
        const startIdx = data.indexOf(PASTE_START);

        if (startIdx === -1) {
          // Check for partial start-marker prefix at end of chunk —
          // hold it back until the next chunk confirms or denies.
          const markerPrefixes = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[200"];
          const trailingPrefix = markerPrefixes.find((p) => data.endsWith(p));
          if (trailingPrefix) {
            forward += data.slice(0, -trailingPrefix.length);
            this.streamBuffer = trailingPrefix;
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
          const endPrefixes = ["\x1b", "\x1b[", "\x1b[2", "\x1b[20", "\x1b[201"];
          const trailingPrefix = endPrefixes.find((p) => data.endsWith(p));
          if (trailingPrefix) {
            this.bracketedBuffer += data.slice(0, -trailingPrefix.length);
            this.streamBuffer = trailingPrefix;
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
    // Empty string is fine — Transform handles it correctly.
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
export function setupPasteInterceptor(): PasteEventBus {
  // Windows CMD/conhost don't support bracketed paste
  const isWindowsLegacyTerminal =
    process.platform === "win32" &&
    !process.env.WT_SESSION &&
    !process.env.TERM_PROGRAM;

  if (isWindowsLegacyTerminal) {
    return new EventEmitter();
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

  return filter.pasteEvents;
}
