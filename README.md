# **Illuma** Signals — Granular state management for anything. 

![NPM Version](https://img.shields.io/npm/v/%40illuma%2Fsignals)
![NPM Downloads](https://img.shields.io/npm/dw/%40illuma%2Fsignals)
![npm bundle size](https://img.shields.io/bundlephobia/min/%40illuma%2Fsignals)
![Test coverage](./badges/coverage.svg)

Status: **Experimental**

The `@illuma/signals` package provides a lightweight reactivity system that is easily integrated into any JavaScript or TypeScript application. It allows you to model state dependencies efficiently from injected dependencies (that live outside render cycle of, for instance, React) and update UI only when specific data changes enough to warrant a re-render (btw, you decide what "enough" means with **custom equality checks**).

Zero dependencies, and nothing in here knows what a framework is.

## Installation

```bash
npm install @illuma/signals
```

## Core Primitives

### `signal<T>`

A wrapper around a value that can notify interested consumers when that value changes.

```typescript
import { signal } from '@illuma/signals';

const count = signal(0);

// Read (dependency tracking)
console.log(count()); 

// Write
count.set(5);

// Update based on previous
count.update(prev => prev + 1);

// Hand out a version nobody else can write to
const readonlyCount = count.asReadonly();
```

Subscribing gives you the **current value immediately**, and then every change after it:

```typescript
const unsubscribe = count.subscribe(value => console.log(value)); // logs 6 right away
count.set(7); // logs 7
unsubscribe();
```

### `computed<T>`

A read-only signal that derives its value from other signals. It automatically tracks dependencies and re-evaluates only when necessary.

```typescript
import { computed } from '@illuma/signals';

const count = signal(1);
const double = computed(() => count() * 2);

console.log(double()); // 2
count.set(2);
console.log(double()); // 4
```

Computations are **lazy**: creating a `computed` does not run it. The first read does, and the result is cached until one of its dependencies actually changes.

Dependencies are re-discovered on **every** run, so a computation that takes a different branch keeps tracking the branch it actually took:

```typescript
const useMetric = signal(true);
const celsius = signal(20);
const fahrenheit = signal(68);

const reading = computed(() => useMetric() ? celsius() : fahrenheit());

useMetric.set(false);
fahrenheit.set(72);
console.log(reading()); // 72 — `fahrenheit` is now a dependency, `celsius` no longer is
```

### `linkedSignal<T>`

A hybrid signal that updates automatically when its source dependency changes, but can also be manually overridden.

Useful for:
- Form states that reset when selection changes
- synced local state that can diverge

```typescript
import { linkedSignal } from '@illuma/signals';

const userId = signal(1);

// Default name is derived from ID
const formState = linkedSignal(() => {
  const id = userId();
  return { id, name: `User ${id}` };
});

console.log(formState().name); // "User 1"

// User edits form (override)
formState.update((state) => ({ ...state, name: "Alice" }));
console.log(formState().name); // "Alice"

// Selection changes (reset)
userId.set(2);
console.log(formState().name); // "User 2" (Reset to computed value)
```

### `resource<T>`

Asynchronous state, expressed as signals. The loader is **lazy** — nothing is fetched until something subscribes — and the in-flight request is aborted once the last subscriber leaves.

```typescript
import { resource, signal } from '@illuma/signals';

const userId = signal(1);

const user = resource({
  params: userId,
  loader: ({ params, abortSignal }) =>
    fetch(`/api/users/${params}`, { signal: abortSignal }).then(r => r.json()),
});

user.state.subscribe(state => console.log(state)); // "idle" -> "loading" -> "ready"

userId.set(2); // aborts the first request, loads the second user
user.refresh(); // aborts whatever is in flight and loads again
```

What you get back:

| Signal | Meaning |
| --- | --- |
| `state` | `"idle"` \| `"loading"` \| `"ready"` \| `"error"` |
| `data` | the last successfully loaded value |
| `error` | the last error, or `undefined` |
| `isLoading` | whether a request is in flight |
| `hasData` | whether a load has ever succeeded |
| `hasError` | whether the last attempt failed |
| `params` | the current parameters |

A request that has been superseded never writes its result, so a slow answer cannot overwrite a newer one — and its abort is not reported as an error. Your loader also receives `previousData`, the last value that loaded successfully.

By default, data stays on screen while new parameters load. Pass `resetOnParamsChange: true` to clear it instead.

### `external<T>`

Adopts a reactive source this library does **not** own — another framework's signal, a media query, a storage event — as a first-class node of the graph.

It is for sources you can **read and observe, but not write**. If you can push a value into the source yourself, you do not need this: use a plain `signal` and set it.

```typescript
import { external } from '@illuma/signals';

const query = window.matchMedia('(prefers-color-scheme: dark)');

const prefersDark = external(
  () => query.matches,
  (notify) => {
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  },
);

const theme = computed(() => prefersDark() ? 'dark' : 'light');
```

The source is observed only while something is watching the resulting signal, and released again once nothing is. While dormant, the value is re-read on access, so a reader never sees a value that went stale in the gap.

This is also how you bring in a signal from a framework that has its own reactivity — read it, and let its own effect mechanism drive `notify`.

## Utilities

### `untracked<T>`

Wraps a function execution to prevent any signals read within it from being tracked as dependencies. This is useful when you want to read a signal's value inside a `computed` or `linkedSignal` without re-evaluating when that signal changes.

```typescript
import { signal, computed, untracked } from '@illuma/signals';

const user = signal("Alice");
const timer = signal(0);

const notification = computed(() => {
  // `timer` is tracked
  const t = timer();
  
  // `user` is read, but NOT tracked
  const u = untracked(() => user());
  
  return `${u} has been online for ${t} seconds`;
});

// `timer` changes will update `notification`, but `user` changes will NOT
notification.subscribe((value) => {
  console.log("Notification updated:", value);
});

```

### `isSignal`

A type guard for anything produced by `signal`, `computed`, `linkedSignal` or `external`.

```typescript
import { isSignal } from '@illuma/signals';

if (isSignal(maybe)) {
  console.log(maybe());
}
```

## Equality

Every primitive accepts a custom `equal` function, and it decides one thing: whether listeners are **notified**.

```typescript
const position = signal({ x: 0, y: 0 }, {
  equal: (a, b) => a.x === b.x && a.y === b.y,
});
```

Note that a write always stores the new value — `equal` suppresses the notification, not the assignment. Reading the signal afterwards gives you what you last wrote.

## Integration

### Creating a React Hook

#### Why signals in React?

Signals provide a fine-grained reactivity system that can be used **outside** of React's render cycle. By using signals, you can manage state outside of React components, for example, in services injected with `@illuma/core` and then bridge that state back to React when needed. This can lead to more efficient updates, as components will only re-render when the specific signals they depend on changes.

It's like a semi-auto update system where you have more control over when and how your components update, without relying on React's state management.

#### Implementing `useSignal`

You can use signals with React by creating a custom hook that bridges Signals with React using `useSyncExternalStore`. It subscribes the component to the signal and triggers a re-render when the signal emits a new value.

This hook works with any signal — `signal`, `computed`, `linkedSignal`, `external`, or one of a resource's signals:

```ts
// useSignal.ts
import { useSyncExternalStore } from 'react';
import { isSignal, type ReadonlySignal } from '@illuma/signals';

export function useSignal<T>(signalRef: ReadonlySignal<T>): T {
  if (!isSignal(signalRef)) {
    throw new Error("useSignal expects a signal as an argument");
  }

  // The third argument is the server snapshot. A signal reads the same way on
  // the server, and without it `renderToString` throws.
  return useSyncExternalStore(signalRef.subscribe, signalRef, signalRef);
}
```

And then you can use this hook in your React components to read from signals:

```tsx
const Counter = () => {
  const value = useSignal(counterSignal);
  return <div>{value}</div>;
};
```

## Internal Mechanics

1. **Dependency Tracking**:
  While a `computed` or `linkedSignal` runs its computation, every signal read during that run records itself as a producer of that computation. The set is rebuilt on every run, so dependencies that are no longer read are dropped.

2. **Push-Pull Propagation**:
  A write does not recompute anything. It first marks every affected node stale, and only then does each node that someone is actually listening to pull a fresh value. A node reachable through several paths is therefore evaluated once, after all of its inputs have settled — which is why an intermediate combination of values is never observable.

3. **Versioning**:
  A node bumps a version only when its value genuinely changed under its equality function. Consumers compare the versions they last saw, so a recomputation that produces an equal value stops propagation right there.

4. **Liveness**:
  Graph edges are held only while a node is observed. A `computed` nobody listens to keeps no references into the graph, and is re-evaluated on read instead, by checking whether its producers moved.
