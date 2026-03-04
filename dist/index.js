#!/usr/bin/env node
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
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
// ── Neon Spinner Component ──
function NeonSpinner({ message }) {
    const [frame, setFrame] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
            setElapsed(Math.floor((Date.now() - start) / 1000));
        }, 80);
        return () => clearInterval(interval);
    }, []);
    return (_jsxs(Text, { children: ["  ", _jsx(Text, { color: "#00FFFF", children: SPINNER_FRAMES[frame] }), " ", _jsx(Text, { bold: true, color: "#FF00FF", children: message }), " ", _jsxs(Text, { color: "#008B8B", children: ["[", elapsed, "s]"] })] }));
}
// ── Banner Component ──
function Banner() {
    const codeLines = [
        "                     _(`-')    (`-')  _ ",
        " _             .->  ( (OO ).-> ( OO).-/ ",
        " \\-,-----.(`-')----. \\    .'_ (,------. ",
        "  |  .--./( OO).-.  ''`'-..__) |  .---' ",
        " /_) (`-')( _) | |  ||  |  ' |(|  '--.  ",
        " ||  |OO ) \\|  |)|  ||  |  / : |  .--'  ",
        "(_'  '--'\\  '  '-'  '|  '-'  / |  `---. ",
        "   `-----'   `-----' `------'  `------' ",
    ];
    const maxxingLines = [
        "<-. (`-')   (`-')  _  (`-')      (`-')      _     <-. (`-')_            ",
        "   \\(OO )_  (OO ).-/  (OO )_.->  (OO )_.-> (_)       \\( OO) )    .->    ",
        ",--./  ,-.) / ,---.   (_| \\_)--. (_| \\_)--.,-(`-'),--./ ,--/  ,---(`-') ",
        "|   `.'   | | \\ /`.\\  \\  `.'  /  \\  `.'  / | ( OO)|   \\ |  | '  .-(OO ) ",
        "|  |'.'|  | '-'|_.' |  \\    .')   \\    .') |  |  )|  . '|  |)|  | .-, \\ ",
        "|  |   |  |(|  .-.  |  .'    \\    .'    \\ (|  |_/ |  |\\    | |  | '.(_/ ",
        "|  |   |  | |  | |  | /  .'.  \\  /  .'.  \\ |  |'->|  | \\   | |  '-'  |  ",
        "`--'   `--' `--' `--'`--'   '--'`--'   '--'`--'   `--'  `--'  `-----'   ",
    ];
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [codeLines.map((line, i) => (_jsx(Text, { color: "#00FFFF", children: line }, `c${i}`))), maxxingLines.map((line, i) => (_jsx(Text, { color: i === maxxingLines.length - 1 ? "#CC00CC" : "#FF00FF", children: line }, `m${i}`))), _jsxs(Text, { children: [_jsx(Text, { color: "#008B8B", children: "                            v" + VERSION }), "  ", _jsx(Text, { color: "#00FFFF", children: "\uD83D\uDCAA" }), "  ", _jsx(Text, { dimColor: true, children: "your code. your model. no excuses." })] })] }));
}
let lineId = 0;
// ── Main App Component ──
function App() {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const termHeight = stdout?.rows ?? 24;
    const termWidth = stdout?.columns ?? 80;
    const [input, setInput] = useState("");
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [spinnerMsg, setSpinnerMsg] = useState("");
    const [agent, setAgent] = useState(null);
    const [providerInfo, setProviderInfo] = useState({ url: "", model: "" });
    const [ready, setReady] = useState(false);
    // Initialize agent
    useEffect(() => {
        (async () => {
            const config = loadConfig();
            let provider = config.provider;
            if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
                addLine("info", "Detecting local LLM server...");
                const detected = await detectLocalProvider();
                if (detected) {
                    provider = detected;
                    addLine("info", `✔ Connected to ${provider.baseUrl} → ${provider.model}`);
                }
                else {
                    addLine("error", "✗ No local LLM server found. Start LM Studio or Ollama.");
                    return;
                }
            }
            else {
                addLine("info", `Provider: ${provider.baseUrl}`);
                addLine("info", `Model: ${provider.model}`);
            }
            setProviderInfo({ url: provider.baseUrl, model: provider.model });
            const cwd = process.cwd();
            const a = new CodingAgent({
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
                    addLine("tool", `${name}(${argStr})`);
                },
                onToolResult: (name, result) => {
                    const numLines = result.split("\n").length;
                    const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
                    addLine("tool-result", `└ ${numLines} lines (${size})`);
                },
            });
            setAgent(a);
            setReady(true);
        })();
    }, []);
    function addLine(type, text) {
        setLines((prev) => [...prev, { id: lineId++, type, text }]);
    }
    function stripThinking(text) {
        return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    // Handle submit
    const handleSubmit = useCallback(async (value) => {
        const trimmed = value.trim();
        setInput("");
        if (!trimmed || !agent)
            return;
        addLine("user", trimmed);
        // Commands
        if (trimmed === "/quit" || trimmed === "/exit") {
            exit();
            return;
        }
        if (trimmed === "/help") {
            addLine("info", "Commands: /help, /reset, /context, /quit");
            return;
        }
        if (trimmed === "/reset") {
            agent.reset();
            addLine("info", "✅ Conversation reset.");
            return;
        }
        if (trimmed === "/context") {
            addLine("info", `Messages in context: ${agent.getContextLength()}`);
            return;
        }
        // Chat
        setLoading(true);
        setSpinnerMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);
        try {
            const response = await agent.chat(trimmed);
            addLine("response", stripThinking(response));
        }
        catch (err) {
            addLine("error", `Error: ${err.message}`);
        }
        setLoading(false);
    }, [agent, exit]);
    // Ctrl+C handler
    useInput((input, key) => {
        if (key.ctrl && input === "c") {
            exit();
        }
    });
    // Calculate visible content area
    // Reserve: banner (~18 lines) + input box (3 lines) + some padding
    const inputBoxHeight = 3;
    const contentHeight = Math.max(5, termHeight - inputBoxHeight - 1);
    // Get visible lines (last N that fit)
    const visibleLines = lines.slice(-contentHeight);
    return (_jsxs(Box, { flexDirection: "column", height: termHeight, children: [_jsxs(Box, { flexDirection: "column", flexGrow: 1, children: [lines.length === 0 && (_jsxs(_Fragment, { children: [_jsx(Banner, {}), _jsx(Text, { color: "#00FFFF", bold: true, children: "  Tips for getting started:" }), _jsx(Text, { color: "#008B8B", children: "  1. Ask questions, edit files, or run commands." }), _jsx(Text, { color: "#008B8B", children: "  2. Be specific for the best results." }), _jsxs(Text, { color: "#008B8B", children: ["  3. ", _jsx(Text, { color: "#00FFFF", children: "/help" }), " for more information."] }), _jsx(Text, { children: "" })] })), visibleLines.map((line) => {
                        switch (line.type) {
                            case "user":
                                return _jsxs(Text, { color: "#008B8B", children: ["  > ", line.text] }, line.id);
                            case "response":
                                return (_jsx(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1, children: line.text.split("\n").map((l, i) => (_jsxs(Text, { children: [i === 0 ? _jsx(Text, { color: "#00FFFF", children: "\u25CF " }) : "  ", l.startsWith("```") ? _jsx(Text, { color: "#008B8B", children: l }) :
                                                l.startsWith("# ") || l.startsWith("## ") ? _jsx(Text, { bold: true, color: "#FF00FF", children: l }) :
                                                    _jsx(Text, { children: l })] }, i))) }, line.id));
                            case "tool":
                                return (_jsxs(Text, { children: [_jsx(Text, { color: "#00FFFF", children: "\u25CF " }), _jsx(Text, { bold: true, color: "#FF00FF", children: line.text })] }, line.id));
                            case "tool-result":
                                return _jsxs(Text, { color: "#008B8B", children: ["  ", line.text] }, line.id);
                            case "error":
                                return _jsxs(Text, { color: "red", children: ["  ", line.text] }, line.id);
                            case "info":
                                return _jsxs(Text, { color: "#008B8B", children: ["  ", line.text] }, line.id);
                            default:
                                return _jsx(Text, { children: line.text }, line.id);
                        }
                    }), loading && _jsx(NeonSpinner, { message: spinnerMsg })] }), _jsx(Box, { flexDirection: "column", borderStyle: "single", borderColor: "#00FFFF", width: termWidth, children: _jsxs(Box, { children: [_jsx(Text, { color: "#FF00FF", bold: true, children: "> " }), ready && !loading ? (_jsx(TextInput, { value: input, onChange: setInput, onSubmit: handleSubmit, placeholder: "" })) : (_jsx(Text, { dimColor: true, children: loading ? "waiting for response..." : "initializing..." }))] }) })] }));
}
// ── Entry point ──
// Clear screen before rendering
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
render(_jsx(App, {}), {
    exitOnCtrlC: true,
});
