import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { openSecureDatabase } from "./db-security.js";

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const DB_PATH = join(CONFIG_DIR, "sessions.db");

let db: Database.Database | null = null;

/**
 * Initialize the database and create tables if needed
 */
function getDb(): Database.Database {
  if (db) return db;

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  db = openSecureDatabase(DB_PATH, "sessions");

  // Enable WAL mode for better concurrent performance
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 0,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id, id);
  `);

  // Migrate: add cost columns if missing (for existing DBs)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN estimated_cost REAL NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  return db;
}

/**
 * Generate a short session ID (8 chars)
 */
function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Create a new session
 */
export function createSession(cwd: string, model: string): string {
  const db = getDb();
  const id = generateId();

  db.prepare(`
    INSERT INTO sessions (id, cwd, model) VALUES (?, ?, ?)
  `).run(id, cwd, model);

  return id;
}

/**
 * Save a message to a session
 */
export function saveMessage(sessionId: string, message: ChatCompletionMessageParam): void {
  const db = getDb();

  const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  const toolCalls = "tool_calls" in message && message.tool_calls
    ? JSON.stringify(message.tool_calls)
    : null;
  const toolCallId = "tool_call_id" in message ? (message as any).tool_call_id : null;

  // Insert + count + metadata update must be atomic so concurrent writers
  // don't leave message_count stale relative to the row count.
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, message.role, content, toolCalls, toolCallId);

    const stats = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE session_id = ?
    `).get(sessionId) as { count: number };

    db.prepare(`
      UPDATE sessions SET updated_at = datetime('now'), message_count = ? WHERE id = ?
    `).run(stats.count, sessionId);
  });
  tx();
}

/**
 * Update token estimate for a session
 */
export function updateTokenEstimate(sessionId: string, tokens: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET token_estimate = ? WHERE id = ?
  `).run(tokens, sessionId);
}

/**
 * List recent sessions
 */
export interface SessionInfo {
  id: string;
  cwd: string;
  model: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  token_estimate: number;
  summary: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost: number;
}

export function listSessions(limit: number = 10): SessionInfo[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?
  `).all(limit) as SessionInfo[];
}

/**
 * Load all messages for a session
 */
export function loadMessages(sessionId: string): ChatCompletionMessageParam[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT role, content, tool_calls, tool_call_id FROM messages
    WHERE session_id = ? ORDER BY id ASC
  `).all(sessionId) as Array<{
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
  }>;

  return rows.map((row) => {
    let content: any = row.content;
    if (typeof content === "string" && (content.startsWith("[") || content.startsWith("{"))) {
      try { content = JSON.parse(content); } catch { /* keep as string */ }
    }
    const msg: any = { role: row.role, content };

    if (row.tool_calls) {
      try {
        msg.tool_calls = JSON.parse(row.tool_calls);
      } catch { /* ignore */ }
    }

    if (row.tool_call_id) {
      msg.tool_call_id = row.tool_call_id;
    }

    return msg as ChatCompletionMessageParam;
  });
}

/**
 * Get a specific session
 */
export function getSession(sessionId: string): SessionInfo | null {
  const db = getDb();
  return (db.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `).get(sessionId) as SessionInfo) || null;
}

/**
 * Delete a session and its messages
 */
export function deleteSession(sessionId: string): boolean {
  const db = getDb();
  db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(sessionId);
  const result = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  return result.changes > 0;
}

/**
 * Update cost tracking for a session
 */
export function updateSessionCost(
  sessionId: string,
  promptTokens: number,
  completionTokens: number,
  estimatedCost: number
): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET prompt_tokens = ?, completion_tokens = ?, estimated_cost = ? WHERE id = ?
  `).run(promptTokens, completionTokens, estimatedCost, sessionId);
}

/**
 * Update session summary (for context compression)
 */
export function updateSummary(sessionId: string, summary: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET summary = ? WHERE id = ?
  `).run(summary, sessionId);
}

/**
 * Get the most recent session for a given cwd
 */
export function getLastSession(cwd: string): SessionInfo | null {
  const db = getDb();
  return (db.prepare(`
    SELECT * FROM sessions WHERE cwd = ? ORDER BY updated_at DESC LIMIT 1
  `).get(cwd) as SessionInfo) || null;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
