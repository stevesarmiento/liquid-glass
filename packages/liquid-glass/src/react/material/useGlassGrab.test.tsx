import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeGrabTransform,
  useGlassGrab,
  type GlassGrabHandle,
  type GlassGrabOptions,
} from "./useGlassGrab";

function Harness({
  options,
  onRender,
  target,
}: {
  options?: GlassGrabOptions;
  onRender: (grab: GlassGrabHandle) => void;
  target: { current: HTMLElement | null };
}) {
  onRender(useGlassGrab(target, options));
  return null;
}

/**
 * Manual rAF queue: the hook's loop is driven by explicit frame timestamps,
 * so the spring physics are deterministic (jsdom's real rAF is async and
 * unpinned from fake timers).
 */
let frameQueue: Map<number, FrameRequestCallback>;
let frameId: number;
let frameTime: number;

function flushFrames(count: number, dtMs = 16): void {
  for (let i = 0; i < count; i += 1) {
    frameTime += dtMs;
    const pending = Array.from(frameQueue.values());
    frameQueue.clear();
    for (const callback of pending) callback(frameTime);
  }
}

const pointerEvent = (element: Element, clientX: number, clientY: number, pointerId = 1) =>
  ({ button: 0, clientX, clientY, currentTarget: element, pointerId }) as never;

describe("computeGrabTransform", () => {
  const OPTIONS = { sizePx: 80, stretchFactor: 0.5, volumeConservation: 0.65, translateFactor: 0.45 };

  it("returns null (identity) at ~zero deflection", () => {
    expect(computeGrabTransform(0, 0, OPTIONS)).toBeNull();
    expect(computeGrabTransform(1e-4, -1e-4, OPTIONS)).toBeNull();
  });

  it("maps a +x deflection to translate + axis-aligned stretch with cross constriction", () => {
    const mapped = computeGrabTransform(8, 0, OPTIONS);
    expect(mapped).not.toBeNull();
    // translate = deflection · translateFactor; stretch = 8/80 · 0.5 = 0.05.
    expect(mapped!.transform).toBe(
      "translate(3.6px, 0px) rotate(0deg) scale(1.05, 0.9675) rotate(0deg)",
    );
    expect(mapped!.transformOrigin).toBe("center");
  });

  it("rotates the stretch axis onto the deflection direction", () => {
    const mapped = computeGrabTransform(0, 8, OPTIONS);
    expect(mapped!.transform).toContain("rotate(90deg)");
    expect(mapped!.transform).toContain("rotate(-90deg)");
    expect(mapped!.transform).toContain("translate(0px, 3.6px)");

    const diagonal = computeGrabTransform(5, 5, OPTIONS);
    expect(diagonal!.transform).toContain("rotate(45deg)");
  });

  it("caps the stretch at 8% no matter the deflection", () => {
    const mapped = computeGrabTransform(400, 0, { ...OPTIONS, sizePx: 10 });
    expect(mapped!.transform).toContain("scale(1.08,");
  });
});

