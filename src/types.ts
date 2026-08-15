import type { iRxNode } from "./graph";

/**
 * Registered on the global symbol registry on purpose. This package can end up
 * duplicated in a dependency tree (two versions, or a bundler that inlines it
 * into several chunks), and a plain `Symbol()` would give each copy its own
 * brand — `isSignal` would then reject a perfectly good signal that happened to
 * be created by the other copy.
 */
export const SIGNAL_SYMBOL: unique symbol = Symbol.for(
  "@illuma/signals/StateSymbol",
) as never;

/**
 * Defines an equality function for signals.
 */
export interface iSignalOptions<T> {
  /**
   * Equality function compares the current and next values of a signal to determine if they are considered equal.
   * When equal, the signal will not notify its listeners of a change, even if the value has been updated.
   * This is useful for optimizing performance by preventing unnecessary updates when the value has not meaningfully changed.
   */
  equal?: (prev: T, next: T) => boolean;
}

/**
 * @internal
 * Provides access to current signal state.
 */
export interface iSignalStateSymb<T> {
  readonly [SIGNAL_SYMBOL]: iReadonlySignalState<T>;
}

// Readonly signal
/**
 * A signal that can be read but not directly modified.
 */
export type ReadonlySignal<T> = (() => T) & {
  /**
   * Allows listeners to subscribe to changes in the signal's value. Returns an unsubscribe function.
   */
  readonly subscribe: (listener: (val: T) => void) => () => void;
};

/** @internal */
export type iSignalObserver = (listener: (...args: any) => void) => () => void;

/** @internal */
export interface iSignalTrackerState {
  readonly trackers: Set<iSignalObserver>;
  readonly track: (obs: iSignalObserver) => void;
}

/**
 * @internal
 * Represents the internal state of a readonly signal, including its current value and listeners.
 */
export interface iReadonlySignalState<T> extends iSignalTrackerState {
  value: T;
  readonly listeners: Set<(val: T) => void>;
  readonly rx: iRxNode;
}

/**
 * A signal that can be both read and modified.
 * It extends the ReadonlySignal with additional methods for updating its value.
 */
export type WritableSignal<T> = ReadonlySignal<T> & {
  /**
   * Sets the signal's value to the provided value.
   * New value will be compared with the current using the equality function,
   * and if they are not equal, listeners will be notified of the change.
   */
  readonly set: (val: T) => void;

  /**
   * Updates the signal's value based on a function that receives the current value and returns the new value.
   * This is useful for updating the signal based on its previous state without needing to read it separately.
   * Will also use the equality function to determine if the new value is different from the current value before notifying listeners.
   */
  readonly update: (fn: (prev: T) => T) => void;

  /**
   * Creates a readonly version of the signal that can be passed around without exposing the ability to modify it.
   * The readonly signal will reflect changes made to the original signal, but will not allow direct updates.
   */
  readonly asReadonly: () => ReadonlySignal<T>;
};

export * from "./computed/types";
export * from "./external/types";
export * from "./linked/types";
export * from "./resource/types";
