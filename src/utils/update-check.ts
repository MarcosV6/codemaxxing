import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const CACHE_FILE = join(homedir(), ".codemaxxing", "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCache {
  lastCheck: number;
  latestVersion: string | null;
}

function loadCache(): UpdateCache {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch {}
  return { lastCheck: 0, latestVersion: null };
}

function saveCache(cache: UpdateCache): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf-8");
  } catch {}
}

/**
 * Check if a newer version of codemaxxing is available on npm.
 * Returns the latest version string if newer, or null if up to date.
 * Non-blocking — silently returns null on any error.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  const cache = loadCache();

  // Use cached result if checked recently
  if (Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) {
    if (cache.latestVersion && isNewer(cache.latestVersion, currentVersion)) {
      return cache.latestVersion;
    }
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://registry.npmjs.org/codemaxxing/latest", {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json() as { version?: string };
    const latest = data.version;

    saveCache({ lastCheck: Date.now(), latestVersion: latest || null });

    if (latest && isNewer(latest, currentVersion)) {
      return latest;
    }
  } catch {
    // Network error — silently ignore
    saveCache({ lastCheck: Date.now(), latestVersion: cache.latestVersion });
  }

  return null;
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}
