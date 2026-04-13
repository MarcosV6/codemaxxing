import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";

const LEARNED_SKILLS_DIR = join(homedir(), ".codemaxxing", "learned-skills");

// ── Types ──

export interface LearnedSkill {
  name: string;
  description: string;
  trigger: string;
  steps: string[];
  tools_used: string[];
  created_at: string;
  times_applied: number;
}

export interface WorkflowTrace {
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: string;
  }>;
  userMessage: string;
  hadError: boolean;
  errorRecovered: boolean;
  userCorrection: boolean;
  totalIterations: number;
}

const WRITE_TOOLS = new Set(["write_file", "edit_file"]);
const COMMAND_TOOLS = new Set(["run_command", "run_background_command"]);
const READ_TOOLS = new Set(["read_file", "list_files", "search_files", "grep_search", "glob_search"]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function trimCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ").slice(0, 80);
}

function sanitizePathLabel(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

function detectEcosystem(paths: string[], commands: string[]): string {
  const corpus = [...paths, ...commands].join(" ").toLowerCase();

  if (
    corpus.includes("package.json") ||
    /\b(?:npm|pnpm|yarn|bun|vite|node)\b/.test(corpus)
  ) {
    return "node";
  }
  if (corpus.includes("cargo.toml") || /\bcargo\b|\brustc\b/.test(corpus)) {
    return "rust";
  }
  if (
    corpus.includes("pyproject.toml") ||
    corpus.includes("requirements.txt") ||
    /\b(?:python|pip|pytest)\b/.test(corpus)
  ) {
    return "python";
  }
  if (corpus.includes("go.mod") || /\bgo\s+(?:build|run|test|get)\b/.test(corpus)) {
    return "go";
  }

  return "project";
}

function detectCommandGoal(commands: string[]): "run" | "build" | "test" | "install" | "command" {
  const joined = commands.join(" ; ").toLowerCase();

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+dev|run\s+start|dev|start)\b/.test(joined) ||
    /\b(?:vite|next dev|serve|preview)\b/.test(joined)
  ) {
    return "run";
  }
  if (
    /\b(?:npm|pnpm|yarn|bun)\s+run\s+build\b/.test(joined) ||
    /\b(?:vite build|tsc|cargo build|go build)\b/.test(joined)
  ) {
    return "build";
  }
  if (
    /\b(?:npm|pnpm|yarn|bun)\s+run\s+test\b/.test(joined) ||
    /\b(?:vitest|jest|pytest|cargo test|go test)\b/.test(joined)
  ) {
    return "test";
  }
  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add)\b/.test(joined) ||
    /\b(?:pip install|cargo add|go get)\b/.test(joined)
  ) {
    return "install";
  }

  return "command";
}

