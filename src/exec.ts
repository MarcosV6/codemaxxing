/**
 * Headless/CI execution mode — runs agent without TUI
 * Usage: codemaxxing exec "your prompt here"
 * Flags: --auto-approve, --json, --model <model>, --provider <name>
 * Supports stdin pipe: echo "fix the tests" | codemaxxing exec
 */

import { CodingAgent } from "./agent.js";
import { loadConfig, applyOverrides, detectLocalProvider } from "./config.js";
import { getCredential } from "./utils/auth.js";
import { disconnectAll } from "./utils/mcp.js";

interface ExecArgs {
  prompt: string;
  autoApprove: boolean;
  json: boolean;
  model?: string;
  provider?: string;
}

function parseExecArgs(argv: string[]): ExecArgs {
  const args: ExecArgs = {
    prompt: "",
    autoApprove: false,
    json: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--auto-approve") {
      args.autoApprove = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if ((arg === "--model" || arg === "-m") && next) {
      args.model = next;
      i++;
    } else if ((arg === "--provider" || arg === "-p") && next) {
      args.provider = next;
      i++;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  args.prompt = positional.join(" ");
  return args;
}

async function readStdin(): Promise<string> {
  // Check if stdin has data (piped input)
  if (process.stdin.isTTY) return "";

  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data.trim()));
    // Timeout after 1s if no data arrives
    setTimeout(() => resolve(data.trim()), 1000);
  });
}

export async function runExec(argv: string[]): Promise<void> {
  const args = parseExecArgs(argv);

  // Read from stdin if no prompt provided
  if (!args.prompt) {
    args.prompt = await readStdin();
  }

  if (!args.prompt) {
    process.stderr.write("Error: No prompt provided.\n");
    process.stderr.write("Usage: codemaxxing exec \"your prompt here\"\n");
    process.stderr.write("       echo \"fix tests\" | codemaxxing exec\n");
    process.stderr.write("\nFlags:\n");
    process.stderr.write("  --auto-approve   Skip approval prompts\n");
    process.stderr.write("  --json           JSON output\n");
    process.stderr.write("  -m, --model      Model to use\n");
    process.stderr.write("  -p, --provider   Provider profile\n");
    process.exit(1);
  }

  // Resolve provider config
  const rawConfig = loadConfig();
  const cliArgs = {
    model: args.model,
    provider: args.provider,
  };
  const config = applyOverrides(rawConfig, cliArgs);
  let provider = config.provider;

  // Auto-detect local provider if needed
  if (provider.model === "auto" || (provider.baseUrl === "http://localhost:1234/v1" && !args.provider)) {
    const detected = await detectLocalProvider();
    if (detected) {
      if (args.model) detected.model = args.model;
      provider = detected;
    } else if (!args.provider) {
      process.stderr.write("Error: No LLM provider found. Start a local server or use --provider.\n");
      process.exit(1);
    }
  }

  process.stderr.write(`Provider: ${provider.baseUrl}\n`);
  process.stderr.write(`Model: ${provider.model}\n`);
  process.stderr.write(`Prompt: ${args.prompt.slice(0, 100)}${args.prompt.length > 100 ? "..." : ""}\n`);
  process.stderr.write("---\n");

  const cwd = process.cwd();
  let hasChanges = false;
  let fullResponse = "";
  const toolResults: Array<{ tool: string; args: Record<string, unknown>; result: string }> = [];

  const agent = new CodingAgent({
    provider,
    cwd,
    maxTokens: config.defaults.maxTokens,
    autoApprove: args.autoApprove,
    onToken: (token) => {
      if (!args.json) {
        process.stdout.write(token);
      }
      fullResponse += token;
    },
    onToolCall: (name, toolArgs) => {
      process.stderr.write(`Tool: ${name}(${Object.values(toolArgs).map(v => String(v).slice(0, 60)).join(", ")})\n`);
      if (name === "write_file") hasChanges = true;
    },
    onToolResult: (name, result) => {
      const lines = result.split("\n").length;
      process.stderr.write(`  └ ${lines} lines\n`);
      toolResults.push({ tool: name, args: {}, result });
    },
    onToolApproval: async (name, toolArgs, diff) => {
      if (args.autoApprove) return "yes";
      // In non-interactive mode without auto-approve, deny dangerous tools
      process.stderr.write(`⚠ Denied ${name} (use --auto-approve to allow)\n`);
      return "no";
    },
    onMCPStatus: (server, status) => {
      process.stderr.write(`MCP ${server}: ${status}\n`);
    },
  });

  try {
    await agent.init();

    const mcpCount = agent.getMCPServerCount();
    if (mcpCount > 0) {
      process.stderr.write(`MCP: ${mcpCount} server${mcpCount > 1 ? "s" : ""} connected\n`);
    }

    await agent.send(args.prompt);

    if (!args.json) {
      // Ensure newline at end of output
      process.stdout.write("\n");
    } else {
      // JSON output mode
      const output = {
        response: fullResponse,
        model: provider.model,
        tools_used: toolResults.length,
        has_changes: hasChanges,
      };
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    }

    await disconnectAll();
    process.exit(hasChanges ? 0 : 2);
  } catch (err: any) {
    await disconnectAll();
    process.stderr.write(`Error: ${err.message}\n`);
    if (args.json) {
      process.stdout.write(JSON.stringify({ error: err.message }, null, 2) + "\n");
    }
    process.exit(1);
  }
}
