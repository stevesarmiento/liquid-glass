import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlassButton from "./index";

/**
 * jsdom has no ResizeObserver, PointerEvent, or WebGL; rects measure 0 so the
 * glass face never mounts. These tests exercise the interaction machinery:
 * the grab deformation (driven through a manual rAF queue so the spring
 * physics are deterministic) and its composition with click semantics.
 */

const GRAB_LAYER_SELECTOR = "[data-lgds-button-grab]";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let frameQueue: Map<number, FrameRequestCallback>;
let frameId: number;
let frameTime: number;

function flushFrames(count: number, dtMs = 16): void {
  act(() => {
    for (let i = 0; i < count; i += 1) {
      frameTime += dtMs;
      const pending = Array.from(frameQueue.values());
      frameQueue.clear();
      for (const callback of pending) callback(frameTime);
    }
  });
}

function pointer(
  element: HTMLElement,
  type: string,
  coords: { clientX: number; clientY: number },
): void {
  act(() => {
    element.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        ...coords,
        button: 0,
        pointerId: 1,
      }),
    );
  });
}

function keyboard(element: HTMLElement, type: string, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key }));
  });
}

describe("GlassButton grab deformation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
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
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  function render(ui: React.ReactElement) {
    act(() => root.render(ui));
  }

  function getButton(): HTMLButtonElement {
    const button = host.querySelector("button");
    if (!button) throw new Error("button not found");
    return button;
  }

  function getGrabLayer(): HTMLElement {
    const layer = host.querySelector<HTMLElement>(GRAB_LAYER_SELECTOR);
    if (!layer) throw new Error("grab layer not found");
    return layer;
  }

  it("press-and-drag deforms the grab layer and a release clears it (with bounce)", () => {
    render(<GlassButton>Save</GlassButton>);
    const button = getButton();
    const layer = getGrabLayer();

    pointer(button, "pointerdown", { clientX: 50, clientY: 20 });
    pointer(button, "pointermove", { clientX: 110, clientY: 20 });
    flushFrames(30);
    expect(layer.style.transform).toContain("translate(");
    expect(layer.style.transform).toContain("scale(");
    expect(layer.style.transformOrigin).toBe("center");

    pointer(button, "pointerup", { clientX: 110, clientY: 20 });
    flushFrames(400);
    expect(layer.style.transform).toBe("");
    expect(layer.style.transformOrigin).toBe("");
  });

  it("a grab drag does not break click", () => {
    const onClick = vi.fn();
    render(<GlassButton onClick={onClick}>Save</GlassButton>);
    const button = getButton();

    pointer(button, "pointerdown", { clientX: 50, clientY: 20 });
    pointer(button, "pointermove", { clientX: 90, clientY: 40 });
    flushFrames(10);
    pointer(button, "pointerup", { clientX: 90, clientY: 40 });
    act(() => button.click());
    flushFrames(400);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(getGrabLayer().style.transform).toBe("");
  });

  it("does not grab while disabled or loading", () => {
    render(<GlassButton disabled>Save</GlassButton>);
    let button = getButton();
    pointer(button, "pointerdown", { clientX: 0, clientY: 0 });
    pointer(button, "pointermove", { clientX: 80, clientY: 0 });
    flushFrames(20);
    expect(getGrabLayer().style.transform).toBe("");

    render(<GlassButton loading>Save</GlassButton>);
    button = getButton();
    pointer(button, "pointerdown", { clientX: 0, clientY: 0 });
    pointer(button, "pointermove", { clientX: 80, clientY: 0 });
    flushFrames(20);
    expect(getGrabLayer().style.transform).toBe("");
  });

  it("keyboard activation never grabs (squish only, on the lens layer)", () => {
    const onClick = vi.fn();
    render(<GlassButton onClick={onClick}>Save</GlassButton>);
    const button = getButton();

    keyboard(button, "keydown", " ");
    flushFrames(10);
    expect(getGrabLayer().style.transform).toBe("");
    keyboard(button, "keyup", " ");
    flushFrames(400);
    expect(getGrabLayer().style.transform).toBe("");
  });

  it("disabling mid-grab drops the deformation immediately", () => {
    render(<GlassButton>Save</GlassButton>);
    const button = getButton();
    pointer(button, "pointerdown", { clientX: 0, clientY: 0 });
    pointer(button, "pointermove", { clientX: 80, clientY: 0 });
    flushFrames(20);
    expect(getGrabLayer().style.transform).not.toBe("");

    render(<GlassButton disabled>Save</GlassButton>);
    expect(getGrabLayer().style.transform).toBe("");
  });
});
