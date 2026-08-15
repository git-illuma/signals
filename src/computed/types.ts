import type { iReadonlySignalState } from "../types";

/**
 * @internal
 * Represents the internal state of a computed signal. Dependencies and their
 * teardown live on the reactive node (`rx`), which rediscovers them on every
 * recomputation.
 */
export interface iComputedSignalState<T> extends iReadonlySignalState<T> {}
