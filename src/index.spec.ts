import { describe, expect, it, vi } from "vitest";

describe("Package Entrypoint", () => {
  describe("Main entrypoint (@illuma/signals)", () => {
    it("should export every primitive", async () => {
      const mainExports = await import("./index");

      expect(mainExports.signal).toBeDefined();
      expect(mainExports.computed).toBeDefined();
      expect(mainExports.linkedSignal).toBeDefined();
      expect(mainExports.resource).toBeDefined();
      expect(mainExports.external).toBeDefined();

      expect(typeof mainExports.signal).toBe("function");
      expect(typeof mainExports.computed).toBe("function");
      expect(typeof mainExports.linkedSignal).toBe("function");
      expect(typeof mainExports.resource).toBe("function");
      expect(typeof mainExports.external).toBe("function");
    });

    it("should export utilities and the signal brand", async () => {
      const mainExports = await import("./index");

      expect(mainExports.isSignal).toBeDefined();
      expect(mainExports.untracked).toBeDefined();
      expect(typeof mainExports.isSignal).toBe("function");
      expect(typeof mainExports.untracked).toBe("function");

      expect(mainExports.SIGNAL_SYMBOL).toBe(Symbol.for("@illuma/signals/StateSymbol"));
    });

    it("should keep the reactive graph out of the public surface", async () => {
      const mainExports = await import("./index");

      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.extractState).not.toBeDefined();
      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.createRxNode).not.toBeDefined();
      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.propagate).not.toBeDefined();
      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.updateIfNecessary).not.toBeDefined();
      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.runTracked).not.toBeDefined();
      // @ts-expect-error Accessing internal API for testing
      expect(mainExports.trackRead).not.toBeDefined();
    });
  });

  describe("Duplicated copies of the package", () => {
    it("should recognise each other's signals", async () => {
      vi.resetModules();
      const copyA = await import("./index");

      vi.resetModules();
      const copyB = await import("./index");

      const fromA = copyA.signal(1);
      const fromB = copyB.signal(2);

      expect(copyB.isSignal(fromA)).toBe(true);
      expect(copyA.isSignal(fromB)).toBe(true);
    });

    it("should share dependency tracking across copies", async () => {
      vi.resetModules();
      const copyA = await import("./index");

      vi.resetModules();
      const copyB = await import("./index");

      const source = copyA.signal(1);
      const derived = copyB.computed(() => source() * 2);

      expect(derived()).toBe(2);

      source.set(5);
      expect(derived()).toBe(10);
    });

    it("should propagate across copies to a live listener", async () => {
      vi.resetModules();
      const copyA = await import("./index");

      vi.resetModules();
      const copyB = await import("./index");

      const source = copyA.signal("a");
      const derived = copyB.computed(() => source().toUpperCase());

      const seen: string[] = [];
      derived.subscribe((v) => seen.push(v));

      source.set("b");

      expect(seen).toEqual(["A", "B"]);
    });
  });
});
