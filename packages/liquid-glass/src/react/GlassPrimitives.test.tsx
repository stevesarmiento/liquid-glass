import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlassNode } from "./GlassNode";
import { GlassSurface } from "./GlassSurface";

class ImageDataMock {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

function installCanvasMocks() {
  vi.stubGlobal("ImageData", ImageDataMock);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,test");
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
      getImageData: (x: number, y: number, width: number, height: number) =>
        new ImageDataMock(new Uint8ClampedArray(width * height * 4).fill(128), width, height),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      putImageData: vi.fn(),
      quadraticCurveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
}

describe("glass React primitives", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    installCanvasMocks();
  });

  it("GlassSurface renders content and expected classes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GlassSurface tone="clear" shape="pill" interactive>
          content
        </GlassSurface>,
      );
    });

    expect(host.textContent).toContain("content");
    expect(host.querySelector(".lg-glass-surface--clear")).not.toBeNull();
    expect(host.querySelector(".lg-glass-surface--pill")).not.toBeNull();
    expect(host.querySelector(".lg-glass-surface--interactive")).not.toBeNull();
    act(() => root.unmount());
  });

  it("GlassNode renders SVG path in non-Safari auto mode", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome/125.0");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GlassNode
          engineMode="ts"
          lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
          lensX={4}
          lensY={4}
          sourceHeight={40}
          sourceWidth={80}
          sourceChildren={<span>source</span>}
          drawSource={({ ctx }) => ctx.fillRect(0, 0, 80, 40)}
        />,
      );
    });

    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelector("canvas")).toBeNull();
    act(() => root.unmount());
  });

  it("GlassNode renders canvas path in Safari auto mode", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Version/17.0 Safari/605.1.15");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GlassNode
          engineMode="ts"
          lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
          lensX={4}
          lensY={4}
          sourceHeight={40}
          sourceWidth={80}
          sourceChildren={<span>source</span>}
          drawSource={({ ctx }) => ctx.fillRect(0, 0, 80, 40)}
        />,
      );
    });

    expect(host.querySelector("canvas")).not.toBeNull();
    expect(host.querySelector("svg")).toBeNull();
    act(() => root.unmount());
  });

  it("GlassNode skips expensive renderer output when disabled", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GlassNode
          disabled
          engineMode="ts"
          lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
          lensX={4}
          lensY={4}
          sourceHeight={40}
          sourceWidth={80}
          sourceChildren={<span>source</span>}
          drawSource={({ ctx }) => ctx.fillRect(0, 0, 80, 40)}
        />,
      );
    });

    expect(host.querySelector("canvas")).toBeNull();
    expect(host.querySelector("svg")).toBeNull();
    expect(host.querySelector(".lg-glass-surface")).not.toBeNull();
    act(() => root.unmount());
  });

  it("GlassNode applies dynamic tint variables to the surface", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <GlassNode
          disabled
          engineMode="ts"
          lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
          lensX={4}
          lensY={4}
          sourceHeight={40}
          sourceWidth={80}
          surfaceBlur={6}
          tint={{
            color: "#123456",
            opacity: 0.2,
            borderOpacity: 0.4,
            highlightOpacity: 0.6,
            shadowOpacity: 0.3,
            saturation: 1.5,
          }}
        />,
      );
    });

    const surface = host.querySelector(".lg-glass-surface") as HTMLElement;
    expect(surface.style.getPropertyValue("--lg-glass-bg")).toBe("rgba(18, 52, 86, 0.2)");
    expect(surface.style.getPropertyValue("--lg-glass-border")).toBe("rgba(18, 52, 86, 0.4)");
    expect(surface.style.getPropertyValue("--lg-glass-saturation")).toBe("1.5");
    expect(surface.style.getPropertyValue("--lg-glass-surface-blur")).toBe("6px");
    act(() => root.unmount());
  });
});
