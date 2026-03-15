import { describe, expect, it } from "vitest";
import { detectProviderType } from "../src/config.js";

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
