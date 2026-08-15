# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `external` — adopts a reactive source this library does not own (another
  framework's signal, a media query, a storage event) as a first-class node of
  the graph. The source is observed only while something is watching, and
  re-read on access while dormant.
- `resource` — asynchronous state as a set of read-only signals, with abortable
  requests, parameter-driven reloads and an opt-in `resetOnParamsChange`.
- `asReadonly()` on writable signals.
- `subscribe` now emits the current value at subscription time.

### Changed

- Dependencies are re-discovered on every recomputation instead of being
  captured once. A computation that reads a different signal on a later run —
  a conditional branch — now tracks the branch it actually took.
- Propagation is glitch-free: a write marks the affected nodes stale before
  anything recomputes, so a node reachable through several paths is evaluated
  once, after all of its inputs have settled. Intermediate combinations are no
  longer observable.
- `computed` is lazy. Creating one no longer runs its computation, and its
  result is cached until a dependency reports a new version.
- Graph edges are held only while a node is observed, so an unsubscribed
  `computed` no longer keeps its producers referenced.
- `SIGNAL_SYMBOL` moved to the global symbol registry, so signals created by a
  duplicated copy of this package are still recognised by `isSignal`.

### Fixed

- A conditional `computed` no longer freezes on the branch taken during its
  first run.
- A diamond dependency no longer emits a combination of values that never
  existed.
- A superseded `resource` request can no longer overwrite a newer result, and
  its abort is no longer reported as an error.
- A `resource` loader resolving `undefined` now reaches the `ready` state.

[Unreleased]: https://github.com/git-illuma/signals/compare/HEAD...HEAD
