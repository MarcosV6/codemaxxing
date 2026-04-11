#!/usr/bin/env node

/**
 * Codemaxxing CLI entry point
 * Routes subcommands (login, auth, exec) to handlers, everything else to the TUI
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
  version: string;
};

function printHelp(): void {
  console.log(`codemaxxing v${pkg.version}

Usage:
  codemaxxing                Start the interactive TUI
  codemaxxing exec <prompt>  Run headless/CI mode
  codemaxxing serve          Start the HTTP/SSE server
  codemaxxing login          Open provider login flow
  codemaxxing auth ...       Manage auth credentials

Flags:
  -h, --help                 Show this help message
  -v, --version              Show version
`);
}

const subcmd = process.argv[2];

if (subcmd === "-h" || subcmd === "--help" || subcmd === "help") {
  printHelp();
} else if (subcmd === "-v" || subcmd === "--version" || subcmd === "version") {
  console.log(pkg.version);
} else if (subcmd === "login" || subcmd === "auth") {
  // Route to auth CLI (spawn is fine here — no TUI/raw mode needed)
  const authScript = join(__dirname, "auth-cli.js");
  const args = subcmd === "login"
    ? [authScript, "login", ...process.argv.slice(3)]
    : [authScript, ...process.argv.slice(3)];

  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  child.on("exit", (code) => process.exit(code ?? 0));
} else if (subcmd === "exec") {
  // Headless/CI mode — no TUI
  const { runExec } = await import("./exec.js");
  await runExec(process.argv.slice(3));
} else if (subcmd === "serve") {
  // HTTP server mode — expose agent over HTTP/SSE
  const { runServe } = await import("./serve.js");
  await runServe(process.argv.slice(3));
} else {
  // TUI mode — import directly (not spawn) to preserve raw stdin
  await import("./index.js");
}
