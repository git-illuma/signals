import { describe, expect, it, vi } from "vitest";
import { computed, external, isSignal, signal } from "../index";

function foreignSource<T>(initial: T) {
  const watchers = new Set<() => void>();
  let current = initial;

  return {
    attachments: 0,
    detachments: 0,
    read: () => current,
    push(next: T) {
      current = next;
      for (const w of Array.from(watchers)) w();
    },
    observe(notify: () => void) {
      this.attachments++;
      watchers.add(notify);

      return () => {
        this.detachments++;
        watchers.delete(notify);
      };
    },
    get watching() {
      return watchers.size;
    },
  };
}

describe("external", () => {
  it("should be a signal", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));

    expect(isSignal(sig)).toBe(true);
    expect(sig()).toBe(1);
  });

  it("should observe the source only while something is watching", () => {
    const src = foreignSource("a");
    const sig = external(src.read, (n) => src.observe(n));

    expect(src.watching).toBe(0);

    const unsub = sig.subscribe(() => {});
    expect(src.watching).toBe(1);
    expect(src.attachments).toBe(1);

    unsub();
    expect(src.watching).toBe(0);
    expect(src.detachments).toBe(1);
  });

  it("should attach once for many listeners", () => {
    const src = foreignSource(0);
    const sig = external(src.read, (n) => src.observe(n));

    const offs = [
      sig.subscribe(() => {}),
      sig.subscribe(() => {}),
      sig.subscribe(() => {}),
    ];
    expect(src.attachments).toBe(1);

    offs[0]?.();
    offs[1]?.();
    expect(src.watching).toBe(1);

    offs[2]?.();
    expect(src.watching).toBe(0);
  });

  it("should push source changes to listeners", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));

    const spy = vi.fn();
    sig.subscribe(spy);
    expect(spy).toHaveBeenCalledWith(1);

    src.push(2);
    expect(spy).toHaveBeenCalledWith(2);
    expect(sig()).toBe(2);
  });

  it("should stay readable and fresh while dormant", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));

    expect(sig()).toBe(1);

    src.push(7);
    expect(src.watching).toBe(0);
    expect(sig()).toBe(7);
  });

  it("should invalidate a dormant computed built on it", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));
    const doubled = computed(() => sig() * 2);

    expect(doubled()).toBe(2);

    src.push(5);
    expect(doubled()).toBe(10);
  });

  it("should catch a change that happened while dormant when it wakes up", () => {
    const src = foreignSource("a");
    const sig = external(src.read, (n) => src.observe(n));

    expect(sig()).toBe("a");
    src.push("b");

    const spy = vi.fn();
    sig.subscribe(spy);
    expect(spy).toHaveBeenCalledWith("b");
  });

  it("should honour a custom equality function", () => {
    const src = foreignSource({ n: 1 });
    const sig = external(src.read, (n) => src.observe(n), {
      equal: (a, b) => a.n === b.n,
    });

    const spy = vi.fn();
    sig.subscribe(spy);
    expect(spy).toHaveBeenCalledTimes(1);

    src.push({ n: 1 });
    expect(spy).toHaveBeenCalledTimes(1);

    src.push({ n: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("should feed a diamond without emitting an intermediate state", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));

    const a = computed(() => sig() * 10);
    const b = computed(() => sig() * 100);
    const tip = computed(() => `${a()}/${b()}`);

    const seen: string[] = [];
    tip.subscribe((v) => seen.push(v));

    src.push(2);

    expect(seen).toEqual(["10/100", "20/200"]);
  });

  it("should not re-read the source on every graph traversal while observed", () => {
    const src = foreignSource(1);
    const read = vi.fn(src.read);
    const sig = external(read, (n) => src.observe(n));

    sig.subscribe(() => {});
    const settled = read.mock.calls.length;

    sig();
    sig();
    sig();

    expect(read).toHaveBeenCalledTimes(settled);
  });

  it("should re-attach after going dormant and waking again", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));

    const unsub = sig.subscribe(() => {});
    unsub();

    const spy = vi.fn();
    sig.subscribe(spy);
    expect(src.attachments).toBe(2);

    src.push(9);
    expect(spy).toHaveBeenCalledWith(9);
  });

  it("should stay live while only a downstream computed is observed", () => {
    const src = foreignSource(1);
    const sig = external(src.read, (n) => src.observe(n));
    const doubled = computed(() => sig() * 2);

    const unsub = doubled.subscribe(() => {});
    expect(src.watching).toBe(1);

    unsub();
    expect(src.watching).toBe(0);
  });

  it("should work with a source that notifies on a later tick", async () => {
    let current = 1;
    const watchers = new Set<() => void>();

    // Angular's `effect` and Solid's `createEffect` are both scheduled rather
    // than synchronous, so the value lands a tick after the source moved.
    const sig = external(
      () => current,
      (notify) => {
        watchers.add(notify);
        return () => watchers.delete(notify);
      },
    );

    const seen: number[] = [];
    sig.subscribe((v) => seen.push(v));

    current = 2;
    expect(seen).toEqual([1]);

    await Promise.resolve().then(() => {
      for (const w of watchers) w();
    });

    expect(seen).toEqual([1, 2]);
    expect(sig()).toBe(2);
  });

  it("should adopt a foreign signal-shaped accessor", () => {
    const watchers = new Set<() => void>();
    let value = "idle";

    const foreignSignal = Object.assign(() => value, {
      set(next: string) {
        value = next;
        for (const w of Array.from(watchers)) w();
      },
    });

    const adopted = external(foreignSignal, (notify) => {
      watchers.add(notify);
      return () => watchers.delete(notify);
    });

    const label = computed(() => `state:${adopted()}`);
    const seen: string[] = [];
    label.subscribe((v) => seen.push(v));

    foreignSignal.set("ready");

    expect(seen).toEqual(["state:idle", "state:ready"]);
  });

  it("should combine with an owned signal", () => {
    const src = foreignSource(2);
    const foreign = external(src.read, (n) => src.observe(n));
    const own = signal(10);
    const sum = computed(() => foreign() + own());

    const seen: number[] = [];
    sum.subscribe((v) => seen.push(v));

    src.push(3);
    own.set(20);

    expect(seen).toEqual([12, 13, 23]);
  });
});
