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
  agentOptions?: AgentOptions
): Promise<boolean> {
  const parts = input.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== "/schedule") return false;

  const sub = parts[1]?.toLowerCase() ?? "";
  const arg = parts[2] ?? "";

  switch (sub) {
    case "list": {
      const jobs = listCronJobs();
      if (jobs.length === 0) {
        console.log(chalk.gray("No scheduled jobs."));
      } else {
        jobs.forEach((j, i) => {
          if (i > 0) console.log();
          console.log(displayCronJob(j));
        });
        console.log(chalk.dim(`\nTotal: ${jobs.length} jobs`));
      }
      return true;
    }

    case "disable": {
      if (!arg) { console.log(chalk.red("Usage: /schedule disable <id>")); return true; }
      const job = getCronJob(arg);
      if (!job) { console.log(chalk.red(`Job ${arg} not found`)); return true; }
      disableCronJob(arg);
      console.log(chalk.cyan(`✓ Job ${arg} disabled`));
      return true;
    }

    case "delete": {
      if (!arg) { console.log(chalk.red("Usage: /schedule delete <id>")); return true; }
      const job = getCronJob(arg);
      if (!job) { console.log(chalk.red(`Job ${arg} not found`)); return true; }
      deleteCronJob(arg);
      console.log(chalk.green(`✓ Job ${arg} deleted`));
      return true;
    }

    case "history": {
      if (!arg) { console.log(chalk.red("Usage: /schedule history <id>")); return true; }
      const history = getCronJobHistory(arg, 10);
      if (history.length === 0) {
        console.log(chalk.gray("No run history for this job."));
      } else {
        console.log(chalk.bold(`Run history for ${arg}:\n`));
        history.forEach(h => {
          const icon = h.status === "completed" ? chalk.green("✓") :
                       h.status === "failed" ? chalk.red("✗") : chalk.yellow("⟳");
          console.log(`${icon} ${h.status.padEnd(10)} ${new Date(h.started_at).toLocaleString()} agent=${h.agent_id}`);
          if (h.error_message) console.log(chalk.red(`   ${h.error_message}`));
        });
      }
      return true;
    }

    case "": {
      console.log(chalk.bold("Scheduled Job Commands:"));
      console.log("/schedule list              — list all jobs");
      console.log("/schedule <id>              — show job details");
      console.log("/schedule disable <id>      — pause a job");
      console.log("/schedule delete <id>       — delete a job");
      console.log("/schedule history <id>      — show run history");
      return true;
    }

    default: {
      // Treat sub as a job ID
      const job = getCronJob(sub);
      if (job) {
        console.log(displayCronJob(job));
        return true;
      }
      console.log(chalk.red(`Unknown subcommand: ${sub}`));
      console.log("Usage: /schedule [list|disable|delete|history] [id]");
      return true;
    }
  }
}
