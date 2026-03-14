import os from "os";
import { execSync } from "child_process";

export interface HardwareInfo {
  cpu: { name: string; cores: number; speed: number };
  ram: number; // bytes
  gpu: { name: string; vram: number } | null; // vram in bytes, null if no GPU
  os: "macos" | "linux" | "windows";
  appleSilicon: boolean;
}

function getOS(): "macos" | "linux" | "windows" {
  switch (process.platform) {
    case "darwin": return "macos";
    case "win32": return "windows";
    default: return "linux";
  }
}

function getCPU(): { name: string; cores: number; speed: number } {
  const cpus = os.cpus();
  return {
    name: cpus[0]?.model?.trim() ?? "Unknown CPU",
    cores: cpus.length,
    speed: cpus[0]?.speed ?? 0, // MHz
  };
}

function getGPU(platform: "macos" | "linux" | "windows"): { name: string; vram: number } | null {
  try {
    if (platform === "macos") {
      const raw = execSync("system_profiler SPDisplaysDataType -json", {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const data = JSON.parse(raw);
      const displays = data?.SPDisplaysDataType;
      if (Array.isArray(displays) && displays.length > 0) {
        const gpu = displays[0];
        const name: string = gpu.sppci_model ?? gpu._name ?? "Unknown GPU";
        // On Apple Silicon, VRAM is shared (unified memory) — report total RAM
        const vramStr: string = gpu["spdisplays_vram"] ?? gpu["spdisplays_vram_shared"] ?? "";
        let vram = 0;
        if (vramStr) {
          const match = vramStr.match(/(\d+)\s*(GB|MB)/i);
          if (match) {
            vram = parseInt(match[1]) * (match[2].toUpperCase() === "GB" ? 1024 * 1024 * 1024 : 1024 * 1024);
          }
        }
        // Apple Silicon unified memory — use total RAM as VRAM
        if (vram === 0 && name.toLowerCase().includes("apple")) {
          vram = os.totalmem();
        }
        return { name, vram };
      }
    }

    if (platform === "linux") {
      // Try NVIDIA first
      try {
        const raw = execSync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const line = raw.trim().split("\n")[0];
        if (line) {
          const parts = line.split(",").map(s => s.trim());
          const name = parts[0] ?? "NVIDIA GPU";
          const memMatch = (parts[1] ?? "").match(/(\d+)/);
          const vram = memMatch ? parseInt(memMatch[1]) * 1024 * 1024 : 0; // MiB to bytes
          return { name, vram };
        }
      } catch {
        // No NVIDIA, try lspci
        try {
          const raw = execSync("lspci | grep -i vga", {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const line = raw.trim().split("\n")[0];
          if (line) {
            const name = line.split(":").slice(2).join(":").trim() || "Unknown GPU";
            return { name, vram: 0 };
          }
        } catch { /* no lspci */ }
      }
    }

    if (platform === "windows") {
      try {
        const raw = execSync("wmic path win32_VideoController get Name,AdapterRAM /format:csv", {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const lines = raw.trim().split("\n").filter(l => l.trim() && !l.startsWith("Node"));
        if (lines.length > 0) {
          const parts = lines[0].split(",");
          const adapterRAM = parseInt(parts[1] ?? "0");
          const name = parts[2]?.trim() ?? "Unknown GPU";
          return { name, vram: isNaN(adapterRAM) ? 0 : adapterRAM };
        }
      } catch { /* no wmic */ }
    }
  } catch {
    // GPU detection failed
  }
  return null;
}

export function detectHardware(): HardwareInfo {
  const platform = getOS();
  const cpu = getCPU();
  const ram = os.totalmem();
  const gpu = getGPU(platform);

  // Detect Apple Silicon
  const appleSilicon = platform === "macos" && /apple\s+m/i.test(cpu.name);

  return { cpu, ram, gpu, os: platform, appleSilicon };
}

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
