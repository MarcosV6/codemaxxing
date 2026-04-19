import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { CodingAgent, type AgentOptions } from "./core/agent.js";
import { getSession, listSessions, type SessionInfo } from "./utils/sessions.js";
import { openSecureDatabase } from "./utils/db-security.js";

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const AGENTS_DB_PATH = join(CONFIG_DIR, "background-agents.db");

let agentsDb: Database.Database | null = null;

/**
 * Initialize background agents database
 */
function getAgentsDb(): Database.Database {
  if (agentsDb) return agentsDb;

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  agentsDb = openSecureDatabase(AGENTS_DB_PATH, "background-agents");
  agentsDb.pragma("journal_mode = WAL");

  agentsDb.exec(`
    CREATE TABLE IF NOT EXISTS background_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      model TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      prompt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      paused_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      iterations INTEGER NOT NULL DEFAULT 0,
      max_iterations INTEGER NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS agent_state (
      agent_id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      last_checkpoint TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES background_agents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agents_status ON background_agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_cwd ON background_agents(cwd);
  `);

  return agentsDb;
}

/**
 * Background agent state (tracks running agents in memory)
 */
interface BackgroundAgentRuntime {
  agent: CodingAgent;
  agentRecord: BackgroundAgentRecord;
  abortController: AbortController;
}

const RUNNING_AGENTS = new Map<string, BackgroundAgentRuntime>();

/**
 * Database record for a background agent
 */
export interface BackgroundAgentRecord {
  id: string;
  name: string;
  cwd: string;
  model: string;
  session_id: string | null;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  prompt: string;
  created_at: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  iterations: number;
  max_iterations: number;
}

/**
 * Create and start a new background agent
 * @param name - Friendly name for the agent
 * @param cwd - Working directory
 * @param prompt - Initial prompt/task
 * @param agentOptions - Agent configuration (provider, model, etc.)
 * @param maxIterations - Max iterations before pausing
 */
