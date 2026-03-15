export function compactCommandOutput(value: unknown, maxLen: number = 160): string {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

export function getCommandErrorMessage(error: any): string {
  return compactCommandOutput(error?.stderr || error?.stdout || error?.message || error);
}
