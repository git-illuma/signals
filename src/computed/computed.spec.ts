import { describe, expect, it, vi } from "vitest";
import { computed, signal } from "../index";
import { extractState } from "../utils/utils";

describe("computed", () => {
  it("should compute value based on dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a() + b());

    expect(sum()).toBe(3);

    a.set(3);
    expect(sum()).toBe(5);

    b.set(4);
    expect(sum()).toBe(7);
  });

  it("should not re-compute if dependencies do not change", () => {
    const a = signal(1);
    const b = signal(2);
    const computeSpy = vi.fn(() => a() + b());
    const sum = computed(computeSpy);

    const unsub = sum.subscribe(() => {});

    // Initial: 1+2=3. Call 1 (init), Call 2 (scan), Call 3 (subscribe check).
    // Actually, subscribe check calls compute IF listeners size was 0.
    // So expect at least 2 or 3 calls initially.
    const initialCalls = computeSpy.mock.calls.length;
    expect(sum()).toBe(3);

    a.set(1);
    expect(sum()).toBe(3);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls);

    b.set(2);
    expect(sum()).toBe(3);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls);

    a.set(4);
    expect(sum()).toBe(6);

    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 1);

    unsub();
  });

  it("should allow nested computed signals", () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a() + b());
    const doubleSum = computed(() => sum() * 2);

    expect(doubleSum()).toBe(6);

    a.set(3);
    expect(doubleSum()).toBe(10);

    b.set(4);
    expect(doubleSum()).toBe(14);
  });

  it("should trigger subscribers only when computed value changes", () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a() + b());
    const spy = vi.fn();
    const unsub = sum.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(3);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(1);
    expect(spy).toHaveBeenCalledTimes(1);

    b.set(2);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(3);
    expect(spy).toHaveBeenCalledWith(5);
    expect(spy).toHaveBeenCalledTimes(2);

    b.set(4);
    expect(spy).toHaveBeenCalledWith(7);
    expect(spy).toHaveBeenCalledTimes(3);

    unsub();
  });

  it("should allow custom equality function in computed", () => {
    const a = signal(1);
    const b = signal(2);
    const computeSpy = vi.fn(() => a() + b());
    const sum = computed(computeSpy, { equal: (a, b) => Math.abs(a - b) <= 2 });

    const spy = vi.fn();
    const unsub = sum.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(3);
    const initialCalls = computeSpy.mock.calls.length;

    a.set(2);
    expect(sum()).toBe(4);

    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 1);
    expect(spy).toHaveBeenCalledTimes(1);

    b.set(3);
    expect(sum()).toBe(5);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 2);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(5);
    expect(sum()).toBe(8);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 3);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(8);

    unsub();
  });

  it("should always return same value when no dependencies", () => {
    const constant = computed(() => 42);
    expect(constant()).toBe(42);
    expect(constant()).toBe(42);
  });

  it("should stop propagation if new value equals old value", () => {
    const a = signal(1);
    const isBig = computed(() => a() > 5);
    const spy = vi.fn();

    const unsub = isBig.subscribe(spy);
    expect(spy).toHaveBeenCalledWith(false);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(2);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(6);
    expect(spy).toHaveBeenCalledWith(true);
    expect(spy).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("should unsubscribe from dependencies when has no listeners", () => {
    const a = signal(1);
    const spy = vi.fn(() => a() * 2);
    const doubleA = computed(spy);

    expect(spy).toHaveBeenCalledTimes(0);

    const unsub = doubleA.subscribe(() => {});
    const callsStart = spy.mock.calls.length;

    a.set(2);
    expect(spy).toHaveBeenCalledTimes(callsStart + 1);

    unsub();

    a.set(3);
    expect(spy).toHaveBeenCalledTimes(callsStart + 1);
  });

  it("should allow tracking listeners", () => {
    const original = signal(0);
    const sig = computed(() => original() * 2);
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const cleanup = vi.fn();
    const tracker = vi.fn().mockImplementation(() => cleanup);
    const state = extractState(sig);

    state.track(tracker);

    const unsubs = [];
    unsubs.push(sig.subscribe(listener1));
    expect(tracker).toHaveBeenCalledWith(listener1);

    unsubs.push(sig.subscribe(listener2));
    expect(tracker).toHaveBeenCalledWith(listener2);

    for (const unsub of unsubs) unsub();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
