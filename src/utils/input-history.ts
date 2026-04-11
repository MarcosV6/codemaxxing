import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const HISTORY_FILE = join(homedir(), ".codemaxxing", "history.txt");
const MAX_HISTORY = 500;

let history: string[] = [];
let cursor = -1;
let savedInput = "";

export function loadHistory(): void {
  try {
    if (existsSync(HISTORY_FILE)) {
      history = readFileSync(HISTORY_FILE, "utf-8")
        .split("\n")
        .filter((l) => l.trim());
    }
  } catch {
    history = [];
  }
  cursor = -1;
}

export function addToHistory(input: string): void {
  const trimmed = input.trim();
  if (!trimmed) return;
  // Don't add duplicates of the last entry
  if (history.length > 0 && history[history.length - 1] === trimmed) return;
  history.push(trimmed);
  if (history.length > MAX_HISTORY) {
    history = history.slice(-MAX_HISTORY);
  }
  cursor = -1;
  // Persist
  try {
    mkdirSync(dirname(HISTORY_FILE), { recursive: true });
    writeFileSync(HISTORY_FILE, history.join("\n") + "\n", "utf-8");
  } catch {
    // ignore write failures
  }
}

/**
 * Navigate history up (older). Returns the entry or null if at the top.
 */
export function historyUp(currentInput: string): string | null {
  if (history.length === 0) return null;
  if (cursor === -1) {
    savedInput = currentInput;
    cursor = history.length - 1;
  } else if (cursor > 0) {
    cursor--;
  } else {
    return null; // at the top
  }
  return history[cursor];
}

/**
 * Navigate history down (newer). Returns the entry, the saved input, or null.
 */
export function historyDown(): string | null {
  if (cursor === -1) return null;
  cursor++;
  if (cursor >= history.length) {
    cursor = -1;
    return savedInput;
  }
  return history[cursor];
}

export function resetHistoryCursor(): void {
  cursor = -1;
}
