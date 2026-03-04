#!/usr/bin/env node
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { render, Box, Text, Static, useInput, useApp, useStdout } from "ink";
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
// ── Neon Spinner ──
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
let msgId = 0;
// ── Main App ──
function App() {
    const { exit } = useApp();
    const { stdout } = useStdout();
    const termWidth = stdout?.columns ?? 80;
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [spinnerMsg, setSpinnerMsg] = useState("");
    const [agent, setAgent] = useState(null);
    const [ready, setReady] = useState(false);
    const [connectionInfo, setConnectionInfo] = useState([]);
    // Initialize agent
    useEffect(() => {
        (async () => {
            const config = loadConfig();
            let provider = config.provider;
            const info = [];
            if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
                info.push("Detecting local LLM server...");
                setConnectionInfo([...info]);
                const detected = await detectLocalProvider();
                if (detected) {
                    provider = detected;
                    info.push(`✔ Connected to ${provider.baseUrl} → ${provider.model}`);
                    setConnectionInfo([...info]);
                }
                else {
                    info.push("✗ No local LLM server found. Start LM Studio or Ollama.");
                    setConnectionInfo([...info]);
                    return;
                }
            }
            else {
                info.push(`Provider: ${provider.baseUrl}`);
                info.push(`Model: ${provider.model}`);
                setConnectionInfo([...info]);
            }
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
                    addMsg("tool", `${name}(${argStr})`);
                },
                onToolResult: (_name, result) => {
                    const numLines = result.split("\n").length;
                    const size = result.length > 1024 ? `${(result.length / 1024).toFixed(1)}KB` : `${result.length}B`;
                    addMsg("tool-result", `└ ${numLines} lines (${size})`);
                },
            });
            setAgent(a);
            setReady(true);
        })();
    }, []);
    function addMsg(type, text) {
        setMessages((prev) => [...prev, { id: msgId++, type, text }]);
    }
    function stripThinking(text) {
        return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
    }
    const handleSubmit = useCallback(async (value) => {
        const trimmed = value.trim();
        setInput("");
        if (!trimmed || !agent)
            return;
        addMsg("user", trimmed);
        if (trimmed === "/quit" || trimmed === "/exit") {
            exit();
            return;
        }
        if (trimmed === "/help") {
            addMsg("info", "Commands: /help · /reset · /context · /quit");
            return;
        }
        if (trimmed === "/reset") {
            agent.reset();
            addMsg("info", "✅ Conversation reset.");
            return;
        }
        if (trimmed === "/context") {
            addMsg("info", `Messages in context: ${agent.getContextLength()}`);
            return;
        }
        setLoading(true);
        setSpinnerMsg(SPINNER_MESSAGES[Math.floor(Math.random() * SPINNER_MESSAGES.length)]);
        try {
            const response = await agent.chat(trimmed);
            addMsg("response", stripThinking(response));
        }
        catch (err) {
            addMsg("error", `Error: ${err.message}`);
        }
        setLoading(false);
    }, [agent, exit]);
    useInput((input, key) => {
        if (key.ctrl && input === "c") {
            exit();
        }
    });
    // CODE banner lines
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
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Static, { items: ["banner"], children: () => (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "#00FFFF", paddingX: 1, children: [codeLines.map((line, i) => (_jsx(Text, { color: "#00FFFF", children: line }, `c${i}`))), maxxingLines.map((line, i) => (_jsx(Text, { color: i === maxxingLines.length - 1 ? "#CC00CC" : "#FF00FF", children: line }, `m${i}`))), _jsxs(Text, { children: [_jsx(Text, { color: "#008B8B", children: "                            v" + VERSION }), "  ", _jsx(Text, { color: "#00FFFF", children: "\uD83D\uDCAA" }), "  ", _jsx(Text, { dimColor: true, children: "your code. your model. no excuses." })] })] }, "banner")) }), connectionInfo.length > 0 && (_jsx(Static, { items: ["conn"], children: () => (_jsx(Box, { flexDirection: "column", borderStyle: "single", borderColor: "#008B8B", paddingX: 1, marginBottom: 1, children: connectionInfo.map((line, i) => (_jsx(Text, { color: line.startsWith("✔") ? "#00FFFF" : line.startsWith("✗") ? "red" : "#008B8B", children: line }, i))) }, "conn")) })), _jsx(Static, { items: messages, children: (msg) => {
                    switch (msg.type) {
                        case "user":
                            return (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "#008B8B", children: ["  > ", msg.text] }) }, msg.id));
                        case "response":
                            return (_jsx(Box, { flexDirection: "column", marginLeft: 2, marginBottom: 1, children: msg.text.split("\n").map((l, i) => (_jsxs(Text, { wrap: "wrap", children: [i === 0 ? _jsx(Text, { color: "#00FFFF", children: "\u25CF " }) : _jsx(Text, { children: "  " }), l.startsWith("```") ? _jsx(Text, { color: "#008B8B", children: l }) :
                                            l.startsWith("# ") || l.startsWith("## ") ? _jsx(Text, { bold: true, color: "#FF00FF", children: l }) :
                                                l.startsWith("**") ? _jsx(Text, { bold: true, children: l }) :
                                                    _jsx(Text, { children: l })] }, i))) }, msg.id));
                        case "tool":
                            return (_jsx(Box, { children: _jsxs(Text, { children: [_jsx(Text, { color: "#00FFFF", children: "  \u25CF " }), _jsx(Text, { bold: true, color: "#FF00FF", children: msg.text })] }) }, msg.id));
                        case "tool-result":
                            return _jsxs(Text, { color: "#008B8B", children: ["    ", msg.text] }, msg.id);
                        case "error":
                            return _jsxs(Text, { color: "red", children: ["  ", msg.text] }, msg.id);
                        case "info":
                            return _jsxs(Text, { color: "#008B8B", children: ["  ", msg.text] }, msg.id);
                        default:
                            return _jsx(Text, { children: msg.text }, msg.id);
                    }
                } }), loading && _jsx(NeonSpinner, { message: spinnerMsg }), _jsxs(Box, { borderStyle: "single", borderColor: "#00FFFF", paddingX: 1, children: [_jsx(Text, { color: "#FF00FF", bold: true, children: "> " }), ready && !loading ? (_jsx(TextInput, { value: input, onChange: setInput, onSubmit: handleSubmit })) : (_jsx(Text, { dimColor: true, children: loading ? "waiting for response..." : "initializing..." }))] })] }));
}
// Clear screen before render
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
render(_jsx(App, {}));
