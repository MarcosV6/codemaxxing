/**
 * Build a project context string by scanning the working directory
 */
export declare function buildProjectContext(cwd: string): string;
/**
 * Get the system prompt for the coding agent
 */
export declare function getSystemPrompt(projectContext: string): string;
