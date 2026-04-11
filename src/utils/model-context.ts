/**
 * Model context-window detection.
 *
 * Two layers:
 *   1. Static lookup table for known cloud models (Claude, GPT, Gemini, etc.)
 *   2. Runtime detection for local servers (Ollama via /api/show, LM Studio
 *      via /api/v0/models, OpenRouter via /api/v1/models) so the *actually
 *      loaded* context window — including user overrides — wins over the
 *      static guess.
 *
 * Returned values are in tokens (the model's max context, not max output).
 * Returns `null` when nothing can be determined; callers should fall back to
 * a sane default rather than crash.
 */

const FALLBACK_WINDOW = 32_000;

/**
 * Static lookup. Keys are matched case-insensitively with substring matching
 * (same shape as MODEL_COSTS) so e.g. "openai/gpt-4o-2024-08-06" resolves to
 * the "gpt-4o" entry.
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // ── Anthropic Claude ────────────────────────────────────────────────────
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-opus-4": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-3-7-sonnet": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-haiku": 200_000,

  // ── OpenAI ──────────────────────────────────────────────────────────────
  "gpt-5.4-pro": 400_000,
  "gpt-5.4": 400_000,
  "gpt-5.3-codex": 400_000,
  "gpt-5-mini": 400_000,
  "gpt-5": 400_000,
  "gpt-4.1-nano": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4.1": 1_000_000,
  "gpt-4o-mini": 128_000,
  "gpt-4o": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "o1-pro": 200_000,
  "o1-mini": 128_000,
  "o1": 200_000,
  "o3-mini": 200_000,
  "o3": 200_000,
  "o4-mini": 200_000,

  // ── Google Gemini ───────────────────────────────────────────────────────
  "gemini-2.5-pro": 2_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-1.5-pro": 2_000_000,
  "gemini-1.5-flash": 1_000_000,
  "gemini-pro": 32_000,

  // ── DeepSeek ────────────────────────────────────────────────────────────
  "deepseek-v3": 64_000,
  "deepseek-r1": 64_000,
  "deepseek-chat": 64_000,
  "deepseek-coder": 64_000,

  // ── Qwen ────────────────────────────────────────────────────────────────
  "qwen3.5": 128_000,
  "qwen-2.5": 128_000,
  "qwen2.5": 128_000,
  "qwen-coder": 128_000,

  // ── Meta Llama ──────────────────────────────────────────────────────────
  "llama-3.3": 128_000,
  "llama-3.2": 128_000,
  "llama-3.1": 128_000,
  "llama-3": 8_192,

  // ── Mistral ─────────────────────────────────────────────────────────────
  "mistral-large": 128_000,
  "mistral-small": 32_000,
  "mistral-nemo": 128_000,
  "mixtral-8x22b": 64_000,
  "mixtral-8x7b": 32_000,

  // ── xAI Grok ────────────────────────────────────────────────────────────
  "grok-2": 131_072,
  "grok-beta": 131_072,
};

/** Substring-based static lookup, case-insensitive. */
export function getStaticContextWindow(model: string): number | null {
  if (!model) return null;
  if (MODEL_CONTEXT_WINDOWS[model] !== undefined) return MODEL_CONTEXT_WINDOWS[model];
  const lower = model.toLowerCase();
  // Exact key contained in model name first (more specific), then the reverse.
  for (const [key, ctx] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.includes(key)) return ctx;
  }
  for (const [key, ctx] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (key.includes(lower)) return ctx;
  }
  return null;
}

/** Strip a trailing /v1 (or /v1/) from an OpenAI-compatible base URL. */
function stripV1Suffix(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ollama: POST /api/show {name: <model>}.
 * Response includes `model_info` with a `<arch>.context_length` key, e.g.
 * `llama.context_length`. We scan for any `*.context_length` key.
 */
export async function detectOllamaContextWindow(baseUrl: string, model: string): Promise<number | null> {
  const root = stripV1Suffix(baseUrl);
  const res = await fetchWithTimeout(`${root}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model }),
  });
  if (!res) return null;
  try {
    const data = (await res.json()) as { model_info?: Record<string, unknown> };
    const info = data.model_info ?? {};
    for (const [key, value] of Object.entries(info)) {
      if (key.endsWith(".context_length") && typeof value === "number") {
        return value;
      }
    }
    // Some Ollama versions expose it directly
    if (typeof (info as Record<string, unknown>).context_length === "number") {
      return (info as Record<string, number>).context_length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * LM Studio: GET /api/v0/models exposes loaded model details including
 * `loaded_context_length` (or `max_context_length` on older builds).
 */
export async function detectLMStudioContextWindow(baseUrl: string, model: string): Promise<number | null> {
  const root = stripV1Suffix(baseUrl);
  const res = await fetchWithTimeout(`${root}/api/v0/models`);
  if (!res) return null;
  try {
    const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const entries = data.data ?? [];
    const match = entries.find((m) => m.id === model || m.id === model.toLowerCase());
    if (!match) return null;
    const candidates = ["loaded_context_length", "max_context_length", "context_length"];
    for (const k of candidates) {
      const v = match[k];
      if (typeof v === "number" && v > 0) return v;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * OpenRouter: GET /api/v1/models returns each model with a `context_length`
 * field. We're already pointed at /v1, so just hit /models and look up the id.
 */
export async function detectOpenRouterContextWindow(baseUrl: string, model: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${baseUrl}/models`);
  if (!res) return null;
  try {
    const data = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const entries = data.data ?? [];
    const match = entries.find((m) => m.id === model);
    if (!match) return null;
    const v = match.context_length;
    if (typeof v === "number" && v > 0) return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Try every applicable detection strategy for the given provider, falling
 * through to the static lookup, and finally a sane default.
 *
 * The detection strategies are cheap (single HTTP request, 2s timeout) and
 * any failure silently falls through to the next layer — never throws.
 */
export async function detectModelContextWindow(opts: {
  model: string;
  baseUrl: string;
  providerType: "openai" | "anthropic";
}): Promise<number> {
  const { model, baseUrl, providerType } = opts;

  // Anthropic doesn't expose a model-listing endpoint with context lengths,
  // and the static table covers every Claude model we care about.
  if (providerType === "anthropic") {
    return getStaticContextWindow(model) ?? 200_000;
  }

  // For OpenAI-compatible endpoints, try the most specific source first.
  const url = baseUrl.toLowerCase();

  // OpenRouter
  if (url.includes("openrouter.ai")) {
    const detected = await detectOpenRouterContextWindow(baseUrl, model);
    if (detected) return detected;
  }

  // Ollama (default port 11434, or any URL containing "ollama")
  if (url.includes(":11434") || url.includes("ollama")) {
    const detected = await detectOllamaContextWindow(baseUrl, model);
    if (detected) return detected;
  }

  // LM Studio (default port 1234)
  if (url.includes(":1234") || url.includes("lmstudio") || url.includes("lm-studio")) {
    const detected = await detectLMStudioContextWindow(baseUrl, model);
    if (detected) return detected;
  }

  // Generic local: try Ollama and LM Studio anyway in case the user is
  // running them on a non-default port.
  const isLoopback =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("::1") ||
    /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
  if (isLoopback) {
    const ollama = await detectOllamaContextWindow(baseUrl, model);
    if (ollama) return ollama;
    const lmstudio = await detectLMStudioContextWindow(baseUrl, model);
    if (lmstudio) return lmstudio;
  }

  // Fall back to the static table, then a default.
  return getStaticContextWindow(model) ?? FALLBACK_WINDOW;
}

/** Format a token count for display: 1234 → "1.2k", 128000 → "128k". */
export function formatContextSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
