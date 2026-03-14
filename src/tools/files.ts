import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

/**
 * Tool definitions for the OpenAI function calling API
 */
export const FILE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to read (relative to project root)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write (relative to project root)",
          },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files and directories in the given path. Returns file names and types.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Directory path to list (relative to project root, defaults to '.')",
          },
          recursive: {
            type: "boolean",
            description: "Whether to list files recursively (default: false)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for a text pattern across files in the project",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Text or regex pattern to search for",
          },
          path: {
            type: "string",
            description: "Directory to search in (defaults to project root)",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Execute a shell command and return the output. Use for running tests, builds, linters, etc.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
];

/**
 * Execute a tool call and return the result
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<string> {
  switch (name) {
    case "read_file": {
      const filePath = join(cwd, args.path as string);
      if (!existsSync(filePath)) return `Error: File not found: ${args.path}`;
      try {
        return readFileSync(filePath, "utf-8");
      } catch (e) {
        return `Error reading file: ${e}`;
      }
    }

    case "write_file": {
      const filePath = join(cwd, args.path as string);
      try {
        writeFileSync(filePath, args.content as string, "utf-8");
        return `✅ Wrote ${(args.content as string).length} bytes to ${args.path}`;
      } catch (e) {
        return `Error writing file: ${e}`;
      }
    }

    case "list_files": {
      const dirPath = join(cwd, (args.path as string) || ".");
      if (!existsSync(dirPath)) return `Error: Directory not found: ${args.path}`;
      try {
        const entries = listDir(dirPath, cwd, args.recursive as boolean);
        return entries.join("\n");
      } catch (e) {
        return `Error listing files: ${e}`;
      }
    }

    case "search_files": {
      const searchPath = join(cwd, (args.path as string) || ".");
      try {
        return searchInFiles(searchPath, args.pattern as string, cwd);
      } catch (e) {
        return `Error searching: ${e}`;
      }
    }

    case "run_command": {
      try {
        const { execSync } = await import("child_process");
        const output = execSync(args.command as string, {
          cwd,
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        return output || "(no output)";
      } catch (e: any) {
        return `Command failed: ${e.stderr || e.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Generate a simple unified diff between two strings
 */
export function generateDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const output: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  const lcs = computeLCS(oldLines, newLines);

  let oi = 0, ni = 0, li = 0;
  let hunkLines: string[] = [];
  let hunkOldCount = 0;
  let hunkNewCount = 0;
  let hunkStartOld = 1;
  let hunkStartNew = 1;
  let pendingContext: string[] = [];
  let hasHunk = false;

  function flushHunk() {
    if (hasHunk && hunkLines.length > 0) {
      output.push(`@@ -${hunkStartOld},${hunkOldCount} +${hunkStartNew},${hunkNewCount} @@`);
      output.push(...hunkLines);
    }
    hunkLines = [];
    hunkOldCount = 0;
    hunkNewCount = 0;
    hasHunk = false;
    pendingContext = [];
  }

  function startHunk() {
    if (!hasHunk) {
      hasHunk = true;
      hunkStartOld = Math.max(1, oi + 1 - 3);
      hunkStartNew = Math.max(1, ni + 1 - 3);
      const contextStart = Math.max(0, oi - 3);
      for (let c = contextStart; c < oi; c++) {
        hunkLines.push(` ${oldLines[c]}`);
        hunkOldCount++;
        hunkNewCount++;
      }
    }
    if (pendingContext.length > 0) {
      hunkLines.push(...pendingContext);
      pendingContext = [];
    }
  }

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && ni < newLines.length &&
        oldLines[oi] === lcs[li] && newLines[ni] === lcs[li]) {
      // Matching line
      if (hasHunk) {
        pendingContext.push(` ${oldLines[oi]}`);
        hunkOldCount++;
        hunkNewCount++;
        if (pendingContext.length > 6) flushHunk();
      }
      oi++; ni++; li++;
    } else if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
      startHunk();
      hunkLines.push(`-${oldLines[oi]}`);
      hunkOldCount++;
      oi++;
    } else if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
      startHunk();
      hunkLines.push(`+${newLines[ni]}`);
      hunkNewCount++;
      ni++;
    } else {
      break;
    }
  }

  flushHunk();

  if (output.length <= 2) return "(no changes)";

  const maxDiffLines = 60;
  if (output.length > maxDiffLines + 2) {
    return output.slice(0, maxDiffLines + 2).join("\n") + `\n... (${output.length - maxDiffLines - 2} more lines)`;
  }
  return output.join("\n");
}

function computeLCS(a: string[], b: string[]): string[] {
  if (a.length > 500 || b.length > 500) {
    // For large files, just return common lines in order
    const result: string[] = [];
    let bi = 0;
    for (const line of a) {
      while (bi < b.length && b[bi] !== line) bi++;
      if (bi < b.length) { result.push(line); bi++; }
    }
    return result;
  }
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { i--; }
    else { j--; }
  }
  return result;
}

/**
 * Get existing file content for diff preview (returns null if file doesn't exist)
 */
export function getExistingContent(filePath: string, cwd: string): string | null {
  const fullPath = join(cwd, filePath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

function listDir(
  dirPath: string,
  cwd: string,
  recursive: boolean = false,
  depth: number = 0
): string[] {
  const entries: string[] = [];
  const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__"];

  for (const entry of readdirSync(dirPath)) {
    if (IGNORE.includes(entry)) continue;
    const fullPath = join(dirPath, entry);
    const rel = relative(cwd, fullPath);
    const stat = statSync(fullPath);
    const prefix = "  ".repeat(depth);

    if (stat.isDirectory()) {
      entries.push(`${prefix}📁 ${rel}/`);
      if (recursive && depth < 3) {
        entries.push(...listDir(fullPath, cwd, true, depth + 1));
      }
    } else {
      const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)}KB` : `${stat.size}B`;
      entries.push(`${prefix}📄 ${rel} (${size})`);
    }
  }
  return entries;
}

function searchInFiles(
  dirPath: string,
  pattern: string,
  cwd: string
): string {
  const results: string[] = [];
  const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__"];
  const regex = new RegExp(pattern, "gi");

  function search(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (IGNORE.includes(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        search(fullPath);
      } else if (stat.size < 100000) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${relative(cwd, fullPath)}:${i + 1}: ${lines[i].trim()}`);
            }
            regex.lastIndex = 0;
          }
        } catch {
          // skip binary files
        }
      }
    }
  }

  search(dirPath);
  return results.length > 0
    ? results.slice(0, 50).join("\n")
    : "No matches found.";
}
