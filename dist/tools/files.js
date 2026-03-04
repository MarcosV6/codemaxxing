import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
/**
 * Tool definitions for the OpenAI function calling API
 */
export const FILE_TOOLS = [
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
            description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
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
            description: "List files and directories in the given path. Returns file names and types.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Directory path to list (relative to project root, defaults to '.')",
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
            description: "Execute a shell command and return the output. Use for running tests, builds, linters, etc.",
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
export async function executeTool(name, args, cwd) {
    switch (name) {
        case "read_file": {
            const filePath = join(cwd, args.path);
            if (!existsSync(filePath))
                return `Error: File not found: ${args.path}`;
            try {
                return readFileSync(filePath, "utf-8");
            }
            catch (e) {
                return `Error reading file: ${e}`;
            }
        }
        case "write_file": {
            const filePath = join(cwd, args.path);
            try {
                writeFileSync(filePath, args.content, "utf-8");
                return `✅ Wrote ${args.content.length} bytes to ${args.path}`;
            }
            catch (e) {
                return `Error writing file: ${e}`;
            }
        }
        case "list_files": {
            const dirPath = join(cwd, args.path || ".");
            if (!existsSync(dirPath))
                return `Error: Directory not found: ${args.path}`;
            try {
                const entries = listDir(dirPath, cwd, args.recursive);
                return entries.join("\n");
            }
            catch (e) {
                return `Error listing files: ${e}`;
            }
        }
        case "search_files": {
            const searchPath = join(cwd, args.path || ".");
            try {
                return searchInFiles(searchPath, args.pattern, cwd);
            }
            catch (e) {
                return `Error searching: ${e}`;
            }
        }
        case "run_command": {
            try {
                const { execSync } = await import("child_process");
                const output = execSync(args.command, {
                    cwd,
                    encoding: "utf-8",
                    timeout: 30000,
                    maxBuffer: 1024 * 1024,
                });
                return output || "(no output)";
            }
            catch (e) {
                return `Command failed: ${e.stderr || e.message}`;
            }
        }
        default:
            return `Unknown tool: ${name}`;
    }
}
function listDir(dirPath, cwd, recursive = false, depth = 0) {
    const entries = [];
    const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__"];
    for (const entry of readdirSync(dirPath)) {
        if (IGNORE.includes(entry))
            continue;
        const fullPath = join(dirPath, entry);
        const rel = relative(cwd, fullPath);
        const stat = statSync(fullPath);
        const prefix = "  ".repeat(depth);
        if (stat.isDirectory()) {
            entries.push(`${prefix}📁 ${rel}/`);
            if (recursive && depth < 3) {
                entries.push(...listDir(fullPath, cwd, true, depth + 1));
            }
        }
        else {
            const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)}KB` : `${stat.size}B`;
            entries.push(`${prefix}📄 ${rel} (${size})`);
        }
    }
    return entries;
}
function searchInFiles(dirPath, pattern, cwd) {
    const results = [];
    const IGNORE = ["node_modules", ".git", "dist", ".next", "__pycache__"];
    const regex = new RegExp(pattern, "gi");
    function search(dir) {
        for (const entry of readdirSync(dir)) {
            if (IGNORE.includes(entry))
                continue;
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                search(fullPath);
            }
            else if (stat.size < 100000) {
                try {
                    const content = readFileSync(fullPath, "utf-8");
                    const lines = content.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        if (regex.test(lines[i])) {
                            results.push(`${relative(cwd, fullPath)}:${i + 1}: ${lines[i].trim()}`);
                        }
                        regex.lastIndex = 0;
                    }
                }
                catch {
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
