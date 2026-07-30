import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSyncEngine } from "@humanmanual/core";

describe("createSyncEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedule debounces persist and fires after the delay", async () => {
    const engine = createSyncEngine();
    const persist = vi.fn(async () => {});

    engine.schedule("k", persist);
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    await Promise.resolve();
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    // flush the awaited persist
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("re-scheduling the same key cancels the earlier timer (true debounce)", async () => {
    const engine = createSyncEngine();
    const calls: string[] = [];

    engine.schedule("k", async () => {
      calls.push("first");
    });
    vi.advanceTimersByTime(400);

    engine.schedule("k", async () => {
      calls.push("second");
    });
    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(calls).toEqual(["second"]);
  });

  it("cancel(key) prevents the pending persist from firing", async () => {
    const engine = createSyncEngine();
    const persist = vi.fn(async () => {});

    engine.schedule("k", persist);
    engine.cancel("k");

    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).not.toHaveBeenCalled();
  });

  it("on persist rejection, engine logs console.error, clears the key, and does not retry", async () => {
    const engine = createSyncEngine();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const persist = vi.fn(async () => {
      throw new Error("boom");
    });

    engine.schedule("k", persist);
    await vi.advanceTimersByTimeAsync(500);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toMatch(/syncEngine/);

    // A later schedule for the same key should fire normally — proving the
    // key was cleared and the engine is not in a poisoned/retry state.
    const ok = vi.fn(async () => {});
    engine.schedule("k", ok);
    await vi.advanceTimersByTimeAsync(500);
    expect(ok).toHaveBeenCalledTimes(1);

    errSpy.mockRestore();
  });
});
