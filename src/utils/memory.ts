import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { openSecureDatabase } from "./db-security.js";

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const MEMORY_DB_PATH = join(CONFIG_DIR, "memory.db");

let memDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (memDb) return memDb;

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  memDb = openSecureDatabase(MEMORY_DB_PATH, "memory");
  memDb.pragma("journal_mode = WAL");

  memDb.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('user', 'project', 'workflow', 'preference', 'fact')),
      scope TEXT NOT NULL DEFAULT 'global',
      key TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      UNIQUE(type, scope, key)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      key, content, type, scope,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memory_fts(rowid, key, content, type, scope)
      VALUES (new.id, new.key, new.content, new.type, new.scope);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, key, content, type, scope)
      VALUES ('delete', old.id, old.key, old.content, old.type, old.scope);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, key, content, type, scope)
      VALUES ('delete', old.id, old.key, old.content, old.type, old.scope);
      INSERT INTO memory_fts(rowid, key, content, type, scope)
      VALUES (new.id, new.key, new.content, new.type, new.scope);
    END;

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
  `);

  return memDb;
}

// ── Types ──

export type MemoryType = "user" | "project" | "workflow" | "preference" | "fact";

export interface Memory {
  id: number;
  type: MemoryType;
  scope: string;
  key: string;
  content: string;
  importance: number;
  access_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

// ── Public API ──

/**
 * Store or update a memory. Upserts on (type, scope, key).
 */
export function remember(
  type: MemoryType,
  key: string,
  content: string,
  options: {
    scope?: string;
    importance?: number;
    expiresAt?: string;
  } = {}
): Memory {
  const db = getDb();
  const scope = options.scope ?? "global";
  const importance = options.importance ?? 0.5;
  const expiresAt = options.expiresAt ?? null;

  db.prepare(`
    INSERT INTO memories (type, scope, key, content, importance, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(type, scope, key) DO UPDATE SET
      content = excluded.content,
      importance = excluded.importance,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(type, scope, key, content, importance, expiresAt);

  return db.prepare(`
    SELECT * FROM memories WHERE type = ? AND scope = ? AND key = ?
  `).get(type, scope, key) as Memory;
}

/**
 * Recall memories by full-text search.
 */
export function recall(query: string, options: {
  type?: MemoryType;
  scope?: string;
  limit?: number;
} = {}): Memory[] {
  const db = getDb();
  const limit = options.limit ?? 20;

  // Clean expired memories first
  db.prepare(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`).run();

  let sql: string;
  const params: any[] = [];

  if (query.trim()) {
    // FTS search
    sql = `
      SELECT m.* FROM memories m
      JOIN memory_fts f ON m.id = f.rowid
      WHERE memory_fts MATCH ?
    `;
    // FTS5 query — escape special chars
    params.push(query.replace(/['"(){}[\]^~*:]/g, " ").trim() + "*");
  } else {
    sql = `SELECT * FROM memories WHERE 1=1`;
  }

  if (options.type) {
    sql += ` AND m.type = ?`;
    params.push(options.type);
  }
  if (options.scope) {
    sql += ` AND m.scope = ?`;
    params.push(options.scope);
  }

  sql += ` ORDER BY m.importance DESC, m.updated_at DESC LIMIT ?`;
  params.push(limit);

  const results = db.prepare(sql).all(...params) as Memory[];

  // Bump access count
  const bumpStmt = db.prepare(`UPDATE memories SET access_count = access_count + 1 WHERE id = ?`);
  for (const mem of results) {
    bumpStmt.run(mem.id);
  }

  return results;
}

/**
 * Get all memories for a scope (e.g., project-specific).
 */
export function getMemories(options: {
  type?: MemoryType;
  scope?: string;
  limit?: number;
} = {}): Memory[] {
  const db = getDb();
  const limit = options.limit ?? 50;

  // Clean expired
  db.prepare(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now')`).run();

  let sql = `SELECT * FROM memories WHERE 1=1`;
  const params: any[] = [];

  if (options.type) {
    sql += ` AND type = ?`;
    params.push(options.type);
  }
  if (options.scope) {
    sql += ` AND scope = ?`;
    params.push(options.scope);
  }

  sql += ` ORDER BY importance DESC, updated_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params) as Memory[];
}

/**
 * Delete a specific memory by ID.
 */
export function forget(id: number): boolean {
  const db = getDb();
  const result = db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return result.changes > 0;
}

/**
 * Delete memories by key pattern.
 */
export function forgetByKey(key: string, type?: MemoryType): number {
  const db = getDb();
  let sql = `DELETE FROM memories WHERE key LIKE ?`;
  const params: any[] = [`%${key}%`];
  if (type) {
    sql += ` AND type = ?`;
    params.push(type);
  }
  return db.prepare(sql).run(...params).changes;
}

/**
 * Build a memory context string to inject into the system prompt.
 * Returns the most relevant memories for the current project.
 */
export function buildMemoryContext(cwd: string): string {
  const projectScope = cwd.replace(/\//g, "_").replace(/^_/, "");

  // Get global user/preference memories
  const globalMems = getMemories({ scope: "global", limit: 15 });
  // Get project-specific memories
  const projectMems = getMemories({ scope: projectScope, limit: 15 });

  if (globalMems.length === 0 && projectMems.length === 0) return "";

  const lines: string[] = ["\n\n## Persistent Memory"];
  lines.push("The following is remembered from past sessions. Use this context but do not mention it unprompted.\n");

  if (globalMems.length > 0) {
    lines.push("### User & Global");
    for (const m of globalMems) {
      lines.push(`- [${m.type}] ${m.key}: ${m.content}`);
    }
  }

  if (projectMems.length > 0) {
    lines.push("\n### This Project");
    for (const m of projectMems) {
      lines.push(`- [${m.type}] ${m.key}: ${m.content}`);
    }
  }

  return lines.join("\n");
}

/**
 * Get memory stats.
 */
export function getMemoryStats(): { total: number; byType: Record<string, number>; byScope: Record<string, number> } {
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) as count FROM memories`).get() as any).count;

  const byType: Record<string, number> = {};
  const typeRows = db.prepare(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`).all() as any[];
  for (const row of typeRows) byType[row.type] = row.count;

  const byScope: Record<string, number> = {};
  const scopeRows = db.prepare(`SELECT scope, COUNT(*) as count FROM memories GROUP BY scope`).all() as any[];
  for (const row of scopeRows) byScope[row.scope] = row.count;

  return { total, byType, byScope };
}

/**
 * Generate a memory nudge prompt for the agent to evaluate what to persist.
 * Called periodically during long conversations.
 */
export function getMemoryNudgePrompt(): string {
  return `[MEMORY CHECK] Before your next reply, scan the recent conversation for durable facts worth persisting across sessions, then call remember_memory for each one. You MUST call remember_memory at least once if any of these apply:
- The user told you how they like to work, their role, tools, or preferences
- The user corrected you ("don't do X", "stop doing Y")
- You learned a non-obvious fact about this project: architecture, conventions, test commands, deploy steps, key file locations
- A multi-step workflow just succeeded that you'd want to repeat
Use type="user" for personal preferences, "project" for repo-specific facts, "preference" for cross-project coding style, "workflow" for repeatable procedures, "fact" for everything else. Keep the content field to ~1 sentence. If nothing qualifies, say so in one line and skip the tool.`;
}
