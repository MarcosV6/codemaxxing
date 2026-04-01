import { randomUUID } from "crypto";
import { CodingAgent, type AgentOptions } from "./agent.js";
import {
  createBackgroundAgent,
  startBackgroundAgent,
  getBackgroundAgent,
  type BackgroundAgentRecord,
} from "./background-agents.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentRole = "coordinator" | "frontend" | "backend" | "docs" | "tests" | "custom";

export interface SubAgentSpec {
  role: AgentRole;
  name: string;
  prompt: string;
  maxIterations?: number;
}

export interface OrchestratorResult {
  orchestrationId: string;
  coordinator: BackgroundAgentRecord;
  subAgents: Array<{
    spec: SubAgentSpec;
    record: BackgroundAgentRecord;
  }>;
  status: "running" | "completed" | "failed";
  error?: string;
}

// ── Role system prompts ────────────────────────────────────────────────────

const ROLE_PREFIXES: Record<AgentRole, string> = {
  coordinator: "You are a coordinator agent. Break down the task, delegate work clearly, and summarize results.",
  frontend: "You are a frontend specialist. Focus on UI components, styling, React/TypeScript patterns, and user experience.",
  backend: "You are a backend specialist. Focus on APIs, databases, server logic, performance, and security.",
  docs: "You are a documentation specialist. Write clear READMEs, inline comments, API docs, and changelogs.",
  tests: "You are a test engineer. Write comprehensive unit tests, integration tests, and ensure good coverage.",
  custom: "",
};

function buildRolePrompt(role: AgentRole, basePrompt: string): string {
  const prefix = ROLE_PREFIXES[role];
  return prefix ? `${prefix}\n\n${basePrompt}` : basePrompt;
}

// ── Orchestrator ───────────────────────────────────────────────────────────

/**
 * Run a multi-agent orchestration:
 * 1. Coordinator agent breaks down the task
 * 2. Specialist sub-agents execute in parallel
 * 3. Results are collected and summarized
 *
 * @param task           High-level task description
 * @param cwd            Working directory
 * @param agentOptions   Base agent config (model, provider, etc.)
 * @param subAgentSpecs  Which specialist agents to spawn
 */
export async function runOrchestration(
  task: string,
  cwd: string,
  agentOptions: AgentOptions,
  subAgentSpecs: SubAgentSpec[],
  onProgress?: (msg: string) => void
): Promise<OrchestratorResult> {
  const orchestrationId = randomUUID().slice(0, 8);
  onProgress?.(`[${orchestrationId}] Starting orchestration: ${task}`);

  // ── Step 1: Coordinator agent generates a plan ──
  onProgress?.(`[${orchestrationId}] Coordinator agent planning...`);

  const coordinatorPrompt = buildRolePrompt(
    "coordinator",
    `Task: ${task}\n\nBreak this down into subtasks and create a clear implementation plan. Be specific about which files to modify and what each specialist should do.`
  );

  const coordinatorRecord = await createBackgroundAgent(
    `[Coordinator] ${task.slice(0, 40)}`,
    cwd,
    coordinatorPrompt,
    agentOptions,
    5
  );

  await startBackgroundAgent(coordinatorRecord.id);
  onProgress?.(`[${orchestrationId}] Coordinator done → spawning ${subAgentSpecs.length} specialists`);

  // ── Step 2: Spawn specialist sub-agents in parallel ──
  const subAgentResults: OrchestratorResult["subAgents"] = [];

  const spawnPromises = subAgentSpecs.map(async (spec) => {
    const fullPrompt = buildRolePrompt(
      spec.role,
      `Overall task: ${task}\n\nYour specific job: ${spec.prompt}`
    );

    onProgress?.(`[${orchestrationId}] Spawning ${spec.role} agent: ${spec.name}`);

    const record = await createBackgroundAgent(
      `[${spec.role}] ${spec.name}`,
      cwd,
      fullPrompt,
      agentOptions,
      spec.maxIterations ?? 10
    );

    subAgentResults.push({ spec, record });
    return { spec, record };
  });

  await Promise.allSettled(spawnPromises);

  // ── Step 3: Run all sub-agents in parallel ──
  onProgress?.(`[${orchestrationId}] Running ${subAgentResults.length} agents in parallel...`);

  const runPromises = subAgentResults.map(async ({ spec, record }) => {
    try {
      await startBackgroundAgent(record.id);
      onProgress?.(`[${orchestrationId}] ✓ ${spec.role} agent completed`);
    } catch (err: any) {
      onProgress?.(`[${orchestrationId}] ✗ ${spec.role} agent failed: ${err.message}`);
    }
  });

  await Promise.allSettled(runPromises);

  // ── Step 4: Build result ──
  const updatedCoordinator = getBackgroundAgent(coordinatorRecord.id)!;
  const allCompleted = subAgentResults.every(
    ({ record }) => getBackgroundAgent(record.id)?.status === "completed"
  );

  const result: OrchestratorResult = {
    orchestrationId,
    coordinator: updatedCoordinator,
    subAgents: subAgentResults.map(({ spec, record }) => ({
      spec,
      record: getBackgroundAgent(record.id) ?? record,
    })),
    status: allCompleted ? "completed" : "running",
  };

  onProgress?.(`[${orchestrationId}] Orchestration ${result.status}`);
  return result;
}

