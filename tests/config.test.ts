import { describe, expect, it } from "vitest";
import {
  detectProviderType,
  getActiveProviderProfileKey,
  getModelListFallback,
  listProviderProfiles,
  normalizeListedModels,
} from "../src/config.js";

describe("detectProviderType", () => {
  it("uses anthropic transport only for native Anthropic API", () => {
    expect(detectProviderType("anthropic", "https://api.anthropic.com/v1")).toBe("anthropic");
    expect(detectProviderType("custom", "https://api.anthropic.com/v1")).toBe("anthropic");
  });

  it("keeps OpenAI-compatible providers on openai transport", () => {
    expect(detectProviderType("openrouter", "https://openrouter.ai/api/v1")).toBe("openai");
    expect(detectProviderType("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/")).toBe("openai");
    expect(detectProviderType("local", "http://localhost:1234/v1")).toBe("openai");
  });
});

describe("provider profile helpers", () => {
  it("finds the active provider profile from config", () => {
    const config = {
      provider: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "x",
        model: "openai/gpt-4o",
        type: "openai" as const,
      },
      providers: {
        local: {
          name: "Local",
          baseUrl: "http://localhost:1234/v1",
          apiKey: "not-needed",
          model: "auto",
          type: "openai" as const,
        },
        openrouter: {
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "x",
          model: "openai/gpt-4o",
          type: "openai" as const,
        },
      },
      defaults: {
        autoApprove: false,
        contextFiles: 20,
        maxTokens: 8192,
      },
    };

    expect(getActiveProviderProfileKey(config)).toBe("openrouter");
    const profiles = listProviderProfiles(config);
    expect(profiles.find((p) => p.key === "openrouter")?.active).toBe(true);
    expect(profiles.find((p) => p.key === "local")?.active).toBe(false);
  });
});

describe("remote model list helpers", () => {
  it("filters out obvious non-chat models by id", () => {
    expect(normalizeListedModels("https://example.com/v1", {
      data: [
        { id: "gpt-4.1" },
        { id: "text-embedding-3-large" },
        { id: "rerank-v1" },
        { id: "gpt-4o-mini" },
      ],
    })).toEqual(["gpt-4.1", "gpt-4o-mini"]);
  });

  it("provides a Qwen fallback list for DashScope-compatible endpoints", () => {
    expect(getModelListFallback("https://dashscope.aliyuncs.com/compatible-mode/v1")).toContain("qwen3-coder-plus");
    expect(getModelListFallback("https://api.openai.com/v1")).toEqual([]);
  });
});
