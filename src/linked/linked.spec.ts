import { describe, expect, it, vi } from "vitest";
import { computed, linkedSignal, signal } from "../index";

describe("linkedSignal", () => {
  it("should update linked signal correctly", () => {
    const a = signal(1);
    const linked = linkedSignal(() => a() * 2);

    const unsub = linked.subscribe(() => {});

    expect(linked()).toBe(2);

    a.set(3);
    expect(linked()).toBe(6);

    linked.set(10);
    expect(linked()).toBe(10);

    a.set(4);
    expect(linked()).toBe(8);

    unsub();
  });

  it("should allow explicit configuration", () => {
    const a = signal(1);
    const linked = linkedSignal({
      source: a,
      computation: (src) => src * 3,
    });
    const unsub = linked.subscribe(() => {});

    expect(linked()).toBe(3);

    a.set(2);
    expect(linked()).toBe(6);

    linked.set(12);
    expect(linked()).toBe(12);

    a.set(3);
    expect(linked()).toBe(9);

    unsub();
  });

  it("should trigger subscribers only when linked value changes", () => {
    const a = signal(1);
    const linked = linkedSignal(() => a() * 2);

    const spy = vi.fn();
    const unsub = linked.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(2);

    a.set(1);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(2);
    expect(spy).toHaveBeenCalledWith(4);
    expect(spy).toHaveBeenCalledTimes(2);

    linked.set(4);
    expect(spy).toHaveBeenCalledTimes(2);

    a.set(3);
    expect(spy).toHaveBeenCalledWith(6);
    expect(spy).toHaveBeenCalledTimes(3);

    unsub();
  });

  it("should allow custom equality function in linked signal", () => {
    const a = signal(1);
    const computeSpy = vi.fn(() => a() * 2);
    const linked = linkedSignal({
      source: a,
      computation: computeSpy,
      equal: (a, b) => Math.abs(a - b) < 2,
    });
    const unsub = linked.subscribe(() => {});

    expect(linked()).toBe(2);

    const initialCalls = computeSpy.mock.calls.length;

    a.set(2);
    expect(linked()).toBe(4);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 1);

    a.set(2.1);
    expect(linked()).toBe(4.2);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 2);

    a.set(3);
    expect(linked()).toBe(6);
    expect(computeSpy).toHaveBeenCalledTimes(initialCalls + 3);

    unsub();
  });

  it("should behave as a plain signal when no dependencies", () => {
    const linked = linkedSignal(() => 42);
    const unsub = linked.subscribe(() => {});

    expect(linked()).toBe(42);

    linked.set(24);
    expect(linked()).toBe(24);

    linked.update((prev) => prev + 1);
    expect(linked()).toBe(25);

    unsub();
  });

  it("should create a linked signal from a source signal directly", () => {
    const source = signal(1);
    const linked = linkedSignal(source);
    const spy = vi.fn();
    const unsub = linked.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenCalledTimes(1);

    source.set(2);
    expect(spy).toHaveBeenCalledWith(2);
    expect(spy).toHaveBeenCalledTimes(2);

    linked.set(10);
    expect(spy).toHaveBeenCalledWith(10);
    expect(spy).toHaveBeenCalledTimes(3);

    source.set(3);

    expect(spy).toHaveBeenCalledWith(3);
    expect(spy).toHaveBeenCalledTimes(4);

    unsub();
  });

  it("should correctly update value using .update()", () => {
    const source = signal(10);
    const linked = linkedSignal(source);
    const spy = vi.fn();
    const unsub = linked.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(10);

    linked.update((prev) => prev * 2);
    expect(spy).toHaveBeenCalledWith(20);

    source.set(11);
    expect(spy).toHaveBeenCalledWith(11);

    unsub();
  });

  it("should handle nested computations correctly", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a() + b());
    const linked = linkedSignal(sum);

    const spy = vi.fn();
    const unsub = linked.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(5);

    a.set(4);
    expect(spy).toHaveBeenCalledWith(7);

    linked.set(100);
    expect(spy).toHaveBeenCalledWith(100);

    b.set(1);
    expect(spy).toHaveBeenCalledWith(5);

    unsub();
  });

  it("should not notify listeners if set to equal value", () => {
    const source = signal(1);
    const linked = linkedSignal(source);
    const spy = vi.fn();
    const unsub = linked.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenCalledTimes(1);

    linked.set(1);
    expect(spy).toHaveBeenCalledTimes(1);

    unsub();
  });
});
