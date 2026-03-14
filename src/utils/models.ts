import { execSync } from "child_process";
import type { HardwareInfo } from "./hardware.js";

export interface RecommendedModel {
  name: string;           // Display name
  ollamaId: string;       // Ollama model ID
  size: number;           // Download size in GB
  ramRequired: number;    // Minimum RAM in GB
  vramOptimal: number;    // Optimal VRAM in GB (0 = CPU fine)
  description: string;    // One-liner
  speed: string;          // e.g., "~45 tok/s on M1"
  quality: "good" | "great" | "best";
}

export type ModelFit = "perfect" | "good" | "tight" | "skip";

export interface ScoredModel extends RecommendedModel {
  fit: ModelFit;
}

const MODELS: RecommendedModel[] = [
  {
    name: "Qwen 2.5 Coder 3B",
    ollamaId: "qwen2.5-coder:3b",
    size: 2,
    ramRequired: 8,
    vramOptimal: 4,
    description: "Lightweight, fast coding model",
    speed: "~60 tok/s on M1",
    quality: "good",
  },
  {
    name: "Qwen 2.5 Coder 7B",
    ollamaId: "qwen2.5-coder:7b",
    size: 5,
    ramRequired: 16,
    vramOptimal: 8,
    description: "Sweet spot for most machines",
    speed: "~45 tok/s on M1",
    quality: "great",
  },
  {
    name: "Qwen 2.5 Coder 14B",
    ollamaId: "qwen2.5-coder:14b",
    size: 9,
    ramRequired: 32,
    vramOptimal: 16,
    description: "High quality coding",
    speed: "~25 tok/s on M1 Pro",
    quality: "best",
  },
  {
    name: "Qwen 2.5 Coder 32B",
    ollamaId: "qwen2.5-coder:32b",
    size: 20,
    ramRequired: 48,
    vramOptimal: 32,
    description: "Premium quality, needs lots of RAM",
    speed: "~12 tok/s on M1 Max",
    quality: "best",
  },
  {
    name: "DeepSeek Coder V2 16B",
    ollamaId: "deepseek-coder-v2:16b",
    size: 9,
    ramRequired: 32,
    vramOptimal: 16,
    description: "Strong alternative for coding",
    speed: "~30 tok/s on M1 Pro",
    quality: "great",
  },
  {
    name: "CodeLlama 7B",
    ollamaId: "codellama:7b",
    size: 4,
    ramRequired: 16,
    vramOptimal: 8,
    description: "Meta's coding model",
    speed: "~40 tok/s on M1",
    quality: "good",
  },
  {
    name: "StarCoder2 7B",
    ollamaId: "starcoder2:7b",
    size: 4,
    ramRequired: 16,
    vramOptimal: 8,
    description: "Good for code completion",
    speed: "~40 tok/s on M1",
    quality: "good",
  },
];

function scoreModel(model: RecommendedModel, ramGB: number, vramGB: number): ModelFit {
  if (ramGB < model.ramRequired) return "skip";

  const ramHeadroom = ramGB - model.ramRequired;
  const hasGoodVRAM = vramGB >= model.vramOptimal;

  if (hasGoodVRAM && ramHeadroom >= 4) return "perfect";
  if (hasGoodVRAM || ramHeadroom >= 8) return "good";
  if (ramHeadroom >= 0) return "tight";
  return "skip";
}

const qualityOrder: Record<string, number> = { best: 3, great: 2, good: 1 };
const fitOrder: Record<string, number> = { perfect: 4, good: 3, tight: 2, skip: 1 };

export function getRecommendations(hardware: HardwareInfo): ScoredModel[] {
  const ramGB = hardware.ram / (1024 * 1024 * 1024);
  const vramGB = hardware.gpu?.vram ? hardware.gpu.vram / (1024 * 1024 * 1024) : 0;

  // Apple Silicon uses unified memory — VRAM = RAM
  const effectiveVRAM = hardware.appleSilicon ? ramGB : vramGB;

  const scored: ScoredModel[] = MODELS.map((m) => ({
    ...m,
    fit: scoreModel(m, ramGB, effectiveVRAM),
  }));

  // Sort: perfect first, then by quality descending
  scored.sort((a, b) => {
    const fitDiff = (fitOrder[b.fit] ?? 0) - (fitOrder[a.fit] ?? 0);
    if (fitDiff !== 0) return fitDiff;
    return (qualityOrder[b.quality] ?? 0) - (qualityOrder[a.quality] ?? 0);
  });

  return scored;
}

export function getFitIcon(fit: ModelFit): string {
  switch (fit) {
    case "perfect": return "\u2B50"; // ⭐
    case "good": return "\u2705";    // ✅
    case "tight": return "\u26A0\uFE0F";  // ⚠️
    case "skip": return "\u274C";    // ❌
  }
}

/** Check if llmfit binary is available */
export function isLlmfitAvailable(): boolean {
  try {
    const cmd = process.platform === "win32" ? "where llmfit" : "which llmfit";
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

interface LlmfitModel {
  name: string;
  provider: string;
  params_b: number;
  quant: string;
  fit: string;
  estimated_tps: number;
  vram_gb: number;
  ram_gb: number;
}

function mapLlmfitFit(fit: string): ModelFit {
  switch (fit) {
    case "perfect": return "perfect";
    case "good": return "good";
    case "marginal": return "tight";
    default: return "skip";
  }
}

function mapLlmfitQuality(params_b: number): "good" | "great" | "best" {
  if (params_b >= 14) return "best";
  if (params_b >= 7) return "great";
  return "good";
}

/** Get recommendations using llmfit if available, otherwise fall back to hardcoded list */
export function getRecommendationsWithLlmfit(hardware: HardwareInfo): { models: ScoredModel[]; usedLlmfit: boolean } {
  if (!isLlmfitAvailable()) {
    return { models: getRecommendations(hardware), usedLlmfit: false };
  }

  try {
    const raw = execSync("llmfit recommend --use-case coding --format json --limit 10", {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const llmfitModels: LlmfitModel[] = JSON.parse(raw.trim());
    if (!Array.isArray(llmfitModels) || llmfitModels.length === 0) {
      return { models: getRecommendations(hardware), usedLlmfit: false };
    }

    const scored: ScoredModel[] = llmfitModels
      .filter((m) => m.provider === "ollama")
      .map((m) => ({
        name: m.name.split(":")[0]?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + ` ${m.params_b}B`,
        ollamaId: m.name,
        size: Math.ceil(m.vram_gb),
        ramRequired: Math.ceil(m.ram_gb),
        vramOptimal: Math.ceil(m.vram_gb),
        description: `${m.quant} · ~${m.estimated_tps.toFixed(0)} tok/s`,
        speed: `~${m.estimated_tps.toFixed(0)} tok/s`,
        quality: mapLlmfitQuality(m.params_b),
        fit: mapLlmfitFit(m.fit),
      }));

    if (scored.length === 0) {
      return { models: getRecommendations(hardware), usedLlmfit: false };
    }

    return { models: scored, usedLlmfit: true };
  } catch {
    return { models: getRecommendations(hardware), usedLlmfit: false };
  }
}
