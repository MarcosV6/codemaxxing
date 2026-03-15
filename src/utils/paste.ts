export interface PendingPasteEndState {
  active: boolean;
  buffer: string;
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
