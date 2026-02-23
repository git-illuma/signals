import { SignalContext } from "../context";

/**
 * Prevents a function from being tracked as a dependency in a computed signal or linked signal.
 * @param fn - The function to execute without tracking its dependencies.
 * @returns The result of the function execution.
 */
export function untracked<T>(fn: () => T): T {
  return SignalContext.execUntracked(fn);
}
