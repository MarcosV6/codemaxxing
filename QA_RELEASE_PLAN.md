# Codemaxxing — Release QA Plan

A practical, end-to-end checklist to validate the app before cutting a release. Work through each section in order on a clean machine if possible (or after `rm -rf ~/.codemaxxing` to simulate first-run). Mark each item ✅ / ❌ / ⚠️ and capture notes.

> **Tip:** keep a scratch dir (e.g. `~/qa-scratch`) and run `codemaxxing` from inside it so file-write tests don't pollute the repo.

---

## 0. Pre-flight

- [ ] `git pull` latest `main`
- [ ] `npm install` clean (no peer-dep warnings that fail the build)
- [ ] `npm run build` succeeds with **zero** TypeScript errors
- [ ] `npm test` (vitest) — all unit tests pass
- [ ] Version bump in `package.json` matches the planned release tag
- [ ] `CHANGELOG` / release notes drafted (if applicable)

---

## 1. Install & first-run

### Fresh install
- [ ] `npm i -g .` (or `npm link`) installs without errors
- [ ] `codemaxxing --help` prints usage
- [ ] `codemaxxing --version` (or banner version line) matches `package.json`
- [ ] First launch with **no `~/.codemaxxing/`** directory → it's created automatically
- [ ] First launch with no provider configured → connection wizard appears, doesn't crash

### Banner & startup
- [ ] Slant ASCII logo renders cleanly (no broken chars, all 6 lines aligned)
- [ ] Gradient flows smoothly across the wordmark in the active theme's colors
- [ ] Banner shows: version, "your code · your model · no excuses", and `▸ ~/path/to/cwd`
- [ ] CWD line collapses `$HOME` to `~` correctly
- [ ] "Type /help for commands · Ctrl+C twice to exit" hint is visible

---

## 2. Authentication & providers

Test each `/login` path. Use a throwaway account where possible.

### OpenAI
- [ ] `/login` → OpenAI → API key flow accepts a valid key
- [ ] `/login` → OpenAI → Codex OAuth flow opens browser, completes, persists token
- [ ] Refresh: let the token expire (or shorten manually) → next request triggers silent refresh, doesn't crash
- [ ] Invalid key → friendly error, not a stack trace

### Anthropic
- [ ] `/login` → Anthropic → API key flow accepts a valid key
- [ ] `/login` → Anthropic → OAuth flow completes
- [ ] Switching to Claude routes through the Anthropic SDK (check `/cost` shows tokens for the right model)

### OpenRouter
- [ ] `/login` → OpenRouter OAuth flow opens browser, completes, persists
- [ ] `/models` lists OpenRouter models after login

### GitHub Copilot
- [ ] `/login` → Copilot → device flow prints URL + code
- [ ] Browser opener does NOT shell-escape user-controlled strings (regression check on shell injection fix)
- [ ] After confirming code, token is saved and chat works

### Qwen / Codex / other token imports
- [ ] Importing an existing Qwen token works
- [ ] Importing an existing Codex token works

### Local providers (Ollama, LM Studio, vLLM)
- [ ] Auto-detect on startup finds running LM Studio at `:1234`
- [ ] Auto-detect finds Ollama at `:11434`
- [ ] Auto-detect finds vLLM at `:8000`
- [ ] If a server is running but has zero models → "no models" wizard appears, doesn't claim "connected"
- [ ] If no server running → graceful "no local server detected" message

---

## 3. Model switching & inventory

- [ ] `/models` opens picker, lists models from the active provider
- [ ] Selecting a model with arrow keys + Enter actually switches the model
- [ ] Status bar updates to show the new model name immediately
- [ ] `/models <name>` shorthand works
- [ ] Switching between OpenAI ⇄ Anthropic ⇄ Local providers mid-session does not corrupt history
- [ ] `qwen3.5`-style local model that emits `<think>...</think>` blocks routes thinking to the thinking pane, not the chat

---

## 4. Themes & UI persistence

