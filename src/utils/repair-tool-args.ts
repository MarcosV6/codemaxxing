/**
 * Best-effort repair of malformed tool-call JSON from local / slow-streaming
 * models.
 *
 * - Strips trailing commas before `}` / `]`
 * - If the payload has an odd number of unescaped `"` quotes, appends a
 *   closing quote — common when the upstream stream is cut off mid-string
 * - Adds a trailing `}` or `]` when the opening brace has no match
 *
 * Extracted into its own file to avoid a circular import between
 * `core/agent.ts` (chat-completions path) and `utils/responses-api.ts`
 * (responses-api path), both of which need the same repair step.
 */
export function repairToolArgs(raw: string): string {
  const stripped = raw.replace(/,(\s*[}\]])/g, "$1");
  let trimmed = stripped.trimEnd();
  if (!trimmed) return trimmed;
  const opensObj = trimmed.startsWith("{");
  const opensArr = trimmed.startsWith("[");
  if (!opensObj && !opensArr) return trimmed;

  let quoteCount = 0;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') quoteCount++;
  }
  if (quoteCount % 2 === 1) {
    trimmed += '"';
  }

  const lastChar = trimmed[trimmed.length - 1];
  const needsClose = opensObj ? lastChar !== "}" : lastChar !== "]";
  if (!needsClose) return trimmed;
  return trimmed + (opensObj ? "}" : "]");
}
