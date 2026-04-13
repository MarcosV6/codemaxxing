import { describe, expect, it } from "vitest";
import { assessModelReliability, formatModelReliabilityLine } from "../src/utils/provider-health.js";

describe("provider health", () => {
  it("marks strong coding models as strong", () => {
    const assessment = assessModelReliability("gpt-5.4", "https://api.openai.com/v1");
    expect(assessment.level).toBe("strong");
    expect(formatModelReliabilityLine("gpt-5.4", "https://api.openai.com/v1")).toContain("strong");
  });

  it("marks tiny local tool models as risky", () => {
    const assessment = assessModelReliability("qwen2.5-coder:3b", "http://localhost:11434/v1");
    expect(assessment.level).toBe("risky");
    expect(assessment.summary).toContain("struggle");
  });

  it("treats middling unknown models as okay", () => {
    const assessment = assessModelReliability("custom-model-12b", "https://example.com/v1");
    expect(assessment.level).toBe("okay");
  });
});
