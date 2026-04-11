/**
 * In-session task progress tracker.
 * The agent creates tasks to show the user what it's working on.
 * Tasks are displayed as a live checklist in the UI.
 */

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface AgentTask {
  id: number;
  label: string;
  status: TaskStatus;
  /** Present-tense label shown while in_progress (e.g., "Fixing tests...") */
  activeLabel?: string;
  createdAt: number;
  completedAt?: number;
}

let tasks: AgentTask[] = [];
let nextId = 1;
let onChange: (() => void) | null = null;

/**
 * Register a callback that fires whenever the task list changes.
 */
export function onTaskChange(cb: () => void): void {
  onChange = cb;
}

function notify(): void {
  onChange?.();
}

/**
 * Create a new task. Returns its ID.
 */
export function createTask(label: string, activeLabel?: string): number {
  const id = nextId++;
  tasks.push({
    id,
    label,
    status: "pending",
    activeLabel,
    createdAt: Date.now(),
  });
  notify();
  return id;
}

/**
 * Update a task's status.
 */
export function updateTask(id: number, status: TaskStatus): boolean {
  const task = tasks.find(t => t.id === id);
  if (!task) return false;
  task.status = status;
  if (status === "completed") {
    task.completedAt = Date.now();
  }
  notify();
  return true;
}

/**
 * Get all current tasks.
 */
export function getTasks(): AgentTask[] {
  return [...tasks];
}

/**
 * Get active (non-completed) tasks.
 */
export function getActiveTasks(): AgentTask[] {
  return tasks.filter(t => t.status !== "completed");
}

/**
 * Check if there are any visible tasks.
 */
export function hasTasks(): boolean {
  return tasks.length > 0;
}

/**
 * Clear all tasks (e.g., after agent finishes a full response).
 */
export function clearTasks(): void {
  tasks = [];
  nextId = 1;
  notify();
}

/**
 * Clear only completed tasks, keep pending/in_progress.
 */
export function clearCompletedTasks(): void {
  tasks = tasks.filter(t => t.status !== "completed");
  notify();
}
