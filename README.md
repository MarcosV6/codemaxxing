# codemaxxing 💪

> your code. your model. no excuses.

<p align="center">
  <img src="assets/screenshot.jpg" alt="codemaxxing terminal UI" width="700">
</p>

Open-source terminal coding agent. Connect **any** LLM — local or remote — and start building. Like Claude Code, but you bring your own model.

## Why?

Every coding agent locks you into their API. Codemaxxing doesn't. Run it with LM Studio, Ollama, OpenRouter, OpenAI, or any OpenAI-compatible endpoint. Your machine, your model, your rules.

## Quick Install (Recommended)

**Linux / macOS:**
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/MarcosV6/codemaxxing/main/install.sh)"
```

**Windows (PowerShell as Administrator):**
```powershell
curl -fsSL -o $env:TEMP\install-codemaxxing.bat https://raw.githubusercontent.com/MarcosV6/codemaxxing/main/install.bat; & $env:TEMP\install-codemaxxing.bat
```

**Windows (CMD as Administrator):**
```
curl -fsSL -o %TEMP%\install-codemaxxing.bat https://raw.githubusercontent.com/MarcosV6/codemaxxing/main/install.bat && %TEMP%\install-codemaxxing.bat
```

> **Note:** Restart your terminal after installation to ensure everything works.

## Manual Installation

**Prerequisites:** [Node.js](https://nodejs.org) 20 or later.

**NPM:**
```bash
npm install -g codemaxxing
```

## Quick Start

### 1. Start Your LLM

You need a local LLM server running. The easiest option:

1. Download [LM Studio](https://lmstudio.ai)
2. Search for a model (e.g. **Qwen 2.5 Coder 7B Q4_K_M** — good for testing)
3. Load the model
4. Click **Start Server** (it runs on port 1234 by default)

### 2. Run It

```bash
codemaxxing
```

That's it. Codemaxxing auto-detects LM Studio and connects. Start coding.

---

## Authentication

**One command to connect any provider:**

```bash
codemaxxing login
```

Interactive setup walks you through it. Or use `/login` inside the TUI.

**Supported auth methods:**

| Provider | Methods |
|----------|---------|
| **OpenRouter** | OAuth (browser login) or API key — one login, 200+ models |
| **Anthropic** | Link your Claude subscription (via Claude Code) or API key |
| **OpenAI** | Import from Codex CLI or API key |
| **Qwen** | Import from Qwen CLI or API key |
| **GitHub Copilot** | Device flow (browser) |
| **Google Gemini** | API key |
| **Any provider** | API key + custom base URL |

```bash
codemaxxing login              # Interactive provider picker
codemaxxing auth list          # See saved credentials
codemaxxing auth remove <name> # Delete a credential
codemaxxing auth openrouter    # Direct OpenRouter OAuth
```

Credentials stored securely in `~/.codemaxxing/auth.json` (owner-only permissions).

---

## Advanced Setup

**With a remote provider (OpenAI, OpenRouter, etc.):**

```bash
codemaxxing --base-url https://api.openai.com/v1 --api-key sk-... --model gpt-4o
```

**With a saved provider profile:**

```bash
codemaxxing --provider openrouter
```

**Auto-detected local servers:** LM Studio (`:1234`), Ollama (`:11434`), vLLM (`:8000`)

## Features

### 🔥 Streaming Tokens
Real-time token display. See the model think, not just the final answer.

### ⚠️ Tool Approval
Dangerous operations (file writes, shell commands) require your approval. Press `y` to allow, `n` to deny, `a` to always allow for the session.

### 📂 Smart Context (Repo Map)
Automatically scans your codebase and builds a map of functions, classes, and types. The model knows what exists where without reading every file.

### 🔀 Git Integration
Opt-in git commands built in:
- `/commit <message>` — stage all + commit
- `/push` — push to remote
- `/diff` — show changes
- `/undo` — revert last codemaxxing commit
- `/git on` / `/git off` — toggle auto-commits

### 💾 Session Persistence
Conversations auto-save to SQLite. Pick up where you left off:
- `/sessions` — list past sessions
- `/resume` — interactive session picker

### 🔄 Multi-Provider
Switch models mid-session without restarting:
- `/model gpt-4o` — switch to a different model
- `/models` — list available models from your provider

### 🔐 Authentication
One command to connect any LLM provider. OpenRouter OAuth (browser login for 200+ models), Anthropic subscription linking, Codex/Qwen CLI import, GitHub Copilot device flow, or manual API keys. Use `codemaxxing login` or `/login` in-session.

### 📋 Smart Paste
Paste large code blocks without breaking the UI. Multi-line pastes collapse into `[Pasted text #1 +N lines]` badges (like Claude Code).

### ⌨️ Slash Commands
Type `/` for autocomplete suggestions. Arrow keys to navigate, Tab or Enter to select.

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/login` | Interactive auth setup |
| `/model <name>` | Switch model mid-session |
| `/models` | List available models |
| `/map` | Show repository map |
| `/sessions` | List past sessions |
| `/resume` | Resume a past session |
| `/reset` | Clear conversation |
| `/context` | Show message count + tokens |
| `/diff` | Show git changes |
| `/commit <msg>` | Stage all + commit |
| `/push` | Push to remote |
| `/undo` | Revert last codemaxxing commit |
| `/git on/off` | Toggle auto-commits |
| `/quit` | Exit |

## CLI Flags

```
-m, --model <model>       Model name to use
-p, --provider <name>     Provider profile from config
-k, --api-key <key>       API key for the provider
-u, --base-url <url>      Base URL for the provider API
-h, --help                Show help
```

## Config

Settings are stored in `~/.codemaxxing/settings.json`:

```json
{
  "provider": {
    "baseUrl": "http://localhost:1234/v1",
    "apiKey": "not-needed",
    "model": "auto"
  },
  "providers": {
    "local": {
      "name": "Local (LM Studio/Ollama)",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "not-needed",
      "model": "auto"
    },
    "openrouter": {
      "name": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-...",
      "model": "anthropic/claude-sonnet-4"
    },
    "openai": {
      "name": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "model": "gpt-4o"
    }
  },
  "defaults": {
    "autoApprove": false,
    "maxTokens": 8192
  }
}
```

## Tools

Codemaxxing gives the model these tools:

- **read_file** — Read file contents (safe)
- **write_file** — Write/create files (requires approval)
- **list_files** — List directory contents (safe)
- **search_files** — Search for patterns across files (safe)
- **run_command** — Execute shell commands (requires approval)

## Project Context

Drop a `CODEMAXXING.md` file in your project root to give the model extra context about your codebase, conventions, or instructions. It's automatically included in the system prompt.

## Stack

- **Runtime:** Node.js + TypeScript
- **TUI:** [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
- **LLM SDK:** [OpenAI SDK](https://github.com/openai/openai-node) (works with any compatible API)
- **Sessions:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Zero cloud dependencies** — everything runs locally

## Inspired By

Built by studying the best:
- [Aider](https://github.com/paul-gauthier/aider) — repo map concept, auto-commit
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — permission system, paste handling
- [OpenCode](https://github.com/opencode-ai/opencode) — multi-provider, SQLite sessions

## License

MIT
