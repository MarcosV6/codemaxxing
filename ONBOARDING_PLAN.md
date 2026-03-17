# Codemaxxing Onboarding Plan — Option 2 (Smart Detection)

> Created: 2026-03-17
> Status: PLANNED — not yet implemented

## Problem

First-time users hit a dead end after authenticating:
1. Start codemaxxing → no local LLM → wizard shows
2. `/login` → auth succeeds
3. `/models` blocked by `if (!agent)` guard → can't pick a model → stuck
4. Have to restart to pick up credentials

## Solution: Smart Detection Flow

```
codemaxxing (first launch)
    │
    ├─ Step 1: Detect local LLMs (1-2 sec)
    │   ├─ Found → auto-connect → ready to code ✅
    │   └─ Not found → Step 2
    │
    ├─ Step 2: Check saved credentials
    │   ├─ Found → auto-show /models picker → pick model → create agent → ready ✅
    │   └─ Not found → Step 3
    │
    └─ Step 3: Interactive "Get Started" picker
        ┌─────────────────────────────────────┐
        │  No LLM detected. Pick a provider:  │
        │                                     │
        │  > ChatGPT (GPT-5.4, free w/ Plus)  │
        │    Claude (Sonnet, Opus, Haiku)      │
        │    OpenRouter (200+ models)          │
        │    Set up local LLM (Ollama)         │
        └─────────────────────────────────────┘
            │
            ├─ Cloud pick → /login flow → auth succeeds → auto-show /models → pick → create agent → ready ✅
            └─ Local pick → existing Ollama wizard → download model → create agent → ready ✅
```

## Implementation Steps

### Step 1: Fix the foundation (30 min)
- Move `/models` and `/login` above the `if (!agent)` guard in `index.tsx`
- Make the model picker save config + call `connectToProvider(true)` when no agent exists
- Test: `/login` → `/models` → pick → coding works without restart

### Step 2: Auto-detect saved credentials on startup (20 min)
- In `connection.ts` `connectToProvider()`: after local detection fails, check for saved credentials via `getCredential()`
- If creds found for any provider → auto-show the model picker (skip the wizard)
- Test: authenticate once, restart, auto-shows model picker

### Step 3: New "Get Started" picker (40 min)
- Replace the current wizard `"connection"` screen with a new provider chooser
- 4 options: ChatGPT, Claude, OpenRouter, Local LLM
- Cloud options → trigger `/login` flow for that specific provider
- Local → existing Ollama wizard
- After auth succeeds → automatically transition to model picker

### Step 4: Post-auth auto-model-picker (20 min)
- After any successful `/login`, automatically trigger the `/models` flow
- No manual step needed — auth → model list appears immediately
- User picks, agent creates, done

### Step 5: Polish (20 min)
- Better status messages during each step
- Handle edge cases: auth fails → back to picker, model pick fails → retry
- Remove "No LLM connected" dead-end message entirely
- Test full flow on fresh config (delete `~/.codemaxxing/`)

## Files to Modify

1. **`src/ui/connection.ts`** — Add credential detection after local fail
2. **`src/index.tsx`** — Move `/models` + `/login` above agent guard, add auto-model-picker after login
3. **`src/ui/input-router.ts`** — Model picker creates agent when none exists (save config + reconnect)
4. **`src/ui/wizard.ts`** (or new file) — New "Get Started" provider chooser screen

## What NOT to Change
- Existing local LLM detection (works fine)
- Existing OAuth flows (all working)
- Existing model picker UI (just needs to work without agent)
- Session/history system

## Testing Matrix

| Scenario | Expected |
|----------|----------|
| Fresh install, no LLM, no creds | "Get Started" picker appears |
| Fresh install, Ollama running | Auto-connects |
| Has saved creds, no local LLM | Model picker auto-shows |
| `/login` → auth → done | Model picker auto-shows after auth |
| Pick model with no agent | Agent creates, ready to code |
| Switch model mid-session | Works as before |

## Key Technical Notes

### ChatGPT Backend API (for Codex OAuth)
- Endpoint: `https://chatgpt.com/backend-api/codex/responses`
- Format: Responses API (not Chat Completions)
- Required: `store: false`, NO `max_output_tokens`
- Auto-detect OAuth tokens: anything NOT starting with `sk-` or `sess-`

### Provider Detection Order
1. Local LLM (LM Studio :1234, Ollama :11434, vLLM :8000, LocalAI :8080)
2. Saved credentials (anthropic, openai, openrouter, qwen, copilot)
3. Interactive picker (new)
