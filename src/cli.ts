#!/usr/bin/env node

/**
 * Codemaxxing CLI entry point
 * Routes subcommands (login, auth) to auth-cli, everything else to the TUI
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const subcmd = process.argv[2];

if (subcmd === "login" || subcmd === "auth") {
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
} else {
  // TUI mode — import directly (not spawn) to preserve raw stdin
  await import("./index.js");
}
