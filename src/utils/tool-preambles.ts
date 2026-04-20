function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasStructuredFormatting(text: string): boolean {
  return /```|^\s*[-*]\s|^\s*\d+\.\s|^\s*#+\s/m.test(text);
}

const GENERIC_PREAMBLE_PREFIX =
  /^(?:ok(?:ay)?|sure|absolutely|totally|yep|yes|you(?:'| a)?re right|i(?:'| a)?m going to|i(?:'| a)?m gonna|i(?:'| a)?m about to|i(?:'| a)?m working on|i(?:'| a)?m checking|i(?:'| a)?m looking|i(?:'| a)?m inspecting|i(?:'| a)?m reviewing|i(?:'| a)?m reading|i(?:'| a)?m updating|i(?:'| a)?m creating|i(?:'| a)?m fixing|i(?:'| a)?m running|i(?:'| a)?m verifying|i(?:'| a)?m testing|i(?:'| a)?m starting|i(?:'| a)?m opening|let me|i(?:'| a)?ll|i will|first(?:,|\b)|next(?:,|\b)|to start(?:,|\b)|starting(?:,|\b)|working on|checking|looking into|inspecting|reviewing|reading|searching|creating|writing|editing|updating|running|verifying|testing|opening)\b/i;

const ACTION_WORD =
  /\b(?:read|inspect|check|search|look|review|analy[sz]e|create|write|edit|update|fix|run|verify|test|open|list|scan|scaffold|implement|finish|continue|patch)\b/i;

export function normalizeAssistantToolTurnText(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

export function isLowSignalToolPreamble(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  if (normalized.length > 280) return false;
  if (normalized.split("\n").length > 3) return false;
  if (hasStructuredFormatting(normalized)) return false;
  if (!ACTION_WORD.test(normalized)) return false;
  return GENERIC_PREAMBLE_PREFIX.test(normalized);
}

export function shouldSuppressAssistantToolTurnText(
  text: string,
  recentTexts: string[] = [],
): boolean {
  const normalized = normalizeAssistantToolTurnText(text);
  if (!normalized) return true;

  for (const prior of recentTexts) {
    if (normalizeAssistantToolTurnText(prior) === normalized) {
      return true;
    }
  }

  return isLowSignalToolPreamble(text);
}
