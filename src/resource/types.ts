import type { ReadonlySignal, SIGNAL_SYMBOL } from "../types";

/**
 * The lifecycle of a resource: `idle` before anything has been requested,
 * `loading` while a request is in flight, then `ready` or `error`.
 */
export type ResourceStatus = "idle" | "loading" | "ready" | "error";

/**
 * The set of read-only signals describing an asynchronous value and the state
 * of fetching it.
 */
export interface iResourceSignalRef<TRes, TParams> {
  /** Current lifecycle status. */
  readonly state: ReadonlySignal<ResourceStatus>;
  /** The parameters the loader is called with. */
  readonly params: ReadonlySignal<TParams>;

  /** Whether a request is currently in flight. */
  readonly isLoading: ReadonlySignal<boolean>;
  /** Whether a load has ever completed successfully. */
  readonly hasData: ReadonlySignal<boolean>;
  /** The last successfully loaded value. */
  readonly data: ReadonlySignal<TRes | undefined>;

  /** Whether the most recent attempt failed. */
  readonly hasError: ReadonlySignal<boolean>;
  /** The error from the most recent failed attempt. */
  readonly error: ReadonlySignal<unknown>;

  /** Aborts whatever is in flight and loads again. */
  readonly refresh: () => void;
  /** Aborts the in-flight request, if any. */
  readonly abort: () => void;
}

export interface iLoaderArgsWithoutParams<TRes> {
  readonly params?: never;
  readonly previousData?: TRes;
  readonly abortSignal: AbortSignal;
}

export interface iLoaderArgsWithParams<TRes, TParams> {
  readonly params: TParams;
  readonly previousData?: TRes;
  readonly abortSignal: AbortSignal;
}

export type LoaderArgs<TRes, TParams> = TParams extends undefined
  ? iLoaderArgsWithoutParams<TRes>
  : iLoaderArgsWithParams<TRes, TParams>;

/**
 * Fetches the resource's value. Receives the current parameters, the last
 * successfully loaded value, and an `AbortSignal` that fires when the request
 * is superseded or the resource is torn down.
 */
export type ResourceLoader<TRes, TParams = undefined> = (
  args: LoaderArgs<TRes, TParams>,
) => Promise<TRes> | TRes;

/** Explicit configuration for a resource. */
export interface iResourceSignalConfig<TRes, TParams = undefined> {
  /** Computation producing the parameters; every change starts a new request. */
  readonly params?: () => TParams;
  /** Fetches the value. */
  readonly loader: ResourceLoader<TRes, TParams>;

  /**
   * Clears the current data as soon as the parameters change, instead of
   * keeping it on screen until the new value arrives. Defaults to `false`.
   */
  readonly resetOnParamsChange?: boolean;
}

export interface iResourceSignalState<TRes> {
  previousData: TRes | undefined;
  abortController: AbortController | null;
  readonly listeners: Set<() => void>;
  cleanup: (() => void) | null;
}

export interface iResourceSignalSymbol<TRes> {
  [SIGNAL_SYMBOL]: iResourceSignalState<TRes>;
}
