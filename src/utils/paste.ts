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
