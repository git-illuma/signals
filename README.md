# **Illuma** Signals — Granular state management for anything. 

![NPM Version](https://img.shields.io/npm/v/%40illuma%2Fsignals)
![NPM Downloads](https://img.shields.io/npm/dw/%40illuma%2Fsignals)
![npm bundle size](https://img.shields.io/bundlephobia/min/%40illuma%2Fsignals)
![Test coverage](./badges/coverage.svg)

Status: **Experimental**

The `@illuma/signals` package provides a lightweight reactivity system that is easily integrated into any JavaScript or TypeScript application. It allows you to model state dependencies efficiently from injected dependencies (that live outside render cycle of, for instance, React) and update UI only when specific data changes enough to warrant a re-render (btw, you decide what "enough" means with **custom equality checks**).

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

## Integration

### Creating a React Hook

#### Why signals in React?

Signals provide a fine-grained reactivity system that can be used **outside** of React's render cycle. By using signals, you can manage state outside of React components, for example, in services injected with `@illuma/core` and then bridge that state back to React when needed. This can lead to more efficient updates, as components will only re-render when the specific signals they depend on changes.

It's like a semi-auto update system where you have more control over when and how your components update, without relying on React's state management.

#### Implementing `useSignal`

You can use signals with React by creating a custom hook that bridges Signals with React using `useSyncExternalStore`. It subscribes the component to the signal and triggers a re-render when the signal emits a new value.

This hook can work with any signal created by `signal`, `computed`, or `linkedSignal`:

```ts
// useSignal.ts
import { useSyncExternalStore } from 'react';
import { isSignal, type ReadonlySignal } from '@illuma/signals';

export function useSignal<T>(signal: ReadonlySignal<T>): T {
  if (!isSignal(signal)) {
    throw new Error("useSignal expects a signal as an argument");
  }

  return useSyncExternalStore(signalRef.subscribe, signalRef);
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
  When a `computed` or `linkedSignal` executes its function, it pushes itself onto a global context stack. Any signal read during that execution registers the active computation as a subscriber.

2. **Equality Checks**:
  Signals use an equality check (default is `===` or shallow comparison) before notifying listeners. If `set(value)` is called with the same value, no updates propagate.

3. **Lazy Evaluation**:
  Computed signals attempt to be lazy. They track whether their dependencies are dirty and re-evaluate only when read or when dependencies push an update.
