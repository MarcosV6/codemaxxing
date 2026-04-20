import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, globSync as fsGlobSync, realpathSync } from "fs";
import { homedir } from "os";
import { join, relative, dirname, resolve, extname } from "path";
import { loadIgnorePatterns } from "../utils/ignore.js";

function isInsideRoot(resolved: string, root: string): boolean {
  if (resolved === root) return true;
  if (resolved.startsWith(root + "/")) return true;
  if (process.platform === "win32" && resolved.startsWith(root + "\\")) return true;
  return false;
}

/**
 * Resolve a user-provided path against cwd and ensure it doesn't escape the project root.
 * Returns the resolved absolute path, or null if the path escapes cwd — either
 * through `..` traversal or by pointing at a symlink whose real target lives
 * outside the root.
 */
function safePath(cwd: string, userPath: string | undefined | null): string | null {
  if (!userPath || typeof userPath !== "string") return null;
  const expandedPath =
    userPath === "~"
      ? homedir()
      : userPath.startsWith("~/") || userPath.startsWith("~\\")
        ? join(homedir(), userPath.slice(2))
        : userPath;
  const resolved = resolve(cwd, expandedPath);
  const root = resolve(cwd);
  if (!isInsideRoot(resolved, root)) return null;

  // Realpath check: if the target (or any ancestor that exists) is a symlink
  // pointing outside the root, reject. We walk up until we find an existing
  // path so this also works for writes that create new files.
  try {
    let probe = resolved;
    while (probe && !existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    if (existsSync(probe)) {
      const realProbe = realpathSync(probe);
      const realRoot = realpathSync(root);
      if (!isInsideRoot(realProbe, realRoot)) return null;
    }
  } catch {
    // realpath can fail on permission issues or broken symlinks — in those
    // cases fall back to the lexical check we already did above.
  }
  return resolved;
}

function pathError(rawPath: unknown): string {
  if (rawPath === undefined || rawPath === null || rawPath === "") {
    return "Error: Empty or missing path argument";
  }
  if (typeof rawPath !== "string") {
    return `Error: Path argument must be a string, got ${typeof rawPath}`;
  }
  return `Error: Path escapes project root: ${rawPath}`;
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

const SHELL_FILE_WRITE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".css", ".go", ".h", ".hpp", ".html", ".ini", ".java",
  ".js", ".json", ".jsx", ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".sass",
  ".scss", ".sh", ".sql", ".svelte", ".toml", ".ts", ".tsx", ".txt", ".vue",
  ".yaml", ".yml", ".zsh",
]);

const SHELL_FILE_WRITE_BASENAMES = new Set([
  "dockerfile",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "index.html",
  "readme.md",
]);

