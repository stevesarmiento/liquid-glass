import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTsLiquidGlassEngine } from "../engine/ts-engine";
import { renderLocalGlassCanvas } from "./local-canvas";

class ImageDataMock {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

describe("renderLocalGlassCanvas", () => {
  let lastImageData: ImageDataMock | null = null;

  beforeEach(() => {
    lastImageData = null;
    vi.stubGlobal("ImageData", ImageDataMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContextMock() {
      const canvas = this as HTMLCanvasElement;
      return {
        canvas,
        filter: "none",
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        closePath: vi.fn(),
        createImageData: (width: number, height: number) =>
          new ImageDataMock(new Uint8ClampedArray(width * height * 4), width, height),
        drawImage: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        getImageData: (x: number, y: number, width: number, height: number) => {
          const data = new Uint8ClampedArray(width * height * 4);
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 80;
            data[i + 1] = 120;
            data[i + 2] = 160;
            data[i + 3] = 255;
          }
          return new ImageDataMock(data, width, height);
        },
        lineTo: vi.fn(),
        moveTo: vi.fn(),
        putImageData: (imageData: ImageDataMock) => {
          lastImageData = imageData;
        },
        quadraticCurveTo: vi.fn(),
        restore: vi.fn(),
        save: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    });
  });

  it("uses deterministic dimensions and returns render metadata", () => {
    const canvas = document.createElement("canvas");
    const result = renderLocalGlassCanvas({
      canvas,
      engine: createTsLiquidGlassEngine(),
      lens: { width: 8, height: 8, radius: 4, mapSize: 16 },
      lensX: 2,
      lensY: 2,
      pixelRatio: 2,
      source: ({ ctx }) => ctx.fillRect(0, 0, 24, 24),
      sourceHeight: 24,
      sourceWidth: 24,
    });

    expect(result.renderer).toBe("canvas");
    expect(result.pixelRatio).toBe(2);
    expect(canvas.width).toBe(16);
    expect(canvas.height).toBe(16);
    expect(lastImageData?.data.length).toBe(16 * 16 * 4);
  });

  it("leaves outside rounded rect pixels transparent", () => {
    const canvas = document.createElement("canvas");
    renderLocalGlassCanvas({
      canvas,
      engine: createTsLiquidGlassEngine(),
      lens: { width: 8, height: 8, radius: 4, mapSize: 16 },
      lensX: 0,
      lensY: 0,
      pixelRatio: 1,
      source: ({ ctx }) => ctx.fillRect(0, 0, 16, 16),
      sourceHeight: 16,
      sourceWidth: 16,
    });

    expect(lastImageData?.data[3]).toBe(0);
  });
});

