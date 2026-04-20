import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { buildRepoMap } from "../utils/repomap.js";
import { loadIgnorePatterns } from "../utils/ignore.js";
import { isAutoLearnSkillsEnabled, loadConfig } from "../config.js";

/**
 * Load project rules from CODEMAXXING.md, .codemaxxing/CODEMAXXING.md, or .cursorrules
 * Returns { content, source } or null if none found
 */
export function loadProjectRules(cwd: string): { content: string; source: string } | null {
  const candidates = [
    { path: join(cwd, "CODEMAXXING.md"), source: "CODEMAXXING.md" },
    { path: join(cwd, ".codemaxxing", "CODEMAXXING.md"), source: ".codemaxxing/CODEMAXXING.md" },
    { path: join(cwd, ".cursorrules"), source: ".cursorrules" },
  ];

  for (const { path, source } of candidates) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8").trim();
        if (content) return { content, source };
      } catch {
        // skip unreadable files
      }
    }
  }
  return null;
}

/**
 * Build a project context string by scanning the working directory
 */
export async function buildProjectContext(cwd: string): Promise<string> {
  const lines: string[] = [];
  lines.push(`Project root: ${cwd}`);

  // Check for common project files
  const markers = [
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "Makefile",
    "Dockerfile",
    "README.md",
    "CODEMAXXING.md",
  ];

  const found: string[] = [];
  for (const m of markers) {
    if (existsSync(join(cwd, m))) found.push(m);
  }

  if (found.length > 0) {
    lines.push(`Project files: ${found.join(", ")}`);
  }

  // Read package.json for project info
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      lines.push(`\nProject: ${pkg.name ?? "unknown"} v${pkg.version ?? "0.0.0"}`);
      if (pkg.description) lines.push(`Description: ${pkg.description}`);
      if (pkg.scripts) {
        lines.push(`Available scripts: ${Object.keys(pkg.scripts).join(", ")}`);
      }
    } catch {
      // ignore
    }
  }

  // Quick file tree (top level only)
  lines.push("\nProject structure:");
  const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__", ".DS_Store"];
  const isIgnored = loadIgnorePatterns(cwd);
  try {
    const entries = readdirSync(cwd)
      .filter((e) => !IGNORE.includes(e) && !isIgnored(e))
      .slice(0, 30);

    for (const entry of entries) {
      const fullPath = join(cwd, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const count = readdirSync(fullPath).filter(
          (e) => !IGNORE.includes(e)
        ).length;
        lines.push(`  📁 ${entry}/ (${count} items)`);
      } else {
        lines.push(`  📄 ${entry}`);
      }
    }
  } catch {
    lines.push("  (could not read directory)");
  }

  // Build and append repo map
  try {
    const repoMap = await buildRepoMap(cwd);
    lines.push("\n" + repoMap);
  } catch (e) {
    // Repo map failed — continue without it
    lines.push("\n## Repository Map\n  (unable to build map)");
  }

  return lines.join("\n");
}

/**
 * Get the system prompt for the coding agent
 */
export async function getSystemPrompt(projectContext: string, skillPrompts: string = "", projectRules: string = ""): Promise<string> {
  const base = `You are CODEMAXXING, an AI coding assistant running in the terminal.

You help developers understand, write, debug, and refactor code. You have access to tools that let you read files, write files, list directories, search code, and run shell commands.

## Rules
- Always read relevant files before making changes
- Explain what you're about to do before doing it
- When writing files, show the user what will change
- Be concise but thorough
- If you're unsure, ask — don't guess
- Use the run_command tool for building, testing, and linters
- Use write_file/edit_file for project files; do not scaffold source files with shell heredocs, echo redirection, or tee
- If the user asks you to run, preview, serve, launch, or verify an app, you must actually do it with tools and report the real result
- For long-running dev servers, use run_background_command and report the PID plus any detected URL/port or startup output
- Never claim something is running, installed, or working unless command output confirmed it
- Never delete files without explicit confirmation

## Task Progress
When working on multi-step tasks, use create_task and update_task to show the user a live progress checklist. Create tasks at the start, mark them in_progress as you work, and completed when done. This helps the user see what you're doing. Only use for multi-step work (3+ steps), not simple questions.
Tasks are only progress indicators, not proof that work is complete.

## Editing Strategy
- Prefer edit_file for small or localized changes — use it when you only need to change part of a file.
- edit_file requires the exact text to be found in the file, so read the file first to confirm the exact content.
- Use write_file only when creating a new file or when the changes affect most of the file.
- When in doubt about scope, prefer edit_file — it is safer and easier to review.

## Tool-Calling Behavior
- Do not narrate before every tool call. If the next action is obvious, call the tool directly.
- Do not repeat the same status update across tool turns.
- Only give a pre-tool note when it adds new information, and keep it to one short sentence.

## Repository Map
The project context below includes a map of the codebase structure. Use this map to understand what files, functions, classes, and types exist where. Use read_file to see full implementations when needed.

## Project Context
${projectContext}

## Behavior
- Respond in markdown
- Use code blocks with language tags
- Be direct and helpful
- If the user asks to "just do it", skip explanations and execute`;

  let prompt = base;

  if (projectRules) {
    prompt += "\n\n--- Project Rules (CODEMAXXING.md) ---\n" + projectRules + "\n--- End Project Rules ---";
  }

  if (skillPrompts) {
    prompt += "\n\n## Active Skills\n" + skillPrompts;
  }

  // Inject persistent memory from past sessions
  try {
    const { buildMemoryContext } = await import("../utils/memory.js");
    const memoryCtx = buildMemoryContext(process.cwd());
    if (memoryCtx) {
      prompt += memoryCtx;
    }
  } catch {
    // Memory module not available — skip
  }

  // Inject learned skills from past workflows
  try {
    if (isAutoLearnSkillsEnabled(loadConfig())) {
      const { buildLearnedSkillPrompts } = await import("../utils/skill-learner.js");
      const learnedCtx = buildLearnedSkillPrompts();
      if (learnedCtx) {
        prompt += learnedCtx;
      }
    }
  } catch {
    // Skill learner not available — skip
  }

  return prompt;
}

/**
 * Synchronous version for backwards compatibility (without repo map)
 * @deprecated Use async buildProjectContext instead
 */
export function buildProjectContextSync(cwd: string): string {
  const lines: string[] = [];
  lines.push(`Project root: ${cwd}`);

  const markers = [
    "package.json", "Cargo.toml", "pyproject.toml", "go.mod",
    "Makefile", "Dockerfile", "README.md", "CODEMAXXING.md",
  ];

  const found: string[] = [];
  for (const m of markers) {
    if (existsSync(join(cwd, m))) found.push(m);
  }

  if (found.length > 0) {
    lines.push(`Project files: ${found.join(", ")}`);
  }

  return lines.join("\n");
}
