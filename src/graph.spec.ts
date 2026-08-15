import { describe, expect, it, vi } from "vitest";
import { computed, linkedSignal, signal } from "./index";
import { extractState } from "./utils/utils";

describe("reactive graph", () => {
  it("should follow a conditional dependency to the branch it actually took", () => {
    const flag = signal(true);
    const a = signal("A1");
    const b = signal("B1");
    const c = computed(() => (flag() ? a() : b()));

    const seen: string[] = [];
    c.subscribe((v) => seen.push(v));

    flag.set(false);
    expect(c()).toBe("B1");

    b.set("B2");
    expect(c()).toBe("B2");
    expect(seen.at(-1)).toBe("B2");
  });

  it("should drop a dependency the computation no longer reads", () => {
    const flag = signal(true);
    const a = signal(1);
    const spy = vi.fn(() => (flag() ? a() : 0));
    const c = computed(spy);

    c.subscribe(() => {});
    flag.set(false);

    const calls = spy.mock.calls.length;
    a.set(99);

    expect(spy).toHaveBeenCalledTimes(calls);
    expect(c()).toBe(0);
  });

  it("should never emit an intermediate value across a diamond", () => {
    const a = signal(1);
    const b = computed(() => a() * 10);
    const c = computed(() => a() * 100);
    const d = computed(() => `${b()}/${c()}`);

    const seen: string[] = [];
    d.subscribe((v) => seen.push(v));

    a.set(2);

    expect(seen).toEqual(["10/100", "20/200"]);
  });

  it("should recompute a diamond tip once per source change", () => {
    const a = signal(1);
    const b = computed(() => a() * 10);
    const c = computed(() => a() * 100);
    const spy = vi.fn(() => b() + c());
    const d = computed(spy);

    d.subscribe(() => {});
    const calls = spy.mock.calls.length;

    a.set(2);

    expect(spy).toHaveBeenCalledTimes(calls + 1);
    expect(d()).toBe(220);
  });

  it("should not run the computation until the value is needed", () => {
    const a = signal(1);
    const spy = vi.fn(() => a() * 2);

    const c = computed(spy);
    expect(spy).not.toHaveBeenCalled();

    expect(c()).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);

    expect(c()).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("should serve repeated reads from cache while dependencies are unchanged", () => {
    const a = signal(1);
    const spy = vi.fn(() => ({ n: a() }));
    const c = computed(spy);

    const first = c();
    expect(c()).toBe(first);
    expect(spy).toHaveBeenCalledTimes(1);

    a.set(2);
    expect(c()).not.toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("should stop recomputing once the last listener goes away", () => {
    const a = signal(1);
    const spy = vi.fn(() => a() * 2);
    const c = computed(spy);

    const unsub = c.subscribe(() => {});
    const whileLive = spy.mock.calls.length;

    a.set(2);
    expect(spy).toHaveBeenCalledTimes(whileLive + 1);

    unsub();

    a.set(3);
    expect(spy).toHaveBeenCalledTimes(whileLive + 1);

    const listener = vi.fn();
    c.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(6);
  });

  it("should keep a deep chain consistent", () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => b() + 1);
    const d = computed(() => c() + 1);

    const seen: number[] = [];
    d.subscribe((v) => seen.push(v));

    a.set(10);

    expect(seen).toEqual([4, 13]);
  });

  it("should emit the subscribed-at value before a tracker mutates the graph", () => {
    const src = signal("idle");
    const view = computed(() => src());
    const seen: string[] = [];

    extractState(view).track(() => {
      src.set("loading");
      return () => {};
    });

    view.subscribe((v) => seen.push(v));

    expect(seen).toEqual(["idle", "loading"]);
  });

  it("should let a linked signal keep a manual value until its source moves", () => {
    const count = signal(0);
    const dbl = linkedSignal(() => count() * 2);

    expect(dbl()).toBe(0);

    dbl.set(10);
    expect(dbl()).toBe(10);

    count.set(3);
    expect(dbl()).toBe(6);
  });

  it("should stay glitch-free when an intermediate node is also observed", () => {
    const a = signal(1);
    const b = computed(() => a() * 10);
    const c = computed(() => a() * 100);
    const d = computed(() => `${b()}/${c()}`);

    const mid: number[] = [];
    const tip: string[] = [];
    b.subscribe((v) => mid.push(v));
    d.subscribe((v) => tip.push(v));

    a.set(2);

    expect(mid).toEqual([10, 20]);
    expect(tip).toEqual(["10/100", "20/200"]);
  });

  it("should pull a fresh value through a chain nobody listens to", () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => b() * 2);

    expect(c()).toBe(4);

    a.set(10);
    expect(c()).toBe(22);
  });

  it("should survive a listener writing back into the graph", () => {
    const a = signal(1);
    const mirror = signal(0);
    const double = computed(() => a() * 2);

    double.subscribe((v) => mirror.set(v));
    expect(mirror()).toBe(2);

    a.set(5);
    expect(mirror()).toBe(10);
  });

  it("should let a listener unsubscribe itself mid-notification", () => {
    const a = signal(0);
    const calls: string[] = [];
    let off: (() => void) | null = null;

    off = a.subscribe(() => {
      calls.push("first");
      off?.();
    });
    a.subscribe(() => calls.push("second"));

    a.set(1);
    const afterSelfRemoval = calls.filter((c) => c === "first").length;

    a.set(2);
    a.set(3);

    expect(calls.filter((c) => c === "first").length).toBe(afterSelfRemoval);
    expect(calls.filter((c) => c === "second").length).toBe(4);
  });

  it("should surface a throwing computation on read and recover afterwards", () => {
    const boom = signal(true);
    const c = computed(() => {
      if (boom()) throw new Error("nope");
      return "ok";
    });

    expect(() => c()).toThrow("nope");

    boom.set(false);
    expect(c()).toBe("ok");
  });

  it("should track a linked signal without any listener attached", () => {
    const count = signal(1);
    const dbl = linkedSignal(() => count() * 2);

    expect(dbl()).toBe(2);
    count.set(5);
    expect(dbl()).toBe(10);
  });
});
