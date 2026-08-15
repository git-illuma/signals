import type { iComputedSignalState } from "../computed/types";
import type { ReadonlySignal, WritableSignal } from "../types";

/**
 * A signal that derives its value from other signals based on `computation` and can also be updated directly.
 * When the value is set directly, it will be challenged against an equality function
 * to determine if the update should trigger listeners.
 */
export type LinkedSignal<K, T = K> = WritableSignal<T>;

/** @internal */
export type LinkedSignalArg<K, T> = iLinkedSignalWithComputation<K, T> | (() => K);

/**
 * Explicit configuration for creating a linked signal with a custom computation function.
 * This allows you to specify a source signal, a computation function that derives the linked signal's value from the source signal,
 * and an optional equality function to control when updates should trigger.
 */
export interface iLinkedSignalWithComputation<K, T> {
  /** Any signal to derive the value from */
  readonly source: ReadonlySignal<K>;
  /** Function to compute the linked signal's value based on the source signal's value and previous state */
  readonly computation: (srcVal: K, prev: { source: K; prevValue: T } | undefined) => T;
  /** Optional equality function to determine if the linked signal's value has changed */
  readonly equal?: (prev: T, next: T) => boolean;
}

/**
 * @internal
 * Represents the internal state of a linked signal, which extends the computed signal state.
 * It includes the current value, listeners, dependencies, and cleanup functions.
 */
export interface iLinkedSignalState<T> extends iComputedSignalState<T> {}
