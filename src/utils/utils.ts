import { type iReadonlySignalState, type ReadonlySignal, SIGNAL_SYMBOL } from "../types";

/** @internal Default equality: strict reference comparison. */
export const defaultEqual = <T>(prev: T, next: T) => prev === next;

/**
 * Checks whether a value is a signal produced by this library — `signal`,
 * `computed`, `linkedSignal` or `external`.
 *
 * @param value - The value to test.
 * @returns `true` if the value is a signal, narrowing it to `ReadonlySignal`.
 *
 * Example usage:
 * ```ts
 * if (isSignal(maybe)) console.log(maybe());
 * ```
 */
export function isSignal(value: unknown): value is ReadonlySignal<unknown> {
  return (
    typeof value === "function" &&
    SIGNAL_SYMBOL in value &&
    typeof value[SIGNAL_SYMBOL] === "object"
  );
}

/**
 * @internal
 * Reaches into a signal's internal state. Used to attach listener trackers,
 * which is how `resource` learns that somebody started watching it.
 */
export function extractState(sig: ReadonlySignal<any>): iReadonlySignalState<any> {
  return (<any>sig)[SIGNAL_SYMBOL];
}
