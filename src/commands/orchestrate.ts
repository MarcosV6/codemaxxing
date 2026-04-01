import chalk from "chalk";
import {
  runOrchestration,
  runFullStackOrchestration,
  runCodeReviewOrchestration,
  formatOrchestrationResult,
  type SubAgentSpec,
} from "../orchestrator.js";
import type { AgentOptions } from "../agent.js";

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
  onProgress?: (msg: string) => void
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== "/orchestrate") return false;

  const sub = parts[1]?.toLowerCase() ?? "";

  switch (sub) {
    case "fullstack": {
      const task = parts.slice(2).join(" ");
      if (!task) {
        console.log(chalk.red("Usage: /orchestrate fullstack <describe the feature>"));
        return true;
      }

      console.log(chalk.bold(`\n🤖 Full-Stack Orchestration`));
      console.log(chalk.dim(`Task: ${task}`));
      console.log(chalk.dim(`Spawning: backend + frontend + tests + docs agents\n`));

      try {
        const result = await runFullStackOrchestration(task, cwd, agentOptions, (msg) => {
          console.log(chalk.dim(msg));
          onProgress?.(msg);
        });
        console.log("\n" + formatOrchestrationResult(result));
      } catch (err: any) {
        console.log(chalk.red(`✗ Orchestration failed: ${err.message}`));
      }
      return true;
    }

    case "review": {
      console.log(chalk.bold(`\n🔍 Code Review Orchestration`));
      console.log(chalk.dim(`Spawning: security + test coverage + docs agents\n`));

      try {
        const result = await runCodeReviewOrchestration(cwd, agentOptions, (msg) => {
          console.log(chalk.dim(msg));
          onProgress?.(msg);
        });
        console.log("\n" + formatOrchestrationResult(result));
      } catch (err: any) {
        console.log(chalk.red(`✗ Review failed: ${err.message}`));
      }
      return true;
    }

    case "": {
      console.log(chalk.bold("Orchestration Commands:"));
      console.log("/orchestrate fullstack <task>   — spawn full-stack specialist team");
      console.log("/orchestrate review             — spawn code review team");
      return true;
    }

    default: {
      // Treat everything after /orchestrate as a free-form task
      const task = parts.slice(1).join(" ");
      console.log(chalk.bold(`\n🤖 Custom Orchestration`));
      console.log(chalk.dim(`Task: ${task}`));

      const specs: SubAgentSpec[] = [
        { role: "backend", name: "Implementation", prompt: task, maxIterations: 10 },
        { role: "tests", name: "Tests", prompt: `Write tests for: ${task}`, maxIterations: 5 },
      ];

      try {
        const result = await runOrchestration(task, cwd, agentOptions, specs, (msg) => {
          console.log(chalk.dim(msg));
          onProgress?.(msg);
        });
        console.log("\n" + formatOrchestrationResult(result));
      } catch (err: any) {
        console.log(chalk.red(`✗ Orchestration failed: ${err.message}`));
      }
      return true;
    }
  }
}
