# Complete Test Plan — All Phases

**Branch:** `claude-code-integration-2026-04-01`
**Build status:** ✅ Clean (zero errors)

---

## Prerequisites

```bash
cd /Users/marcos/Projects/codemaxxing
git status   # Should be on claude-code-integration-2026-04-01
npm run build   # Should succeed with no errors
```

Make sure you have a local LLM running (LM Studio or Ollama on localhost:1234).

---

## Phase A: Background Agents

### Test 1: Empty State
```bash
npm run dev
```
In the TUI:
```
/agent list
```
**Expected:** "No background agents found."

### Test 2: Create Agent via Script
```bash
mkdir -p /tmp/test-project

node -e "
import { createBackgroundAgent, startBackgroundAgent, listBackgroundAgents, getBackgroundAgent } from './dist/background-agents.js';

const opts = {
  provider: { baseUrl: 'http://localhost:1234/v1', apiKey: 'not-needed', model: 'auto', type: 'openai' },
  cwd: '/tmp/test-project',
  maxTokens: 4096,
  autoApprove: true
};

const agent = await createBackgroundAgent('Test Agent', '/tmp/test-project', 'List 3 best practices for TypeScript projects', opts, 3);
console.log('Created:', agent.id, agent.status);

await startBackgroundAgent(agent.id);

const updated = getBackgroundAgent(agent.id);
console.log('After run:', updated.id, updated.status, 'iterations:', updated.iterations);

const all = listBackgroundAgents();
console.log('Total agents:', all.length);
all.forEach(a => console.log(' ', a.id, a.name, a.status));
"
```
**Expected:** Agent created, runs, shows status. No crashes.

### Test 3: Agent Commands in TUI
Back in `npm run dev`:
```
/agent list
```
**Expected:** Shows the test agent from Test 2.

```
/agent <id-from-above>
```
**Expected:** Shows details (name, status, iterations, timestamps).

### Test 4: Delete Agent
```
/agent delete <id>
/agent list
```
**Expected:** Agent removed. List is empty.

### Test 5: Check Database
```bash
sqlite3 ~/.codemaxxing/background-agents.db ".tables"
sqlite3 ~/.codemaxxing/background-agents.db "SELECT id, name, status, iterations FROM background_agents;"
```
**Expected:** Tables exist. Shows your agent records (or empty if deleted).

---

## Phase B: Cron Scheduling

### Test 6: Empty Schedule
In the TUI:
```
/schedule list
```
**Expected:** "No scheduled jobs."

### Test 7: Create Cron Job via Script
```bash
node -e "
import { createCronJob, listCronJobs, getCronJob } from './dist/cron-scheduling.js';

const opts = {
  provider: { baseUrl: 'http://localhost:1234/v1', apiKey: 'not-needed', model: 'auto', type: 'openai' },
  cwd: '/tmp/test-project',
  maxTokens: 4096,
  autoApprove: true
};

// Schedule every minute for testing
const job = await createCronJob(
  'Test Cron',
  '/tmp/test-project',
  'auto',
  'Say hello and list the current time',
  '* * * * *',   // every minute
  opts
);

console.log('Created job:', job.id, job.name);
console.log('Cron:', job.cron_expression);
console.log('Enabled:', job.enabled);

// Wait 65 seconds to see it fire
console.log('Waiting 65s for first run...');
await new Promise(r => setTimeout(r, 65000));

const updated = getCronJob(job.id);
console.log('After wait:', updated?.last_run_at ? 'RAN at ' + updated.last_run_at : 'NOT YET');

// Clean up
import { deleteCronJob } from './dist/cron-scheduling.js';
deleteCronJob(job.id);
console.log('Cleaned up.');
"
```
**Expected:** Job fires after ~1 minute. Shows "RAN at <time>".

### Test 8: Schedule Commands in TUI
```
/schedule list      # shows jobs
/schedule help      # shows usage
```

### Test 9: Disable/Delete
```
/schedule disable <id>
/schedule list         # should show DISABLED
/schedule delete <id>
/schedule list         # should be empty
```

### Test 10: Check Cron Database
```bash
sqlite3 ~/.codemaxxing/cron-jobs.db ".tables"
sqlite3 ~/.codemaxxing/cron-jobs.db "SELECT * FROM cron_jobs;"
sqlite3 ~/.codemaxxing/cron-jobs.db "SELECT * FROM cron_job_history;"
```

---

## Phase C: Multi-Agent Orchestration

### Test 11: Orchestrate Help
In the TUI:
```
/orchestrate
```
**Expected:** Shows available orchestration commands.

### Test 12: Full-Stack Orchestration
```
/orchestrate fullstack Add a /status endpoint that returns app health info
```
**Expected:**
1. Coordinator agent plans the work
2. Backend, frontend, tests, docs agents spawn
3. Each runs in parallel
4. Summary shows status of all agents

⚠️ **Note:** This spawns 5 agents total! Make sure your LLM server can handle it. If using local Ollama/LM Studio, they'll run sequentially (one model at a time), which is fine but slower.

### Test 13: Code Review Orchestration
```
/orchestrate review
```
**Expected:** Spawns security + test coverage + docs review agents.

### Test 14: Custom Orchestration
```
/orchestrate Refactor the config loading to use Zod validation
```
**Expected:** Spawns implementation + tests agents.

### Test 15: Check All Agents After Orchestration
```
/agent list
```
**Expected:** Shows coordinator + all sub-agents from the orchestration run.

---

## Integration Tests (All Phases Together)

### Test 16: Full Workflow
1. Start an orchestration: `/orchestrate fullstack Add dark mode toggle`
2. While it runs, check agents: `/agent list`
3. After completion, schedule a daily version: `/schedule list`
4. Clean up: delete all agents and jobs

### Test 17: Revert Safety Check
```bash
# Save current state
git stash

# Switch to main — everything should work as before
git checkout main
npm run build
npm run dev
# Test normal codemaxxing functionality

# Come back to feature branch
git checkout claude-code-integration-2026-04-01
git stash pop
```

---

## Quick Smoke Test (5 minutes)

If you're short on time, just do these:

1. `npm run build` → no errors ✅
2. `npm run dev` → TUI launches ✅
3. `/agent list` → "No background agents" ✅
4. `/schedule list` → "No scheduled jobs" ✅
5. `/orchestrate` → shows help ✅
6. Test script from Test 2 → agent runs ✅
7. `/agent list` → shows the agent ✅

---

## Known Limitations (Expected Behavior)

- **Local LLMs process one request at a time** — parallel orchestration will be sequential on Ollama/LM Studio
- **Cloud providers (OpenRouter, Anthropic)** — true parallel execution works, but watch rate limits
- **Cron jobs only fire while codemaxxing is running** — it's in-process, not a system daemon (future improvement)
- **Background agents stay in memory** — restarting codemaxxing loses running agents (DB state preserved for resume)

---

## Reverting (If Anything Goes Wrong)

```bash
# Option 1: Go back to main (instant, safe)
git checkout main

# Option 2: Delete feature branch entirely
git branch -D claude-code-integration-2026-04-01

# Option 3: Keep branch but reset
git checkout claude-code-integration-2026-04-01
git reset --hard HEAD~1
```

Your main branch is **completely untouched**. Zero risk.
