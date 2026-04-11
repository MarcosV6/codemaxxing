import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const CONFIG_DIR = join(homedir(), ".codemaxxing");

// ── Types ──

export type HookEvent =
  | "pre-tool"      // Before any tool execution
  | "post-tool"     // After any tool execution
  | "pre-send"      // Before sending user message to LLM
  | "post-response" // After receiving LLM response
  | "on-error"      // When an error occurs
  | "on-commit"     // After a git commit
  | "on-edit"       // After a file is written/edited
  | "on-start"      // When session starts
  | "on-exit";      // When session ends

export interface HookDefinition {
  event: HookEvent;
  command: string;
  /** Optional: only run for specific tool names */
  tools?: string[];
  /** Optional: only run for files matching glob */
  glob?: string;
  /** Timeout in ms (default 10000) */
  timeout?: number;
  /** If true, hook failure blocks the action */
  blocking?: boolean;
  /** If true, hook output is shown to user */
  showOutput?: boolean;
  /** If true, hook output is fed back to the agent */
  feedToAgent?: boolean;
}

export interface HooksConfig {
  hooks: HookDefinition[];
}

export interface HookResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

// ── Loading ──

/**
 * Load hooks from global (~/.codemaxxing/hooks.json) and project (.codemaxxing/hooks.json).
 * Project hooks take precedence and are merged with global ones.
 */
export function loadHooks(cwd: string): HookDefinition[] {
  const allHooks: HookDefinition[] = [];

  // Global hooks
  const globalPath = join(CONFIG_DIR, "hooks.json");
  if (existsSync(globalPath)) {
    try {
      const config: HooksConfig = JSON.parse(readFileSync(globalPath, "utf-8"));
      if (Array.isArray(config.hooks)) {
        allHooks.push(...config.hooks);
      }
    } catch {
      // Invalid config — skip
    }
  }

  // Project hooks
  const projectPath = join(cwd, ".codemaxxing", "hooks.json");
  if (existsSync(projectPath)) {
    try {
      const config: HooksConfig = JSON.parse(readFileSync(projectPath, "utf-8"));
      if (Array.isArray(config.hooks)) {
        allHooks.push(...config.hooks);
      }
    } catch {
      // Invalid config — skip
    }
  }

  return allHooks;
}

// ── Execution ──

/**
 * Run hooks matching a given event.
 * Returns results for each hook that ran.
 */
export async function runHooks(
  event: HookEvent,
  cwd: string,
  context: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: string;
    filePath?: string;
    userMessage?: string;
    response?: string;
    error?: string;
  } = {}
): Promise<HookResult[]> {
  const hooks = loadHooks(cwd);
  const matching = hooks.filter(h => {
    if (h.event !== event) return false;
    // Filter by tool name if specified
    if (h.tools && h.tools.length > 0 && context.toolName) {
      if (!h.tools.includes(context.toolName)) return false;
    }
    // Filter by glob if specified
    if (h.glob && context.filePath) {
      // Simple glob check — just checks if the path contains the pattern
      const pattern = h.glob.replace(/\*/g, "");
      if (!context.filePath.includes(pattern)) return false;
    }
    return true;
  });

  if (matching.length === 0) return [];

  const results: HookResult[] = [];

  for (const hook of matching) {
    const start = Date.now();
    const timeout = hook.timeout ?? 10000;

    // Build environment variables for the hook
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      CODEMAXXING_EVENT: event,
      CODEMAXXING_CWD: cwd,
    };
    if (context.toolName) env.CODEMAXXING_TOOL = context.toolName;
    if (context.filePath) env.CODEMAXXING_FILE = context.filePath;
    if (context.userMessage) env.CODEMAXXING_USER_MESSAGE = context.userMessage.slice(0, 1000);
    if (context.error) env.CODEMAXXING_ERROR = context.error.slice(0, 1000);

    try {
      const output = execSync(hook.command, {
        cwd,
        timeout,
        env,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 1024 * 512, // 512KB
      }).trim();

      results.push({
        success: true,
        output,
        duration: Date.now() - start,
      });
    } catch (err: any) {
      const output = err.stdout?.toString()?.trim() ?? "";
      const error = err.stderr?.toString()?.trim() ?? err.message ?? "Hook failed";
      results.push({
        success: false,
        output,
        error,
        duration: Date.now() - start,
      });

      // If blocking hook fails, throw to prevent the action
      if (hook.blocking) {
        throw new Error(`Blocking hook failed: ${hook.command}\n${error}`);
      }
    }
  }

  return results;
}

/**
 * Get a summary of configured hooks for display.
 */
export function getHooksSummary(cwd: string): string {
  const hooks = loadHooks(cwd);
  if (hooks.length === 0) {
    return "No hooks configured.\n\nAdd hooks in ~/.codemaxxing/hooks.json or .codemaxxing/hooks.json:\n" +
      JSON.stringify({
        hooks: [
          { event: "post-tool", command: "echo 'Tool executed!'", tools: ["write_file"], showOutput: true },
          { event: "on-edit", command: "prettier --write $CODEMAXXING_FILE", blocking: false },
        ]
      }, null, 2);
  }

  const lines = hooks.map(h => {
    const flags: string[] = [];
    if (h.blocking) flags.push("blocking");
    if (h.showOutput) flags.push("show-output");
    if (h.feedToAgent) flags.push("feed-to-agent");
    if (h.tools) flags.push(`tools: ${h.tools.join(",")}`);
    const flagStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";
    return `  ${h.event}: ${h.command}${flagStr}`;
  });

  return `${hooks.length} hook${hooks.length !== 1 ? "s" : ""} configured:\n${lines.join("\n")}`;
}