- [ ] First launch shows the new **Codemaxxing** default theme
- [ ] All text in the theme picker is **legible** against the terminal background (no `muted` text disappearing)
- [ ] `/theme` opens picker; `↑↓` navigates; Enter applies AND persists
- [ ] Confirmation message says "(saved as default)"
- [ ] Restart the app — selected theme is restored from `~/.codemaxxing/settings.json`
- [ ] `/theme <name>` shorthand also persists
- [ ] Cycle through every theme — none crash, none have unreadable color combos:
  - codemaxxing, cyberpunk-neon, dracula, gruvbox, nord, mono, solarized, hacker, catppuccin, tokyo-night, one-dark, rose-pine, synthwave, blood-moon, hot-dog, acid
- [ ] Banner gradient retints when theme changes (test by switching to gruvbox / nord / one-dark)

---

## 5. Input box & command suggestions

- [ ] Input is wrapped in a rounded border that fills terminal width
- [ ] Border color matches `theme.colors.border`
- [ ] Border turns warning yellow when an approval prompt is active
- [ ] `❯` chevron is colored by `theme.colors.primary`
- [ ] Type `/` → suggestions panel appears
- [ ] Suggestions show **8 at a time** with `↑ N more above` / `↓ N more below` indicators
- [ ] Arrow-down past the visible window → window scrolls to keep selection in view
- [ ] **Every** slash command in the registry is reachable by scrolling
- [ ] Tab completes the highlighted suggestion
- [ ] Esc closes suggestions
- [ ] Filtering by typing more characters narrows the list
- [ ] No literal `\u00b7` text appears anywhere in the UI (regression check)
- [ ] Input history (↑/↓ when no suggestions) cycles previous prompts
- [ ] Bracketed paste of multi-line content shows a `📎 paste #1 · N lines` chip
- [ ] Backspace removes the most recent paste chip

---

## 6. Status bar

- [ ] Token gauge fills/changes color: green < 50% → orange < 80% → red ≥ 80%
- [ ] Message count updates each turn
- [ ] `~Nk tok` updates after each request
- [ ] Cost (`$`) appears when using a paid model with usage data
- [ ] Model name renders without `\u00b7` literals
- [ ] Skills count appears when ≥1 skill is active
- [ ] `architect` segment appears when architect mode is on
- [ ] **Local model only:** `tok/s` segment appears in green after the first response
- [ ] `tok/s` does NOT appear for cloud providers
- [ ] `tok/s` updates each completion

---

## 7. Chat lifecycle

- [ ] Single-turn prompt streams tokens to the UI
- [ ] Long response (>1k tokens) streams smoothly without UI flicker
- [ ] **Ctrl+C once** during streaming → cancels current request, shows `_(cancelled)_`
- [ ] Ctrl+C twice in idle state → exits cleanly
- [ ] Spinner appears before first token, hides once streaming starts
- [ ] Streaming indicator visible while tokens flow
- [ ] After cancel, you can immediately submit a new prompt

### Slow / hung requests
- [ ] Trigger a slow first-token (large local model, cold load) → after ~120s, info message appears: `still waiting on the model… Ns since last activity. Press Ctrl+C twice to cancel.`
- [ ] Message is the **muted info** style (○), NOT a red error
- [ ] Request **continues** running — when the model finally streams, output still arrives (regression: old behavior killed the request at 60s)
- [ ] Ctrl+C twice during the wait actually cancels

---

## 8. Tools

For each tool: trigger via natural prompt, verify the call appears in the UI with args, and the result is reasonable.

