export interface ModelReliabilityAssessment {
  level: "strong" | "okay" | "risky";
  summary: string;
  reasons: string[];
}

function isLocalBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase();
  return lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("0.0.0.0");
}

function hasAnyPattern(model: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(model));
}

export function assessModelReliability(model: string, baseUrl: string): ModelReliabilityAssessment {
  const lower = model.toLowerCase();
  const local = isLocalBaseUrl(baseUrl);

  const strongPatterns = [
    /^gpt-5/,
    /^gpt-4\.1/,
    /^gpt-4o$/,
    /^o3\b/,
    /^o4-mini\b/,
    /claude-sonnet-4/,
    /claude-opus-4/,
    /claude-3[-.]?5-sonnet/,
    /gemini-2\.5-pro/,
    /qwen2\.5-coder:14b/,
    /qwen2\.5-coder:7b/,
  ];

  const riskyPatterns = [
    /\ba3b\b/,
    /\b(?:1\.?5b|2b|3b|4b)\b/,
    /\bmini\b/,
    /\bnano\b/,
    /qwen2\.5-coder:3b/,
    /llama3\.2:3b/,
    /codegemma:2b/,
    /phi-?3/,
  ];

  const reasons: string[] = [];

  if (strongPatterns.some((pattern) => pattern.test(lower))) {
    reasons.push("model family is generally strong at multi-step tool use");
  }

  if (local && hasAnyPattern(lower, riskyPatterns)) {
    reasons.push("small local models often miss multi-step tool flows or stop early");
  } else if (hasAnyPattern(lower, [/\ba3b\b/, /qwen2\.5-coder:3b/, /\bnano\b/])) {
    reasons.push("this model variant is known to be weaker at tool calling");
  }

  if (local && !reasons.length) {
    reasons.push("local inference quality depends heavily on the loaded model and server");
  }

  if (strongPatterns.some((pattern) => pattern.test(lower))) {
    return {
      level: "strong",
      summary: "strong fit for coding and tool-driven workflows",
      reasons,
    };
  }

  if (reasons.some((reason) => reason.includes("weaker") || reason.includes("small local"))) {
    return {
      level: "risky",
      summary: "likely to struggle with long coding/tool flows",
      reasons,
    };
  }

  return {
    level: "okay",
    summary: local
      ? "usable, but local model behavior may vary"
      : "usable, but not a top-tier coding/tool model",
    reasons,
  };
}

export function formatModelReliabilityLine(model: string, baseUrl: string): string {
  const assessment = assessModelReliability(model, baseUrl);
  const prefix =
    assessment.level === "strong" ? "Tool fit: strong" :
    assessment.level === "risky" ? "Tool fit: risky" :
    "Tool fit: okay";
  return `${prefix} — ${assessment.summary}`;
}
