export type AddMsg = (type: "user" | "response" | "tool" | "tool-result" | "error" | "info" | "diff", text: string) => void;

export interface CommandRegistryContext {
  trimmed: string;
}

export type CommandRegistryHandler<TContext extends CommandRegistryContext = CommandRegistryContext> = (
  context: TContext,
) => boolean | Promise<boolean>;
