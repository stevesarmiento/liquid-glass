import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTsLiquidGlassEngine } from "../engine/ts-engine";
import { createLiquidGlassController } from "./controller";

describe("LiquidGlassController", () => {
  beforeEach(() => {
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

  it("creates one SVG filter root and removes it on destroy", () => {
    const container = document.createElement("div");
    const source = document.createElement("div");
    document.body.append(container);
    container.append(source);
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 240,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 240,
      right: 320,
      toJSON: () => ({}),
    });

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
    const container = document.createElement("div");
    const source = document.createElement("div");
    document.body.append(container);
    container.append(source);
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 240,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 240,
      right: 320,
      toJSON: () => ({}),
    });
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const writes = controller.stats.domWrites;

    controller.update({});

    expect(controller.stats.domWrites - writes).toBe(0);
    controller.destroy();
  });

  it("can force the canvas renderer and hide the SVG target", () => {
    const container = document.createElement("div");
    const source = document.createElement("div");
    const target = document.createElement("div");
    document.body.append(container);
    container.append(source, target);
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 240,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 240,
      right: 320,
      toJSON: () => ({}),
    });

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
});
