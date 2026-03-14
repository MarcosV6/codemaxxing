import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/** Get known Ollama binary paths for Windows */
function getWindowsOllamaPaths(): string[] {
  const paths: string[] = [];
  const localAppData = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || "", "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  paths.push(join(localAppData, "Programs", "Ollama", "ollama.exe"));
  paths.push(join(programFiles, "Ollama", "ollama.exe"));
  paths.push(join(localAppData, "Ollama", "ollama.exe"));
  return paths;
}

/** Check if ollama binary exists on PATH, known install locations, or server is running */
export function isOllamaInstalled(): boolean {
  // Check PATH first
  try {
    const cmd = process.platform === "win32" ? "where ollama" : "which ollama";
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
    return true;
  } catch {}

  // Check known install paths on Windows
  if (process.platform === "win32") {
    if (getWindowsOllamaPaths().some(p => existsSync(p))) return true;
  }

  // Check if the server is responding (if server is running, Ollama is definitely installed)
  try {
    execSync("curl -s http://localhost:11434/api/tags", {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    });
    return true;
  } catch {}

  // Check if ollama process is running (Windows)
  if (process.platform === "win32") {
    try {
      const result = execSync("tasklist /fi \"imagename eq ollama app.exe\" /fo csv /nh", {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 3000,
      });
      if (result.toString().toLowerCase().includes("ollama")) return true;
    } catch {}
  }

  return false;
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

/** Find the ollama binary path */
function findOllamaBinary(): string {
  // Try PATH first
  try {
    const cmd = process.platform === "win32" ? "where ollama" : "which ollama";
    return execSync(cmd, { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 }).toString().trim().split("\n")[0];
  } catch {}
  // Check known Windows paths
  if (process.platform === "win32") {
    for (const p of getWindowsOllamaPaths()) {
      if (existsSync(p)) return p;
    }
  }
  return "ollama"; // fallback, hope for the best
}

/** Start ollama serve in background */
export function startOllama(): void {
  const bin = findOllamaBinary();
  const child = spawn(bin, ["serve"], {
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
 * Pull a model from Ollama registry via HTTP API.
 * Falls back to CLI if API fails.
 * Calls onProgress with download updates.
 */
export function pullModel(
  modelId: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  // Try HTTP API first (works even when CLI isn't on PATH)
  return pullModelViaAPI(modelId, onProgress).catch(() => {
    // Fallback to CLI
    return pullModelViaCLI(modelId, onProgress);
  });
}

function pullModelViaAPI(
  modelId: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch("http://localhost:11434/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelId, stream: true }),
      });
      if (!res.ok || !res.body) {
        reject(new Error(`Ollama API returned ${res.status}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status === "success") {
              onProgress?.({ status: "success", percent: 100 });
              resolve();
              return;
            }
            if (data.total && data.completed) {
              const percent = Math.round((data.completed / data.total) * 100);
              onProgress?.({ status: "downloading", total: data.total, completed: data.completed, percent });
            } else {
              onProgress?.({ status: data.status || "working...", percent: 0 });
            }
          } catch {}
        }
      }
      resolve();
    } catch (err: any) {
      reject(err);
    }
  });
}

function pullModelViaCLI(
  modelId: string,
  onProgress?: (progress: PullProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = findOllamaBinary();
    const child = spawn(bin, ["pull", modelId], {
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

export interface OllamaModelInfo {
  name: string;
  size: number; // bytes
  modified_at: string;
  digest: string;
}

/** List models installed in Ollama with detailed info */
export async function listInstalledModelsDetailed(): Promise<OllamaModelInfo[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { models?: Array<{ name: string; size: number; modified_at: string; digest: string }> };
      return (data.models ?? []).map((m) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
        digest: m.digest,
      }));
    }
  } catch { /* not running */ }
  return [];
}

/** List models installed in Ollama */
export async function listInstalledModels(): Promise<string[]> {
  const models = await listInstalledModelsDetailed();
  return models.map((m) => m.name);
}

/** Stop all loaded models (frees VRAM) and kill the Ollama server process */
export async function stopOllama(): Promise<{ ok: boolean; message: string }> {
  try {
    // First unload all models from memory
    try {
      const bin = findOllamaBinary();
      const { spawnSync } = require("child_process");
      spawnSync(bin, ["stop"], { stdio: "pipe", timeout: 5000 });
    } catch { /* may fail if no models loaded */ }

    // Kill the server process
    if (process.platform === "win32") {
      execSync("taskkill /f /im ollama.exe", { stdio: ["pipe", "pipe", "pipe"], timeout: 5000 });
    } else if (process.platform === "darwin") {
      // Try launchctl first (Ollama app), then pkill
      try {
        execSync("launchctl stop com.ollama.ollama", { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
      } catch {
        try {
          execSync("pkill ollama", { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
        } catch { /* already stopped */ }
      }
    } else {
      // Linux
      try {
        execSync("systemctl stop ollama", { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
      } catch {
        try {
          execSync("pkill ollama", { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 });
        } catch { /* already stopped */ }
      }
    }

    // Verify it stopped
    await new Promise(r => setTimeout(r, 500));
    const stillRunning = await isOllamaRunning();
    if (stillRunning) {
      return { ok: false, message: "Ollama is still running. Try killing it manually." };
    }
    return { ok: true, message: "Ollama stopped." };
  } catch (err: any) {
    return { ok: false, message: `Failed to stop Ollama: ${err.message}` };
  }
}

/** Delete a model from disk */
export function deleteModel(modelId: string): { ok: boolean; message: string } {
  try {
    const bin = findOllamaBinary();
    execSync(`"${bin}" rm ${modelId}`, { stdio: ["pipe", "pipe", "pipe"], timeout: 30000 });
    return { ok: true, message: `Deleted ${modelId}` };
  } catch (err: any) {
    return { ok: false, message: `Failed to delete ${modelId}: ${err.stderr?.toString().trim() || err.message}` };
  }
}

/** Get GPU memory usage info (best-effort) */
export function getGPUMemoryUsage(): string | null {
  try {
    if (process.platform === "darwin") {
      // Apple Silicon — check memory pressure
      const raw = execSync("memory_pressure", { encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] });
      const match = raw.match(/System-wide memory free percentage:\s*(\d+)%/);
      if (match) {
        return `${100 - parseInt(match[1])}% system memory in use`;
      }
      return null;
    }
    // NVIDIA GPU
    const raw = execSync("nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits", {
      encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"],
    });
    const parts = raw.trim().split(",").map(s => s.trim());
    if (parts.length === 2) {
      return `${parts[0]} MiB / ${parts[1]} MiB GPU memory`;
    }
  } catch { /* no GPU info available */ }
  return null;
}
