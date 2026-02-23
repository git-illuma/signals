import { describe, expect, it } from "vitest";

describe("Exports", () => {
  it("should export all core primitives", async () => {
    const exports = await import("./index");

    // Factories
    expect(exports.signal).toBeDefined();
    expect(exports.computed).toBeDefined();
    expect(exports.linkedSignal).toBeDefined();

    // Utils
    expect(exports.isSignal).toBeDefined();
    expect(exports.untracked).toBeDefined();
  });
});
