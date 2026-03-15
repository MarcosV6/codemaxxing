import { exec as execAsync } from "child_process";
import { promisify } from "util";
import { getDiff, undoLastCommit } from "../utils/git.js";
import type { AddMsg } from "./types.js";
import { compactCommandOutput, getCommandErrorMessage } from "./output.js";

const execPromise = promisify(execAsync);

export function tryHandleGitCommand(
  trimmed: string,
  cwd: string,
  addMsg: AddMsg,
): boolean {
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
      .then(() => execPromise(`git commit -m ${JSON.stringify(msg)}`, { cwd }))
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
