# Pierre Code 🎩

An open-source terminal coding agent. Connect any LLM, code anywhere.

## What is this?

Pierre Code is a terminal-based AI coding assistant that works with **any OpenAI-compatible API** — local models via LM Studio, Ollama, or cloud providers like OpenAI, Anthropic, and more.

No vendor lock-in. No subscriptions required. Your model, your rules.

## Quick Start

```bash
# Install globally
npm install -g pierre-code

# Run with local LM Studio
pierre --provider http://localhost:1234/v1

# Run with OpenAI
pierre --provider openai --api-key sk-...

# Auto-detect local LM Studio
pierre --local
```

## Features

- 🔌 **Any model** — works with any OpenAI-compatible endpoint
- 🏠 **Local first** — auto-detects LM Studio and Ollama
- 🛠️ **Tool use** — reads, writes, and edits files in your codebase
- 🧠 **Context aware** — understands your project structure
- 🎯 **Smart routing** — suggests better models for complex tasks
- 💻 **Terminal native** — built for developers who live in the CLI
- 🔓 **Open source** — MIT licensed, fork it, extend it, make it yours

## Supported Providers

| Provider | Endpoint | Local? |
|----------|----------|--------|
| LM Studio | `http://localhost:1234/v1` | ✅ |
| Ollama | `http://localhost:11434/v1` | ✅ |
| OpenAI | `https://api.openai.com/v1` | ❌ |
| Anthropic | Via OpenRouter | ❌ |
| Any OpenAI-compatible | Custom URL | Depends |

## How It Works

1. Pierre Code connects to your chosen LLM endpoint
2. It scans your project structure for context
3. You describe what you want in natural language
4. It reads relevant files, proposes changes, and applies them with your approval

## Configuration

Create `~/.pierre/settings.json`:

```json
{
  "provider": {
    "baseUrl": "http://localhost:1234/v1",
    "apiKey": "not-needed",
    "model": "qwen3.5-27b"
  },
  "defaults": {
    "autoApprove": false,
    "contextFiles": 20,
    "maxTokens": 8192
  }
}
```

## Requirements

- Node.js 20+
- An LLM endpoint (local or cloud)

## Contributing

PRs welcome. This is a community project.

## License

MIT — do whatever you want with it.

---

Built by [Marcos Vallejo](https://github.com/MarcosV6) 🎩
