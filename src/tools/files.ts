import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, globSync as fsGlobSync } from "fs";
import { join, relative, dirname, resolve, extname } from "path";

/**
 * Resolve a user-provided path against cwd and ensure it doesn't escape the project root.
 * Returns the resolved absolute path, or null if the path escapes cwd.
 */
function safePath(cwd: string, userPath: string): string | null {
  const resolved = resolve(cwd, userPath);
  const root = resolve(cwd);
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    // Windows: also check backslash separator
    if (process.platform === "win32" && resolved.startsWith(root + "\\")) {
      return resolved;
    }
    return null;
  }
  return resolved;
}
import type { ChatCompletionTool } from "openai/resources/chat/completions";

function normalizeWindowsCommand(command: string): { command: string; notes: string[] } {
  const notes: string[] = [];
  let normalized = command;

  const mkdirPMatch = normalized.match(/^mkdir\s+-p\s+(.+)$/);
  if (mkdirPMatch) {
    const raw = mkdirPMatch[1].trim();
    const paths = raw.match(/(?:"[^"]+"|'[^']+'|[^\s]+)/g) ?? [raw];
    const converted = paths
      .map((p) => p.replace(/^['"]|['"]$/g, "").replace(/\//g, "\\"))
      .map((p) => `mkdir \"${p}\"`)
      .join(" && ");
    normalized = converted;
    notes.push("translated Unix mkdir -p to Windows mkdir");
  }

  return { command: normalized, notes };
}


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
        "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Use this for new files or full rewrites only.",
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
      name: "edit_file",
      description:
        "Edit an existing file by replacing exact text. Prefer this over write_file for small or localized changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit (relative to project root)",
          },
          oldText: {
            type: "string",
            description: "Exact text to find in the file",
          },
          newText: {
            type: "string",
            description: "Replacement text",
          },
          replaceAll: {
            type: "boolean",
            description: "Replace all exact matches instead of only the first one (default: false)",
          },
        },
        required: ["path", "oldText", "newText"],
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
        "Execute a shell command and return the output. Use for running tests, builds, linters, etc. Commands should match the current OS shell (Windows vs Unix). Has a 30s timeout — use run_background_command for long-running processes like dev servers.",
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
  {
    type: "function",
    function: {
      name: "run_background_command",
      description:
        "Start a long-running command in the background (e.g. dev servers, watch modes). Returns immediately with the process ID. Use this instead of run_command for processes that should keep running.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to run in the background",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_image",
      description:
        "View an image file and describe what you see. Supports PNG, JPG, GIF, WebP. Returns the image as base64 for the model to analyze.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the image file (relative to project root, or absolute path)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description:
        "Find files matching a glob pattern. Use this to locate files by name or extension across the project (e.g. '**/*.tsx', 'src/**/test.*', '*.json').",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern to match files (e.g. '**/*.ts', 'src/**/*.test.*')",
          },
          path: {
            type: "string",
            description: "Directory to search in (relative to project root, defaults to '.')",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch the content of a URL. Use this to read documentation, APIs, or any web page. Returns the text content of the response.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
          method: {
            type: "string",
            description: "HTTP method (default: GET)",
          },
          headers: {
            type: "object",
            description: "Optional HTTP headers as key-value pairs",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "think",
      description:
        "Use this tool to think through complex problems step-by-step. Your thoughts are private and not shown to the user. Use this when you need to reason about architecture, plan multi-step changes, or work through a tricky bug before acting.",
      parameters: {
        type: "object",
        properties: {
          thought: {
            type: "string",
            description: "Your internal reasoning or analysis",
          },
        },
        required: ["thought"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a question and wait for their response. Use this when you need clarification, confirmation, or additional information before proceeding. The question will be displayed to the user and their response will be returned.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user",
          },
        },
        required: ["question"],
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
      const filePath = safePath(cwd, args.path as string);
      if (!filePath) return `Error: Path escapes project root: ${args.path}`;
      if (!existsSync(filePath)) return `Error: File not found: ${args.path}`;
      try {
        return readFileSync(filePath, "utf-8");
      } catch (e: any) {
        return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "write_file": {
      const filePath = safePath(cwd, args.path as string);
      if (!filePath) return `Error: Path escapes project root: ${args.path}`;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, args.content as string, "utf-8");
        return `✅ Wrote ${(args.content as string).length} bytes to ${args.path}`;
      } catch (e: any) {
        return `Error writing file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "edit_file": {
      const filePath = safePath(cwd, args.path as string);
      if (!filePath) return `Error: Path escapes project root: ${args.path}`;
      if (!existsSync(filePath)) return `Error: File not found: ${args.path}`;
      try {
        const oldText = String(args.oldText ?? "");
        const newText = String(args.newText ?? "");
        const replaceAll = Boolean(args.replaceAll);
        const content = readFileSync(filePath, "utf-8");
        if (!oldText) return "Error: oldText cannot be empty.";
        if (!content.includes(oldText)) {
          return `Error: Could not find exact text in ${args.path}`;
        }

        const matchCount = content.split(oldText).length - 1;
        const nextContent = replaceAll
          ? content.split(oldText).join(newText)
          : content.replace(oldText, newText);

        writeFileSync(filePath, nextContent, "utf-8");
        return `✅ Edited ${args.path} (${replaceAll ? matchCount : 1} replacement${replaceAll ? (matchCount === 1 ? "" : "s") : ""})`;
      } catch (e: any) {
        return `Error editing file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "list_files": {
      const dirPath = safePath(cwd, (args.path as string) || ".");
      if (!dirPath) return `Error: Path escapes project root: ${args.path}`;
      if (!existsSync(dirPath)) return `Error: Directory not found: ${args.path}`;
      try {
        const entries = listDir(dirPath, cwd, args.recursive as boolean);
        return entries.join("\n");
      } catch (e: any) {
        return `Error listing files: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "search_files": {
      const searchPath = safePath(cwd, (args.path as string) || ".");
      if (!searchPath) return `Error: Path escapes project root: ${args.path}`;
      try {
        return searchInFiles(searchPath, args.pattern as string, cwd);
      } catch (e: any) {
        return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "run_command": {
      try {
        const { execSync } = await import("child_process");
        const original = String(args.command ?? "");
        let command = original;
        let notes: string[] = [];

        const options: any = {
          cwd,
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        };

        if (process.platform === "win32") {
          const normalized = normalizeWindowsCommand(original);
          command = normalized.command;
          notes = normalized.notes;
          options.shell = process.env.ComSpec || "cmd.exe";
        }

        const output = execSync(command, options);
        const prefix = notes.length > 0 ? `[note: ${notes.join(", ")}]\n` : "";
        return prefix + (output || "(no output)");
      } catch (e: any) {
        const stderr = e.stderr || e.message || String(e);
        const original = String(args.command ?? "");
        if (process.platform === "win32" && /mkdir\s+-p/i.test(original)) {
          return `Command failed: ${stderr}\nHint: Unix-style \`mkdir -p\` was used on Windows. Use plain \`mkdir path\` commands or let Codemaxxing retry with a Windows-safe command.`;
        }
        return `Command failed: ${stderr}`;
      }
    }

    case "run_background_command": {
      try {
        const { spawn } = await import("child_process");
        const command = String(args.command ?? "");
        const shell = process.platform === "win32"
          ? (process.env.ComSpec || "cmd.exe")
          : true;

        const child = spawn(command, [], {
          shell,
          cwd,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Collect first few lines of output to confirm it started
        let earlyOutput = "";
        const collectEarly = (chunk: Buffer) => {
          earlyOutput += chunk.toString("utf-8");
          if (earlyOutput.length > 2000) {
            child.stdout?.removeListener("data", collectEarly);
            child.stderr?.removeListener("data", collectEarly);
          }
        };
        child.stdout?.on("data", collectEarly);
        child.stderr?.on("data", collectEarly);

        // Give it a moment to start and produce output
        await new Promise(r => setTimeout(r, 1500));

        child.stdout?.removeListener("data", collectEarly);
        child.stderr?.removeListener("data", collectEarly);
        child.unref();

        const pid = child.pid ?? "unknown";
        const preview = earlyOutput.trim().slice(0, 500);
        return `✅ Started in background (PID ${pid})${preview ? `\n\nEarly output:\n${preview}` : ""}`;
      } catch (e: any) {
        return `Failed to start background command: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "view_image": {
      try {
        const userPath = String(args.path ?? "");
        // Support both absolute paths and project-relative paths
        const filePath = userPath.startsWith("/")
          ? userPath
          : safePath(cwd, userPath);
        if (!filePath) return `Error: Path escapes project root: ${userPath}`;
        if (!existsSync(filePath)) return `Error: Image not found: ${userPath}`;

        const ext = extname(filePath).toLowerCase();
        const supportedExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
        if (!supportedExts.includes(ext)) {
          return `Error: Unsupported image format: ${ext}. Supported: ${supportedExts.join(", ")}`;
        }

        const data = readFileSync(filePath);
        const base64 = data.toString("base64");
        const mimeTypes: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".bmp": "image/bmp",
          ".svg": "image/svg+xml",
        };
        const mime = mimeTypes[ext] || "image/png";
        const sizeKB = (data.length / 1024).toFixed(1);

        // Return as a structured response the agent can use for vision
        return JSON.stringify({
          type: "image",
          mime,
          base64,
          path: userPath,
          size: `${sizeKB} KB`,
        });
      } catch (e: any) {
        return `Error viewing image: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "glob": {
      try {
        const pattern = String(args.pattern ?? "");
        const baseDir = safePath(cwd, (args.path as string) || ".") || cwd;
        const matches = fsGlobSync(pattern, { cwd: baseDir })
          .map((f: string) => relative(cwd, join(baseDir, f)))
          .filter((f: string) => !f.includes("node_modules") && !f.startsWith(".git/"))
          .sort();
        if (matches.length === 0) return `No files matching: ${pattern}`;
        return matches.slice(0, 100).join("\n") + (matches.length > 100 ? `\n... (${matches.length - 100} more)` : "");
      } catch (e: any) {
        return `Error globbing: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "web_fetch": {
      try {
        const url = String(args.url ?? "");
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return "Error: URL must start with http:// or https://";
        }
        const method = String(args.method ?? "GET").toUpperCase();
        const headers = (args.headers as Record<string, string>) || {};
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
          method,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        // Strip HTML tags for readability if it's HTML
        let content = text;
        if (contentType.includes("text/html")) {
          content = text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        }
        // Truncate very long responses
        if (content.length > 50000) {
          content = content.slice(0, 50000) + `\n\n... (truncated, ${text.length} total chars)`;
        }
        return `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${content}`;
      } catch (e: any) {
        return `Error fetching URL: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "think": {
      // Think tool is a no-op — the model's reasoning is captured in the tool call itself.
      // We return a brief acknowledgment so the model knows it was processed.
      return "(thinking complete)";
    }

    case "ask_user": {
      // The ask_user tool is handled specially by the agent — it pauses execution
      // and shows the question to the user. The result comes from user input.
      // This fallback shouldn't normally be reached since the agent intercepts it.
      return `[Question for user]: ${args.question}`;
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
  const fullPath = safePath(cwd, filePath);
  if (!fullPath || !existsSync(fullPath)) return null;
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