### File tools
- [ ] `read_file` — small file (<2k lines)
- [ ] `read_file` — large file (auto-paginates / errors gracefully)
- [ ] `read_file` — image (PNG/JPG) renders inline as image
- [ ] `read_file` — PDF with `pages` argument
- [ ] `write_file` — creates new file in CWD
- [ ] `write_file` — refuses to silently overwrite without `read_file` first (if that's the policy)
- [ ] `edit_file` — exact-string replace
- [ ] `edit_file` — `replace_all`
- [ ] `edit_file` — error on non-unique `old_string`
- [ ] `glob` — pattern match returns sorted-by-mtime
- [ ] `grep` — content search across the repo
- [ ] `grep` with `glob` filter narrows to file type

### Shell
- [ ] `bash` — short command runs and returns output
- [ ] `bash` — long-running command with `run_in_background: true` returns a handle
- [ ] `bash` — output of background process can be tailed
- [ ] `bash` — sandbox / approval prompts fire correctly per approval mode
- [ ] `bash` — quoted paths with spaces work
- [ ] `bash` — non-zero exit code surfaces to the model

### Web & misc
- [ ] `web_fetch` — fetches a public URL, returns parsed content
- [ ] `web_fetch` — handles 404 / network error without crashing
- [ ] `think` — internal-only, doesn't pollute chat output
- [ ] `ask_user` — pauses, shows prompt, captures answer, resumes
- [ ] `image` (`/image` command) — pastes an image for analysis

---

## 9. Approval modes

Set via `/approve suggest|auto-edit|full-auto`.

### `suggest` (default)
- [ ] Every file write asks for approval first
- [ ] Every shell command asks for approval first
- [ ] Diff preview is shown before file edits
- [ ] "Always" approval remembers for the session

### `auto-edit`
- [ ] File edits run without prompting
- [ ] Shell commands still prompt
- [ ] Network calls still prompt

### `full-auto`
- [ ] All tool calls run without prompts
- [ ] Status bar / banner indicates the elevated mode somewhere obvious
- [ ] Mode persists for the session, resets on restart (verify intended behavior)

---

## 10. Sessions & history

- [ ] `/sessions` lists past sessions with timestamps + preview
- [ ] `/resume <id>` restores conversation history visibly (messages reappear)
- [ ] `/session delete <id>` removes the session
- [ ] Resumed session continues with context the model can reference
- [ ] `/reset` clears in-memory conversation but doesn't delete persisted sessions

---

## 11. Checkpoints

- [ ] `/checkpoint` saves current state with a name
- [ ] `/checkpoints` lists saved checkpoints
- [ ] `/restore <id>` restores conversation + (if applicable) file state
- [ ] Restoring after destructive edits actually rolls back the files

---

## 12. Git integration

In a clean test repo:

- [ ] `/git on` enables auto-commit
- [ ] After file edits, an automatic commit is created with a sensible message
- [ ] `/git off` disables auto-commit, no further commits created
- [ ] `/diff` shows current uncommitted changes
- [ ] `/commit` stages + commits all changes with an AI-generated message
- [ ] `/push` pushes to remote (verify remote actually receives it)
- [ ] `/undo` reverts the last codemaxxing-authored commit
- [ ] `/undo` does NOT revert user commits

---

## 13. Background agents & scheduling

- [ ] `/agent list` shows running agents
- [ ] `/agent start <task>` spawns a background agent
- [ ] `/agent pause <id>` pauses
- [ ] `/agent delete <id>` removes
- [ ] Agents survive across in-app navigation but stop on app exit
- [ ] `/schedule add` creates a cron entry
- [ ] `/schedule list` shows scheduled jobs
- [ ] `/schedule remove` deletes
- [ ] `/orchestrate` multi-agent flow runs end-to-end

---

## 14. Skills

- [ ] `/skills` opens the skills picker / browser
- [ ] Installed skills load on startup
- [ ] Skill count shown in status bar matches reality
- [ ] Disabling a skill mid-session updates the count
- [ ] Auto-learned skills appear in `/skills learned`
- [ ] Skills picker scrolls if list is long (no truncation)

---

## 15. Memory system

- [ ] `/memory` lists persisted memories
- [ ] `/memory search <term>` filters
- [ ] `/memory forget <id>` deletes
- [ ] `/memory stats` shows totals
- [ ] Memories actually surface in future conversations relevant to them

---

## 16. Hooks & MCP

### Hooks
- [ ] `/hooks` lists configured hooks from settings
- [ ] PreToolUse hooks fire and can block tool calls
- [ ] PostToolUse hooks fire and receive results
- [ ] SessionStart hooks fire on launch

### MCP
- [ ] `/mcp` shows connected servers
- [ ] `/mcp add` adds a new server (test with a simple stdio server)
- [ ] `/mcp tools` lists tools from MCP servers
- [ ] `/mcp reconnect` recovers a disconnected server
- [ ] `/mcp remove` removes
- [ ] MCP tool calls round-trip results back to the model

---

## 17. Architect mode

- [ ] `/architect` toggles on with default planner
- [ ] `/architect <model>` sets a specific planner
- [ ] Status bar shows `architect` segment when on
- [ ] Plans actually use the planner model for high-level reasoning
- [ ] Toggle off works

---

## 18. Lint & test integration

- [ ] `/lint` shows current lint state and detected linter
- [ ] `/lint on` enables auto-lint after file changes
- [ ] After editing a file, the linter runs and reports issues to the model
- [ ] `/lint off` disables
- [ ] `/test` detects the project's test runner (vitest / jest / pytest / etc.)
- [ ] `/test on` enables auto-test after file changes
- [ ] `/test` runs once on demand
- [ ] Test failures are surfaced to the model

---

## 19. Context management

- [ ] `/context` shows current message count
- [ ] `/tokens` shows token estimate
- [ ] `/cost` shows cumulative input/output tokens and dollar cost
- [ ] `/compact` manually compresses context, shows before/after token counts
- [ ] Auto-compaction triggers near the configured threshold
- [ ] After compaction, conversation continuity is preserved (model remembers earlier context via summary)
- [ ] `/read-only <file>` injects a file as read-only reference
- [ ] Model treats read-only files as immutable

---

## 20. Misc commands

- [ ] `/init` creates a `CODEMAXXING.md` in the project
- [ ] `/export` writes conversation to a markdown file
- [ ] `/doctor` runs diagnostics, prints provider/auth/env status
- [ ] `/copy` copies the last assistant response to clipboard
- [ ] `/help` prints command list
- [ ] `/map` shows repository map for the CWD
- [ ] `/voice` toggles voice input (if mic available); recording indicator visible
- [ ] `/quit` exits cleanly

---

## 21. Headless / exec mode

- [ ] `codemaxxing exec "list files in src"` runs once and exits
- [ ] `echo "explain this" | codemaxxing exec` reads stdin
- [ ] `--auto-approve` flag skips prompts
- [ ] `--json` flag emits structured output instead of streaming text
- [ ] Exit code is non-zero on error
- [ ] Exec mode honors saved provider config

---

## 22. Resilience & edge cases

- [ ] Pull network cable mid-stream → graceful error, conversation state preserved
- [ ] Send a 50k-line paste → input chip handles it, doesn't freeze the UI
- [ ] Resize terminal mid-session → no ghost artifacts, layout reflows
- [ ] Very narrow terminal (60 cols) → banner truncates without crashing
- [ ] Very wide terminal (200 cols) → input border + status bar still look right
- [ ] Drop into a directory with 100k files → glob/repomap don't lock up
- [ ] Trigger an OAuth token refresh failure → friendly "/login to re-authenticate" message
- [ ] Symlink loops in the working directory → file tools don't infinite-loop
- [ ] Submit empty input → no-op, no crash

---

## 23. Cross-platform smoke tests

Run abbreviated 1 / 5 / 7 / 8 / 12 sections on each:

- [ ] **macOS** (Apple Silicon, default zsh)
- [ ] **macOS** (Intel)
- [ ] **Linux** (Ubuntu LTS, bash)
- [ ] **Windows** (PowerShell) — fast-typing corruption regression check
- [ ] **Windows** (WSL2)

---

## 24. Performance sanity

- [ ] Cold start to interactive prompt: < 2s on a modern laptop
- [ ] Memory after 1h of normal use stays under ~500MB
- [ ] No noticeable input lag when typing rapidly
- [ ] Streaming render stays smooth at >50 tok/s

---

## 25. Final release gates

- [ ] All ✅ above OR known-issues documented in release notes
- [ ] `npm run build` clean one more time
- [ ] `git status` clean (or only intentional uncommitted scratch)
- [ ] Tag created: `git tag vX.Y.Z`
- [ ] Pushed to `main` and tag pushed
- [ ] `npm publish` (if publishing to registry)
- [ ] Release notes posted on GitHub

---

## Bug log

Use this section to capture issues found during the QA pass.

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
|   |          |      |             |        |
