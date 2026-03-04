#!/usr/bin/env node

import React, { useState, useEffect, useCallback } from "react";
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
function NeonSpinner({ message }: { message: string }) {
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

  return (
    <Text>
      {"  "}
      <Text color="#00FFFF">{SPINNER_FRAMES[frame]}</Text>
      {" "}
      <Text bold color="#FF00FF">{message}</Text>
      {" "}
      <Text color="#008B8B">[{elapsed}s]</Text>
    </Text>
  );
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

  return (
    <Box flexDirection="column" marginBottom={1}>
      {codeLines.map((line, i) => (
        <Text key={`c${i}`} color="#00FFFF">{line}</Text>
      ))}
      {maxxingLines.map((line, i) => (
        <Text key={`m${i}`} color={i === maxxingLines.length - 1 ? "#CC00CC" : "#FF00FF"}>{line}</Text>
      ))}
      <Text>
        <Text color="#008B8B">{"                            v" + VERSION}</Text>
        {"  "}
        <Text color="#00FFFF">💪</Text>
        {"  "}
        <Text dimColor>your code. your model. no excuses.</Text>
      </Text>
    </Box>
  );
}

// ── Message Types ──
interface ContentLine {
  id: number;
  type: "text" | "user" | "response" | "tool" | "tool-result" | "error" | "info";
  text: string;
}

let lineId = 0;

// ── Main App Component ──
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth = stdout?.columns ?? 80;

  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ContentLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinnerMsg, setSpinnerMsg] = useState("");
  const [agent, setAgent] = useState<CodingAgent | null>(null);
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
        } else {
          addLine("error", "✗ No local LLM server found. Start LM Studio or Ollama.");
          return;
        }
      } else {
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

  function addLine(type: ContentLine["type"], text: string) {
    setLines((prev) => [...prev, { id: lineId++, type, text }]);
  }

  function stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
  }

  // Handle submit
  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    setInput("");
    if (!trimmed || !agent) return;

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
    } catch (err: any) {
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

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Content area */}
      <Box flexDirection="column" flexGrow={1}>
        <Banner />
        {lines.length === 0 && (
          <>
            <Text color="#00FFFF" bold>  Tips for getting started:</Text>
            <Text color="#008B8B">  1. Ask questions, edit files, or run commands.</Text>
            <Text color="#008B8B">  2. Be specific for the best results.</Text>
            <Text color="#008B8B">  3. <Text color="#00FFFF">/help</Text> for more information.</Text>
          </>
        )}

        {visibleLines.map((line) => {
          switch (line.type) {
            case "user":
              return <Text key={line.id} color="#008B8B">{"  > "}{line.text}</Text>;
            case "response":
              return (
                <Box key={line.id} flexDirection="column" marginTop={1} marginBottom={1}>
                  {line.text.split("\n").map((l, i) => (
                    <Text key={i}>
                      {i === 0 ? <Text color="#00FFFF">● </Text> : "  "}
                      {l.startsWith("```") ? <Text color="#008B8B">{l}</Text> :
                       l.startsWith("# ") || l.startsWith("## ") ? <Text bold color="#FF00FF">{l}</Text> :
                       <Text>{l}</Text>}
                    </Text>
                  ))}
                </Box>
              );
            case "tool":
              return (
                <Text key={line.id}>
                  <Text color="#00FFFF">● </Text>
                  <Text bold color="#FF00FF">{line.text}</Text>
                </Text>
              );
            case "tool-result":
              return <Text key={line.id} color="#008B8B">  {line.text}</Text>;
            case "error":
              return <Text key={line.id} color="red">  {line.text}</Text>;
            case "info":
              return <Text key={line.id} color="#008B8B">  {line.text}</Text>;
            default:
              return <Text key={line.id}>{line.text}</Text>;
          }
        })}

        {loading && <NeonSpinner message={spinnerMsg} />}
      </Box>

      {/* Input box - pinned to bottom */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="#00FFFF"
        width={termWidth}
      >
        <Box>
          <Text color="#FF00FF" bold>{"> "}</Text>
          {ready && !loading ? (
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder=""
            />
          ) : (
            <Text dimColor>{loading ? "waiting for response..." : "initializing..."}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ── Entry point ──
// Clear screen before rendering
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

render(<App />, {
  exitOnCtrlC: true,
});
