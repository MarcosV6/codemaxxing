#!/usr/bin/env node

import { createInterface } from "readline";
import chalk from "chalk";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider } from "./config.js";

const VERSION = "0.1.0";

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

const SPINNER_MESSAGES = [
  "Locking in...", "Cooking...", "Maxxing...", "In the zone...",
  "Yapping...", "Frame mogging...", "Jester gooning...", "Gooning...",
  "Doing back flips...", "Jester maxxing...", "Getting baked...",
  "Blasting tren...", "Pumping...", "Wondering if I should actually do this...",
  "Hacking the main frame...", "Codemaxxing...", "Vibe coding...", "Running a marathon...",
];

// ── Neon colors ──
const neonPink = chalk.hex("#FF00FF");
const neonCyan = chalk.hex("#00FFFF");
const dimCyan = chalk.hex("#008B8B");
const glow = chalk.bold.hex("#FF44FF");

// ── TUI: alternate screen + scroll region ──
const rows = () => process.stdout.rows || 24;
const cols = () => process.stdout.columns || 80;

// Input box height (top border + input line + bottom border)
const INPUT_BOX_HEIGHT = 3;

function enterAltScreen() {
  process.stdout.write("\x1B[?1049h"); // enter alternate screen
  process.stdout.write("\x1B[2J");     // clear visible
  process.stdout.write("\x1B[3J");     // clear scrollback buffer
  process.stdout.write("\x1B[H");      // cursor home
}

function exitAltScreen() {
  process.stdout.write("\x1B[?1049l"); // restore original screen
}

function setScrollRegion(top: number, bottom: number) {
  process.stdout.write(`\x1B[${top};${bottom}r`);
}

function moveTo(row: number, col: number) {
  process.stdout.write(`\x1B[${row};${col}H`);
}

function clearLine() {
  process.stdout.write("\x1B[2K");
}

function drawInputBox(rl?: any) {
  const c = cols();
  const r = rows();
  const boxTop = r - INPUT_BOX_HEIGHT + 1;

  // Draw the 3 lines of the input box at the bottom
  moveTo(boxTop, 1);
  clearLine();
  process.stdout.write(neonCyan("┌" + "─".repeat(c - 2) + "┐"));

  moveTo(boxTop + 1, 1);
  clearLine();
  process.stdout.write(neonCyan("│") + " ".repeat(c - 2) + neonCyan("│"));

  moveTo(boxTop + 2, 1);
  clearLine();
  process.stdout.write(neonCyan("└" + "─".repeat(c - 2) + "┘"));

  // Position cursor inside the box
  moveTo(boxTop + 1, 3);
}

// Track which content row we're on (in the scroll region)
let contentRow = 1;

function writeContent(text: string) {
  const r = rows();
  const scrollBottom = r - INPUT_BOX_HEIGHT;

  // Set scroll region to content area
  setScrollRegion(1, scrollBottom);

  const lines = text.split("\n");
  for (const line of lines) {
    // If we've gone past the scroll region, it'll auto-scroll
    if (contentRow > scrollBottom) {
      contentRow = scrollBottom;
    }
    moveTo(contentRow, 1);
    clearLine();
    process.stdout.write(line);
    contentRow++;
  }

  // Reset scroll region to full screen so input box stays put
  setScrollRegion(1, r);
}

function writeContentLine(text: string) {
  writeContent(text + "\n");
}

// ── Spinner ──
function startSpinner(msg: string): { stop: () => string } {
  let i = 0;
  const startTime = Date.now();
  const r = rows();
  const scrollBottom = r - INPUT_BOX_HEIGHT;

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
    setScrollRegion(1, scrollBottom);
    moveTo(contentRow > scrollBottom ? scrollBottom : contentRow, 1);
    clearLine();
    process.stdout.write(`  ${neonCyan(frame)} ${chalk.bold.hex("#00FFFF")(msg)} ${dimCyan(`[${elapsed}s]`)}`);
    setScrollRegion(1, r);
    drawInputBox();
    i++;
  }, 80);

  return {
    stop: () => {
      clearInterval(interval);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      // Clear spinner line
      const sr = rows();
      const sb = sr - INPUT_BOX_HEIGHT;
      setScrollRegion(1, sb);
      moveTo(contentRow > sb ? sb : contentRow, 1);
      clearLine();
      setScrollRegion(1, sr);
      return elapsed;
    },
  };
}

