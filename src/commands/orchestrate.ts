import chalk from "chalk";
import {
  runOrchestration,
  runFullStackOrchestration,
  runCodeReviewOrchestration,
  formatOrchestrationResult,
  type SubAgentSpec,
} from "../orchestrator/index.js";
import type { AgentOptions } from "../core/agent.js";
import type { AddMsg } from "./types.js";

/**
 * Handle /orchestrate commands
 *
 * /orchestrate fullstack <task>   — spawn backend+frontend+tests+docs agents
 * /orchestrate review             — spawn security+test coverage+docs review agents
 * /orchestrate <task>             — custom orchestration (uses defaults)
 */
export async function tryHandleOrchestrateCommand(
  input: string,
  cwd: string,
  agentOptions: AgentOptions,
  addMsg: AddMsg,
  ctx?: { setOrchestratePicker?: (val: boolean) => void }
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== "/orchestrate") return false;

  const sub = parts[1]?.toLowerCase() ?? "";

  switch (sub) {
    case "fullstack": {
      const task = parts.slice(2).join(" ");
      if (!task) {
        addMsg("error", "Usage: /orchestrate fullstack <describe the feature>");
        return true;
      }

      addMsg("info", `🤖 Full-Stack Orchestration\nTask: ${task}\nSpawning: backend + frontend + tests + docs agents...`);

      try {
        const result = await runFullStackOrchestration(task, cwd, agentOptions, (msg) => {
          addMsg("info", msg);
        });
        addMsg("info", formatOrchestrationResult(result));
      } catch (err: any) {
        addMsg("error", `✗ Orchestration failed: ${err.message}`);
      }
      return true;
    }

    case "review": {
      addMsg("info", `🔍 Code Review Orchestration\nSpawning: security + test coverage + docs agents...`);

      try {
        const result = await runCodeReviewOrchestration(cwd, agentOptions, (msg) => {
          addMsg("info", msg);
        });
        addMsg("info", formatOrchestrationResult(result));
      } catch (err: any) {
        addMsg("error", `✗ Review failed: ${err.message}`);
      }
      return true;
    }

    case "": {
      if (ctx?.setOrchestratePicker) ctx.setOrchestratePicker(true);
      else addMsg("info", [
        "Orchestration Commands:",
        "  /orchestrate fullstack <task>   — spawn full-stack specialist team",
        "  /orchestrate review             — spawn code review team",
      ].join("\n"));
      return true;
    }

    default: {
      // Treat everything after /orchestrate as a free-form task
      const task = parts.slice(1).join(" ");
      addMsg("info", `🤖 Custom Orchestration\nTask: ${task}`);

      const specs: SubAgentSpec[] = [
        { role: "backend", name: "Implementation", prompt: task, maxIterations: 10 },
        { role: "tests", name: "Tests", prompt: `Write tests for: ${task}`, maxIterations: 5 },
      ];

      try {
        const result = await runOrchestration(task, cwd, agentOptions, specs, (msg) => {
          addMsg("info", msg);
        });
        addMsg("info", formatOrchestrationResult(result));
      } catch (err: any) {
        addMsg("error", `✗ Orchestration failed: ${err.message}`);
      }
      return true;
    }
  }
}
