import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

/**
 * Build a project context string by scanning the working directory
 */
export function buildProjectContext(cwd: string): string {
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
    "PIERRE.md",
  ];

  const found: string[] = [];
  for (const m of markers) {
    if (existsSync(join(cwd, m))) found.push(m);
  }

  if (found.length > 0) {
    lines.push(`Project files: ${found.join(", ")}`);
  }

  // Read PIERRE.md if it exists (like QWEN.md — project context file)
  const pierreMd = join(cwd, "PIERRE.md");
  if (existsSync(pierreMd)) {
    const content = readFileSync(pierreMd, "utf-8");
    lines.push("\n--- PIERRE.md (project context) ---");
    lines.push(content.slice(0, 4000));
    lines.push("--- end PIERRE.md ---");
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

  return lines.join("\n");
}

/**
 * Get the system prompt for the coding agent
 */
export function getSystemPrompt(projectContext: string): string {
  return `You are CODEMAXXING, an AI coding assistant running in the terminal.

You help developers understand, write, debug, and refactor code. You have access to tools that let you read files, write files, list directories, search code, and run shell commands.

## Rules
- Always read relevant files before making changes
- Explain what you're about to do before doing it
- When writing files, show the user what will change
- Be concise but thorough
- If you're unsure, ask — don't guess
- Use the run_command tool for building, testing, and linting
- Never delete files without explicit confirmation

## Project Context
${projectContext}

## Behavior
- Respond in markdown
- Use code blocks with language tags
- Be direct and helpful
- If the user asks to "just do it", skip explanations and execute`;
}
