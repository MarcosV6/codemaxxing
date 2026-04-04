import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { buildRepoMap } from "../utils/repomap.js";

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
  try {
    const entries = readdirSync(cwd)
      .filter((e) => !IGNORE.includes(e))
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
- Never delete files without explicit confirmation

## Editing Strategy
- Prefer edit_file for small or localized changes — use it when you only need to change part of a file.
- edit_file requires the exact text to be found in the file, so read the file first to confirm the exact content.
- Use write_file only when creating a new file or when the changes affect most of the file.
- When in doubt about scope, prefer edit_file — it is safer and easier to review.

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
