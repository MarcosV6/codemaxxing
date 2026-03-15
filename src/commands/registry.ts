import type { CommandRegistryContext, CommandRegistryHandler } from "./types.js";

export async function dispatchRegisteredCommands<TContext extends CommandRegistryContext>(
  handlers: Array<CommandRegistryHandler<TContext>>,
  context: TContext,
): Promise<boolean> {
  for (const handler of handlers) {
    if (await handler(context)) {
      return true;
    }
  }
  return false;
}
