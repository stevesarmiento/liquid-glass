import { afterEach, describe, expect, it, vi } from "vitest";

import { createRenderGate } from "./render-gate";

type IoCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

/** Records observed targets and lets tests fire intersection changes. */
class StubIntersectionObserver {
  static instances: StubIntersectionObserver[] = [];
  observed = new Set<Element>();
  callback: IoCallback;
  constructor(callback: IoCallback) {
    this.callback = callback;
    StubIntersectionObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
  fire(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting }]);
  }
}

afterEach(() => {
  StubIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("createRenderGate", () => {
  it("falls back to always-intersecting without IntersectionObserver", () => {
    const element = document.createElement("div");
    const gate = createRenderGate(element);
    expect(gate.active).toBe(true);
    gate.destroy();
  });

  it("tracks intersection changes and notifies subscribers", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const element = document.createElement("div");
    const gate = createRenderGate(element);
    const flips: boolean[] = [];
    gate.subscribe((active) => flips.push(active));

    const observer = StubIntersectionObserver.instances[0];
    expect(observer.observed.has(element)).toBe(true);

    // Optimistic start: active until the observer reports otherwise.
    expect(gate.active).toBe(true);
    observer.fire(element, false);
    expect(gate.active).toBe(false);
    observer.fire(element, true);
    expect(gate.active).toBe(true);
    expect(flips).toEqual([false, true]);
    gate.destroy();
  });

  it("shares one observer across gates with the same rootMargin and cleans up", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const a = createRenderGate(document.createElement("div"));
    const b = createRenderGate(document.createElement("div"));
    expect(StubIntersectionObserver.instances.length).toBe(1);

    a.destroy();
    expect(StubIntersectionObserver.instances[0].observed.size).toBe(1);
    b.destroy();
    expect(StubIntersectionObserver.instances[0].observed.size).toBe(0);

    // A new gate after full teardown creates a fresh shared observer.
    const c = createRenderGate(document.createElement("div"));
    expect(StubIntersectionObserver.instances.length).toBe(2);
    c.destroy();
  });

  it("combines tab visibility with intersection", () => {
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    const element = document.createElement("div");
    const gate = createRenderGate(element);
    StubIntersectionObserver.instances[0].fire(element, true);
    expect(gate.active).toBe(true);

    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(gate.active).toBe(false);

    visibilitySpy.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(gate.active).toBe(true);
    gate.destroy();
    visibilitySpy.mockRestore();
  });
});