// ── Think tag stripper ──
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

// ── Response formatter ──
function formatResponse(text: string): string {
  const lines = text.split("\n");
  const formatted: string[] = [];
  let inCodeBlock = false;

  formatted.push(neonCyan("● ") + lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      formatted.push(dimCyan(`  ${line}`));
    } else if (inCodeBlock) {
      formatted.push(neonCyan(`  ${line}`));
    } else if (line.startsWith("# ") || line.startsWith("## ")) {
      formatted.push(neonPink.bold(`  ${line}`));
    } else if (line.startsWith("- ")) {
      formatted.push(`  ${line}`);
    } else {
      formatted.push(`  ${line}`);
    }
  }
  return formatted.join("\n");
}

// ── Main ──
async function main() {
  enterAltScreen();

  // Cleanup on exit
  process.on("SIGINT", () => {
    exitAltScreen();
    process.exit(0);
  });
  process.on("exit", () => {
    exitAltScreen();
  });

  const c = cols();

  // Banner
  const bannerLines = [
    neonCyan("               ██████╗ ██████╗ ██████╗ ███████╗"),
    neonCyan("              ██╔════╝██╔═══██╗██╔══██╗██╔════╝"),
    neonCyan("              ██║     ██║   ██║██║  ██║█████╗  "),
    neonCyan("              ██║     ██║   ██║██║  ██║██╔══╝  "),
    neonCyan("              ╚██████╗╚██████╔╝██████╔╝███████╗"),
    dimCyan("               ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝"),
    neonPink("    ███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗██╗███╗   ██╗ ██████╗ "),
    neonPink("    ████╗ ████║██╔══██╗╚██╗██╔╝╚██╗██╔╝██║████╗  ██║██╔════╝ "),
    neonPink("    ██╔████╔██║███████║ ╚███╔╝  ╚███╔╝ ██║██╔██╗ ██║██║  ███╗"),
    neonPink("    ██║╚██╔╝██║██╔══██║ ██╔██╗  ██╔██╗ ██║██║╚██╗██║██║   ██║"),
    neonPink("    ██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██╔╝ ██╗██║██║ ╚████║╚██████╔╝"),
    chalk.hex("#CC00CC")("    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ "),
    "",
    `${dimCyan(`                            v${VERSION}`)}  ${neonCyan("💪")}  ${chalk.dim("your code. your model. no excuses.")}`,
    "",
  ];
  writeContent(bannerLines.join("\n"));

  // Load config + detect provider
  const config = loadConfig();
  let provider = config.provider;

  if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
    writeContentLine(dimCyan("  Detecting local LLM server..."));
    const detected = await detectLocalProvider();
    if (detected) {
      provider = detected;
      writeContentLine(`${neonCyan("  ✔")} Connected to ${neonCyan(provider.baseUrl)} → ${neonPink(provider.model)}`);
    } else {
      writeContentLine(chalk.red("  ✗ No local LLM server found. Start LM Studio or Ollama."));
      exitAltScreen();
      process.exit(1);
    }
  } else {
    writeContentLine(`  ${dimCyan("Provider:")} ${neonCyan(provider.baseUrl)}`);
    writeContentLine(`  ${dimCyan("Model:")} ${neonPink(provider.model)}`);
  }

  writeContent([
    "",
    neonCyan.bold("  Tips for getting started:"),
    dimCyan("  1. Ask questions, edit files, or run commands."),
    dimCyan("  2. Be specific for the best results."),
    dimCyan(`  3. ${neonCyan("/help")} for more information.`),
    "",
    neonCyan("─".repeat(c)),
    "",
  ].join("\n"));

  // Create agent
  const cwd = process.cwd();
  const cwdShort = cwd.replace(process.env.HOME || "", "~");

  const agent = new CodingAgent({
    provider,
    cwd,
    maxTokens: config.defaults.maxTokens,
    autoApprove: config.defaults.autoApprove,
    onToolCall: (name, args) => {
      const argStr = Object.entries(args)
        .map(([k, v]) => {
          const val = String(v);
          return val.length > 60 ? val.slice(0, 60) + "..." : val;
        })
        .join(", ");
      writeContentLine(`\n${neonCyan("●")} ${neonPink.bold(name)}(${dimCyan(argStr)})`);
    },
    onToolResult: (name, result) => {
      const lines = result.split("\n").length;
      const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
      writeContentLine(dimCyan(`  └ ${lines} lines (${size})`));
    },
  });

  // REPL
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  // Enable raw-ish mode for keypress but handle readline manually
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  function prompt() {
    drawInputBox();

    // We read a line manually
    const chunks: string[] = [];
    const onData = (data: Buffer) => {
      const str = data.toString();
      for (const ch of str) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.removeListener("data", onData);
          const input = chunks.join("").trim();
          handleInput(input);
          return;
        } else if (ch === "\x03") {
          // Ctrl+C
          exitAltScreen();
          process.exit(0);
        } else if (ch === "\x7F" || ch === "\b") {
          // Backspace
          if (chunks.length > 0) {
            chunks.pop();
            redrawInputLine(chunks.join(""));
          }
        } else if (ch >= " ") {
          chunks.push(ch);
          redrawInputLine(chunks.join(""));
        }
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("data", onData);
  }

  function redrawInputLine(text: string) {
    const r = rows();
    const boxTop = r - INPUT_BOX_HEIGHT + 1;
    moveTo(boxTop + 1, 1);
    clearLine();
    const c2 = cols();
    const displayText = text.length > c2 - 6 ? text.slice(text.length - c2 + 6) : text;
    process.stdout.write(neonCyan("│ ") + neonPink("> ") + displayText + " ".repeat(Math.max(0, c2 - displayText.length - 5)) + neonCyan("│"));
    moveTo(boxTop + 1, 5 + displayText.length);
  }

  async function handleInput(input: string) {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    if (!input) {
      prompt();
      return;
    }

    // Show what user typed in content area
    writeContentLine(dimCyan(`> ${input}`));

    if (input === "/quit" || input === "/exit") {
      writeContentLine(neonPink("\n  Stay maxxed! 💪\n"));
      exitAltScreen();
      process.exit(0);
    }
    if (input === "/help") {
      writeContent([
        "",
        `  ${neonPink.bold("Commands:")}`,
        `    ${neonCyan("/help")}     ${dimCyan("— Show this help")}`,
        `    ${neonCyan("/reset")}    ${dimCyan("— Clear conversation history")}`,
        `    ${neonCyan("/context")}  ${dimCyan("— Show current context size")}`,
        `    ${neonCyan("/quit")}     ${dimCyan("— Exit CODEMAXXING")}`,
        "",
      ].join("\n"));
      drawInputBox();
      prompt();
      return;
    }
    if (input === "/reset") {
      agent.reset();
      writeContentLine(neonCyan("  ✅ Conversation reset.\n"));
      drawInputBox();
      prompt();
      return;
    }
    if (input === "/context") {
      writeContentLine(dimCyan(`  Messages in context: ${agent.getContextLength()}\n`));
      drawInputBox();
      prompt();
      return;
    }

    // Chat
    const randomMsg = SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)];
    const spinner = startSpinner(randomMsg);

    try {
      const response = await agent.chat(input);
      spinner.stop();
      writeContentLine("");
      writeContent(formatResponse(stripThinking(response)));
      writeContentLine("");
    } catch (err: any) {
      spinner.stop();
      writeContentLine(chalk.red(`\n  Error: ${err.message}`));
      writeContentLine(chalk.red("  Check if your LLM server is running and the model is loaded.\n"));
    }

    drawInputBox();
    prompt();
  }

  // Start
  drawInputBox();
  prompt();
}

main().catch((err) => {
  exitAltScreen();
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
