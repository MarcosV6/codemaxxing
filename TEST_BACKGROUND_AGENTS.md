# Background Agents Testing Guide

## What We Built

**Phase A: Background Agents Module** — Long-running coding tasks that can:
- Sleep and resume from where they left off
- Persist state to SQLite (separate database from regular sessions)
- Run up to a max iteration limit, then pause automatically
- Be paused, resumed, or fed follow-up messages
- Show progress and status in the UI

## Architecture

```
src/background-agents.ts
├── createBackgroundAgent()    — create + init a new agent
├── startBackgroundAgent()     — run the agent's prompt
├── pauseBackgroundAgent()     — pause mid-run
├── resumeBackgroundAgent()    — pick up where it left off
├── messageBackgroundAgent()   — send follow-up
├── listBackgroundAgents()     — view all agents
└── getBackgroundAgent()       — details for one agent

src/background-agents-cli.ts
└── displayAgent(), listAgents(), etc. — pretty printing

src/commands/background-agents.ts
└── /agent commands in the main TUI
```

**Database:** `~/.codemaxxing/background-agents.db` (separate from sessions.db)

**State Tracking:**
- Agent record (name, model, cwd, status, iterations, prompt)
- Runtime reference (CodingAgent instance, abort controller)
- Session link (each agent has a session_id for message history)

## Testing Steps

### 1. Build & Start
```bash
cd /Users/marcos/Projects/codemaxxing
npm run build
npm run dev
```

### 2. Test Agent Commands

Once in the TUI:

```
/agent list
```
Should show: "No background agents found." (empty state)

### 3. Create an Agent Manually (for now)

The UI doesn't have a "create background agent" command yet, so test it via code. Create a test file:

```bash
cat > /tmp/test-agent.js << 'EOF'
import { createBackgroundAgent, startBackgroundAgent, listBackgroundAgents } from "/Users/marcos/Projects/codemaxxing/dist/background-agents.js";

const agentOptions = {
  provider: {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "not-needed",
    model: "qwen",
    type: "openai"
  },
  cwd: "/tmp/test-project",
  maxTokens: 8192,
  autoApprove: false
};

const agent = await createBackgroundAgent(
  "Test Agent",
  "/tmp/test-project",
  "Explain what background agents are",
  agentOptions,
  5  // max 5 iterations
);

console.log("Created:", agent.id);
await startBackgroundAgent(agent.id);

const updated = listBackgroundAgents();
updated.forEach(a => console.log(a.id, a.status, a.iterations));
EOF

node /tmp/test-agent.js
```

### 4. Check Agent Status in TUI

Back in the running TUI:
```
/agent list
```

You should see your test agent with status "completed" or "paused".

### 5. Test Pause/Resume

In the TUI:
```
/agent pause [agent-id]
```

Then:
```
/agent [agent-id]
```

Status should be "paused".

Resume it:
```
/agent resume [agent-id]
```

### 6. Delete Cleanup

```
/agent delete [agent-id]
```

---

## Feature Flags for Phase A

When you're happy with the module, we'll wrap it in feature flags:

```json
{
  "features": {
    "backgroundAgents": {
      "enabled": true,
      "maxConcurrentAgents": 5
    }
  }
}
```

For now, the module is always available.

---

## What's Next (if you like this)

**Phase B: Cron Scheduling**
- Schedule agents to run on a recurring schedule
- Example: `/agent schedule "audit dependencies" --cron "0 3 * * 0"` (every Sunday 3 AM)
- Hooks into OpenClaw's cron system

**Phase C: Multi-Agent Orchestration**
- Master coordinator spawns specialized sub-agents
- Example: Frontend specialist, backend specialist, docs writer working in parallel
- Sync results back to main agent

---

## Debugging

Enable debug logs:
```bash
CODEMAXXING_DEBUG=1 npm run dev
```

Check the database directly:
```bash
sqlite3 ~/.codemaxxing/background-agents.db
> .schema
> SELECT * FROM background_agents;
> SELECT * FROM agent_state;
```

---

## Let Me Know

Once you test it:
1. Does it build without errors? ✓
2. Can you create agents?
3. Can you list/pause/resume?
4. Any crashes or weird behavior?

Then we'll iterate on the next phases!
