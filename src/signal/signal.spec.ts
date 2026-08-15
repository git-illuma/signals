import { describe, expect, it, vi } from "vitest";
import { signal } from "../index";
import { extractState } from "../utils/utils";

describe("signal", () => {
  it("should initialize with default value", () => {
    const sig = signal(0);
    expect(sig()).toBe(0);
  });

  it("should initialize without value", () => {
    const sig = signal<string>();
    expect(sig()).toBeUndefined();
  });

  it("should update value", () => {
    const sig = signal(0);
    expect(sig()).toBe(0);

    sig.set(1);
    expect(sig()).toBe(1);
  });

  it("should update value with update method", () => {
    const sig = signal(0);
    expect(sig()).toBe(0);

    sig.update((prev) => prev + 1);
    expect(sig()).toBe(1);
  });

  it("should notify subscribers", () => {
    const sig = signal(0);
    const spy1 = vi.fn();
    const spy2 = vi.fn();

    const unsub1 = sig.subscribe(spy1);
    const unsub2 = sig.subscribe(spy2);

    expect(spy1).toHaveBeenCalledWith(0);
    expect(spy2).toHaveBeenCalledWith(0);

    sig.set(5);

    expect(spy1).toHaveBeenCalledWith(5);
    expect(spy2).toHaveBeenCalledWith(5);
    expect(spy1).toHaveBeenCalledTimes(2);
    expect(spy2).toHaveBeenCalledTimes(2);

    unsub1();
    unsub2();
  });

  it("should trigger subscribers only when value changes", () => {
    const sig = signal(0);
    const spy = vi.fn();
    const unsub = sig.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(0);

    sig.set(0);
    expect(spy).toHaveBeenCalledTimes(1);

    sig.set(1);
    expect(spy).toHaveBeenCalledTimes(2);

    sig.update((prev) => prev);
    expect(spy).toHaveBeenCalledTimes(2);

    sig.update((prev) => prev + 1);
    expect(spy).toHaveBeenCalledTimes(3);

    unsub();
  });

  it("should not update if same reference value is set by default", () => {
    const obj = { a: 1 };
    const sig = signal(obj);
    const spy = vi.fn();
    const unsub = sig.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(obj);

    sig.set(obj);
    expect(spy).toHaveBeenCalledTimes(1);

    sig.update((prev) => prev);
    expect(spy).toHaveBeenCalledTimes(1);

    sig.update((prev) => ({ ...prev }));
    expect(spy).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("should allow custom equality function", () => {
    const sig = signal(0, { equal: (a, b) => Math.abs(a - b) < 2 });
    const spy = vi.fn();
    const unsub = sig.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(0);

    sig.set(1);
    expect(spy).toHaveBeenCalledTimes(1);

    sig.set(2);
    expect(spy).toHaveBeenCalledTimes(1);

    sig.set(5);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(5);

    unsub();
  });

  it("should allow custom equality function with update", () => {
    const sig = signal(0, { equal: (a, b) => Math.abs(a - b) <= 2 });
    const spy = vi.fn();
    const unsub = sig.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(0);

    sig.update((prev) => prev + 1);
    expect(sig()).toBe(1);

    expect(spy).toHaveBeenCalledTimes(1);

    sig.update((prev) => prev + 1);
    expect(sig()).toBe(2);

    expect(spy).toHaveBeenCalledTimes(1);

    sig.update((prev) => prev + 3);
    expect(sig()).toBe(5);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(5);

    unsub();
  });

  it("should allow undefined as a value", () => {
    const sig = signal<string | undefined>("initial");
    expect(sig()).toBe("initial");

    sig.set(undefined);
    expect(sig()).toBeUndefined();
  });

  it("should produce readonly signal that reflects current value", () => {
    const sig = signal("initial");
    const readonlySig = sig.asReadonly();

    const listener = vi.fn();
    const unsub = readonlySig.subscribe(listener);

    expect(readonlySig).not.toHaveProperty("set");
    expect(readonlySig).not.toHaveProperty("update");

    expect(listener).toHaveBeenCalledWith("initial");

    sig.set("updated");
    expect(listener).toHaveBeenCalledWith("updated");

    sig.update((prev) => `${prev} value`);
    expect(listener).toHaveBeenCalledWith("updated value");

    unsub();
  });

  it("should allow tracking listeners", () => {
    const sig = signal(0);
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
