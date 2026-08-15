/**
 * @internal
 * The reactive graph shared by every signal primitive.
 *
 * Dependencies are discovered on every recomputation rather than once at
 * creation, so a computation that reads a different signal on a later run
 * (a conditional branch) stays correct.
 *
 * Propagation is push-pull: a source write marks its transitive consumers
 * stale without recomputing anything, then each node that actually has
 * listeners pulls a fresh value. A node reached through several paths is
 * therefore recomputed once, after every one of its inputs is already stale,
 * which is what keeps intermediate states from ever being observable.
 */
export interface iRxNode {
  version: number;
  stale: boolean;
  live: boolean;
  readonly derived: boolean;
  producers: Map<iRxNode, number>;
  readonly consumers: Set<iRxNode>;
  recompute: () => void;
  emit: () => void;
  listenerCount: () => number;

  /**
   * Source nodes fed from outside the graph use this to re-read their origin
   * while nothing is observing them. A graph traversal calls it before trusting
   * the node's version, so a foreign value that moved while dormant is still
   * noticed by a consumer that nobody listens to either.
   */
  refresh: (() => void) | null;

  /** Fired when the node starts or stops being observed. */
  onLiveness: ((live: boolean) => void) | null;
}

export function createRxNode(derived: boolean): iRxNode {
  return {
    version: 0,
    stale: derived,
    live: false,
    derived,
    producers: new Map(),
    consumers: new Set(),
    recompute: () => {},
    emit: () => {},
    listenerCount: () => 0,
    refresh: null,
    onLiveness: null,
  };
}

/**
 * The active dependency collector is stashed on `globalThis` under a shared
 * symbol, mirroring how `@illuma/core` keys its own module-level state.
 *
 * This package can end up duplicated in a dependency tree, and a plain
 * module-level binding would give each copy its own collector: a `computed`
 * from one copy reading a signal from the other would capture no dependencies
 * at all and silently freeze on its first value.
 */
const TRACKING_KEY = Symbol.for("@illuma/signals/ActiveCollector");

type iSignalsGlobalThis = typeof globalThis & {
  [TRACKING_KEY]?: { collector: Map<iRxNode, number> | null };
};

const signalsGlobal = globalThis as iSignalsGlobalThis;

if (!signalsGlobal[TRACKING_KEY]) {
  signalsGlobal[TRACKING_KEY] = { collector: null };
}

const tracking = signalsGlobal[TRACKING_KEY];

export function trackRead(node: iRxNode): void {
  tracking.collector?.set(node, node.version);
}

export function runTracked<T>(fn: () => T): {
  value: T;
  producers: Map<iRxNode, number>;
} {
  const previous = tracking.collector;
  const producers = new Map<iRxNode, number>();
  tracking.collector = producers;

  try {
    return { value: fn(), producers };
  } finally {
    tracking.collector = previous;
  }
}

export function runUntracked<T>(fn: () => T): T {
  const previous = tracking.collector;
  tracking.collector = null;

  try {
    return fn();
  } finally {
    tracking.collector = previous;
  }
}

/**
 * A node is live while something can observe it: its own listeners, or a live
 * consumer downstream. Only live nodes keep edges on their producers, so a
 * computed nobody listens to holds no references into the graph and is free to
 * be collected.
 */
function refreshLiveness(node: iRxNode): void {
  const live = node.listenerCount() > 0 || node.consumers.size > 0;
  if (live === node.live) return;

  node.live = live;

  if (node.derived) {
    for (const producer of node.producers.keys()) {
      if (live) producer.consumers.add(node);
      else producer.consumers.delete(node);

      refreshLiveness(producer);
    }
  }

  node.onLiveness?.(live);
}

export function livenessChanged(node: iRxNode): void {
  refreshLiveness(node);
}

function setProducers(node: iRxNode, producers: Map<iRxNode, number>): void {
  if (node.live) {
    for (const previous of node.producers.keys()) {
      if (producers.has(previous)) continue;

      previous.consumers.delete(node);
      refreshLiveness(previous);
    }

    for (const next of producers.keys()) {
      if (node.producers.has(next)) continue;

      next.consumers.add(node);
      refreshLiveness(next);
    }
  }

  node.producers = producers;
}

export function commitRecompute(
  node: iRxNode,
  producers: Map<iRxNode, number>,
  changed: boolean,
): void {
  node.stale = false;
  setProducers(node, producers);
  if (changed) node.version++;
}

export function updateIfNecessary(node: iRxNode): void {
  node.refresh?.();
  if (!node.derived) return;

  if (node.stale) {
    node.recompute();
    return;
  }

  for (const [producer, seenVersion] of node.producers) {
    updateIfNecessary(producer);

    if (producer.version !== seenVersion) {
      node.recompute();
      return;
    }
  }
}

export function propagate(source: iRxNode): void {
  source.version++;

  const affected = new Set<iRxNode>([source]);
  const pending: iRxNode[] = [source];

  while (pending.length > 0) {
    const node = pending.pop() as iRxNode;

    for (const consumer of node.consumers) {
      if (affected.has(consumer)) continue;

      affected.add(consumer);
      consumer.stale = true;
      pending.push(consumer);
    }
  }

  for (const node of affected) {
    if (node.listenerCount() === 0) continue;

    if (node === source) {
      node.emit();
      continue;
    }

    const seenVersion = node.version;
    updateIfNecessary(node);
    if (node.version !== seenVersion) node.emit();
  }
}
