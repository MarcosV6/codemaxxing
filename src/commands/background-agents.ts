import chalk from "chalk";
import {
  listBackgroundAgents,
  getBackgroundAgent,
  pauseBackgroundAgent,
  deleteBackgroundAgent,
  type BackgroundAgentRecord,
} from "../background-agents.js";
import { displayAgent, listAgents, showAgentDetail } from "../background-agents-cli.js";
import type { AddMsg } from "./types.js";

/**
 * Handle /agent commands
 * Usage:
 *   /agent list           - list all background agents
 *   /agent [id]           - show details for agent
 *   /agent pause [id]     - pause a running agent
 *   /agent resume [id]    - resume a paused agent
 *   /agent delete [id]    - delete an agent
 */
export async function tryHandleBackgroundAgentCommand(
  input: string,
  cwd: string,
  addMsg: AddMsg,
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd !== "/agent") {
    return false;
  }

  const subcommand = parts[1]?.toLowerCase() ?? "";
  const agentId = parts[2];

  switch (subcommand) {
    case "list": {
      const agents = listBackgroundAgents(cwd);
      if (agents.length === 0) {
        addMsg("info", "No background agents found.\n  Use /agent start to create one.");
      } else {
        const lines = agents.map(a => `  ${a.id} — ${a.name} (${a.status})`).join("\n");
        addMsg("info", `Background Agents:\n${lines}`);
      }
      return true;
    }

    case "pause": {
      if (!agentId) {
        addMsg("error", "Usage: /agent pause <agent-id>");
        return true;
      }
      const agent = getBackgroundAgent(agentId);
      if (!agent) {
        addMsg("error", `Agent ${agentId} not found`);
        return true;
      }
      pauseBackgroundAgent(agentId);
      addMsg("info", `✓ Agent ${agentId} paused`);
      return true;
    }

    case "delete": {
      if (!agentId) {
        addMsg("error", "Usage: /agent delete <agent-id>");
        return true;
      }
      const agent = getBackgroundAgent(agentId);
      if (!agent) {
        addMsg("error", `Agent ${agentId} not found`);
        return true;
      }
      deleteBackgroundAgent(agentId);
      addMsg("info", `✓ Agent ${agentId} deleted`);
      return true;
    }

    case "": {
      // No subcommand, show help
      addMsg("info", [
        "Background Agent Commands:",
        "  /agent list              — list all agents",
        "  /agent pause <id>        — pause a running agent",
        "  /agent delete <id>       — delete an agent",
      ].join("\n"));
      return true;
    }

    default: {
      // Assume it's an agent ID if no subcommand
      const possibleId = subcommand;
      const agent = getBackgroundAgent(possibleId);
      if (agent) {
        addMsg("info", `Agent: ${agent.name}\n  Status: ${agent.status}\n  ID: ${agent.id}`);
        return true;
      }

      // If not found as ID, maybe they misspelled
      addMsg("error", `Unknown subcommand: ${subcommand}\nUsage: /agent [list|pause|delete] [agent-id]`);
      return true;
    }
  }
}
