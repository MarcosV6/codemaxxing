import { exec as execAsync } from "child_process";
import { promisify } from "util";
import { getDiff, undoLastCommit } from "../utils/git.js";

const execPromise = promisify(execAsync);

type AddMsg = (type: "user" | "response" | "tool" | "tool-result" | "error" | "info", text: string) => void;

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
        const out = (stdout + stderr).trim();
        addMsg("info", `✅ Pushed to remote${out ? "\n" + out : ""}`);
      })
      .catch((e: any) => {
        addMsg("error", `Push failed: ${e.stderr || e.message}`);
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
      .then(() => {
        addMsg("info", `✅ Committed: ${msg}`);
      })
      .catch((e: any) => {
        addMsg("error", `Commit failed: ${e.stderr || e.message}`);
      });
    return true;
  }

  return false;
}
