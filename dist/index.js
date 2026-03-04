#!/usr/bin/env node
import { createInterface } from "readline";
import chalk from "chalk";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider } from "./config.js";
const VERSION = "0.1.0";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
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
    const interval = setInterval(() => {
        process.stdout.write(`\r${chalk.cyan(SPINNER_FRAMES[i % SPINNER_FRAMES.length])} ${msg}`);
        i++;
    }, 80);
    return {
        stop: () => {
            clearInterval(interval);
            process.stdout.write("\r" + " ".repeat(msg.length + 4) + "\r");
        },
    };
}
function stripThinking(text) {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}
function formatResponse(text) {
    return text
        .split("\n")
        .map((line) => {
        if (line.startsWith("```"))
            return chalk.dim(line);
        if (line.startsWith("# "))
            return chalk.bold.white(line);
        if (line.startsWith("## "))
            return chalk.bold.white(line);
        if (line.startsWith("- "))
            return `  ${line}`;
        if (line.startsWith("✅"))
            return chalk.green(line);
        if (line.startsWith("❌"))
            return chalk.red(line);
        return `  ${line}`;
    })
        .join("\n");
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
                return `${k}=${val.length > 50 ? val.slice(0, 50) + "..." : val}`;
            })
                .join(", ");
            console.log(chalk.dim(`  🔧 ${name}(${argStr})`));
        },
        onToolResult: (name, result) => {
            const preview = result.length > 200 ? result.slice(0, 200) + "..." : result;
            console.log(chalk.dim(`  ✅ ${name} → ${preview.split("\n")[0]}`));
        },
    });
    // REPL using stdin directly
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    function prompt() {
        rl.question(chalk.bold.white("\n> "), async (input) => {
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
                spinner.stop();
                console.log();
                console.log(formatResponse(stripThinking(response)));
                console.log();
                // Status bar
                const statusLine = chalk.cyan("─".repeat(cols));
                console.log(statusLine);
                const modelStr = provider.model;
                const gap1 = Math.max(1, Math.floor((cols - cwdShort.length - 12 - modelStr.length) / 2));
                const gap2 = Math.max(1, cols - cwdShort.length - 12 - modelStr.length - gap1);
                const sandbox = config.defaults.autoApprove ? chalk.green("auto-approve") : chalk.red("no sandbox");
                console.log(`${chalk.cyan(cwdShort)}${" ".repeat(gap1)}${sandbox}${" ".repeat(gap2)}${chalk.magenta(modelStr)}`);
                console.log(statusLine);
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
