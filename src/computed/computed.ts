import {
  commitRecompute,
  createRxNode,
  livenessChanged,
  runTracked,
  trackRead,
  updateIfNecessary,
} from "../graph";
import type { iSignalOptions, iSignalStateSymb, ReadonlySignal } from "../types";
import { SIGNAL_SYMBOL } from "../types";
import { defaultEqual } from "../utils/utils";
import type { iComputedSignalState } from "./types";

/**
 * Creates a computed signal that derives its value from other signals.
 * It automatically tracks dependencies and updates when any of the dependencies change.
 *
 * @param computation - A function that computes the value of the signal based on other signals.
 * @param opts - Optional configuration for the computed signal, including a custom equality function.
 * @returns A readonly signal that updates its value based on the provided computation.
 *
 * Example usage:
 * ```ts
 * const count = signal(0);
 * const doubleCount = computed(() => count() * 2);
 *
 * console.log(doubleCount()); // 0
 * count.set(1);
 * console.log(doubleCount()); // 2
 * ```
 *
 * Dependencies are re-discovered on every recomputation, so a computation that
 * reads a different signal on a later run keeps tracking the branch it actually
 * took. The computation itself is lazy: it does not run until the value is read
 * or subscribed to, and its result is cached until one of its dependencies
 * reports a new version.
 */
export function computed<T>(
  computation: () => T,
  opts?: iSignalOptions<T>,
): ReadonlySignal<T> {
  const equal = opts?.equal ?? defaultEqual;

  const rx = createRxNode(true);
  const _state: iComputedSignalState<T> = {
    value: undefined as T,
    listeners: new Set(),

    trackers: new Set(),
    track: (obs) => _state.trackers.add(obs),

    rx,
  };

  let initialized = false;

  rx.listenerCount = () => _state.listeners.size;
  rx.emit = () => {
    for (const l of Array.from(_state.listeners)) l(_state.value);
  };
  rx.recompute = () => {
    const prev = _state.value;
    const { value: next, producers } = runTracked(computation);

    _state.value = next;

    const changed = !initialized || !equal(prev, next);
    initialized = true;

    commitRecompute(rx, producers, changed);
  };

  const signalRef = (() => {
    updateIfNecessary(rx);
    trackRead(rx);

    return _state.value;
  }) as ReadonlySignal<T> & iSignalStateSymb<T>;

  Object.defineProperty(signalRef, SIGNAL_SYMBOL, { value: _state });

  Object.defineProperty(signalRef, "subscribe", {
    value: (listener: (val: T) => void) => {
      _state.listeners.add(listener);
      livenessChanged(rx);
      updateIfNecessary(rx);

      // Before the trackers: a tracker may write into the graph (that is how
      // `resource` starts loading), and this listener must still see the state
      // that was current when it subscribed rather than only the aftermath.
      listener(_state.value);

      const trackerCleanups: (() => void)[] = [];
      for (const tracker of _state.trackers) {
        const cleanupFn = tracker(listener);
        trackerCleanups.push(cleanupFn);
      }

      return () => {
        _state.listeners.delete(listener);
        livenessChanged(rx);

        for (const cleanupFn of trackerCleanups) cleanupFn();
      };
    },
  });

  Object.freeze(signalRef);
  return signalRef;
}
