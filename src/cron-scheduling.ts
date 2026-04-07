import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import nodeCron, { type ScheduledTask } from "node-cron";
import type { AgentOptions } from "./core/agent.js";
import {
  createBackgroundAgent,
  startBackgroundAgent,
} from "./background-agents.js";

const CONFIG_DIR = join(homedir(), ".codemaxxing");
const CRON_DB_PATH = join(CONFIG_DIR, "cron-jobs.db");

let cronDb: Database.Database | null = null;

function getCronDb(): Database.Database {
  if (cronDb) return cronDb;

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  cronDb = new Database(CRON_DB_PATH);
  cronDb.pragma("journal_mode = WAL");

  cronDb.exec(`
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_run_at TEXT,
      last_agent_id TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS cron_job_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);
    CREATE INDEX IF NOT EXISTS idx_cron_history_job ON cron_job_history(job_id);
  `);

  return cronDb;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface CronJobRecord {
  id: string;
  name: string;
  cwd: string;
  model: string;
  prompt: string;
  cron_expression: string;
  enabled: number;
  created_at: string;
  last_run_at: string | null;
  last_agent_id: string | null;
  error_message: string | null;
}

interface CronJobRuntime {
  task: ScheduledTask;
  record: CronJobRecord;
  agentOptions: AgentOptions;
}

// ── Runtime registry ───────────────────────────────────────────────────────

const ACTIVE_CRON_JOBS = new Map<string, CronJobRuntime>();

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Create and schedule a new cron job.
 *
 * @param name           Human-readable label
 * @param cwd            Working directory the agent will operate in
 * @param model          LLM model name
 * @param prompt         Task prompt run on each tick
 * @param cronExpression Standard 5-part cron expression (e.g. "0 2 * * *")
 * @param agentOptions   Full agent provider/config
 */
export async function createCronJob(
  name: string,
  cwd: string,
  model: string,
  prompt: string,
  cronExpression: string,
  agentOptions: AgentOptions
): Promise<CronJobRecord> {
  if (!nodeCron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: "${cronExpression}"`);
  }

  const db = getCronDb();
  const jobId = randomUUID().slice(0, 8);

  db.prepare(`
    INSERT INTO cron_jobs (id, name, cwd, model, prompt, cron_expression)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobId, name, cwd, model, prompt, cronExpression);

  const record = getCronJob(jobId)!;

  _scheduleTask(jobId, record, agentOptions);

  return record;
}

/**
 * Reschedule (re-activate) a disabled job.
 */
export function enableCronJob(jobId: string, agentOptions: AgentOptions): void {
  const db = getCronDb();
  const record = getCronJob(jobId);
  if (!record) throw new Error(`Cron job ${jobId} not found`);

  _scheduleTask(jobId, record, agentOptions);
  db.prepare(`UPDATE cron_jobs SET enabled = 1 WHERE id = ?`).run(jobId);
}

/**
 * Pause (disable) a cron job without deleting it.
 */
export function disableCronJob(jobId: string): void {
  const db = getCronDb();
  const runtime = ACTIVE_CRON_JOBS.get(jobId);
  if (runtime) {
    runtime.task.stop();
    ACTIVE_CRON_JOBS.delete(jobId);
  }
  db.prepare(`UPDATE cron_jobs SET enabled = 0 WHERE id = ?`).run(jobId);
}

/**
 * Permanently delete a cron job and all history.
 */
export function deleteCronJob(jobId: string): void {
  disableCronJob(jobId);
  const db = getCronDb();
  db.prepare(`DELETE FROM cron_job_history WHERE job_id = ?`).run(jobId);
  db.prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(jobId);
}

/**
 * Get a single cron job record.
 */
export function getCronJob(jobId: string): CronJobRecord | null {
  return (getCronDb().prepare(`SELECT * FROM cron_jobs WHERE id = ?`).get(jobId) as CronJobRecord) ?? null;
}

/**
 * List cron jobs, optionally filtering by enabled state.
 */
export function listCronJobs(enabled?: boolean): CronJobRecord[] {
  const db = getCronDb();
  if (enabled === undefined) {
    return db.prepare(`SELECT * FROM cron_jobs ORDER BY created_at DESC`).all() as CronJobRecord[];
  }
  return db.prepare(`SELECT * FROM cron_jobs WHERE enabled = ? ORDER BY created_at DESC`).all(enabled ? 1 : 0) as CronJobRecord[];
}

/**
 * Get run history for a job.
 */
export function getCronJobHistory(jobId: string, limit = 10): Array<{
  id: number;
  job_id: string;
  agent_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}> {
  return getCronDb().prepare(
    `SELECT * FROM cron_job_history WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`
  ).all(jobId, limit) as any[];
}

/**
 * Shut everything down (call on process exit).
 */
export function closeCronScheduler(): void {
  for (const runtime of ACTIVE_CRON_JOBS.values()) {
    runtime.task.stop();
  }
  ACTIVE_CRON_JOBS.clear();
  if (cronDb) {
    cronDb.close();
    cronDb = null;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

function _scheduleTask(jobId: string, record: CronJobRecord, agentOptions: AgentOptions): void {
  const task = nodeCron.schedule(record.cron_expression, async () => {
    const db = getCronDb();
    let agentId = "";
    try {
      const agent = await createBackgroundAgent(
        `${record.name} (cron)`,
        record.cwd,
        record.prompt,
        agentOptions,
        10
      );
      agentId = agent.id;

      _recordRun(jobId, agentId, "started");
      await startBackgroundAgent(agentId);
      _recordRun(jobId, agentId, "completed");

      db.prepare(`UPDATE cron_jobs SET last_run_at = datetime('now'), last_agent_id = ?, error_message = NULL WHERE id = ?`)
        .run(agentId, jobId);
    } catch (err: any) {
      _recordRun(jobId, agentId, "failed", err.message);
      db.prepare(`UPDATE cron_jobs SET error_message = ? WHERE id = ?`).run(err.message, jobId);
    }
  });

  ACTIVE_CRON_JOBS.set(jobId, { task, record, agentOptions });
}

function _recordRun(jobId: string, agentId: string, status: string, error?: string): void {
  getCronDb().prepare(
    `INSERT INTO cron_job_history (job_id, agent_id, status, error_message) VALUES (?, ?, ?, ?)`
  ).run(jobId, agentId, status, error ?? null);
}
