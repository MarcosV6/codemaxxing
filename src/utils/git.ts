import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Check if a directory is inside a git repo
 */
export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export function getBranch(cwd: string): string {
  try {
    return execSync("git branch --show-current", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Get short git status (clean / dirty + count)
 */
export function getStatus(cwd: string): string {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();
    if (!output) return "clean";
    const count = output.split("\n").length;
    return `${count} changed`;
  } catch {
    return "unknown";
  }
}

/**
 * Auto-commit a file change with a descriptive message
 */
export function autoCommit(cwd: string, filePath: string, action: string): boolean {
  try {
    execSync(`git add "${filePath}"`, { cwd, stdio: "pipe" });
    const msg = `codemaxxing: ${action} ${filePath}`;
    execSync(`git commit -m "${msg}" --no-verify`, { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get diff of uncommitted changes (or last commit)
 */
export function getDiff(cwd: string): string {
  try {
    // First try uncommitted changes
    let diff = execSync("git diff", { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
    // Include staged changes too
    const staged = execSync("git diff --cached", { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
    if (staged) diff = diff ? `${diff}\n${staged}` : staged;

    // If no uncommitted changes, show last commit
    if (!diff) {
      diff = execSync("git diff HEAD~1 HEAD", { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
      if (diff) return `(last commit)\n${diff}`;
    }

    return diff || "No changes.";
  } catch {
    return "Error getting diff.";
  }
}

/**
 * Undo the last codemaxxing commit
 */
export function undoLastCommit(cwd: string): { success: boolean; message: string } {
  try {
    // Check if last commit was from codemaxxing
    const lastMsg = execSync("git log -1 --pretty=%s", {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
    }).trim();

    if (!lastMsg.startsWith("codemaxxing:")) {
      return {
        success: false,
        message: `Last commit is not from codemaxxing: "${lastMsg}"`,
      };
    }

    execSync("git reset --soft HEAD~1", { cwd, stdio: "pipe" });
    execSync("git restore --staged .", { cwd, stdio: "pipe" });

    return { success: true, message: `Reverted: ${lastMsg}` };
  } catch (e: any) {
    return { success: false, message: `Error: ${e.message}` };
  }
}
