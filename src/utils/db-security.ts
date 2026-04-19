import Database from "better-sqlite3";
import { chmodSync, renameSync, existsSync, statSync } from "fs";

/**
 * Open a sqlite DB with user-only permissions (0o600) on the main file and
 * its WAL/SHM sidecars. Windows: chmod is a no-op but doesn't throw.
 *
 * If the DB file is corrupt, rename it to `<path>.corrupt-<timestamp>` so the
 * app can recover by recreating an empty one instead of crashing at startup.
 */
export function openSecureDatabase(dbPath: string, label: string): Database.Database {
  try {
    const db = new Database(dbPath);
    secureDbFiles(dbPath);
    return db;
  } catch (err: any) {
    if (!existsSync(dbPath)) throw err;
    const suffix = `.corrupt-${Date.now()}`;
    try {
      renameSync(dbPath, dbPath + suffix);
      console.error(`[${label}] database at ${dbPath} was unreadable (${err.message}); moved to ${dbPath + suffix} and recreating.`);
    } catch {
      // If we can't rename, let the original error propagate.
      throw err;
    }
    const db = new Database(dbPath);
    secureDbFiles(dbPath);
    return db;
  }
}

function secureDbFiles(dbPath: string): void {
  for (const path of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
    if (!existsSync(path)) continue;
    try {
      const mode = statSync(path).mode & 0o777;
      if (mode !== 0o600) chmodSync(path, 0o600);
    } catch {
      // chmod fails on Windows / some network FS — not fatal.
    }
  }
}