/**
 * Preset orchestration: full-stack feature implementation
 * Spawns backend + frontend + tests + docs specialists
 */
export async function runFullStackOrchestration(
  task: string,
  cwd: string,
  agentOptions: AgentOptions,
  onProgress?: (msg: string) => void
): Promise<OrchestratorResult> {
  return runOrchestration(
    task,
    cwd,
    agentOptions,
    [
      {
        role: "backend",
        name: "Backend Implementation",
        prompt: "Implement the server-side logic, APIs, and data models for this feature.",
        maxIterations: 10,
      },
      {
        role: "frontend",
        name: "Frontend Implementation",
        prompt: "Implement the UI components, state management, and user interactions for this feature.",
        maxIterations: 10,
      },
      {
        role: "tests",
        name: "Test Suite",
        prompt: "Write unit and integration tests for the new feature. Aim for >80% coverage.",
        maxIterations: 5,
      },
      {
        role: "docs",
        name: "Documentation",
        prompt: "Update README, add inline docs, and write a changelog entry for this feature.",
        maxIterations: 3,
      },
    ],
    onProgress
  );
}

/**
 * Preset: code review + fix orchestration
 * Spawns security reviewer + perf reviewer + fix agent
 */
export async function runCodeReviewOrchestration(
  cwd: string,
  agentOptions: AgentOptions,
  onProgress?: (msg: string) => void
): Promise<OrchestratorResult> {
  return runOrchestration(
    "Comprehensive code review and fix",
    cwd,
    agentOptions,
    [
      {
        role: "backend",
        name: "Security Audit",
        prompt: "Review the codebase for security vulnerabilities: SQL injection, XSS, auth issues, exposed secrets, dependency vulnerabilities.",
        maxIterations: 5,
      },
      {
        role: "tests",
        name: "Test Coverage Audit",
        prompt: "Find untested code paths and write tests for the most critical gaps.",
        maxIterations: 8,
      },
      {
        role: "docs",
        name: "Docs Audit",
        prompt: "Find missing or outdated documentation. Update inline comments, JSDoc, and README sections.",
        maxIterations: 5,
      },
    ],
    onProgress
  );
}

/**
 * Format orchestration result as human-readable string
 */
export function formatOrchestrationResult(result: OrchestratorResult): string {
  const lines: string[] = [
    `Orchestration [${result.orchestrationId}] — ${result.status.toUpperCase()}`,
    ``,
    `Coordinator: ${result.coordinator.name} [${result.coordinator.id}]`,
    `  Status: ${result.coordinator.status} | Iterations: ${result.coordinator.iterations}`,
    ``,
    `Sub-Agents (${result.subAgents.length}):`,
  ];

  for (const { spec, record } of result.subAgents) {
    const statusEmoji = record.status === "completed" ? "✓" :
                        record.status === "failed" ? "✗" :
                        record.status === "running" ? "⟳" : "○";
    lines.push(`  ${statusEmoji} [${spec.role}] ${record.name} [${record.id}]`);
    lines.push(`     Status: ${record.status} | Iterations: ${record.iterations}/${record.max_iterations}`);
    if (record.error_message) {
      lines.push(`     Error: ${record.error_message}`);
    }
  }

  return lines.join("\n");
}
