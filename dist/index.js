#!/usr/bin/env node
import { createInterface } from "readline";
import chalk from "chalk";
import ora from "ora";
import { CodingAgent } from "./agent.js";
import { loadConfig, detectLocalProvider } from "./config.js";
const VERSION = "0.1.0";
async function main() {
    // Banner
    const banner = `
${chalk.bold.magenta("   ██████╗ ██████╗ ██████╗ ███████╗")}
${chalk.bold.magenta("  ██╔════╝██╔═══██╗██╔══██╗██╔════╝")}
${chalk.bold.cyan("  ██║     ██║   ██║██║  ██║█████╗  ")}
${chalk.bold.cyan("  ██║     ██║   ██║██║  ██║██╔══╝  ")}
${chalk.bold.blue("  ╚██████╗╚██████╔╝██████╔╝███████╗")}
${chalk.bold.blue("   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝")}
${chalk.bold.magenta("  ███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗██╗███╗   ██╗ ██████╗ ")}
${chalk.bold.magenta("  ████╗ ████║██╔══██╗╚██╗██╔╝╚██╗██╔╝██║████╗  ██║██╔════╝ ")}
${chalk.bold.cyan("  ██╔████╔██║███████║ ╚███╔╝  ╚███╔╝ ██║██╔██╗ ██║██║  ███╗")}
${chalk.bold.cyan("  ██║╚██╔╝██║██╔══██║ ██╔██╗  ██╔██╗ ██║██║╚██╗██║██║   ██║")}
${chalk.bold.blue("  ██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██╔╝ ██╗██║██║ ╚████║╚██████╔╝")}
${chalk.bold.blue("  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ")}
${chalk.gray(`                                              v${VERSION}`)}
`;
    console.log(banner);
    // Load config
    const config = loadConfig();
    let provider = config.provider;
    // Auto-detect local provider if model is "auto"
    if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
        const spinner = ora("Detecting local LLM server...").start();
        const detected = await detectLocalProvider();
        if (detected) {
            provider = detected;
            spinner.succeed(`Connected to ${chalk.green(provider.baseUrl)} → ${chalk.yellow(provider.model)}`);
        }
        else {
            spinner.fail("No local LLM server found. Start LM Studio or Ollama, or configure a provider in ~/.pierre/settings.json");
            process.exit(1);
        }
    }
    else {
        console.log(`  ${chalk.gray("Provider:")} ${chalk.green(provider.baseUrl)}`);
        console.log(`  ${chalk.gray("Model:")} ${chalk.yellow(provider.model)}`);
    }
    const cwd = process.cwd();
    // Tips
    console.log(chalk.white.bold("  Tips for getting started:"));
    console.log(chalk.gray("  1. Ask questions, edit files, or run commands."));
    console.log(chalk.gray("  2. Be specific for the best results."));
    console.log(chalk.gray(`  3. ${chalk.white("/help")} for more information.`));
    console.log();
    // Status bar
    const cols = process.stdout.columns || 80;
    const line = chalk.dim("─".repeat(cols));
    console.log(line);
    const cwdShort = cwd.replace(process.env.HOME || "", "~");
    const statusLeft = chalk.cyan(cwdShort);
    const statusCenter = config.defaults.autoApprove ? chalk.green("auto-approve") : chalk.yellow("manual approve");
    const statusRight = chalk.magenta(`${provider.model}`);
    const padding = Math.max(1, Math.floor((cols - cwdShort.length - 14 - provider.model.length) / 2));
    console.log(`  ${statusLeft}${" ".repeat(padding)}${statusCenter}${" ".repeat(padding)}${statusRight}`);
    console.log(line);
    console.log();
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
    // REPL loop
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.bold.magenta("  > "),
    });
    rl.prompt();
    rl.on("line", async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }
        // Handle commands
        if (input.startsWith("/")) {
            handleCommand(input, agent);
            rl.prompt();
            return;
        }
        // Send to agent
        const spinnerMessages = [
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
        const randomMsg = spinnerMessages[Math.floor(Math.random() * spinnerMessages.length)];
        const spinner = ora({ text: randomMsg, color: "cyan" }).start();
        try {
            const response = await agent.chat(input);
            spinner.stop();
            console.log();
            console.log(formatResponse(response));
            console.log();
        }
        catch (err) {
            spinner.fail(`Error: ${err.message}`);
            console.log(chalk.red(`  Check if your LLM server is running and the model is loaded.`));
            console.log();
        }
        rl.prompt();
    });
    rl.on("close", () => {
        console.log(chalk.gray("\n  Stay maxxed! 💪\n"));
        process.exit(0);
    });
}
function handleCommand(input, agent) {
    const cmd = input.toLowerCase();
    switch (cmd) {
        case "/help":
            console.log(`
  ${chalk.bold("Commands:")}
    ${chalk.cyan("/help")}     — Show this help
    ${chalk.cyan("/reset")}    — Clear conversation history
    ${chalk.cyan("/context")} — Show current context size
    ${chalk.cyan("/quit")}     — Exit Pierre Code
`);
            break;
        case "/reset":
            agent.reset();
            console.log(chalk.green("  ✅ Conversation reset.\n"));
            break;
        case "/context":
            console.log(chalk.gray(`  Messages in context: ${agent.getContextLength()}\n`));
            break;
        case "/quit":
        case "/exit":
            console.log(chalk.gray("\n  Stay maxxed! 💪\n"));
            process.exit(0);
        default:
            console.log(chalk.yellow(`  Unknown command: ${input}\n`));
    }
}
function formatResponse(text) {
    // Basic formatting — highlight code blocks
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
main().catch((err) => {
    console.error(chalk.red(`Fatal: ${err.message}`));
    process.exit(1);
});