function normalizeShellTarget(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeProjectSourceTarget(target: string): boolean {
  const normalized = normalizeShellTarget(target).toLowerCase();
  if (!normalized) return false;
  const base = normalized.split(/[\\/]/).pop() || normalized;
  if (SHELL_FILE_WRITE_BASENAMES.has(base)) return true;
  const extension = extname(base);
  if (extension && SHELL_FILE_WRITE_EXTENSIONS.has(extension)) return true;
  return normalized.includes("/src/") || normalized.includes("\\src\\");
}

function extractShellWriteTargets(command: string): string[] {
  const targets: string[] = [];
  const redirectRe = /(?:^|[^0-9])(?:>>?|1>>?|1>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
  const teeRe = /\btee\s+(?:-a\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;

  for (const regex of [redirectRe, teeRe]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(command)) !== null) {
      const target = normalizeShellTarget(match[1] || match[2] || match[3] || "");
      if (target) targets.push(target);
    }
  }

  return targets;
}

export function getShellFileWriteGuardReason(command: string): string | null {
  const targets = extractShellWriteTargets(command).filter(looksLikeProjectSourceTarget);
  if (targets.length === 0) return null;

  const usesInlineShellFileWriting =
    /\b(?:cat|echo|printf|tee)\b/i.test(command) ||
    /<<['"]?[A-Za-z0-9_-]+['"]?/i.test(command) ||
    />/.test(command);

  if (!usesInlineShellFileWriting) return null;

  const sample = targets.slice(0, 3).join(", ");
  return `Blocked: run_command should not be used to write project files (${sample}). Use write_file or edit_file for source/config files, then use run_command only for installs, builds, tests, or launching the app.`;
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
        "Execute a shell command and return the output. Use for running installs, builds, tests, linters, and one-shot verification commands. Do NOT use this to create or edit project files with shell redirection, heredocs, echo, cat, or tee — use write_file/edit_file for source files. Package manager commands (npm install, yarn, pip install, cargo build, etc.) get a 5-minute timeout; other commands have a 30s timeout. Use run_background_command for long-running processes like dev servers.",
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
      name: "web_search",
      description:
        "Search the web for information. Returns a list of relevant results with titles, URLs, and snippets. Use this to find documentation, solutions, APIs, or any information not available locally.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          count: {
            type: "number",
            description: "Number of results to return (default: 5, max: 10)",
          },
        },
        required: ["query"],
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
  {
    type: "function",
    function: {
      name: "remember_memory",
      description:
        "Save information to persistent memory for future sessions. Use this to remember user preferences, project decisions, successful workflows, or important facts. Memories persist across sessions and are automatically loaded.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["user", "project", "workflow", "preference", "fact"],
            description:
              "Memory type: 'user' for user info/prefs, 'project' for architecture/decisions, 'workflow' for successful patterns, 'preference' for coding style, 'fact' for important facts",
          },
          key: {
            type: "string",
            description: "Short identifier for this memory (e.g., 'preferred-language', 'test-framework', 'deploy-process')",
          },
          content: {
            type: "string",
            description: "The information to remember",
          },
          importance: {
            type: "number",
            description: "How important is this (0.0-1.0). Default 0.5. Use 0.8+ for critical info, 0.3 for nice-to-know.",
          },
        },
        required: ["type", "key", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "Search persistent memory for information from past sessions. Use this when the user references past work, asks 'do you remember', or when you need context about the user or project.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query — keywords to find relevant memories",
          },
          type: {
            type: "string",
            enum: ["user", "project", "workflow", "preference", "fact"],
            description: "Optional: filter by memory type",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a task in the progress checklist shown to the user. Use this to break down your work into visible steps so the user can see what you're doing. Each task appears as a checklist item. Create tasks at the start of multi-step work.",
      parameters: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Short task description (e.g., 'Read configuration files', 'Fix failing tests')",
          },
          active_label: {
            type: "string",
            description: "Optional present-tense label shown while working (e.g., 'Reading config files...')",
          },
        },
        required: ["label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Update the status of a task in the progress checklist. Mark tasks as 'in_progress' when you start working on them and 'completed' when done.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The task ID returned by create_task",
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"],
            description: "New status for the task",
          },
        },
        required: ["id", "status"],
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
      const rawPath = (args.path ?? args.file_path ?? args.filepath ?? args.filename) as string | undefined;
      if (!rawPath) return `Error: Missing required 'path' argument. Received args: ${Object.keys(args).join(", ")}`;
      const filePath = safePath(cwd, rawPath);
      if (!filePath) return pathError(rawPath);
      if (!existsSync(filePath)) return `Error: File not found: ${rawPath}`;
      try {
        // Handle Jupyter notebooks
        if (extname(filePath).toLowerCase() === ".ipynb") {
          const raw = readFileSync(filePath, "utf-8");
          const nb = JSON.parse(raw);
          const cells = nb.cells || [];
          const parts: string[] = [`# Notebook: ${args.path} (${cells.length} cells)\n`];
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const cellType = cell.cell_type || "unknown";
            const source = Array.isArray(cell.source) ? cell.source.join("") : (cell.source || "");
            parts.push(`## Cell ${i + 1} [${cellType}]`);
            if (cellType === "code") {
              parts.push("```python\n" + source + "\n```");
              // Include outputs
              if (cell.outputs && cell.outputs.length > 0) {
                for (const output of cell.outputs) {
                  if (output.text) {
                    const text = Array.isArray(output.text) ? output.text.join("") : output.text;
                    parts.push("Output:\n```\n" + text.slice(0, 2000) + "\n```");
                  } else if (output.data?.["text/plain"]) {
                    const text = Array.isArray(output.data["text/plain"]) ? output.data["text/plain"].join("") : output.data["text/plain"];
                    parts.push("Output:\n```\n" + text.slice(0, 2000) + "\n```");
                  }
                }
              }
            } else {
              parts.push(source);
            }
            parts.push("");
          }
          return parts.join("\n");
        }

        // Handle PDF files (basic text extraction)
        if (extname(filePath).toLowerCase() === ".pdf") {
          return `[PDF file: ${args.path}] — Use a PDF-specific tool or run: pdftotext "${filePath}" - to extract text.`;
        }

        return readFileSync(filePath, "utf-8");
      } catch (e: any) {
        return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "write_file": {
      // LLMs sometimes use alternative arg names — normalize
      const rawPath = (args.path ?? args.file_path ?? args.filepath ?? args.filename) as string | undefined;
      const rawContent = (args.content ?? args.text ?? args.data) as string | undefined;
      if (!rawPath) return `Error: Missing required 'path' argument. Received args: ${Object.keys(args).join(", ")}`;
      if (rawContent === undefined) return `Error: Missing required 'content' argument.`;
      const filePath = safePath(cwd, rawPath);
      if (!filePath) return pathError(rawPath);
      try {
        const existed = existsSync(filePath);
        const oldContent = existed ? readFileSync(filePath, "utf-8") : "";
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, rawContent, "utf-8");

        const newLines = rawContent.split("\n");
        const added = existed
          ? newLines.filter(l => !oldContent.includes(l)).length
          : newLines.length;
        const removed = existed
          ? oldContent.split("\n").filter(l => !rawContent.includes(l)).length
          : 0;
        const diffStr = generateDiff(oldContent, rawContent, rawPath);
        return `✅ Wrote ${rawContent.length} bytes to ${rawPath}\n<<<DIFF>>>${rawPath}\n+${added} -${removed}\n${diffStr}<<<END_DIFF>>>`;
      } catch (e: any) {
        return `Error writing file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "edit_file": {
      const rawPath = (args.path ?? args.file_path ?? args.filepath ?? args.filename) as string | undefined;
      if (!rawPath) return `Error: Missing required 'path' argument. Received args: ${Object.keys(args).join(", ")}`;
      const filePath = safePath(cwd, rawPath);
      if (!filePath) return pathError(rawPath);
      if (!existsSync(filePath)) return `Error: File not found: ${rawPath}`;
      try {
        const oldText = String(args.oldText ?? "");
        const newText = String(args.newText ?? "");
        const replaceAll = Boolean(args.replaceAll);
        const content = readFileSync(filePath, "utf-8");
        if (!oldText) return "Error: oldText cannot be empty.";
        if (oldText === newText) return "Error: oldText and newText are identical — nothing to do.";
        if (!content.includes(oldText)) {
          return `Error: Could not find exact text in ${rawPath}`;
        }

        const matchCount = content.split(oldText).length - 1;
        if (!replaceAll && matchCount > 1) {
          return `Error: oldText matches ${matchCount} locations in ${rawPath}. Either include more surrounding context so the match is unique, or pass replaceAll=true to update every occurrence.`;
        }

        // Avoid String.prototype.replace() here: replacement strings interpret
        // `$&`, `$1`, `$$`, etc., which corrupts literal shell vars / regex text.
        const parts = content.split(oldText);
        const nextContent = replaceAll
          ? parts.join(newText)
          : parts[0] + newText + parts.slice(1).join(oldText);

        writeFileSync(filePath, nextContent, "utf-8");
        const diffStr = generateDiff(content, nextContent, rawPath);
        const addedLines = newText.split("\n").length;
        const removedLines = oldText.split("\n").length;
        const replacements = replaceAll ? matchCount : 1;
        const summary = `✅ Edited ${rawPath} (${replacements} replacement${replacements === 1 ? "" : "s"})`;
        return `${summary}\n<<<DIFF>>>${rawPath}\n+${addedLines} -${removedLines}\n${diffStr}<<<END_DIFF>>>`;
      } catch (e: any) {
        return `Error editing file: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "list_files": {
      const dirPath = safePath(cwd, (args.path as string) || ".");
      if (!dirPath) return pathError(args.path);
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
      if (!searchPath) return pathError(args.path);
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
        const blockedReason = getShellFileWriteGuardReason(original);
        if (blockedReason) return blockedReason;
        let command = original;
        let notes: string[] = [];

        // Package-manager installs and builds can take much longer than 30s
        const isLongRunning = /\b(npm\s+(install|i|ci|run\s+build|run\s+dev)|yarn(\s+install|\s+add)?|pnpm\s+(install|i|add)|bun\s+(install|i|add)|pip\s+install|cargo\s+build|go\s+build|mvn|gradle)\b/i.test(original);
        const timeout = isLongRunning ? 300000 : 30000; // 5min for installs, 30s otherwise
        const maxBuffer = isLongRunning ? 10 * 1024 * 1024 : 1024 * 1024; // 10MB vs 1MB

        const options: any = {
          cwd,
          encoding: "utf-8",
          timeout,
          maxBuffer,
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
        const original = String(args.command ?? "");
        // Distinguish timeout kills from regular failures
        if (e.killed) {
          const isLongRunning = /\b(npm\s+(install|i|ci|run\s+build|run\s+dev)|yarn(\s+install|\s+add)?|pnpm\s+(install|i|add)|bun\s+(install|i|add)|pip\s+install|cargo\s+build|go\s+build|mvn|gradle)\b/i.test(original);
          const limitSecs = isLongRunning ? 300 : 30;
          return `Command timed out after ${limitSecs}s: ${original}\nHint: Use run_background_command for long-running processes, or break the command into smaller steps.`;
        }
        const stderr = e.stderr || e.message || String(e);
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

        // Track early exit so we can report failures instead of false success
        let exitCode: number | null = null;
        child.on("exit", (code) => { exitCode = code; });

        // Collect first few lines of output to confirm it started
        let earlyOutput = "";
        let earlyStderr = "";
        const collectStdout = (chunk: Buffer) => {
          earlyOutput += chunk.toString("utf-8");
          if (earlyOutput.length > 2000) {
            child.stdout?.removeListener("data", collectStdout);
          }
        };
        const collectStderr = (chunk: Buffer) => {
          earlyStderr += chunk.toString("utf-8");
          if (earlyStderr.length > 2000) {
            child.stderr?.removeListener("data", collectStderr);
          }
        };
        child.stdout?.on("data", collectStdout);
        child.stderr?.on("data", collectStderr);

        // Give it a moment to start and produce output
        await new Promise(r => setTimeout(r, 1500));

        child.stdout?.removeListener("data", collectStdout);
        child.stderr?.removeListener("data", collectStderr);
        child.unref();

        // If the process already exited with an error, report failure
        if (exitCode !== null && exitCode !== 0) {
          const errOutput = (earlyStderr || earlyOutput).trim().slice(0, 1000);
          return `Command failed immediately (exit code ${exitCode})${errOutput ? `:\n${errOutput}` : ""}`;
        }

        const pid = child.pid ?? "unknown";
        const preview = (earlyOutput || earlyStderr).trim().slice(0, 500);
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
        if (!filePath) return pathError(userPath);
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
        const isIgnored = loadIgnorePatterns(cwd);
        const matches = fsGlobSync(pattern, { cwd: baseDir })
          .map((f: string) => relative(cwd, join(baseDir, f)))
          .filter((f: string) => !f.includes("node_modules") && !f.startsWith(".git/") && !isIgnored(f))
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

    case "web_search": {
      try {
        const query = String(args.query ?? "");
        if (!query) return "Error: search query is required";
        const count = Math.min(Number(args.count ?? 5), 10);

        // Use DuckDuckGo HTML search (no API key needed)
        const encodedQuery = encodeURIComponent(query);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQuery}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; codemaxxing/1.0)",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const html = await res.text();

        // Parse results from DuckDuckGo HTML
        const results: string[] = [];
        const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < count) {
          const url = match[1].replace(/&amp;/g, "&");
          const title = match[2].replace(/<[^>]+>/g, "").trim();
          const snippet = match[3].replace(/<[^>]+>/g, "").trim();
          if (title && url) {
            results.push(`${results.length + 1}. ${title}\n   ${url}\n   ${snippet}`);
          }
        }

        if (results.length === 0) {
          // Fallback: try simpler parsing
          const linkRegex = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
          while ((match = linkRegex.exec(html)) !== null && results.length < count) {
            const title = match[1].replace(/<[^>]+>/g, "").trim();
            if (title) results.push(`${results.length + 1}. ${title}`);
          }
        }

        return results.length > 0
          ? `Search results for "${query}":\n\n${results.join("\n\n")}`
          : `No results found for "${query}". Try a different search query.`;
      } catch (e: any) {
        return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
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

    case "remember_memory": {
      const { remember } = await import("../utils/memory.js");
      const memType = String(args.type) as any;
      const scope = cwd.replace(/\//g, "_").replace(/^_/, "");
      const mem = remember(memType, String(args.key), String(args.content), {
        scope: memType === "user" || memType === "preference" ? "global" : scope,
        importance: (args.importance as number) ?? 0.5,
      });
      return `Memory saved: [${mem.type}] ${mem.key} (importance: ${mem.importance})`;
    }

    case "create_task": {
      const { createTask } = await import("../utils/task-tracker.js");
      const id = createTask(String(args.label), args.active_label ? String(args.active_label) : undefined);
      return `Task #${id} created.`;
    }

    case "update_task": {
      const { updateTask } = await import("../utils/task-tracker.js");
      const ok = updateTask(Number(args.id), String(args.status) as any);
      return ok ? `Task #${args.id} updated to ${args.status}.` : `Task #${args.id} not found.`;
    }

    case "recall_memory": {
      const { recall } = await import("../utils/memory.js");
      const results = recall(String(args.query), {
        type: args.type ? String(args.type) as any : undefined,
        limit: 10,
      });
      if (results.length === 0) return "No memories found matching that query.";
      return results.map(m =>
        `[${m.type}] ${m.key}: ${m.content} (importance: ${m.importance}, last updated: ${m.updated_at})`
      ).join("\n");
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
  const isIgnored = loadIgnorePatterns(cwd);

  for (const entry of readdirSync(dirPath)) {
    if (IGNORE.includes(entry)) continue;
    const fullPath = join(dirPath, entry);
    const rel = relative(cwd, fullPath);
    if (isIgnored(rel)) continue;
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

/**
 * Detect regex shapes that commonly trigger catastrophic backtracking. This is
 * a heuristic — it won't catch every hostile pattern, but it stops the
 * textbook cases (`(a+)+`, `(a|a)*`, `(.*)*`) from hanging the agent.
 * Returns a human description of the hazard, or null if the pattern looks OK.
 */
function detectReDoSHazard(pattern: string): string | null {
  // Nested quantifier on a group: (...)+ (...)* where the group itself ends
  // with an unbounded quantifier.
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) {
    return "nested quantifier on a repeated group";
  }
  // (a|a)* / (x|x)+ — alternation over simple literals followed by unbounded
  // quantifier. Captures the classic `(a|a)*` shape.
  if (/\([^()]*\|[^()]*\)[+*]/.test(pattern)) {
    return "alternation under an unbounded quantifier";
  }
  // .* or .+ followed by another .* / .+ — two unbounded dots race for the
  // same text.
  if (/\.[+*].*\.[+*]/.test(pattern)) {
    return "multiple unbounded dot-quantifiers";
  }
  return null;
}

function searchInFiles(
  dirPath: string,
  pattern: string,
  cwd: string
): string {
  const results: string[] = [];
  const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__"];
  if (typeof pattern !== "string" || pattern.length === 0) {
    return "Error: search pattern must be a non-empty string";
  }
  if (pattern.length > 500) {
    return "Error: search pattern too long (max 500 chars)";
  }
  // ReDoS preflight — reject patterns with classic catastrophic-backtracking
  // shapes (nested quantifiers, alternations over quantified groups) before
  // we hand them to the engine and block the event loop.
  const redosHazard = detectReDoSHazard(pattern);
  if (redosHazard) {
    return `Error: regex rejected (potential ReDoS): ${redosHazard}. Anchor the pattern or remove nested quantifiers.`;
  }
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gi");
  } catch (e: any) {
    return `Error: invalid regex pattern: ${e.message}`;
  }
  const isIgnored = loadIgnorePatterns(cwd);

  function search(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (IGNORE.includes(entry)) continue;
      const fullPath = join(dir, entry);
      const rel = relative(cwd, fullPath);
      if (isIgnored(rel)) continue;
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
