import chalk from "chalk";
import {
  createBackgroundAgent,
  startBackgroundAgent,
  pauseBackgroundAgent,
  resumeBackgroundAgent,
  messageBackgroundAgent,
  getBackgroundAgent,
  listBackgroundAgents,
  getAgentsByStatus,
  deleteBackgroundAgent,
  getAgentRuntimeStatus,
  type BackgroundAgentRecord,
} from "./background-agents.js";
import type { AgentOptions } from "./core/agent.js";

/**
 * Display a background agent record in a readable format
 */
export function displayAgent(agent: BackgroundAgentRecord): string {
  const statusColors: Record<string, (s: string) => string> = {
    idle: chalk.gray,
    running: chalk.yellow,
    paused: chalk.cyan,
    completed: chalk.green,
    failed: chalk.red,
  };

  const colorFn = statusColors[agent.status] || chalk.white;
  const status = colorFn(agent.status.toUpperCase());

  const lines = [
    `${chalk.bold(agent.name)} [${agent.id}]`,
    `Status: ${status}`,
    `Model: ${agent.model}`,
    `Directory: ${agent.cwd}`,
    `Iterations: ${agent.iterations}/${agent.max_iterations}`,
    `Created: ${new Date(agent.created_at).toLocaleString()}`,
  ];

  if (agent.started_at) {
    lines.push(`Started: ${new Date(agent.started_at).toLocaleString()}`);
  }

  if (agent.completed_at) {
    lines.push(`Completed: ${new Date(agent.completed_at).toLocaleString()}`);
  }

  if (agent.error_message) {
    lines.push(`Error: ${chalk.red(agent.error_message)}`);
  }

  if (agent.prompt) {
    lines.push(`Task: ${agent.prompt.slice(0, 100)}${agent.prompt.length > 100 ? "..." : ""}`);
  }

  return lines.join("\n");
}

/**
 * List all background agents
 */
export function listAgents(cwd?: string): void {
  const agents = listBackgroundAgents(cwd);

  if (agents.length === 0) {
    console.log(chalk.gray("No background agents found."));
    return;
  }

  agents.forEach((agent, i) => {
    if (i > 0) console.log("");
    console.log(displayAgent(agent));
  });

  console.log(`\n${chalk.dim(`Total: ${agents.length} agents`)}`);
}

/**
 * Show detail for a specific agent
 */
export function showAgentDetail(agentId: string): void {
  const agent = getBackgroundAgent(agentId);
  if (!agent) {
    console.log(chalk.red(`Agent ${agentId} not found`));
    return;
  }

  console.log(displayAgent(agent));

  const runtime = getAgentRuntimeStatus(agentId);
  if (runtime) {
    console.log(chalk.dim("\nRuntime Status:"));
    console.log(
      `  ${runtime.running ? chalk.green("●") : chalk.gray("○")} ` +
      `${runtime.iterationsSoFar}/${runtime.maxIterations} iterations`
    );
  }
}

/**
 * Start a new background agent
 */
export async function startNewAgent(
  name: string,
  cwd: string,
  prompt: string,
  agentOptions: AgentOptions,
  maxIterations: number = 10
): Promise<string> {
  try {
    const agent = await createBackgroundAgent(name, cwd, prompt, agentOptions, maxIterations);
    console.log(chalk.green(`✓ Agent created: ${agent.id}`));
    console.log(`Name: ${agent.name}`);
    console.log(`Model: ${agent.model}`);
    console.log(`Max iterations: ${agent.max_iterations}`);

    // Auto-start
    await startBackgroundAgent(agent.id);
    console.log(chalk.green(`✓ Agent started`));

    return agent.id;
  } catch (err: any) {
    console.log(chalk.red(`✗ Failed to create agent: ${err.message}`));
    throw err;
  }
}

/**
 * Pause an agent
 */
export function pauseAgent(agentId: string): void {
  const agent = getBackgroundAgent(agentId);
  if (!agent) {
    console.log(chalk.red(`Agent ${agentId} not found`));
    return;
  }

  pauseBackgroundAgent(agentId);
  console.log(chalk.cyan(`✓ Agent ${agentId} paused`));
}

/**
 * Resume an agent
 */
export async function resumeAgent(agentId: string): Promise<void> {
  const agent = getBackgroundAgent(agentId);
  if (!agent) {
    console.log(chalk.red(`Agent ${agentId} not found`));
    return;
  }

  if (agent.status !== "paused") {
    console.log(chalk.red(`Agent must be paused to resume. Current status: ${agent.status}`));
    return;
  }

  try {
    await resumeBackgroundAgent(agentId);
    console.log(chalk.green(`✓ Agent ${agentId} resumed`));
  } catch (err: any) {
    console.log(chalk.red(`✗ Failed to resume: ${err.message}`));
  }
}

/**
 * Send a message to an agent
 */
export async function sendMessage(agentId: string, message: string): Promise<void> {
  const agent = getBackgroundAgent(agentId);
  if (!agent) {
    console.log(chalk.red(`Agent ${agentId} not found`));
    return;
  }

  if (agent.status !== "running" && agent.status !== "paused") {
    console.log(chalk.red(`Agent must be running or paused. Current status: ${agent.status}`));
    return;
  }

  try {
    await messageBackgroundAgent(agentId, message);
    console.log(chalk.green(`✓ Message sent to ${agentId}`));
  } catch (err: any) {
    console.log(chalk.red(`✗ Failed to send message: ${err.message}`));
  }
}

/**
 * Delete an agent
 */
export function deleteAgent(agentId: string): void {
  const agent = getBackgroundAgent(agentId);
  if (!agent) {
    console.log(chalk.red(`Agent ${agentId} not found`));
    return;
  }

  deleteBackgroundAgent(agentId);
  console.log(chalk.green(`✓ Agent ${agentId} deleted`));
}

/**
 * Show agents by status
 */
export function showAgentsByStatus(status: string): void {
  const agents = getAgentsByStatus(status);

  if (agents.length === 0) {
    console.log(chalk.gray(`No agents with status "${status}".`));
    return;
  }

  console.log(chalk.bold(`Agents with status: ${status}`));
  agents.forEach((agent, i) => {
    if (i > 0) console.log("");
    console.log(displayAgent(agent));
  });
}
