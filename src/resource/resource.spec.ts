import { describe, expect, it, vi } from "vitest";
import { signal } from "../signal/signal";
import { resource } from "./resource";

const awaiter = () => new Promise((r) => setTimeout(r, 100));

describe("resource", () => {
  it("should initialize with idle state", () => {
    const loader = vi.fn();
    const res = resource(loader);

    expect(res.state()).toBe("idle");
    expect(res.isLoading()).toBe(false);
    expect(res.hasError()).toBe(false);

    expect(loader).not.toHaveBeenCalled();
  });

  it("should trigger loader on subscribe", async () => {
    const loader = vi.fn().mockResolvedValue("data");
    const res = resource(loader);

    const listener = vi.fn();
    const unsub = res.data.subscribe(listener);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(res.isLoading()).toBe(true);
    expect(res.state()).toBe("loading");

    await awaiter();

    expect(res.isLoading()).toBe(false);
    expect(res.state()).toBe("ready");
    expect(res.hasError()).toBe(false);
    expect(res.data()).toBe("data");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith("data");

    unsub();
  });

  it("should handle loader errors", async () => {
    const error = new Error("fail");
    const loader = vi.fn().mockRejectedValue(error);
    const res = resource(loader);

    const listener = vi.fn();
    const unsub1 = res.data.subscribe(listener);

    const onErrorListener = vi.fn();
    const unsub2 = res.error.subscribe(onErrorListener);

    await awaiter();

    expect(res.state()).toBe("error");
    expect(res.hasError()).toBe(true);
    expect(res.error()).toBe(error);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onErrorListener).toHaveBeenCalledWith(error);

    unsub1();
    unsub2();
  });

  it("should handle parameters", async () => {
    const loader = vi
      .fn()
      .mockImplementation(({ params }) => Promise.resolve(`Hello ${params}`));
    const paramsSignal = signal("World");

    const res = resource({
      params: paramsSignal,
      loader,
    });

    const listener = vi.fn();
    const unsub = res.data.subscribe(listener);

    await awaiter();
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ params: "World" }));
    expect(listener).toHaveBeenCalledWith("Hello World");

    paramsSignal.set("Test");
    expect(res.isLoading()).toBe(true);

    await awaiter();
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ params: "Test" }));
    expect(listener).toHaveBeenCalledWith("Hello Test");

    unsub();
  });

  it("should support manual refresh", async () => {
    let counter = 0;
    const loader = vi.fn().mockImplementation(() => Promise.resolve(counter++));
    const res = resource(loader);

    const unsub = res.data.subscribe(() => {});
    await awaiter();
    expect(loader).toHaveBeenCalledTimes(1);

    res.refresh();
    expect(res.isLoading()).toBe(true);
    await awaiter();
    expect(loader).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("should restart the loader when refreshed while already loading", async () => {
    const loader = vi.fn().mockResolvedValue("data");
    const res = resource(loader);

    const unsub = res.data.subscribe(() => {});

    expect(loader).toHaveBeenCalledTimes(1);
    expect(res.isLoading()).toBe(true);

    res.refresh();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(res.isLoading()).toBe(true);

    await awaiter();
    expect(res.isLoading()).toBe(false);

    unsub();
  });

  it("should not let a superseded request write its result", async () => {
    let call = 0;
    const loader = vi.fn().mockImplementation(() => {
      call++;
      const mine = call;
      return new Promise((r) => setTimeout(() => r(`r${mine}`), mine === 1 ? 80 : 10));
    });

    const res = resource(loader);
    const unsub = res.data.subscribe(() => {});

    res.refresh();
    await awaiter();

    expect(res.data()).toBe("r2");
    expect(res.isLoading()).toBe(false);

    await awaiter();
    expect(res.data()).toBe("r2");

    unsub();
  });

  it("should not report an aborted request as an error", async () => {
    const loader = vi.fn().mockImplementation(
      ({ abortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason));
        }),
    );

    const res = resource(loader);
    const unsub = res.data.subscribe(() => {});

    res.refresh();
    await awaiter();

    expect(res.hasError()).toBe(false);
    expect(res.error()).toBeUndefined();

    unsub();
  });

  it("should reach ready when the loader resolves undefined", async () => {
    const res = resource(() => Promise.resolve(undefined));
    const unsub = res.data.subscribe(() => {});

    await awaiter();

    expect(res.state()).toBe("ready");
    expect(res.hasData()).toBe(true);
    expect(res.hasError()).toBe(false);

    unsub();
  });

  it("should hand the loader the last successfully loaded value", async () => {
    const seen: unknown[] = [];
    const params = signal(1);
    const loader = vi.fn().mockImplementation(({ previousData, params: p }) => {
      seen.push(previousData);
      return Promise.resolve(`v${p}`);
    });

    const res = resource({ params, loader });
    const unsub = res.data.subscribe(() => {});
    await awaiter();

    params.set(2);
    await awaiter();

    expect(seen).toEqual([undefined, "v1"]);
    unsub();
  });

  it("should keep stale data on params change by default", async () => {
    const params = signal(1);
    const loader = vi
      .fn()
      .mockImplementation(({ params: p }) => Promise.resolve(`v${p}`));

    const res = resource({ params, loader });
    const unsub = res.data.subscribe(() => {});
    await awaiter();
    expect(res.data()).toBe("v1");

    params.set(2);
    expect(res.data()).toBe("v1");
    expect(res.hasData()).toBe(true);

    await awaiter();
    expect(res.data()).toBe("v2");

    unsub();
  });

  it("should clear data on params change when resetOnParamsChange is set", async () => {
    const params = signal(1);
    const loader = vi
      .fn()
      .mockImplementation(({ params: p }) => Promise.resolve(`v${p}`));

    const res = resource({ params, loader, resetOnParamsChange: true });
    const unsub = res.data.subscribe(() => {});
    await awaiter();
    expect(res.data()).toBe("v1");

    params.set(2);
    expect(res.data()).toBeUndefined();
    expect(res.hasData()).toBe(false);
    expect(res.state()).toBe("loading");

    await awaiter();
    expect(res.data()).toBe("v2");
    expect(res.state()).toBe("ready");

    unsub();
  });

  it("should abort the in-flight request on demand", () => {
    const abortSpy = vi.fn();
    const loader = vi.fn().mockImplementation(({ abortSignal }) => {
      abortSignal.addEventListener("abort", abortSpy);
      return new Promise((r) => setTimeout(r, 10000));
    });

    const res = resource(loader);
    const unsub = res.data.subscribe(() => {});
    expect(res.isLoading()).toBe(true);

    res.abort();
    expect(abortSpy).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("should seal state signals", () => {
    const res = resource(() => Promise.resolve());

    expect(res.state).not.toHaveProperty("set");
    expect(res.state).not.toHaveProperty("update");
    expect(res.data).not.toHaveProperty("set");
    expect(res.data).not.toHaveProperty("update");
    expect(res.error).not.toHaveProperty("set");
    expect(res.error).not.toHaveProperty("update");
    expect(res.isLoading).not.toHaveProperty("set");
    expect(res.isLoading).not.toHaveProperty("update");
  });

  it("should abort previous request on new refresh", () => {
    const abortSpy = vi.fn();
    const resSpy = vi.fn();
    const loader = vi.fn().mockImplementation(({ abortSignal }) => {
      abortSignal.addEventListener("abort", abortSpy);
      return new Promise((r) => setTimeout(r, 10000));
    });

    const res = resource(loader);
    const unsub = res.data.subscribe(resSpy);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(resSpy).toHaveBeenCalledWith(undefined);
    expect(res.isLoading()).toBe(true);

    res.refresh();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(resSpy).toHaveBeenCalledTimes(1);

    unsub();
  });
});
