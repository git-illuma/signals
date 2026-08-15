import {
  createRxNode,
  livenessChanged,
  propagate,
  runUntracked,
  trackRead,
  updateIfNecessary,
} from "../graph";
import type {
  iReadonlySignalState,
  iSignalOptions,
  iSignalStateSymb,
  ReadonlySignal,
} from "../types";
import { SIGNAL_SYMBOL } from "../types";
import { defaultEqual } from "../utils/utils";
import type { ExternalObserver } from "./types";

/**
 * Adopts a reactive source this library does not own — another framework's
 * signal, a media query, a storage event — as a first-class node of the graph.
 *
 * It is meant for sources you can **read and observe but not write**. If you
 * can push a value into the source yourself, you do not need this: use a plain
 * `signal` and set it.
 *
 * The source is observed only while something is watching the returned signal,
 * and released again once nothing is. While dormant the value is re-read on
 * access instead, so a reader never sees a value that went stale in the gap.
 *
 * @param read - Reads the source's current value. Must be synchronous.
 * @param observe - Attaches to the source; the returned function detaches.
 * @param opts - Optional equality function.
 *
 * Example usage:
 * ```ts
 * const query = window.matchMedia("(prefers-color-scheme: dark)");
 * const prefersDark = external(
 *   () => query.matches,
 *   (notify) => {
 *     query.addEventListener("change", notify);
 *     return () => query.removeEventListener("change", notify);
 *   },
 * );
 * ```
 */
export function external<T>(
  read: () => T,
  observe: ExternalObserver,
  opts?: iSignalOptions<T>,
): ReadonlySignal<T> {
  const equal = opts?.equal ?? defaultEqual;

  const rx = createRxNode(false);
  const _state: iReadonlySignalState<T> = {
    value: runUntracked(read),
    listeners: new Set(),

    trackers: new Set(),
    track: (t) => _state.trackers.add(t),

    rx,
  };

  let detach: (() => void) | null = null;
  let attached = false;

  const reread = (): boolean => {
    const prev = _state.value;
    const next = runUntracked(read);
    _state.value = next;

    return !equal(prev, next);
  };

  const notify = () => {
    if (reread()) propagate(rx);
  };

  rx.listenerCount = () => _state.listeners.size;
  rx.emit = () => {
    for (const l of Array.from(_state.listeners)) l(_state.value);
  };
  rx.refresh = () => {
    if (attached) return;
    if (reread()) rx.version++;
  };
  rx.onLiveness = (live) => {
    if (live) {
      attached = true;
      detach = observe(notify);

      if (reread()) rx.version++;
      return;
    }

    attached = false;
    detach?.();
    detach = null;
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

  Object.freeze(signalRef);
  return signalRef;
}
