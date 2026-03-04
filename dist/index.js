#!/usr/bin/env node
import { createInterface } from "readline";
import chalk from "chalk";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider } from "./config.js";
const VERSION = "0.1.0";
const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
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
        process.stdout.write(`\r  ${chalk.hex("#FF00FF")(frame)} ${chalk.bold.hex("#FF44FF")(msg)} ${chalk.hex("#7B2FBE")(`[${elapsed}s]`)}`);
        i++;
    }, 80);
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
    const bullet = chalk.hex("#00FFFF");
    const code = chalk.hex("#BF00FF");
    const heading = chalk.bold.hex("#FF00FF");
    // Add bullet point to first line
    formatted.push(bullet("● ") + lines[0]);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("```")) {
            inCodeBlock = !inCodeBlock;
            formatted.push(code(`  ${line}`));
        }
        else if (inCodeBlock) {
            formatted.push(chalk.hex("#00FFFF")(`  ${line}`));
        }
        else if (line.startsWith("# ")) {
            formatted.push(heading(`  ${line}`));
        }
        else if (line.startsWith("## ")) {
            formatted.push(heading(`  ${line}`));
        }
        else if (line.startsWith("- ")) {
            formatted.push(`  ${line}`);
        }
        else if (line.startsWith("✅")) {
            formatted.push(chalk.hex("#00FFFF")(`  ${line}`));
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
    // Neon color palette
    const neonPink = chalk.hex("#FF00FF");
    const neonCyan = chalk.hex("#00FFFF");
    const neonPurple = chalk.hex("#BF00FF");
    const dimPurple = chalk.hex("#7B2FBE");
    const glow = chalk.bold.hex("#FF44FF");
    const shadow = chalk.hex("#660066");
    // Banner
    console.log(`
${glow("  ██████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗██╗███╗   ██╗ ██████╗ ")}
${glow("  ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗╚██╗██╔╝╚██╗██╔╝██║████╗  ██║██╔════╝ ")}
${neonPink("  ██║     ██║   ██║██║  ██║█████╗  ██╔████╔██║███████║ ╚███╔╝  ╚███╔╝ ██║██╔██╗ ██║██║  ███╗")}
${neonPink("  ██║     ██║   ██║██║  ██║██╔══╝  ██║╚██╔╝██║██╔══██║ ██╔██╗  ██╔██╗ ██║██║╚██╗██║██║   ██║")}
${neonPurple("  ╚██████╗╚██████╔╝██████╔╝███████╗██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██╔╝ ██╗██║██║ ╚████║╚██████╔╝")}
${shadow("   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ")}
${dimPurple(`                                       v${VERSION}`)}  ${neonCyan("💪")}  ${chalk.dim("your code. your model. no excuses.")}
`);
    // Load config
    const config = loadConfig();
    let provider = config.provider;
    // Auto-detect local provider
    if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
        process.stdout.write(dimPurple("  Detecting local LLM server..."));
        const detected = await detectLocalProvider();
        if (detected) {
            provider = detected;
            process.stdout.write(`\r${neonCyan("✔")} Connected to ${neonCyan(provider.baseUrl)} → ${neonPink(provider.model)}\n`);
        }
        else {
            process.stdout.write(`\r${chalk.red("✗")} No local LLM server found. Start LM Studio or Ollama.\n`);
            process.exit(1);
        }
    }
    else {
        console.log(`  ${dimPurple("Provider:")} ${neonCyan(provider.baseUrl)}`);
        console.log(`  ${dimPurple("Model:")} ${neonPink(provider.model)}`);
    }
    const cwd = process.cwd();
    const cols = process.stdout.columns || 80;
    const cwdShort = cwd.replace(process.env.HOME || "", "~");
    // Tips
    console.log();
    console.log(neonCyan.bold("  Tips for getting started:"));
    console.log(dimPurple("  1. Ask questions, edit files, or run commands."));
    console.log(dimPurple("  2. Be specific for the best results."));
    console.log(dimPurple(`  3. ${neonCyan("/help")} for more information.`));
    console.log();
    console.log(neonPurple("─".repeat(cols)));
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
            console.log(`\n${neonPurple("●")} ${neonPink.bold(name)}(${dimPurple(argStr)})`);
        },
        onToolResult: (name, result) => {
            const lines = result.split("\n").length;
            const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
            console.log(dimPurple(`  └ ${lines} lines (${size})`));
        },
    });
    // REPL using stdin directly
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    function drawInputBox() {
        console.log();
        console.log(neonCyan("┌" + "─".repeat(cols - 2) + "┐"));
    }
    function drawInputBoxBottom() {
        console.log(neonCyan("└" + "─".repeat(cols - 2) + "┘"));
    }
    function prompt() {
        drawInputBox();
        rl.question(neonCyan("│ ") + neonPink.bold("> "), async (input) => {
            input = input.trim();
            if (!input) {
                prompt();
                return;
            }
            drawInputBoxBottom();
            // Commands
            if (input === "/quit" || input === "/exit") {
                console.log(neonPink("\n  Stay maxxed! 💪\n"));
                rl.close();
                process.exit(0);
            }
            if (input === "/help") {
                console.log(`
  ${neonPink.bold("Commands:")}
    ${neonCyan("/help")}     ${dimPurple("— Show this help")}
    ${neonCyan("/reset")}    ${dimPurple("— Clear conversation history")}
    ${neonCyan("/context")}  ${dimPurple("— Show current context size")}
    ${neonCyan("/quit")}     ${dimPurple("— Exit CODEMAXXING")}
`);
                prompt();
                return;
            }
            if (input === "/reset") {
                agent.reset();
                console.log(neonCyan("  ✅ Conversation reset.\n"));
                prompt();
                return;
            }
            if (input === "/context") {
                console.log(dimPurple(`  Messages in context: ${agent.getContextLength()}\n`));
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
        console.log(neonPink("\n  Stay maxxed! 💪\n"));
        process.exit(0);
    });
    prompt();
}
main().catch((err) => {
    console.error(chalk.red(`Fatal: ${err.message}`));
    process.exit(1);
});
