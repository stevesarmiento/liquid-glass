import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDisplacementMapCache, getDisplacementMapCacheStats } from "../engine/map-cache";
import { resetSharedGlassCompositorForTests } from "../web/glass-compositor";
import { clearMapUrlCache } from "../web/map-url-cache";
import { createStubGl } from "../web/test-stub-gl";
import { GlassNode } from "./GlassNode";
import { GlassSurface } from "./GlassSurface";
import { ensureLiquidGlassStyles } from "./inject-styles";

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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function getContextMock(this: HTMLCanvasElement) {
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

  afterEach(() => {
    resetSharedGlassCompositorForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
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

  it("injected glass styles keep host shadows unclipped", () => {
    ensureLiquidGlassStyles();
    const css = document.head.querySelector("style[data-liquid-glass]")?.textContent ?? "";

    expect(css).toContain("--lg-glass-highlight-spread");
    expect(css).toContain("box-shadow:");
    expect(css).not.toContain("clip-path: inset(0 round var(--lg-glass-radius))");
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
    expect(host.querySelector(".lg-glass-node__content")?.getAttribute("aria-hidden")).toBe("true");
    const arithmeticComposites = Array.from(host.getElementsByTagName("feComposite")).filter(
      (node) =>
        node.getAttribute("operator") === "arithmetic" &&
        node.getAttribute("k2") === "1" &&
        node.getAttribute("k3") === "1",
    );
    expect(arithmeticComposites.length).toBeGreaterThanOrEqual(2);
    act(() => root.unmount());
  });

  it("bounds map generation during a resize burst on the SVG path", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome/125.0");
    vi.useFakeTimers();
    try {
      clearDisplacementMapCache();
      clearMapUrlCache();
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const renderNode = (width: number) =>
        act(() => {
          root.render(
            <GlassNode
              engineMode="ts"
              lens={{ width, height: 40, radius: 8, mapSize: 32 }}
              lensX={0}
              lensY={0}
              sourceChildren={<span>source</span>}
              sourceHeight={40}
              sourceWidth={200}
            />,
          );
        });

      renderNode(100);
      const base = getDisplacementMapCacheStats().generated;
      // 30 resize ticks: without quantization each would be a cache miss.
      for (let width = 101; width <= 130; width += 1) renderNode(width);
      // First change exact (1) + a handful of quantized buckets.
      expect(getDisplacementMapCacheStats().generated - base).toBeLessThanOrEqual(6);
      // The feImage rect always keeps the EXACT lens size (the quantized map
      // stretches over it via preserveAspectRatio="none").
      expect(host.querySelector("feImage")?.getAttribute("width")).toBe("130");

      // Settle: exactly one final exact-size regeneration.
      const beforeSettle = getDisplacementMapCacheStats().generated;
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(getDisplacementMapCacheStats().generated - beforeSettle).toBeLessThanOrEqual(1);
      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the filter id stable across size changes and bumps once after settle", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome/125.0");
    // Distinct data URLs per encode so mapUrl actually changes across maps.
    let encodeCount = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      () => `data:image/png;base64,${(encodeCount += 1)}`,
    );
    vi.useFakeTimers();
    try {
      clearDisplacementMapCache();
      clearMapUrlCache();
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const renderNode = (width: number) =>
        act(() => {
          root.render(
            <GlassNode
              engineMode="ts"
              lens={{ width, height: 40, radius: 8, mapSize: 32 }}
              lensX={0}
              lensY={0}
              sourceChildren={<span>source</span>}
              sourceHeight={40}
              sourceWidth={200}
            />,
          );
        });

      await act(async () => renderNode(100));
      const idAfterMount = host.querySelector("filter")?.id ?? "";
      expect(idAfterMount).not.toBe("");

      // Size changes rewrite region attributes; the id must not churn.
      await act(async () => renderNode(110));
      await act(async () => renderNode(120));
      expect(host.querySelector("filter")?.id).toBe(idAfterMount);

      // Settle regen swaps the map with a static region: exactly one bump.
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      const idAfterSettle = host.querySelector("filter")?.id ?? "";
      expect(idAfterSettle).not.toBe(idAfterMount);
      const counterOf = (id: string) => Number(/-(\d+)-\d+$/.exec(id)?.[1] ?? NaN);
      expect(counterOf(idAfterSettle)).toBe(counterOf(idAfterMount) + 1);
      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it("injects the stylesheet exactly once on mount", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <>
          <GlassSurface>one</GlassSurface>
          <GlassSurface>two</GlassSurface>
        </>,
      );
    });
    ensureLiquidGlassStyles();

    expect(document.head.querySelectorAll("style[data-liquid-glass]")).toHaveLength(1);
    act(() => root.unmount());
  });

  it("GlassNode renders an opaque-ish fallback when reduced transparency is preferred", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-transparency"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
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

    expect(host.querySelector("svg")).toBeNull();
    expect(host.querySelector("canvas")).toBeNull();
    const surface = host.querySelector(".lg-glass-surface") as HTMLElement;
    expect(surface.style.getPropertyValue("--lg-glass-bg")).toBe("rgba(255, 255, 255, 0.85)");
    act(() => root.unmount());
  });

  it("GlassNode keeps refraction when respectReducedTransparency is false", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-transparency"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
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
          respectReducedTransparency={false}
          sourceHeight={40}
          sourceWidth={80}
          sourceChildren={<span>source</span>}
        />,
      );
    });

    expect(host.querySelector("svg")).not.toBeNull();
    act(() => root.unmount());
  });

  it("two webgl-backed GlassNodes share ONE WebGL2 context via the compositor", () => {
    resetSharedGlassCompositorForTests();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari/605.1.15 Version/17.0");
    // Re-mock getContext: hand out the GL stub for webgl2 (the compositor's
    // detached canvas) and keep the 2D-ish mock for everything else (scratch
    // scenes + blit targets).
    vi.restoreAllMocks();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari/605.1.15 Version/17.0");
    const { gl } = createStubGl();
    installCanvasMocks();
    const get2d = HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>;
    const baseImpl = get2d.getMockImplementation()!;
    const getContextSpy = get2d.mockImplementation(function getContextMock(
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === "webgl2") return gl as never;
      return baseImpl.call(this, type, ...rest);
    });

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <>
          {[0, 1].map((index) => (
            <GlassNode
              engineMode="ts"
              key={index}
              lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
              lensX={4}
              lensY={4}
              sourceHeight={40}
              sourceWidth={80}
              drawSource={({ ctx }) => ctx.fillRect(0, 0, 80, 40)}
              sourceVersion={`node-${index}`}
            />
          ))}
        </>,
      );
    });

    // Two glass canvases in the DOM, but exactly ONE webgl2 context request.
    expect(host.querySelectorAll("canvas").length).toBe(2);
    const webgl2Requests = getContextSpy.mock.calls.filter(([type]) => type === "webgl2");
    expect(webgl2Requests.length).toBe(1);
    act(() => root.unmount());
  });

  it("GlassNode skips redraws when sourceVersion is stable across new drawSource closures", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari/605.1.15 Version/17.0");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let draws = 0;

    const renderNode = (version: string) => {
      act(() => {
        root.render(
          <GlassNode
            engineMode="ts"
            lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
            lensX={4}
            lensY={4}
            sourceHeight={40}
            sourceWidth={80}
            // Fresh closure on every render — identity must NOT drive redraws.
            drawSource={({ ctx }) => {
              draws += 1;
              ctx.fillRect(0, 0, 80, 40);
            }}
            sourceVersion={version}
          />,
        );
      });
    };

    renderNode("a");
    const drawsAfterMount = draws;
    expect(drawsAfterMount).toBeGreaterThan(0);

    renderNode("a"); // new closure, same content version -> no redraw
    expect(draws).toBe(drawsAfterMount);

    renderNode("b"); // version bump -> redraw
    expect(draws).toBeGreaterThan(drawsAfterMount);
    act(() => root.unmount());
  });

  it("GlassNode keeps legacy identity-keyed redraws when sourceVersion is omitted", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Safari/605.1.15 Version/17.0");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let draws = 0;

    const renderNode = () => {
      act(() => {
        root.render(
          <GlassNode
            engineMode="ts"
            lens={{ width: 32, height: 20, radius: 8, mapSize: 16 }}
            lensX={4}
            lensY={4}
            sourceHeight={40}
            sourceWidth={80}
            drawSource={({ ctx }) => {
              draws += 1;
              ctx.fillRect(0, 0, 80, 40);
            }}
          />,
        );
      });
    };

    renderNode();
    const drawsAfterMount = draws;
    expect(drawsAfterMount).toBeGreaterThan(0);

    renderNode(); // new closure, no version -> legacy behavior: redraw
    expect(draws).toBeGreaterThan(drawsAfterMount);
    act(() => root.unmount());
  });

  it("GlassNode renders canvas path in Safari auto mode", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
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
            highlightWidth: 1.35,
            highlightHeight: 0.55,
            highlightCore: 0.28,
            highlightSpread: 0.72,
            highlightRotation: 24,
            highlightX: 0.7,
            highlightY: 0.2,
            shadowOpacity: 0.3,
            saturation: 1.5,
          }}
        />,
      );
    });

    const surface = host.querySelector(".lg-glass-surface") as HTMLElement;
    expect(surface.style.getPropertyValue("--lg-glass-bg")).toBe("rgba(18, 52, 86, 0.2)");
    expect(surface.style.getPropertyValue("--lg-glass-border")).toBe("rgba(18, 52, 86, 0.4)");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-width")).toBe("135%");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-height")).toBe("55%");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-core")).toBe("28%");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-spread")).toBe("72%");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-rotation")).toBe("24deg");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-x")).toBe("70%");
    expect(surface.style.getPropertyValue("--lg-glass-highlight-y")).toBe("20%");
    expect(surface.style.getPropertyValue("--lg-glass-radius")).toBe("8px");
    expect(surface.style.getPropertyValue("--lg-glass-saturation")).toBe("1.5");
    expect(surface.style.getPropertyValue("--lg-glass-surface-blur")).toBe("6px");
    act(() => root.unmount());
  });
});
