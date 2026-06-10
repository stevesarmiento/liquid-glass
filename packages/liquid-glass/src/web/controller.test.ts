import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTsLiquidGlassEngine } from "../engine/ts-engine";
import { createLiquidGlassController } from "./controller";

let rafCallbacks: FrameRequestCallback[] = [];

function flushFrame(): void {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const callback of callbacks) callback(performance.now());
}

function mockRect(element: HTMLElement, width = 320, height = 240): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    toJSON: () => ({}),
  } as DOMRect);
}

function createFixture(): { container: HTMLDivElement; source: HTMLDivElement } {
  const container = document.createElement("div");
  const source = document.createElement("div");
  document.body.append(container);
  container.append(source);
  mockRect(container);
  mockRect(source);
  return { container, source };
}

describe("LiquidGlassController", () => {
  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafCallbacks[id - 1] = () => undefined;
    });
    vi.stubGlobal(
      "ImageData",
      class ImageDataMock {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("creates one SVG filter root and removes it on destroy", () => {
    const { container, source } = createFixture();

    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });

    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(source.style.filter).toContain("url(");
    controller.destroy();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
    expect(source.style.filter).toBe("");
  });

  it("avoids redundant DOM writes when inputs do not change", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      safariRefresh: false,
    });
    const writes = controller.stats.domWrites;

    controller.update({});
    flushFrame();

    expect(controller.stats.domWrites - writes).toBe(0);
    controller.destroy();
  });

  it("coalesces multiple updates into one apply per animation frame", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const applies = controller.stats.applyCount;

    controller.setPosition({ x: 0.1, y: 0.1 });
    controller.setPosition({ x: 0.4, y: 0.6 });
    controller.update({ position: { x: 0.9, y: 0.9 } });
    expect(controller.stats.applyCount).toBe(applies);

    flushFrame();
    expect(controller.stats.applyCount).toBe(applies + 1);

    flushFrame();
    expect(controller.stats.applyCount).toBe(applies + 1);
    controller.destroy();
  });

  it("cancels a pending frame on destroy", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const applies = controller.stats.applyCount;

    controller.setPosition({ x: 0.2, y: 0.3 });
    controller.destroy();
    flushFrame();

    expect(controller.stats.applyCount).toBe(applies);
  });

  it("applies synchronously when requestAnimationFrame is unavailable", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const applies = controller.stats.applyCount;

    controller.setPosition({ x: 0.8, y: 0.1 });

    expect(controller.stats.applyCount).toBe(applies + 1);
    controller.destroy();
  });

  it("cycles the filter id on primitive-only changes (source mode) when safariRefresh is on", () => {
    // In source mode the filter region spans the whole source, so a position
    // change mutates only filter *primitives* (feImage x/y) — the case where
    // WebKit fails to repaint without an id change.
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      safariRefresh: true,
    });
    const initialFilter = source.style.filter;

    controller.setPosition({ x: 0.85, y: 0.15 });
    flushFrame();

    expect(source.style.filter).toContain("url(");
    expect(source.style.filter).not.toBe(initialFilter);
    controller.destroy();
  });

  it("does not cycle the filter id during target-mode drags (region moves with the lens)", () => {
    // In target mode the <filter> region attributes move together with the
    // primitives every frame; region mutations already invalidate the filter
    // in WebKit, and cycling the id per drag frame is the expensive path.
    const { container, source } = createFixture();
    const target = document.createElement("div");
    container.append(target);
    mockRect(target);
    const controller = createLiquidGlassController({
      container,
      source,
      target,
      mode: "target",
      engine: createTsLiquidGlassEngine(),
      safariRefresh: true,
    });
    const initialFilter = target.style.filter;
    expect(initialFilter).toContain("url(");

    controller.setPosition({ x: 0.85, y: 0.15 });
    flushFrame();
    controller.setPosition({ x: 0.25, y: 0.75 });
    flushFrame();

    expect(target.style.filter).toBe(initialFilter);
    controller.destroy();
  });

  it("keeps the filter id stable across geometry changes when safariRefresh is off", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      safariRefresh: false,
    });
    const initialFilter = source.style.filter;

    controller.setPosition({ x: 0.85, y: 0.15 });
    flushFrame();

    expect(source.style.filter).toBe(initialFilter);
    controller.destroy();
  });

  it("schedules updates from ResizeObserver notifications", () => {
    const resizeCallbacks: Array<() => void> = [];
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe(element: Element) {
          observed.push(element);
        }
        unobserve() {}
        disconnect = disconnect;
      },
    );

    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const applies = controller.stats.applyCount;

    expect(observed).toContain(container);
    resizeCallbacks[0]?.();
    flushFrame();
    expect(controller.stats.applyCount).toBe(applies + 1);

    controller.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it("works without ResizeObserver available", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { container, source } = createFixture();

    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });

    expect(source.style.filter).toContain("url(");
    controller.destroy();
  });

  it("skips the displacement filter when reduced transparency is preferred", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-transparency"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container, source } = createFixture();

    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });

    expect(source.style.filter).toBe("");
    expect(controller.stats.applyCount).toBeGreaterThan(0);
    controller.destroy();
  });

  it("ignores reduced transparency when respectReducedTransparency is false", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-transparency"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container, source } = createFixture();

    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      respectReducedTransparency: false,
    });

    expect(source.style.filter).toContain("url(");
    controller.destroy();
  });

  it("computes geometry from the source element rect in source mode", () => {
    const container = document.createElement("div");
    const source = document.createElement("div");
    document.body.append(container);
    container.append(source);
    mockRect(container, 1000, 800);
    const sourceRect = vi.spyOn(source, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 240,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 240,
      right: 320,
      toJSON: () => ({}),
    } as DOMRect);

    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });

    expect(sourceRect).toHaveBeenCalled();
    controller.destroy();
  });

  it("can force the canvas renderer and hide the SVG target", () => {
    const container = document.createElement("div");
    const source = document.createElement("div");
    const target = document.createElement("div");
    document.body.append(container);
    container.append(source, target);
    mockRect(container);

    const controller = createLiquidGlassController({
      container,
      source,
      target,
      engine: createTsLiquidGlassEngine(),
      mode: "target",
      renderer: "canvas",
      sourceImageUrl: "/image.jpg",
    });

    expect(controller.stats.activeRenderer).toBe("canvas");
    expect(target.style.visibility).toBe("hidden");
    expect(container.querySelector("canvas")?.style.display).toBe("block");
    controller.destroy();
  });

  it("falls back to the CPU canvas when webgl is requested but unavailable", () => {
    // The mocked getContext returns a 2D-ish stub for every context type, so
    // createWebglGlassRenderer rejects it and the controller downgrades.
    const container = document.createElement("div");
    const source = document.createElement("div");
    const target = document.createElement("div");
    document.body.append(container);
    container.append(source, target);
    mockRect(container);

    const controller = createLiquidGlassController({
      container,
      source,
      target,
      engine: createTsLiquidGlassEngine(),
      mode: "target",
      renderer: "webgl",
      sourceImageUrl: "/image.jpg",
    });

    expect(controller.stats.activeRenderer).toBe("canvas");
    expect(target.style.visibility).toBe("hidden");
    controller.destroy();
  });

  it("auto prefers webgl on Safari target+image scenes and falls back to canvas without GL", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    const container = document.createElement("div");
    const source = document.createElement("div");
    const target = document.createElement("div");
    document.body.append(container);
    container.append(source, target);
    mockRect(container);

    const controller = createLiquidGlassController({
      container,
      source,
      target,
      engine: createTsLiquidGlassEngine(),
      mode: "target",
      renderer: "auto",
      sourceImageUrl: "/image.jpg",
    });

    // jsdom has no WebGL2, so auto lands on the CPU canvas renderer.
    expect(controller.stats.activeRenderer).toBe("canvas");
    expect(container.querySelector("canvas")?.style.display).toBe("block");
    controller.destroy();
  });
});
