import { computed } from "../computed/computed";
import { signal } from "../signal/signal";
import { type ReadonlySignal, SIGNAL_SYMBOL } from "../types";
import { extractState } from "../utils/utils";
import type {
  iResourceSignalConfig,
  iResourceSignalRef,
  iResourceSignalState,
  iResourceSignalSymbol,
  LoaderArgs,
  ResourceLoader,
} from "./types";

/**
 * Creates an asynchronous resource: a set of read-only signals describing a
 * value that has to be fetched, plus the state of fetching it.
 *
 * The loader is lazy. Nothing is requested until something subscribes to one of
 * the resource's signals, and the in-flight request is aborted once the last
 * subscriber goes away. When `params` is given, every change to it starts a new
 * request.
 *
 * A request that has been superseded — by a parameter change, a `refresh`, or a
 * teardown — never writes its result, so a slow answer cannot overwrite a newer
 * one, and its abort is not reported as an error.
 *
 * @param cfgOrLoader - Either a loader function, or a configuration object with
 * a `loader`, an optional `params` computation and `resetOnParamsChange`.
 * @returns A resource reference exposing `state`, `data`, `error`, `isLoading`,
 * `hasData`, `hasError`, `params`, and the `refresh` / `abort` commands.
 *
 * Example usage:
 * ```ts
 * const userId = signal(1);
 * const user = resource({
 *   params: userId,
 *   loader: ({ params, abortSignal }) =>
 *     fetch(`/api/users/${params}`, { signal: abortSignal }).then((r) => r.json()),
 * });
 *
 * user.state.subscribe((state) => console.log(state)); // "loading" -> "ready"
 * userId.set(2); // aborts the first request and loads the second user
 * ```
 *
 * `refresh` restarts the loader even while a request is already in flight: the
 * previous one is aborted first.
 */
export function resource<TResult>(
  loader: ResourceLoader<TResult, undefined>,
): iResourceSignalRef<TResult, undefined>;
export function resource<TResult, TParams>(
  cfg: iResourceSignalConfig<TResult, TParams>,
): iResourceSignalRef<TResult, TParams>;
export function resource<TResult, TParams>(
  cfgOrLoader:
    | iResourceSignalConfig<TResult, TParams>
    | ResourceLoader<TResult, undefined>,
): iResourceSignalRef<TResult, TParams> {
  const _cfg =
    typeof cfgOrLoader === "function"
      ? { loader: <ResourceLoader<TResult, TParams>>cfgOrLoader }
      : cfgOrLoader;

  const _computedParams = _cfg.params ? computed(_cfg.params) : computed(() => undefined);
  const _dataSignal = signal<TResult | undefined>(undefined, { equal: () => false });
  const _errorSignal = signal<unknown>(undefined);
  const _isLoading = signal(false);
  const _hasLoaded = signal(false);
  const hasError = computed(() => _errorSignal() !== undefined);

  // Tracked separately rather than derived from the value, so a loader that
  // legitimately resolves `undefined` still counts as having loaded.
  const hasData = computed(() => _hasLoaded());

  const _state: iResourceSignalState<TResult> = {
    previousData: undefined,
    abortController: null,
    listeners: new Set(),
    cleanup: null,
  };

  const _refresh = (params: TParams, paramsChanged = false) => {
    _state.abortController?.abort();

    const controller = new AbortController();
    const abortSignal = controller.signal;
    _state.abortController = controller;

    if (paramsChanged && _cfg.resetOnParamsChange) {
      _dataSignal.set(undefined);
      _hasLoaded.set(false);
    }

    _isLoading.set(true);
    _errorSignal.set(undefined);

    Promise.resolve(
      _cfg.loader({
        params,
        previousData: _state.previousData,
        abortSignal,
      } as LoaderArgs<TResult, TParams>),
    )
      .then((result) => {
        // A superseded request must never write: its answer is older than the
        // one already in flight, and neither its value nor its abort rejection
        // says anything about the resource's current state.
        if (abortSignal.aborted) return;

        _state.previousData = result;
        _dataSignal.set(result);
        _hasLoaded.set(true);
      })
      .catch((err) => {
        if (abortSignal.aborted) return;
        _errorSignal.set(err);
      })
      .finally(() => {
        if (_state.abortController !== controller) return;

        _isLoading.set(false);
        _state.abortController = null;
      });
  };

  const _obs = (listener: () => void): (() => void) => {
    if (_state.listeners.size === 0) {
      // Subscribing emits the current parameters straight away, which is what
      // kicks off the first load.
      _state.cleanup = _computedParams.subscribe((v) => _refresh(v as TParams, true));
    }

    _state.listeners.add(listener);

    return () => {
      _state.listeners.delete(listener);
      if (_state.listeners.size === 0) {
        if (_state.abortController) _state.abortController.abort();

        _state.cleanup?.();
        _state.cleanup = null;
      }
    };
  };

  const abort = () => {
    _state.abortController?.abort();
  };

  const state = computed(() => {
    const error = hasError();
    const data = hasData();
    const loading = _isLoading();

    if (loading) return "loading";
    if (error) return "error";
    if (data) return "ready";

    return "idle";
  });

  const errorRef = _errorSignal.asReadonly();
  const dataRef = _dataSignal.asReadonly();
  const isLoadingRef = _isLoading.asReadonly();

  for (const sig of [
    hasError,
    hasData,

    state,
    errorRef,
    isLoadingRef,
    dataRef,
  ]) {
    extractState(sig).track(_obs);
  }

  const ref = {
    state,
    params: <ReadonlySignal<TParams>>_computedParams,

    hasError: hasError,
    error: errorRef,

    hasData: hasData,
    isLoading: isLoadingRef,
    data: dataRef,

    refresh: () => _refresh(_computedParams() as TParams),
    abort,

    [SIGNAL_SYMBOL]: _state,
  } satisfies iResourceSignalRef<TResult, TParams> & iResourceSignalSymbol<TResult>;

  return ref;
}
