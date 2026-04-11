import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
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

// ── Triggers: when should we try to learn? ──

/**
 * Evaluate whether a completed workflow should be saved as a learned skill.
 */
export function shouldLearnSkill(trace: WorkflowTrace): boolean {
  // At least 5 tool calls — non-trivial workflow
  if (trace.totalIterations >= 5) return true;

  // Error + recovery pattern — valuable to remember
  if (trace.hadError && trace.errorRecovered) return true;

  // User corrected the agent then it succeeded
  if (trace.userCorrection) return true;

  return false;
}

// ── Skill generation ──

/**
 * Generate a skill definition from a workflow trace.
 * This creates a prompt.md that the agent can use next time.
 */
export function generateSkillFromTrace(trace: WorkflowTrace): LearnedSkill {
  const tools = [...new Set(trace.toolCalls.map(tc => tc.name))];

  // Extract the pattern: what files were read/written, what commands were run
  const fileReads = trace.toolCalls
    .filter(tc => tc.name === "read_file")
    .map(tc => String(tc.args.path || ""))
    .filter(Boolean);

  const fileWrites = trace.toolCalls
    .filter(tc => tc.name === "write_file" || tc.name === "edit_file")
    .map(tc => String(tc.args.path || ""))
    .filter(Boolean);

  const commands = trace.toolCalls
    .filter(tc => tc.name === "run_command")
    .map(tc => String(tc.args.command || ""))
    .filter(Boolean);

  // Build step descriptions
  const steps: string[] = [];
  if (fileReads.length > 0) steps.push(`Read: ${fileReads.slice(0, 5).join(", ")}`);
  if (fileWrites.length > 0) steps.push(`Modified: ${fileWrites.slice(0, 5).join(", ")}`);
  if (commands.length > 0) steps.push(`Ran: ${commands.slice(0, 5).join("; ")}`);
  if (trace.hadError && trace.errorRecovered) steps.push("Recovered from error during execution");

  // Generate a name from the user message
  const name = trace.userMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-") || `workflow-${Date.now()}`;

  return {
    name,
    description: `Learned from: "${trace.userMessage.slice(0, 100)}"`,
    trigger: trace.userMessage.slice(0, 200),
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
