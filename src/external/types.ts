/**
 * Attaches to a foreign source and returns its teardown. `notify` asks the
 * signal to re-read the source; it carries no value of its own on purpose, so
 * the signal's value always comes from a single place — the `read` function.
 */
export type ExternalObserver = (notify: () => void) => () => void;
