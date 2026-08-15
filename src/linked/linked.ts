import { computed } from "../computed/computed";
import {
  commitRecompute,
  createRxNode,
  livenessChanged,
  propagate,
  runTracked,
  runUntracked,
  trackRead,
  updateIfNecessary,
} from "../graph";
import type {
  iLinkedSignalState,
  iLinkedSignalWithComputation,
  LinkedSignal,
  LinkedSignalArg,
} from "../linked/types";
import type { iSignalStateSymb } from "../types";
import { SIGNAL_SYMBOL } from "../types";
import { defaultEqual } from "../utils/utils";

/**
 * Creates a linked signal that derives its value from another signal or a computation.
 * The linked signal automatically updates when the source signal changes, and can also have its own computation logic.
 * `linkedSignal` value can be `set` or `update`'d directly, which will override the computed value until the next update from the source signal.
 *
 * @param arg - Either a computation that returns a value
 * or a configuration object with a `source`, `computation`,
 * and optional equality function.
 * @returns A linked signal that reflects the computed value based on the source signal.
 *
 * Example usage:
 * ```ts
 * const count = signal(0);
 * const doubleCount = linkedSignal({
 *   source: count,
 *   computation: (val) => val * 2,
 * });
 * // Or simply:
 * // const doubleCount = linkedSignal(() => count() * 2);
 *
 * console.log(doubleCount()); // 0
 * count.set(1);
 * console.log(doubleCount()); // 2
 *
 * doubleCount.set(10);
 * console.log(doubleCount()); // 10 (overridden value)
 * count.set(2);
 * console.log(doubleCount()); // 4 (recomputed from source signal)
 * ```
 *
 * The linked signal will subscribe to the source signal and update its value
 * based on the provided computation whenever the source signal changes.
 * If the linked signal is directly set or updated, it will use that value
 * until the next change from the source signal triggers a recomputation.
 *
 * You can use it with `useSignal` hook in React to subscribe to changes and get the current value of the linked signal.
 * ```tsx
 * const count = signal(0);
 * const doubleCount = linkedSignal(() => count() * 2);
 * function DoubleCounter() {
 *   const currentDoubleCount = useSignal(doubleCount);
 *   return <div>{currentDoubleCount}</div>;
 * }
 * ```
 */
export function linkedSignal<K>(src: () => K): LinkedSignal<K>;
export function linkedSignal<K, T>(
  cfg: iLinkedSignalWithComputation<K, T>,
): LinkedSignal<T>;
export function linkedSignal<K, T = K>(arg: LinkedSignalArg<K, T>): LinkedSignal<K, T> {
  let equal = defaultEqual<T>;

  let srcFn: () => K;
  let computation: (srcVal: K, prev: { source: K; prevValue: T } | undefined) => T;

  if (typeof arg === "function") {
    srcFn = () => arg();
    computation = (srcVal) => srcVal as unknown as T;
  } else {
    srcFn = arg.source;
    computation = arg.computation;
    equal = arg.equal ?? defaultEqual;
  }

  const rx = createRxNode(true);
  const _state: iLinkedSignalState<T> = {
    value: undefined as T,
    listeners: new Set(),

    trackers: new Set(),
    track: (t) => _state.trackers.add(t),

    rx,
  };

  let initialized = false;

  rx.listenerCount = () => _state.listeners.size;
  rx.emit = () => {
    for (const l of Array.from(_state.listeners)) l(_state.value);
  };
  rx.recompute = () => {
    const prev = _state.value;
    const { value: next, producers } = runTracked(() => {
      const sourceVal = srcFn();

      // Only the source is a dependency: the computation is free to read other
      // signals for context without silently becoming reactive to them.
      return runUntracked(() =>
        computation(
          sourceVal,
          initialized ? { source: sourceVal, prevValue: prev } : undefined,
        ),
      );
    });

    _state.value = next;

    const changed = !initialized || !equal(prev, next);
    initialized = true;

    commitRecompute(rx, producers, changed);
  };

  const signalRef = (() => {
    updateIfNecessary(rx);
    trackRead(rx);

    return _state.value;
  }) as LinkedSignal<K, T> & iSignalStateSymb<T>;

  Object.defineProperty(signalRef, SIGNAL_SYMBOL, { value: _state });

  Object.defineProperty(signalRef, "set", {
    value: (next: T) => {
      updateIfNecessary(rx);

      const prev = _state.value;
      _state.value = next;

      if (equal(prev, next)) return;
      propagate(rx);
    },
  });

  Object.defineProperty(signalRef, "update", {
    value: (fn: (prev: T) => T) => {
      updateIfNecessary(rx);

      const next = fn(_state.value);
      signalRef.set(next);
    },
  });

  Object.defineProperty(signalRef, "subscribe", {
    value: (listener: (val: T) => void) => {
      _state.listeners.add(listener);
      livenessChanged(rx);
      updateIfNecessary(rx);

      listener(_state.value);

      const trackerCleanups: (() => void)[] = [];
      for (const tracker of _state.trackers) {
        trackerCleanups.push(tracker(listener));
      }

      return () => {
        _state.listeners.delete(listener);
        livenessChanged(rx);

        for (const cleanupFn of trackerCleanups) cleanupFn();
      };
    },
  });

  Object.defineProperty(signalRef, "asReadonly", {
    value: () => computed(() => signalRef()),
  });

  Object.freeze(signalRef);
  return signalRef;
}