export async function createBackgroundAgent(
  name: string,
  cwd: string,
  prompt: string,
  agentOptions: AgentOptions,
  maxIterations: number = 10
): Promise<BackgroundAgentRecord> {
  const db = getAgentsDb();
  const agentId = randomUUID().slice(0, 8);

  // Create agent instance
  const agent = new CodingAgent(agentOptions);
  await agent.init();

  const sessionId = agent.getSessionId();

  // Insert record
  const stmt = db.prepare(`
    INSERT INTO background_agents (id, name, cwd, model, session_id, prompt, max_iterations)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(agentId, name, cwd, agentOptions.provider.model, sessionId, prompt, maxIterations);

  const record = getBackgroundAgent(agentId)!;

  // Store runtime reference
  RUNNING_AGENTS.set(agentId, {
    agent,
    agentRecord: record,
    abortController: new AbortController(),
  });

  return record;
}

/**
 * Start execution of a background agent
 */
export async function startBackgroundAgent(agentId: string): Promise<void> {
  const db = getAgentsDb();
  const runtime = RUNNING_AGENTS.get(agentId);

  if (!runtime) {
    throw new Error(`Background agent ${agentId} not found in runtime`);
  }

  const { agent, agentRecord } = runtime;

  // Update status
  db.prepare(`
    UPDATE background_agents SET status = 'running', started_at = datetime('now') WHERE id = ?
  `).run(agentId);

  try {
    // Run the initial prompt
    const response = await agent.send(agentRecord.prompt);

    // Checkpoint state
    checkpointAgentState(agentId, agent);

    // Increment iterations
    db.prepare(`
      UPDATE background_agents SET iterations = iterations + 1 WHERE id = ?
    `).run(agentId);

    // Check if we've hit the iteration limit
    const updated = getBackgroundAgent(agentId)!;
    if (updated.iterations >= updated.max_iterations) {
      db.prepare(`
        UPDATE background_agents SET status = 'paused' WHERE id = ?
      `).run(agentId);
      console.log(`Agent ${agentId} paused after ${updated.iterations} iterations`);
    }
  } catch (err: any) {
    db.prepare(`
      UPDATE background_agents SET status = 'failed', error_message = ? WHERE id = ?
    `).run(err.message, agentId);
  }
}

/**
 * Pause a running background agent
 */
export function pauseBackgroundAgent(agentId: string): void {
  const db = getAgentsDb();
  const runtime = RUNNING_AGENTS.get(agentId);

  if (runtime) {
    runtime.abortController.abort();
    runtime.agent.abort();
  }

  db.prepare(`
    UPDATE background_agents SET status = 'paused', paused_at = datetime('now') WHERE id = ?
  `).run(agentId);
}

/**
 * Resume a paused background agent
 */
export async function resumeBackgroundAgent(agentId: string): Promise<void> {
  const record = getBackgroundAgent(agentId);
  if (!record) throw new Error(`Agent ${agentId} not found`);

  if (record.status !== "paused") {
    throw new Error(`Can only resume paused agents. Current status: ${record.status}`);
  }

  // Restore agent state from checkpoint
  const runtime = RUNNING_AGENTS.get(agentId);
  if (!runtime) {
    throw new Error(`Agent ${agentId} not in runtime. Create a new session to resume.`);
  }

  // Resume execution
  await startBackgroundAgent(agentId);
}

/**
 * Send a follow-up message to a background agent
 */
export async function messageBackgroundAgent(agentId: string, message: string): Promise<void> {
  const runtime = RUNNING_AGENTS.get(agentId);
  if (!runtime) {
    throw new Error(`Agent ${agentId} not running`);
  }

  const { agent } = runtime;
  const response = await agent.send(message);

  const db = getAgentsDb();
  db.prepare(`
    UPDATE background_agents SET iterations = iterations + 1 WHERE id = ?
  `).run(agentId);

  checkpointAgentState(agentId, agent);
}

/**
 * Get background agent by ID
 */
export function getBackgroundAgent(agentId: string): BackgroundAgentRecord | null {
  const db = getAgentsDb();
  return (db.prepare(`
    SELECT * FROM background_agents WHERE id = ?
  `).get(agentId) as BackgroundAgentRecord) || null;
}

/**
 * List all background agents
 */
export function listBackgroundAgents(cwd?: string): BackgroundAgentRecord[] {
  const db = getAgentsDb();
  if (cwd) {
    return db.prepare(`
      SELECT * FROM background_agents WHERE cwd = ? ORDER BY created_at DESC
    `).all(cwd) as BackgroundAgentRecord[];
  }
  return db.prepare(`
    SELECT * FROM background_agents ORDER BY created_at DESC
  `).all() as BackgroundAgentRecord[];
}

/**
 * List agents by status
 */
export function getAgentsByStatus(status: string): BackgroundAgentRecord[] {
  const db = getAgentsDb();
  return db.prepare(`
    SELECT * FROM background_agents WHERE status = ? ORDER BY updated_at DESC
  `).all(status) as BackgroundAgentRecord[];
}

/**
 * Delete a background agent and its state
 */
export function deleteBackgroundAgent(agentId: string): void {
  const db = getAgentsDb();
  const runtime = RUNNING_AGENTS.get(agentId);

  if (runtime) {
    runtime.agent.abort();
    RUNNING_AGENTS.delete(agentId);
  }

  db.prepare(`DELETE FROM agent_state WHERE agent_id = ?`).run(agentId);
  db.prepare(`DELETE FROM background_agents WHERE id = ?`).run(agentId);
}

/**
 * Checkpoint agent state (save messages for resume)
 */
function checkpointAgentState(agentId: string, agent: CodingAgent): void {
  const db = getAgentsDb();
  // For now, we rely on the session's SQLite storage
  // In future, could add incremental checkpoints here
  db.prepare(`
    UPDATE background_agents SET paused_at = datetime('now') WHERE id = ?
  `).run(agentId);
}

/**
 * Mark agent as completed
 */
export function completeBackgroundAgent(agentId: string): void {
  const db = getAgentsDb();
  db.prepare(`
    UPDATE background_agents SET status = 'completed', completed_at = datetime('now') WHERE id = ?
  `).run(agentId);
}

/**
 * Get runtime status of an agent (if currently running)
 */
export function getAgentRuntimeStatus(agentId: string): {
  running: boolean;
  iterationsSoFar: number;
  maxIterations: number;
} | null {
  const record = getBackgroundAgent(agentId);
  if (!record) return null;

  return {
    running: record.status === "running",
    iterationsSoFar: record.iterations,
    maxIterations: record.max_iterations,
  };
}

/**
 * Close database connection
 */
export function closeAgentsDb(): void {
  if (agentsDb) {
    agentsDb.close();
    agentsDb = null;
  }
}
