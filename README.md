# CODEMAXXING 💪

An open-source terminal coding agent. Connect any LLM. Max your code.

## Install

```bash
npm install -g codemaxxing
```

Or via source:

```bash
git clone https://github.com/MarcosV6/codemaxxing.git
cd codemaxxing
npm install
npm install -g .
```

## Quick Start

```bash
# Start CODEMAXXING (auto-detects local LLM servers)
codemaxxing
```

On first run, you'll be prompted to connect a model.

## Connect Your LLM

### Local Models (LM Studio / Ollama)

1. Start your local server (LM Studio, Ollama, vLLM, etc.)
2. Run `codemaxxing` — it auto-detects servers on common ports
3. That's it. No API key needed.

Or configure manually in `~/.codemaxxing/settings.json`:

```json
{
  "provider": {
    "baseUrl": "http://localhost:1234/v1",
    "apiKey": "not-needed",
    "model": "qwen3.5-27b"
  }
}
```

### Cloud Providers (OpenAI, Anthropic, etc.)

Any OpenAI-compatible API works:

```json
{
  "provider": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "model": "gpt-4o"
  }
}
```

Works with OpenAI, Anthropic (via OpenRouter), Google Gemini, Groq, Together AI, and any OpenAI-compatible endpoint.

## Features

- 🔌 **Any model** — works with any OpenAI-compatible endpoint
- 🏠 **Local first** — auto-detects LM Studio, Ollama, and vLLM
- 🛠️ **Tool use** — reads, writes, searches, and runs commands in your codebase
- 🧠 **Context aware** — scans your project structure automatically
- 💻 **Terminal native** — built for developers who live in the CLI
- 🔓 **Open source** — MIT licensed

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/reset` | Clear conversation history |
| `/context` | Show current context size |
| `/quit` | Exit |

## Project Context

Drop a `CODEMAXXING.md` file in your project root to give the agent persistent context about your codebase — architecture, conventions, key files, etc.

## Requirements

- Node.js 20+
- An LLM endpoint (local or cloud)

## Contributing

PRs welcome. Open an issue or just send it.

## License

MIT
