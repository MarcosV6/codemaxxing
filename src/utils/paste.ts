export interface PendingPasteEndState {
  active: boolean;
  buffer: string;
}

export function shouldSwallowPostPasteDebris(chunk: string): boolean {
  if (!chunk) return false;
  if (chunk.length > 8) return false;

  // Terminals sometimes leak tiny bracketed-paste marker fragments after the
  // multiline payload is already complete. Be conservative: only swallow short
  // chunks made entirely of characters that belong to those control fragments.
  return /^[\x1b\[\]0-9;~]+$/.test(chunk);
}

export function sanitizeInputArtifacts(value: string): string {
  if (!value) return value;

  let out = value;

  // Strip canonical bracketed-paste markers whether they arrive as real escape
  // sequences or as already-rendered visible fragments leaked by the terminal.
  out = out.replace(/\x1b\[200~/g, "");
  out = out.replace(/\x1b\[201~/g, "");
  out = out.replace(/\[200~/g, "");
  out = out.replace(/\[201~/g, "");

  // Defensive UI cleanup for tiny raw marker remnants.
  const trimmed = out.trim();
  const looksLikeDebris =
    trimmed.length <= 8 &&
    /^(?:\x1b\[)?20[01]~$/.test(trimmed);

  if (looksLikeDebris) {
    return "";
  }

  return out;
}

const END_MARKERS = ["\x1b[201~", "[201~", "201~"] as const;

function isPrefixOfAnyMarker(value: string): boolean {
  return END_MARKERS.some((marker) => marker.startsWith(value));
}

function stripLeadingFullMarkers(value: string): { remaining: string; stripped: boolean } {
  let remaining = value;
  let stripped = false;

  outer: while (remaining.length > 0) {
    for (const marker of END_MARKERS) {
      if (remaining.startsWith(marker)) {
        remaining = remaining.slice(marker.length);
        stripped = true;
        continue outer;
      }
    }
    break;
  }

  return { remaining, stripped };
}

export function consumePendingPasteEndMarkerChunk(
  chunk: string,
  state: PendingPasteEndState,
): { remaining: string; nextState: PendingPasteEndState; swallowed: boolean } {
  if (!state.active) {
    return { remaining: chunk, nextState: state, swallowed: false };
  }

  let combined = state.buffer + chunk;
  let swallowed = false;

  const stripped = stripLeadingFullMarkers(combined);
  combined = stripped.remaining;
  swallowed = stripped.stripped;

  if (!combined) {
    return {
      remaining: "",
      nextState: { active: false, buffer: "" },
      swallowed,
    };
  }

  if (isPrefixOfAnyMarker(combined)) {
    return {
      remaining: "",
      nextState: { active: true, buffer: combined },
      swallowed: true,
    };
  }

  return {
    remaining: combined,
    nextState: { active: false, buffer: "" },
    swallowed,
  };
}
