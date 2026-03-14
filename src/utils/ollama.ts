import { execSync, spawn } from "child_process";

/** Check if ollama binary exists on PATH */
export function isOllamaInstalled(): boolean {
  try {
    const cmd = process.platform === "win32" ? "where ollama" : "which ollama";
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Check if ollama server is responding */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Get the install command for the user's OS */
export function getOllamaInstallCommand(os: "macos" | "linux" | "windows"): string {
  switch (os) {
    case "macos": return "brew install ollama";
    case "linux": return "curl -fsSL https://ollama.com/install.sh | sh";
    case "windows": return "winget install Ollama.Ollama";
  }
}

/** Start ollama serve in background */
export function startOllama(): void {
  const child = spawn("ollama", ["serve"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export interface PullProgress {
  status: string;
  total?: number;
  completed?: number;
  percent: number;
}

/**
 * Pull a model from Ollama registry.
 * Calls onProgress with download updates.
 * Returns a promise that resolves when complete.
 */
export function pullModel(
  modelId: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ollama", ["pull", modelId], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let lastOutput = "";

    const parseLine = (data: string) => {
      lastOutput = data;
      // Ollama pull output looks like:
      // pulling manifest
      // pulling abc123... 58% ▕██████████░░░░░░░░░░▏ 2.9 GB/5.0 GB
      // verifying sha256 digest
      // writing manifest
      // success

      // Try to parse percentage
      const pctMatch = data.match(/(\d+)%/);
      const sizeMatch = data.match(/([\d.]+)\s*GB\s*\/\s*([\d.]+)\s*GB/);

      if (pctMatch) {
        const percent = parseInt(pctMatch[1]);
        let completed: number | undefined;
        let total: number | undefined;
        if (sizeMatch) {
          completed = parseFloat(sizeMatch[1]) * 1024 * 1024 * 1024;
          total = parseFloat(sizeMatch[2]) * 1024 * 1024 * 1024;
        }
        onProgress?.({ status: "downloading", total, completed, percent });
      } else if (data.includes("pulling manifest")) {
        onProgress?.({ status: "pulling manifest", percent: 0 });
      } else if (data.includes("verifying")) {
        onProgress?.({ status: "verifying", percent: 100 });
      } else if (data.includes("writing manifest")) {
        onProgress?.({ status: "writing manifest", percent: 100 });
      } else if (data.includes("success")) {
        onProgress?.({ status: "success", percent: 100 });
      }
    };

    child.stdout?.on("data", (data: Buffer) => {
      parseLine(data.toString().trim());
    });

    child.stderr?.on("data", (data: Buffer) => {
      // Ollama writes progress to stderr
      parseLine(data.toString().trim());
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ollama pull failed (exit ${code}): ${lastOutput}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to run ollama pull: ${err.message}`));
    });
  });
}

/** List models installed in Ollama */
export async function listInstalledModels(): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return (data.models ?? []).map((m) => m.name);
    }
  } catch { /* not running */ }
  return [];
}
