import { describe, expect, it } from "vitest";
import { computed } from "../computed/computed";
import { linkedSignal } from "../linked/linked";
import { signal } from "../signal/signal";
import { isSignal } from "./utils";

describe("Utils", () => {
  describe("isSignal", () => {
    it("should return true for valid signals", () => {
      const s = signal(1);
      expect(isSignal(s)).toBe(true);
    });

    it("should return true for computed signals", () => {
      const a = signal(1);
      const b = computed(() => a() * 2);
      expect(isSignal(b)).toBe(true);
    });

    it("should return true for linked signals", () => {
      const a = signal(1);
      const b = linkedSignal({
        source: a,
        computation: (val) => val * 2,
      });

      expect(isSignal(b)).toBe(true);
    });

    it("should return false for non-signals", () => {
      expect(isSignal({})).toBe(false);
      expect(isSignal(() => {})).toBe(false);
      expect(isSignal(123)).toBe(false);
      expect(isSignal("test")).toBe(false);
    });

    it("should return false for objects with a similar shape but missing the signal symbol", () => {
      const fakeSignal = {
        value: 1,
        listeners: new Set(),
        cleanups: new Set(),
        deps: new Set(),
      };
      expect(isSignal(fakeSignal)).toBe(false);
    });

    it("should return false for null and undefined", () => {
      expect(isSignal(null)).toBe(false);
      expect(isSignal(undefined)).toBe(false);
    });
  });
});
