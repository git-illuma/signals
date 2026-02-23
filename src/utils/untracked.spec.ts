import { describe, expect, it, vi } from "vitest";
import { computed, signal } from "../index";
import { untracked } from "./untracked";

describe("untracked", () => {
  it("should return the result of the function", () => {
    const result = untracked(() => 42);
    expect(result).toBe(42);
  });

  it("should not track dependencies accessed within the callback", () => {
    const a = signal(1);
    const spy = vi.fn(() => untracked(() => a()));
    const c = computed(spy);

    const listener = vi.fn();
    c.subscribe(listener);

    const initCalls = spy.mock.calls.length;

    expect(c()).toBe(1);

    // Update 'a'
    a.set(2);

    expect(spy).toHaveBeenCalledTimes(initCalls);
    expect(c()).toBe(1);
  });

  it("should still return correct value when executed", () => {
    const a = signal(1);
    const c = computed(() => untracked(() => a() * 2));
    expect(c()).toBe(2);
  });

  it("should allow tracking other signals outside untracked block", () => {
    const tracked = signal(10);
    const untrackedParams = signal(2);

    const c = computed(() => {
      return tracked() + untracked(() => untrackedParams());
    });

    const spy = vi.fn();
    c.subscribe(spy);

    expect(spy).toHaveBeenCalledWith(12);

    untrackedParams.set(5);
    expect(spy).toHaveBeenCalledTimes(1);

    tracked.set(20);
    expect(spy).toHaveBeenCalledWith(25);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
