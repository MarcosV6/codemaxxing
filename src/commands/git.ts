import { exec as execAsync, execFile as execFileAsync } from "child_process";
import { promisify } from "util";
import { getDiff, undoLastCommit, createCheckpoint, restoreCheckpoint, listCheckpoints } from "../utils/git.js";
import type { AddMsg } from "./types.js";
import { compactCommandOutput, getCommandErrorMessage } from "./output.js";

const execPromise = promisify(execAsync);
const execFilePromise = promisify(execFileAsync);

export function tryHandleGitCommand(
  trimmed: string,
  cwd: string,
  addMsg: AddMsg,
): boolean {
  if (trimmed === "/checkpoint" || trimmed.startsWith("/checkpoint ")) {
    const label = trimmed.replace("/checkpoint", "").trim() || undefined;
    const result = createCheckpoint(cwd, label);
    addMsg("info", result.success ? `✅ ${result.message}` : `✗ ${result.message}`);
    return true;
  }

  if (trimmed === "/checkpoints") {
    const cps = listCheckpoints(cwd);
    if (cps.length === 0) {
      addMsg("info", "No checkpoints saved. Use /checkpoint to create one.");
    } else {
      addMsg("info", `Checkpoints (${cps.length}):\n${cps.map((c) => `  ${c}`).join("\n")}\n\n  Use /restore <id> to restore`);
    }
    return true;
  }

  if (trimmed.startsWith("/restore")) {
    const id = trimmed.replace("/restore", "").trim();
    if (!id) {
      const cps = listCheckpoints(cwd);
      if (cps.length === 0) {
        addMsg("info", "No checkpoints. Use /checkpoint to create one first.");
      } else {
        addMsg("info", `Usage: /restore <checkpoint-id>\n\nAvailable:\n${cps.map((c) => `  ${c}`).join("\n")}`);
      }
      return true;
    }
    const result = restoreCheckpoint(cwd, id);
    addMsg("info", result.success ? `✅ ${result.message}` : `✗ ${result.message}`);
    return true;
  }

  if (trimmed === "/diff") {
    const diff = getDiff(cwd);
    addMsg("info", diff);
    return true;
  }

  if (trimmed === "/undo") {
    const result = undoLastCommit(cwd);
    addMsg("info", result.success ? `✅ ${result.message}` : `✗ ${result.message}`);
    return true;
  }

  if (trimmed === "/push") {
    addMsg("info", "⏳ Pushing to remote...");
    execPromise("git push", { cwd })
      .then(({ stdout, stderr }) => {
        const out = compactCommandOutput(stdout + stderr);
        addMsg("info", `✅ Pushed to remote${out ? ` — ${out}` : ""}`);
      })
      .catch((e: any) => {
        const message = getCommandErrorMessage(e);
        addMsg("error", `Push failed${message ? ` — ${message}` : ""}`);
      });
    return true;
  }

  if (trimmed.startsWith("/commit")) {
    const msg = trimmed.replace("/commit", "").trim();
    if (!msg) {
      addMsg("info", "Usage: /commit your commit message here");
      return true;
    }

    addMsg("info", "⏳ Committing...");
    execPromise("git add -A", { cwd })
      .then(() => execFilePromise("git", ["commit", "-m", msg], { cwd }))
      .then(({ stdout, stderr }) => {
        const out = compactCommandOutput(stdout + stderr);
        addMsg("info", `✅ Committed: ${msg}${out ? ` — ${out}` : ""}`);
      })
      .catch((e: any) => {
        const message = getCommandErrorMessage(e);
        addMsg("error", `Commit failed${message ? ` — ${message}` : ""}`);
      });
    return true;
  }

  return false;
}