function detectFocus(paths: string[]): string | null {
  const lower = paths.map((path) => path.toLowerCase());

  if (lower.some((path) => /(?:^|\/)(tests?|__tests__)\//.test(path) || /\.(test|spec)\./.test(path))) {
    return "tests";
  }
  if (
    lower.some(
      (path) =>
        path.includes("/src/") ||
        /\.(?:ts|tsx|js|jsx|css|scss|html)$/.test(path),
    )
  ) {
    return "app";
  }
  if (
    lower.some((path) =>
      /(?:package\.json|tsconfig|vite\.config|webpack|eslint|prettier|tailwind|dockerfile)/.test(path),
    )
  ) {
    return "config";
  }

  const first = lower[0];
  if (!first) return null;

  const label = basename(first).replace(/\.[a-z0-9]+$/i, "");
  if (!label || ["index", "main", "app"].includes(label)) return null;
  return label.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || null;
}

function detectWorkflowAction(fileWrites: string[], commands: string[]): string {
  const hasWrites = fileWrites.length > 0;
  const goal = detectCommandGoal(commands);

  if (hasWrites && goal === "run") return "scaffold-run";
  if (hasWrites && goal === "build") return "edit-build";
  if (hasWrites && goal === "test") return "edit-test";
  if (hasWrites && goal === "install") return "scaffold-install";
  if (hasWrites && commands.length > 0) return "edit-verify";
  if (hasWrites) return "edit";
  if (goal !== "command") return goal;
  if (commands.length > 0) return "run";
  return "inspect";
}

function buildTrigger(ecosystem: string, focus: string | null, commands: string[], fileWrites: string[]): string {
  const parts: string[] = [];
  const goal = detectCommandGoal(commands);

  if (fileWrites.length > 0) parts.push("editing project files");
  if (focus === "app") parts.push("working in app source files");
  if (focus === "config") parts.push("updating project configuration");
  if (focus === "tests") parts.push("changing tests");
  if (goal === "run") parts.push("starting a local app");
  if (goal === "build") parts.push("building the project");
  if (goal === "test") parts.push("running verification");
  if (goal === "install") parts.push("installing dependencies");

  const summary = joinWithAnd(unique(parts)) || "repeatable project changes";
  return `Use for ${ecosystem} tasks involving ${summary}.`;
}

// ── Triggers: when should we try to learn? ──

/**
 * Evaluate whether a completed workflow should be saved as a learned skill.
 */
export function shouldLearnSkill(trace: WorkflowTrace): boolean {
  const writeCount = trace.toolCalls.filter((tc) => WRITE_TOOLS.has(tc.name)).length;
  const commandCalls = trace.toolCalls.filter((tc) => COMMAND_TOOLS.has(tc.name));
  const commandCount = commandCalls.length;
  const readCount = trace.toolCalls.filter((tc) => READ_TOOLS.has(tc.name)).length;
  const uniqueTools = new Set(trace.toolCalls.map((tc) => tc.name));
  const commandGoal = detectCommandGoal(
    commandCalls.map((tc) => String(tc.args.command || "")),
  );

  if (trace.toolCalls.length < 4) return false;
  if (uniqueTools.size < 2) return false;
  if (writeCount === 0 || commandCount === 0) return false;
  if (commandGoal === "command" || commandGoal === "install") return false;
  if (writeCount + commandCount + readCount < 4) return false;

  if (trace.totalIterations >= 6 || trace.toolCalls.length >= 6) return true;
  if (trace.hadError && trace.errorRecovered) return true;

  return false;
}

// ── Skill generation ──

/**
 * Generate a skill definition from a workflow trace.
 * This creates a prompt.md that the agent can use next time.
 */
export function generateSkillFromTrace(trace: WorkflowTrace): LearnedSkill {
  const tools = unique(trace.toolCalls.map((tc) => tc.name));

  // Extract the pattern: what files were read/written, what commands were run
  const fileReads = trace.toolCalls
    .filter((tc) => READ_TOOLS.has(tc.name))
    .map((tc) => String(tc.args.path || ""))
    .filter(Boolean);

  const fileWrites = trace.toolCalls
    .filter((tc) => WRITE_TOOLS.has(tc.name))
    .map((tc) => String(tc.args.path || ""))
    .filter(Boolean);

  const commands = trace.toolCalls
    .filter((tc) => COMMAND_TOOLS.has(tc.name))
    .map((tc) => String(tc.args.command || ""))
    .filter(Boolean);

  const ecosystem = detectEcosystem([...fileReads, ...fileWrites], commands);
  const focus = detectFocus(fileWrites.length > 0 ? fileWrites : fileReads);
  const action = detectWorkflowAction(fileWrites, commands);

  // Build step descriptions
  const steps: string[] = [];
  if (fileReads.length > 0) steps.push(`Read: ${unique(fileReads).slice(0, 5).map(sanitizePathLabel).join(", ")}`);
  if (fileWrites.length > 0) steps.push(`Modified: ${unique(fileWrites).slice(0, 5).map(sanitizePathLabel).join(", ")}`);
  if (commands.length > 0) steps.push(`Ran: ${unique(commands).slice(0, 5).map(trimCommand).join("; ")}`);
  if (trace.hadError && trace.errorRecovered) steps.push("Recovered from error during execution");

  const nameParts = [ecosystem, action, focus].filter(Boolean);
  const name =
    nameParts
      .join("-")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || `workflow-${Date.now()}`;

  const descriptionBits: string[] = [];
  if (fileWrites.length > 0) descriptionBits.push(`updated ${formatCount(unique(fileWrites).length, "file")}`);
  if (commands.length > 0) descriptionBits.push(`ran ${formatCount(unique(commands).length, "command")}`);
  if (trace.hadError && trace.errorRecovered) descriptionBits.push("recovered from an execution error");

  return {
    name,
    description: `Repeatable ${ecosystem} workflow that ${joinWithAnd(descriptionBits) || "made project changes"}.`,
    trigger: buildTrigger(ecosystem, focus, commands, fileWrites),
    steps,
    tools_used: tools,
    created_at: new Date().toISOString(),
    times_applied: 0,
  };
}

// ── Persistence ──

/**
 * Save a learned skill to disk.
 */
export function saveLearnedSkill(skill: LearnedSkill): string {
  if (!existsSync(LEARNED_SKILLS_DIR)) {
    mkdirSync(LEARNED_SKILLS_DIR, { recursive: true });
  }

  const skillDir = join(LEARNED_SKILLS_DIR, skill.name);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  // Write metadata
  writeFileSync(join(skillDir, "skill.json"), JSON.stringify(skill, null, 2), "utf-8");

  // Write prompt.md for system prompt injection
  const prompt = `## Learned Skill: ${skill.name}

${skill.description}

### When to apply
When the user asks something similar to: "${skill.trigger}"

### Recommended approach
${skill.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

### Tools typically used
${skill.tools_used.join(", ")}
`;
  writeFileSync(join(skillDir, "prompt.md"), prompt, "utf-8");

  return skillDir;
}

/**
 * List all learned skills.
 */
export function listLearnedSkills(): LearnedSkill[] {
  if (!existsSync(LEARNED_SKILLS_DIR)) return [];

  const skills: LearnedSkill[] = [];
  try {
    const dirs = readdirSync(LEARNED_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of dirs) {
      const metaPath = join(LEARNED_SKILLS_DIR, dir.name, "skill.json");
      if (existsSync(metaPath)) {
        try {
          skills.push(JSON.parse(readFileSync(metaPath, "utf-8")));
        } catch {
          // Corrupted skill — skip
        }
      }
    }
  } catch {
    // Dir not readable
  }

  return skills.sort((a, b) => b.times_applied - a.times_applied);
}

/**
 * Build prompts from learned skills for system prompt injection.
 */
export function buildLearnedSkillPrompts(): string {
  const skills = listLearnedSkills();
  if (skills.length === 0) return "";

  const lines = ["\n\n## Learned Skills (from past sessions)"];
  lines.push("These patterns were learned from successful past workflows.\n");

  for (const skill of skills.slice(0, 10)) {
    const promptPath = join(LEARNED_SKILLS_DIR, skill.name, "prompt.md");
    if (existsSync(promptPath)) {
      try {
        lines.push(readFileSync(promptPath, "utf-8"));
      } catch {
        lines.push(`- ${skill.name}: ${skill.description}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Increment the times_applied counter for a skill.
 */
export function bumpSkillUsage(name: string): void {
  const metaPath = join(LEARNED_SKILLS_DIR, name, "skill.json");
  if (!existsSync(metaPath)) return;
  try {
    const skill: LearnedSkill = JSON.parse(readFileSync(metaPath, "utf-8"));
    skill.times_applied++;
    writeFileSync(metaPath, JSON.stringify(skill, null, 2), "utf-8");
  } catch {
    // skip
  }
}

/**
 * Delete a learned skill.
 */
export function deleteLearnedSkill(name: string): boolean {
  const skillDir = join(LEARNED_SKILLS_DIR, name);
  if (!existsSync(skillDir)) return false;
  try {
    const { rmSync } = require("fs");
    rmSync(skillDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
