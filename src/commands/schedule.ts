import chalk from "chalk";
import {
  createCronJob,
  disableCronJob,
  enableCronJob,
  deleteCronJob,
  listCronJobs,
  getCronJob,
  getCronJobHistory,
  type CronJobRecord,
} from "../cron-scheduling.js";
import type { AgentOptions } from "../agent.js";
import type { AddMsg } from "./types.js";

/**
 * Pretty-print a cron job record
 */
function displayCronJob(job: CronJobRecord): string {
  const enabled = job.enabled ? chalk.green("ENABLED") : chalk.gray("DISABLED");
  const lines = [
    `${chalk.bold(job.name)} [${job.id}]  ${enabled}`,
    `Schedule: ${chalk.cyan(job.cron_expression)}`,
    `Model:    ${job.model}`,
    `Dir:      ${job.cwd}`,
    `Task:     ${job.prompt.slice(0, 80)}${job.prompt.length > 80 ? "..." : ""}`,
    `Created:  ${new Date(job.created_at).toLocaleString()}`,
  ];
  if (job.last_run_at) lines.push(`Last run: ${new Date(job.last_run_at).toLocaleString()}`);
  if (job.error_message) lines.push(chalk.red(`Error:    ${job.error_message}`));
  return lines.join("\n");
}

/**
 * Handle /schedule commands
 *
 * /schedule list                  — list all jobs
 * /schedule <id>                  — show details
 * /schedule disable <id>          — disable a job
 * /schedule delete <id>           — delete a job
 * /schedule history <id>          — show run history
 */
export async function tryHandleScheduleCommand(
  input: string,
  agentOptions?: AgentOptions,
  addMsg?: AddMsg
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== "/schedule") return false;

  const sub = parts[1]?.toLowerCase() ?? "";
  const arg = parts[2] ?? "";

  switch (sub) {
    case "list": {
      const jobs = listCronJobs();
      if (jobs.length === 0) {
        addMsg("info", "No scheduled jobs.");
      } else {
        const lines = jobs.map((j, i) => {
          const enabled = j.enabled ? "ENABLED" : "DISABLED";
          return [
            `${j.name} [${j.id}]  ${enabled}`,
            `Schedule: ${j.cron_expression}`,
            `Model:    ${j.model}`,
            `Dir:      ${j.cwd}`,
            `Task:     ${j.prompt.slice(0, 80)}${j.prompt.length > 80 ? "..." : ""}`,
          ].join("\n");
        }).join("\n\n");
        addMsg("info", `${lines}\n\nTotal: ${jobs.length} jobs`);
      }
      return true;
    }

    case "disable": {
      if (!arg) { addMsg("error", "Usage: /schedule disable <id>"); return true; }
      const job = getCronJob(arg);
      if (!job) { addMsg("error", `Job ${arg} not found`); return true; }
      disableCronJob(arg);
      addMsg("info", `✓ Job ${arg} disabled`);
      return true;
    }

    case "delete": {
      if (!arg) { addMsg("error", "Usage: /schedule delete <id>"); return true; }
      const job = getCronJob(arg);
      if (!job) { addMsg("error", `Job ${arg} not found`); return true; }
      deleteCronJob(arg);
      addMsg("info", `✓ Job ${arg} deleted`);
      return true;
    }

    case "history": {
      if (!arg) { addMsg("error", "Usage: /schedule history <id>"); return true; }
      const history = getCronJobHistory(arg, 10);
      if (history.length === 0) {
        addMsg("info", "No run history for this job.");
      } else {
        const lines = history.map(h => {
          const icon = h.status === "completed" ? "✓" :
                       h.status === "failed" ? "✗" : "⟳";
          let line = `${icon} ${h.status.padEnd(10)} ${new Date(h.started_at).toLocaleString()} agent=${h.agent_id}`;
          if (h.error_message) line += `\n   ${h.error_message}`;
          return line;
        }).join("\n");
        addMsg("info", `Run history for ${arg}:\n${lines}`);
      }
      return true;
    }

    case "": {
      addMsg("info", [
        "Scheduled Job Commands:",
        "  /schedule list              — list all jobs",
        "  /schedule <id>              — show job details",
        "  /schedule disable <id>      — pause a job",
        "  /schedule delete <id>       — delete a job",
        "  /schedule history <id>      — show run history",
      ].join("\n"));
      return true;
    }

    default: {
      // Treat sub as a job ID
      const job = getCronJob(sub);
      if (job) {
        const enabled = job.enabled ? "ENABLED" : "DISABLED";
        addMsg("info", [
          `${job.name} [${job.id}]  ${enabled}`,
          `Schedule: ${job.cron_expression}`,
          `Model:    ${job.model}`,
          `Task:     ${job.prompt.slice(0, 80)}${job.prompt.length > 80 ? "..." : ""}`,
        ].join("\n"));
        return true;
      }
      addMsg("error", `Unknown subcommand: ${sub}\nUsage: /schedule [list|disable|delete|history] [id]`);
      return true;
    }
  }
}
