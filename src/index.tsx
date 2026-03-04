#!/usr/bin/env node

import React, { useState, useEffect, useCallback } from "react";
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
      {"  "}<Text color="#00FFFF">{SPINNER_FRAMES[frame]}</Text>
      {" "}<Text bold color="#FF00FF">{message}</Text>
      {" "}<Text color="#008B8B">[{elapsed}s]</Text>
    </Text>
  );
}

// ── Message Types ──
interface ChatMessage {
  id: number;
  type: "user" | "response" | "tool" | "tool-result" | "error" | "info";
  text: string;
}

let msgId = 0;

// ── Main App ──
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinnerMsg, setSpinnerMsg] = useState("");
  const [agent, setAgent] = useState<CodingAgent | null>(null);
  const [ready, setReady] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<string[]>([]);
  const [ctrlCPressed, setCtrlCPressed] = useState(false);

  // Initialize agent
  useEffect(() => {
    (async () => {
      const config = loadConfig();
      let provider = config.provider;
      const info: string[] = [];

      if (provider.model === "auto" || provider.baseUrl === "http://localhost:1234/v1") {
        info.push("Detecting local LLM server...");
        setConnectionInfo([...info]);
        const detected = await detectLocalProvider();
        if (detected) {
          provider = detected;
          info.push(`✔ Connected to ${provider.baseUrl} → ${provider.model}`);
          setConnectionInfo([...info]);
        } else {
          info.push("✗ No local LLM server found. Start LM Studio or Ollama.");
          setConnectionInfo([...info]);
          return;
        }
      } else {
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

  function addMsg(type: ChatMessage["type"], text: string) {
    setMessages((prev) => [...prev, { id: msgId++, type, text }]);
  }

  function stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
  }

  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    setInput("");
    if (!trimmed || !agent) return;

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
    } catch (err: any) {
      addMsg("error", `Error: ${err.message}`);
    }

    setLoading(false);
  }, [agent, exit]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      if (ctrlCPressed) {
        exit();
      } else {
        setCtrlCPressed(true);
        addMsg("info", "Press Ctrl+C again to exit.");
        setTimeout(() => setCtrlCPressed(false), 3000);
      }
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

  return (
    <Box flexDirection="column">
      {/* ═══ ALL SCROLLABLE CONTENT (banner + connection + messages) ═══ */}
      <Static items={[
        { id: -2, type: "banner" as const, text: "" },
        ...(connectionInfo.length > 0 ? [{ id: -1, type: "connection" as const, text: "" }] : []),
        ...messages,
      ]}>
        {(item) => {
          // Banner
          if (item.id === -2) {
            return (
              <Box key="banner" flexDirection="column" borderStyle="round" borderColor="#00FFFF" paddingX={1}>
                {codeLines.map((line, i) => (
                  <Text key={`c${i}`} color="#00FFFF">{line}</Text>
                ))}
                {maxxingLines.map((line, i) => (
                  <Text key={`m${i}`} color={i === maxxingLines.length - 1 ? "#CC00CC" : "#FF00FF"}>{line}</Text>
                ))}
                <Text>
                  <Text color="#008B8B">{"                            v" + VERSION}</Text>
                  {"  "}<Text color="#00FFFF">💪</Text>
                  {"  "}<Text dimColor>your code. your model. no excuses.</Text>
                </Text>
              </Box>
            );
          }

          // Connection info
          if (item.id === -1) {
            return (
              <Box key="conn" flexDirection="column" borderStyle="single" borderColor="#008B8B" paddingX={1} marginBottom={1}>
                {connectionInfo.map((line, i) => (
                  <Text key={i} color={line.startsWith("✔") ? "#00FFFF" : line.startsWith("✗") ? "red" : "#008B8B"}>{line}</Text>
                ))}
              </Box>
            );
          }

          const msg = item as ChatMessage;
          switch (msg.type) {
            case "user":
              return (
                <Box key={msg.id} marginTop={1}>
                  <Text color="#008B8B">{"  > "}{msg.text}</Text>
                </Box>
              );
            case "response":
              return (
                <Box key={msg.id} flexDirection="column" marginLeft={2} marginBottom={1}>
                  {msg.text.split("\n").map((l, i) => (
                    <Text key={i} wrap="wrap">
                      {i === 0 ? <Text color="#00FFFF">● </Text> : <Text>  </Text>}
                      {l.startsWith("```") ? <Text color="#008B8B">{l}</Text> :
                       l.startsWith("# ") || l.startsWith("## ") ? <Text bold color="#FF00FF">{l}</Text> :
                       l.startsWith("**") ? <Text bold>{l}</Text> :
                       <Text>{l}</Text>}
                    </Text>
                  ))}
                </Box>
              );
            case "tool":
              return (
                <Box key={msg.id}>
                  <Text><Text color="#00FFFF">  ● </Text><Text bold color="#FF00FF">{msg.text}</Text></Text>
                </Box>
              );
            case "tool-result":
              return <Text key={msg.id} color="#008B8B">    {msg.text}</Text>;
            case "error":
              return <Text key={msg.id} color="red">  {msg.text}</Text>;
            case "info":
              return <Text key={msg.id} color="#008B8B">  {msg.text}</Text>;
            default:
              return <Text key={msg.id}>{msg.text}</Text>;
          }
        }}
      </Static>

      {/* ═══ SPINNER ═══ */}
      {loading && <NeonSpinner message={spinnerMsg} />}

      {/* ═══ INPUT BOX (always at bottom) ═══ */}
      <Box borderStyle="single" borderColor="#00FFFF" paddingX={1}>
        <Text color="#FF00FF" bold>{"> "}</Text>
        {ready && !loading ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        ) : (
          <Text dimColor>{loading ? "waiting for response..." : "initializing..."}</Text>
        )}
      </Box>
    </Box>
  );
}

// Clear screen before render
process.stdout.write("\x1B[2J\x1B[3J\x1B[H");

render(<App />, { exitOnCtrlC: false });