describe("useGlassGrab", () => {
  let host: HTMLDivElement;
  let root: Root;
  let element: HTMLDivElement;
  let target: { current: HTMLElement | null };
  let latest: GlassGrabHandle;

  const mount = (options?: GlassGrabOptions) => {
    act(() => {
      root.render(<Harness onRender={(grab) => (latest = grab)} options={options} target={target} />);
    });
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    frameQueue = new Map();
    frameId = 0;
    frameTime = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameId += 1;
      frameQueue.set(frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frameQueue.delete(id);
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    element = document.createElement("div");
    document.body.append(element);
    target = { current: element };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    element.remove();
    vi.unstubAllGlobals();
  });

  it("handlers engage on pointer down, track moves, and bounce back clear on release", () => {
    mount();

    act(() => latest.handlers.onPointerDown(pointerEvent(element, 100, 100)));
    expect(latest.active).toBe(true);

    act(() => latest.handlers.onPointerMove(pointerEvent(element, 160, 100)));
    flushFrames(30);
    expect(element.style.transform).toContain("translate(");
    expect(element.style.transform).toContain("scale(");
    expect(element.style.transformOrigin).toBe("center");

    act(() => latest.handlers.onPointerUp(pointerEvent(element, 160, 100)));
    flushFrames(400);
    expect(latest.active).toBe(false);
    expect(element.style.transform).toBe("");
    expect(element.style.transformOrigin).toBe("");
  });

  it("ignores moves from other pointers while a grab is bound", () => {
    const deflections: Array<[number, number]> = [];
    mount({ onDeflection: (dx, dy) => deflections.push([dx, dy]) });

    act(() => latest.handlers.onPointerDown(pointerEvent(element, 0, 0, 1)));
    act(() => latest.handlers.onPointerMove(pointerEvent(element, 500, 0, 2)));
    flushFrames(60);
    expect(Math.max(...deflections.map(([dx]) => Math.abs(dx)))).toBe(0);
  });

  it("rubberbands the deflection toward maxPx with diminishing returns", () => {
    const deflections: number[] = [];
    mount({ maxPx: 8, falloffPx: 90, onDeflection: (dx) => deflections.push(dx) });

    act(() => latest.grab(0, 0));
    act(() => latest.pull(10_000, 0));
    flushFrames(120);
    const peak = Math.max(...deflections);
    expect(peak).toBeGreaterThan(7);
    expect(peak).toBeLessThan(8);
  });

  it("release retargets zero underdamped: the deflection overshoots (bounce) then settles", () => {
    const deflections: number[] = [];
    mount({ onDeflection: (dx) => deflections.push(dx) });

    act(() => latest.grab(0, 0));
    act(() => latest.pull(200, 0));
    flushFrames(60);
    expect(deflections[deflections.length - 1]).toBeGreaterThan(0);

    deflections.length = 0;
    act(() => latest.release());
    flushFrames(400);
    // Underdamped (380/16): the position crosses zero at least once.
    expect(Math.min(...deflections)).toBeLessThan(-0.1);
    // Final settle emits exactly (0, 0).
    expect(deflections[deflections.length - 1]).toBe(0);
    expect(latest.active).toBe(false);
  });

  it("applyTransform: false only reports deflections and never writes styles", () => {
    const deflections: Array<[number, number]> = [];
    mount({ applyTransform: false, onDeflection: (dx, dy) => deflections.push([dx, dy]) });

    act(() => latest.grab(0, 0));
    act(() => latest.pull(50, 50));
    flushFrames(30);
    expect(element.style.transform).toBe("");
    expect(deflections.length).toBeGreaterThan(0);
    expect(deflections[deflections.length - 1][0]).toBeGreaterThan(0);
    expect(deflections[deflections.length - 1][1]).toBeGreaterThan(0);

    act(() => latest.release());
    flushFrames(400);
    expect(deflections[deflections.length - 1]).toEqual([0, 0]);
  });

  it("is fully inert under prefers-reduced-motion (latched at grab)", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );
    const onDeflection = vi.fn();
    mount({ onDeflection });

    act(() => latest.handlers.onPointerDown(pointerEvent(element, 0, 0)));
    expect(latest.active).toBe(false);
    act(() => latest.handlers.onPointerMove(pointerEvent(element, 100, 0)));
    flushFrames(60);
    expect(element.style.transform).toBe("");
    expect(onDeflection).not.toHaveBeenCalled();

    act(() => latest.handlers.onPointerUp(pointerEvent(element, 100, 0)));
    flushFrames(60);
    expect(onDeflection).not.toHaveBeenCalled();
  });

  it("does nothing while disabled", () => {
    mount({ enabled: false });

    act(() => latest.handlers.onPointerDown(pointerEvent(element, 0, 0)));
    expect(latest.active).toBe(false);
    act(() => latest.handlers.onPointerMove(pointerEvent(element, 80, 0)));
    flushFrames(30);
    expect(element.style.transform).toBe("");
  });

  it("cancel stops immediately, clears styles, and emits a final (0, 0)", () => {
    const deflections: Array<[number, number]> = [];
    mount({ onDeflection: (dx, dy) => deflections.push([dx, dy]) });

    act(() => latest.grab(0, 0));
    act(() => latest.pull(120, 0));
    flushFrames(30);
    expect(element.style.transform).not.toBe("");

    act(() => latest.cancel());
    expect(element.style.transform).toBe("");
    expect(element.style.transformOrigin).toBe("");
    expect(latest.active).toBe(false);
    expect(deflections[deflections.length - 1]).toEqual([0, 0]);
    // The loop is stopped: no further frames are queued.
    expect(frameQueue.size).toBe(0);
  });

  it("clears the inline transform on unmount", () => {
    mount();
    act(() => latest.grab(0, 0));
    act(() => latest.pull(120, 0));
    flushFrames(30);
    expect(element.style.transform).not.toBe("");

    act(() => root.unmount());
    expect(element.style.transform).toBe("");
    expect(frameQueue.size).toBe(0);
    // Re-create the root so afterEach's unmount stays valid.
    root = createRoot(host);
  });
});
