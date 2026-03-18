# Testing Feedback — 2026-03-17

> From: Friend testing on Windows (pre-v1.1.2 build, some issues may be fixed)
> Status: NEEDS TRIAGE

## Critical (Blocks Usage)

### #15 — Auth succeeds but "No LLM connected" ⚠️ LIKELY FIXED in v1.1.2
- Logged into Claude and OpenAI, both said "authenticated successfully"
- Every message still says "No LLM connected"
- Only Ollama worked
- **v1.1.2 fix:** /models now works without agent, model picker creates agent

### #11 — OpenRouter OAuth broken
- Getting 409 error
- Sat waiting 5 min before timeout
- No way to cancel
- **Status:** NOT FIXED — needs investigation

### #13 — Paste doesn't work
- Ctrl+V doesn't work
- Right-click doesn't work
- Can't paste API keys or code
- **Status:** NOT FIXED — critical for usability

## Major (Seriously Hurts UX)

### #1 — Install finder gets stuck, no back button
- Picked local model + Ollama
- Install finder got stuck
- Had to spam Enter to get past
- **Status:** NOT FIXED

### #2 — Ollama download: no progress indicator
- Downloading for 166 seconds with nothing on screen
- Looked frozen
- Needs progress bar or status updates
- **Status:** NOT FIXED

### #3 — Ollama install timeout too short (Windows)
- Said "Install failed: Command failed: winget install Ollama.Ollama"
- But installer was still running fine
- Timed out too early — winget is slow
- **Status:** NOT FIXED — increase timeout for Windows

### #4 — First message takes 151 seconds (7B model)
- Just a spinner the whole time
- Most people would close it
- **Status:** Expected for slow hardware + 7B model, but needs better messaging

### #6 — No stop/cancel button
- Only way to stop output is Ctrl+C which kills the whole app
- Needs Escape or stop button
- **Status:** NOT FIXED

### #8 — No hint about file reading
- User pasted code into chat, didn't know about file tools
- No onboarding hint about capabilities
- **Status:** NOT FIXED — add hint in welcome message

### #14 — "Use provider" option buried
- Hidden in the API keys section
- Should be on the main menu
- Confusing navigation
- **Status:** NOT FIXED

## Minor (Polish)

### #5 — Slow token streaming
- Text typing out super slow
- **Status:** Model-dependent (7B), but check if streaming has buffering issues

### #7 — 7B model too small for default
- Mixed up batch script and PowerShell syntax
- 7B might not be good enough as default recommendation
- **Status:** Consider recommending 14B+ for coding

### #9 — No way to get back to main menu
- Have to quit the whole app
- **Status:** NOT FIXED

### #10 — Ollama quit hangs
- Said yes to close Ollama, it hung
- Only came back after manually closing from tray
- **Status:** NOT FIXED — Windows tray process issue

### #12 — Scroll breaks UI
- Scrolled up while response was streaming
- UI got weird, couldn't get back to bottom
- **Status:** Known Ink TUI limitation, hard to fix

## Priority Order

1. **#13** Paste support (blocks basic usage)
2. **#11** OpenRouter OAuth 409 (blocks cloud provider)
3. **#15** Auth → No LLM (likely fixed in v1.1.2, needs retest)
4. **#6** Stop button (Escape to cancel)
5. **#1-3** Ollama install flow (Windows)
6. **#8** Capability hints
7. **#14** Menu navigation
8. Everything else
