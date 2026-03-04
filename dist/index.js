#!/usr/bin/env node
import { createInterface } from "readline";
import chalk from "chalk";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider } from "./config.js";
const VERSION = "0.1.0";
const SPINNER_FRAMES = ["💪", "🔥", "💪", "⚡", "💪", "🔥", "💪", "⚡"];
const SPINNER_MESSAGES = [
    "Locking in...",
    "Cooking...",
    "Maxxing...",
    "In the zone...",
    "Yapping...",
    "Frame mogging...",
    "Jester gooning...",
    "Gooning...",
    "Doing back flips...",
    "Jester maxxing...",
    "Getting baked...",
    "Blasting tren...",
    "Pumping...",
    "Wondering if I should actually do this...",
    "Hacking the main frame...",
    "Codemaxxing...",
    "Vibe coding...",
    "Running a marathon...",
];
function startSpinner(msg) {
    let i = 0;
    const startTime = Date.now();
    const interval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
        process.stdout.write(`\r  ${frame} ${chalk.bold.white(msg)} ${chalk.dim(`[${elapsed}s]`)}`);
        i++;
    }, 300);
    return {
        stop: () => {
            clearInterval(interval);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write("\r" + " ".repeat(100) + "\r");
            return elapsed;
        },
    };
}
function stripThinking(text) {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}
function formatResponse(text) {
    const lines = text.split("\n");
    const formatted = [];
    let inCodeBlock = false;
    // Add bullet point to first line
    formatted.push(chalk.white("● ") + lines[0]);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            formatted.push(chalk.dim(`  ${line}`));
        }
        else if (inCodeBlock) {
            formatted.push(chalk.cyan(`  ${line}`));
        }
        else if (line.startsWith("# ")) {
            formatted.push(chalk.bold.white(`  ${line}`));
        }
        else if (line.startsWith("## ")) {
            formatted.push(chalk.bold.white(`  ${line}`));
        }
        else if (line.startsWith("- ")) {
            formatted.push(`  ${line}`);
        }
        else if (line.startsWith("✅")) {
            formatted.push(chalk.green(`  ${line}`));
        }
        else if (line.startsWith("❌")) {
            formatted.push(chalk.red(`  ${line}`));
        }
        else {
            formatted.push(`  ${line}`);
        }
    }
    return formatted.join("\n");
}
async function main() {
    // Clear screen
    console.clear();
    // Banner
    const c1 = chalk.bold.white;
    const c2 = chalk.dim.white;
    console.log(`
${c1("  ██████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗██╗███╗   ██╗ ██████╗ ")}
${c1("  ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗╚██╗██╔╝╚██╗██╔╝██║████╗  ██║██╔════╝ ")}
${c1("  ██║     ██║   ██║██║  ██║█████╗  ██╔████╔██║███████║ ╚███╔╝  ╚███╔╝ ██║██╔██╗ ██║██║  ███╗")}
${c1("  ██║     ██║   ██║██║  ██║██╔══╝  ██║╚██╔╝██║██╔══██║ ██╔██╗  ██╔██╗ ██║██║╚██╗██║██║   ██║")}
${c1("  ╚██████╗╚██████╔╝██████╔╝███████╗██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██╔╝ ██╗██║██║ ╚████║╚██████╔╝")}
${c2("   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ")}
${chalk.gray(`                                       v${VERSION}  💪  your code. your model. no excuses.`)}
`);
    // Load config
    const config = loadConfig();
    let provider = config.provider;
    // Auto-detect local provider
    if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
        process.stdout.write(chalk.gray("  Detecting local LLM server..."));
        const detected = await detectLocalProvider();
        if (detected) {
            provider = detected;
            process.stdout.write(`\r${chalk.green("✔")} Connected to ${chalk.green(provider.baseUrl)} → ${chalk.yellow(provider.model)}\n`);
        }
        else {
            process.stdout.write(`\r${chalk.red("✗")} No local LLM server found. Start LM Studio or Ollama.\n`);
            process.exit(1);
        }
    }
    else {
        console.log(`  ${chalk.gray("Provider:")} ${chalk.green(provider.baseUrl)}`);
        console.log(`  ${chalk.gray("Model:")} ${chalk.yellow(provider.model)}`);
    }
    const cwd = process.cwd();
    const cols = process.stdout.columns || 80;
    const cwdShort = cwd.replace(process.env.HOME || "", "~");
    // Tips
    console.log();
    console.log(chalk.white.bold("  Tips for getting started:"));
    console.log(chalk.gray("  1. Ask questions, edit files, or run commands."));
    console.log(chalk.gray("  2. Be specific for the best results."));
    console.log(chalk.gray(`  3. ${chalk.white("/help")} for more information.`));
    console.log();
    console.log(chalk.cyan("─".repeat(cols)));
    // Create agent
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
            console.log(`\n${chalk.green("●")} ${chalk.bold(name)}(${chalk.dim(argStr)})`);
        },
        onToolResult: (name, result) => {
            const lines = result.split("\n").length;
            const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
            console.log(chalk.dim(`  └ ${lines} lines (${size})`));
        },
    });
    // REPL using stdin directly
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    function drawInputBox() {
        console.log();
        console.log(chalk.dim("┌" + "─".repeat(cols - 2) + "┐"));
    }
    function prompt() {
        drawInputBox();
        rl.question(chalk.bold.white("│ > "), async (input) => {
            input = input.trim();
            if (!input) {
                prompt();
                return;
            }
            // Commands
            if (input === "/quit" || input === "/exit") {
                console.log(chalk.gray("\n  Stay maxxed! 💪\n"));
                rl.close();
                process.exit(0);
            }
            if (input === "/help") {
                console.log(`
  ${chalk.bold("Commands:")}
    ${chalk.cyan("/help")}     — Show this help
    ${chalk.cyan("/reset")}    — Clear conversation history
    ${chalk.cyan("/context")}  — Show current context size
    ${chalk.cyan("/quit")}     — Exit CODEMAXXING
`);
                prompt();
                return;
            }
            if (input === "/reset") {
                agent.reset();
                console.log(chalk.green("  ✅ Conversation reset.\n"));
                prompt();
                return;
            }
            if (input === "/context") {
                console.log(chalk.gray(`  Messages in context: ${agent.getContextLength()}\n`));
                prompt();
                return;
            }
            // Chat with agent
            const randomMsg = SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)];
            const spinner = startSpinner(randomMsg);
            try {
                const response = await agent.chat(input);
                const elapsed = spinner.stop();
                console.log();
                console.log(formatResponse(stripThinking(response)));
                console.log();
            }
            catch (err) {
                spinner.stop();
                console.log(chalk.red(`\n  Error: ${err.message}`));
                console.log(chalk.red("  Check if your LLM server is running and the model is loaded.\n"));
            }
            prompt();
        });
    }
    // Handle Ctrl+C
    rl.on("close", () => {
        console.log(chalk.gray("\n  Stay maxxed! 💪\n"));
        process.exit(0);
    });
    prompt();
}
main().catch((err) => {
    console.error(chalk.red(`Fatal: ${err.message}`));
    process.exit(1);
});
