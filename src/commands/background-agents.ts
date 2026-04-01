import chalk from "chalk";
import {
  listBackgroundAgents,
  getBackgroundAgent,
  pauseBackgroundAgent,
  deleteBackgroundAgent,
  type BackgroundAgentRecord,
} from "../background-agents.js";
import { displayAgent, listAgents, showAgentDetail } from "../background-agents-cli.js";

/**
 * Handle /agent commands
 * Usage:
 *   /agent list           - list all background agents
 *   /agent [id]           - show details for agent
 *   /agent pause [id]     - pause a running agent
 *   /agent resume [id]    - resume a paused agent
 *   /agent delete [id]    - delete an agent
 */
export async function tryHandleBackgroundAgentCommand(input: string): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd !== "/agent") {
    return false;
  }

  const subcommand = parts[1]?.toLowerCase() ?? "";
  const agentId = parts[2];

  switch (subcommand) {
    case "list": {
      console.log(chalk.bold("Background Agents:\n"));
      listAgents();
      return true;
    }

    case "pause": {
      if (!agentId) {
        console.log(chalk.red("Usage: /agent pause <agent-id>"));
        return true;
      }
      const agent = getBackgroundAgent(agentId);
      if (!agent) {
        console.log(chalk.red(`Agent ${agentId} not found`));
        return true;
      }
      pauseBackgroundAgent(agentId);
      console.log(chalk.cyan(`✓ Agent ${agentId} paused`));
      return true;
    }

    case "delete": {
      if (!agentId) {
        console.log(chalk.red("Usage: /agent delete <agent-id>"));
        return true;
      }
      const agent = getBackgroundAgent(agentId);
      if (!agent) {
        console.log(chalk.red(`Agent ${agentId} not found`));
        return true;
      }
      deleteBackgroundAgent(agentId);
      console.log(chalk.green(`✓ Agent ${agentId} deleted`));
      return true;
    }

    case "": {
      // No subcommand, show help
      console.log(chalk.bold("Background Agent Commands:"));
      console.log("/agent list              - list all agents");
      console.log("/agent <id>              - show agent details");
      console.log("/agent pause <id>        - pause a running agent");
      console.log("/agent delete <id>       - delete an agent");
      return true;
    }

    default: {
      // Assume it's an agent ID if no subcommand
      const possibleId = subcommand;
      const agent = getBackgroundAgent(possibleId);
      if (agent) {
        console.log(chalk.bold(`Agent: ${agent.name}\n`));
        showAgentDetail(possibleId);
        return true;
      }

      // If not found as ID, maybe they misspelled
      console.log(chalk.red(`Unknown subcommand: ${subcommand}`));
      console.log("Usage: /agent [list|pause|delete] [agent-id]");
      return true;
    }
  }
}
