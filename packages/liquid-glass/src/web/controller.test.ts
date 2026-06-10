import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MERGED_ALPHA_DISTANCE_RANGE } from "../engine/merged";
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

  it("supports a single lenses[] entry through the regular single-lens path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      lenses: [{ position: { x: 0.3, y: 0.4 }, width: 60, height: 60, radius: 18 }],
    });

    expect(controller.stats.activeRenderer).toBe("svg");
    expect(source.style.filter).toContain("url(");
    expect(warn).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("ignores tint on the single-lens svg path", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
      tint: "aqua",
    });

    expect(controller.stats.activeRenderer).toBe("svg");
    expect(source.style.filter).toContain("url(");
    controller.destroy();
  });

  it("aliases setLensPosition(0) to setPosition in single-lens mode", () => {
    const { container, source } = createFixture();
    const controller = createLiquidGlassController({
      container,
      source,
      engine: createTsLiquidGlassEngine(),
    });
    const applies = controller.stats.applyCount;

    controller.setLensPosition(1, { x: 0.9, y: 0.9 });
    flushFrame();
    expect(controller.stats.applyCount).toBe(applies);

    controller.setLensPosition(0, { x: 0.9, y: 0.9 });
    flushFrame();
    expect(controller.stats.applyCount).toBe(applies + 1);
    controller.destroy();
  });

  describe("merged multi-lens mode", () => {
    const MERGED_LENSES = [
      { position: { x: 100, y: 100, unit: "px" as const }, width: 60, height: 60, radius: 20 },
      { position: { x: 160, y: 100, unit: "px" as const }, width: 60, height: 60, radius: 20 },
    ];

    function createMergedFixture() {
      const container = document.createElement("div");
      const source = document.createElement("div");
      const target = document.createElement("div");
      document.body.append(container);
      container.append(source, target);
      mockRect(container);
      mockRect(target);
      return { container, source, target };
    }

    /**
     * Minimal WebGL2-like stub accepted by createWebglGlassRenderer. When a
     * `uniforms` array is passed, named uniform writes are recorded as
     * "uniformNf:u_name=v1,v2" strings for assertions.
     */
    function stubWebgl2(uniforms?: string[]): unknown {
      const noop = () => undefined;
      const recordUniform =
        (name: string) =>
        (location: { name?: string } | null, ...values: number[]) => {
          uniforms?.push(`${name}:${location?.name ?? "?"}=${values.join(",")}`);
        };
      const gl: Record<string, unknown> = {
        createShader: () => ({}),
        shaderSource: noop,
        compileShader: noop,
        getShaderParameter: () => true,
        getShaderInfoLog: () => "",
        deleteShader: noop,
        createProgram: () => ({}),
        attachShader: noop,
        linkProgram: noop,
        getProgramParameter: () => true,
        getProgramInfoLog: () => "",
        deleteProgram: noop,
        createBuffer: () => ({}),
        bindBuffer: noop,
        bufferData: noop,
        deleteBuffer: noop,
        createVertexArray: () => ({}),
        bindVertexArray: noop,
        deleteVertexArray: noop,
        enableVertexAttribArray: noop,
        vertexAttribPointer: noop,
        createTexture: () => ({}),
        bindTexture: noop,
        texParameteri: noop,
        texImage2D: noop,
        deleteTexture: noop,
        pixelStorei: noop,
        activeTexture: noop,
        createFramebuffer: () => ({}),
        bindFramebuffer: noop,
        framebufferTexture2D: noop,
        deleteFramebuffer: noop,
        useProgram: noop,
        getUniformLocation: (_program: unknown, name: string) => ({ name }),
        uniform1i: recordUniform("uniform1i"),
        uniform1f: recordUniform("uniform1f"),
        uniform2f: recordUniform("uniform2f"),
        uniform3f: recordUniform("uniform3f"),
        uniform4f: recordUniform("uniform4f"),
        uniform1fv: noop,
        viewport: noop,
        disable: noop,
        drawArrays: noop,
        clearColor: noop,
        clear: noop,
        isContextLost: () => false,
        getExtension: () => null,
      };
      return gl;
    }

    it("prefers webgl with an image scene even on non-Safari user agents", () => {
      // jsdom's default UA is not Safari; merged mode must still pick WebGL.
      const twoD = { clearRect: vi.fn(), putImageData: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        (type: string) => (type === "webgl2" ? stubWebgl2() : twoD) as never,
      );
      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "auto",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
      });

      expect(controller.stats.activeRenderer).toBe("webgl");
      controller.destroy();
    });

    it("derives chrome uniforms from the tint in the merged webgl path", () => {
      const uniforms: string[] = [];
      const twoD = { clearRect: vi.fn(), putImageData: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        (type: string) => (type === "webgl2" ? stubWebgl2(uniforms) : twoD) as never,
      );
      // A pre-"loaded" image so the second apply actually renders.
      class FakeImage {
        decoding = "";
        src = "";
        currentSrc = "";
        complete = true;
        naturalWidth = 64;
        naturalHeight = 48;
        onload: (() => void) | null = null;
      }
      vi.stubGlobal("Image", FakeImage);

      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "auto",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
        // aqua: background rgba(72, 186, 190, 0.16), border rgba(178, 245,
        // 246, 0.56), highlight alpha 0, highlight position (0.24, -0.2).
        tint: "aqua",
      });
      // The first apply kicks off the image "load"; re-apply to render.
      controller.update({});
      flushFrame();

      expect(controller.stats.activeRenderer).toBe("webgl");
      expect(uniforms).toContain("uniform1i:u_maskMode=1");
      expect(uniforms).toContain(`uniform1f:u_alphaDistRange=${MERGED_ALPHA_DISTANCE_RANGE}`);
      expect(uniforms).toContain(
        `uniform4f:u_tintColor=${72 / 255},${186 / 255},${190 / 255},0.16`,
      );
      expect(uniforms).toContain(
        `uniform4f:u_borderColor=${178 / 255},${245 / 255},${246 / 255},0.56`,
      );
      expect(uniforms).toContain("uniform1f:u_borderWidth=1.5");
      // Preset highlights are transparent → rim strength floored at the
      // subtle-top-rim fallback (0.18).
      expect(uniforms).toContain("uniform1f:u_highlightStrength=0.18");
      // Light direction: element center toward the highlight position,
      // rotated by the preset's highlightRotation (-10°).
      const length = Math.hypot(0.24 - 0.5, -0.2 - 0.5);
      const dir: [number, number] = [(0.24 - 0.5) / length, (-0.2 - 0.5) / length];
      const rad = (-10 * Math.PI) / 180;
      const rotated = [
        dir[0] * Math.cos(rad) - dir[1] * Math.sin(rad),
        dir[0] * Math.sin(rad) + dir[1] * Math.cos(rad),
      ];
      expect(uniforms).toContain(`uniform2f:u_lightDir=${rotated[0]},${rotated[1]}`);
      // Lobe shape from the preset's highlight params.
      expect(uniforms).toContain("uniform1f:u_highlightSpread=0.68");
      expect(uniforms).toContain("uniform1f:u_highlightCore=0.36");
      expect(uniforms).toContain("uniform2f:u_highlightAniso=1.16,0.74");
      // Interior glow: per-lens rects in region px. The merged margin
      // (blend 40 + targetBleed 31 + shadow extent 40 = 111) exceeds the
      // lens bbox min (70, 70), so the region clamps to the container origin
      // and the rect centers equal the raw px lens positions; half size 30.
      expect(uniforms).toContain("uniform1i:u_glassLensCount=2");
      expect(uniforms).toContain("uniform4f:u_glassLensRect[0]=100,100,30,30");
      expect(uniforms).toContain("uniform4f:u_glassLensRect[1]=160,100,30,30");
      // Glow color straight from the preset highlight rgba(221, 255, 255, 0)
      // — transparent, so the glow itself is inert (no MIN_RIM floor here),
      // anchored/sized by the highlight fractions, rotation in radians.
      expect(uniforms).toContain(`uniform4f:u_glowColor=${221 / 255},1,1,0`);
      expect(uniforms).toContain("uniform2f:u_glowAnchor=0.24,-0.2");
      expect(uniforms).toContain("uniform2f:u_glowRadii=1.16,0.74");
      expect(uniforms).toContain(`uniform1f:u_glowRotation=${(-10 * Math.PI) / 180}`);
      // Backdrop saturation from the tint (aqua: 1.22).
      expect(uniforms).toContain("uniform1f:u_saturation=1.22");
      // Drop shadow: aqua shadow rgba(7, 71, 79, 0.28); geometry is the CSS
      // 0 18px 48px scaled so |offset| + blur fits the alpha band.
      expect(uniforms).toContain(
        `uniform4f:u_shadowColor=${7 / 255},${71 / 255},${79 / 255},0.28`,
      );
      const shadowScale = MERGED_ALPHA_DISTANCE_RANGE / (18 + 48);
      expect(uniforms).toContain(`uniform2f:u_shadowOffset=0,${18 * shadowScale}`);
      expect(uniforms).toContain(`uniform1f:u_shadowBlur=${48 * shadowScale}`);
      controller.destroy();
    });

    it("maps a custom tint with an opaque highlight into interior glow uniforms", () => {
      const uniforms: string[] = [];
      const twoD = { clearRect: vi.fn(), putImageData: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        (type: string) => (type === "webgl2" ? stubWebgl2(uniforms) : twoD) as never,
      );
      class FakeImage {
        decoding = "";
        src = "";
        currentSrc = "";
        complete = true;
        naturalWidth = 64;
        naturalHeight = 48;
        onload: (() => void) | null = null;
      }
      vi.stubGlobal("Image", FakeImage);

      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "auto",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
        tint: {
          color: "#6fd7d0",
          highlightColor: "#ffffff",
          highlightOpacity: 1,
          highlightX: 0.24,
          highlightY: -0.2,
          highlightWidth: 1.16,
          highlightHeight: 0.74,
        },
      });
      controller.update({});
      flushFrame();

      expect(controller.stats.activeRenderer).toBe("webgl");
      // Base fill: #6fd7d0 at the default 0.08 opacity.
      expect(uniforms).toContain(
        `uniform4f:u_tintColor=${111 / 255},${215 / 255},${208 / 255},0.08`,
      );
      // Opaque white highlight: glow color carries the full opacity (the rim
      // strength also rides the same alpha, above its 0.18 floor).
      expect(uniforms).toContain("uniform4f:u_glowColor=1,1,1,1");
      expect(uniforms).toContain("uniform1f:u_highlightStrength=1");
      // Anchor above the lens box (0.24, -0.2), radii as box fractions.
      expect(uniforms).toContain("uniform2f:u_glowAnchor=0.24,-0.2");
      expect(uniforms).toContain("uniform2f:u_glowRadii=1.16,0.74");
      // Default rotation (-10°) in radians; stops via core/spread uniforms.
      expect(uniforms).toContain(`uniform1f:u_glowRotation=${(-10 * Math.PI) / 180}`);
      expect(uniforms).toContain("uniform1f:u_highlightCore=0.36");
      expect(uniforms).toContain("uniform1f:u_highlightSpread=0.68");
      // Per-lens rects (region clamps to the container origin; see above).
      expect(uniforms).toContain("uniform1i:u_glassLensCount=2");
      expect(uniforms).toContain("uniform4f:u_glassLensRect[0]=100,100,30,30");
      expect(uniforms).toContain("uniform4f:u_glassLensRect[1]=160,100,30,30");
      controller.destroy();
    });

    it("passes no chrome to the renderer when no tint is set", () => {
      const uniforms: string[] = [];
      const twoD = { clearRect: vi.fn(), putImageData: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        (type: string) => (type === "webgl2" ? stubWebgl2(uniforms) : twoD) as never,
      );
      class FakeImage {
        decoding = "";
        src = "";
        currentSrc = "";
        complete = true;
        naturalWidth = 64;
        naturalHeight = 48;
        onload: (() => void) | null = null;
      }
      vi.stubGlobal("Image", FakeImage);

      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "auto",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
      });
      controller.update({});
      flushFrame();

      expect(uniforms).toContain("uniform1i:u_maskMode=1");
      expect(uniforms).toContain("uniform4f:u_tintColor=0,0,0,0");
      expect(uniforms).toContain("uniform4f:u_borderColor=0,0,0,0");
      // Saturation, shadow, and the interior glow stay inert without a tint
      // (lens rects are still uploaded, but the transparent glow color
      // zeroes the glow term).
      expect(uniforms).toContain("uniform1f:u_saturation=1");
      expect(uniforms).toContain("uniform4f:u_shadowColor=0,0,0,0");
      expect(uniforms).toContain("uniform1f:u_shadowBlur=0");
      expect(uniforms).toContain("uniform4f:u_glowColor=0,0,0,0");
      expect(uniforms).toContain("uniform1i:u_glassLensCount=2");
      controller.destroy();
    });

    it("falls back to the CPU canvas when webgl is unavailable (jsdom default)", () => {
      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "auto",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
      });

      expect(controller.stats.activeRenderer).toBe("canvas");
      expect(target.style.visibility).toBe("hidden");
      controller.destroy();
    });

    it("warns once (dev) and renders only the primary lens without an image scene", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { container, source } = createFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        engine: createTsLiquidGlassEngine(),
        lens: { mapSize: 32 },
        lenses: [
          { position: { x: 0.25, y: 0.5 } },
          { position: { x: 0.75, y: 0.5 } },
        ],
      });

      // Falls back to the single-lens SVG path for the primary lens.
      expect(controller.stats.activeRenderer).toBe("svg");
      expect(source.style.filter).toContain("url(");
      expect(warn).toHaveBeenCalledTimes(1);

      controller.setLensPosition(0, { x: 0.3, y: 0.5 });
      flushFrame();
      expect(warn).toHaveBeenCalledTimes(1);
      controller.destroy();
    });

    it("coalesces setLensPosition into one apply per animation frame", () => {
      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine: createTsLiquidGlassEngine(),
        renderer: "canvas",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        lenses: MERGED_LENSES,
      });
      const applies = controller.stats.applyCount;

      controller.setLensPosition(0, { x: 110, y: 100, unit: "px" });
      controller.setLensPosition(1, { x: 170, y: 100, unit: "px" });
      controller.setLensPosition(0, { x: 112, y: 100, unit: "px" });
      expect(controller.stats.applyCount).toBe(applies);

      flushFrame();
      expect(controller.stats.applyCount).toBe(applies + 1);

      flushFrame();
      expect(controller.stats.applyCount).toBe(applies + 1);
      controller.destroy();
    });

    it("reuses the merged map for group translations and regenerates on relative moves", () => {
      const engine = createTsLiquidGlassEngine();
      const spy = vi.spyOn(engine, "generateMergedDisplacementMap");
      const { container, source, target } = createMergedFixture();
      const controller = createLiquidGlassController({
        container,
        source,
        target,
        mode: "target",
        engine,
        renderer: "canvas",
        sourceImageUrl: "/image.jpg",
        lens: { mapSize: 32 },
        // Small blend keeps the merged region away from the container edges,
        // so translation does not change the (clamped) region size.
        blend: 20,
        lenses: MERGED_LENSES,
      });
      expect(spy).toHaveBeenCalledTimes(1);

      // Both lenses move by the same delta: relative offsets (quantized to
      // 1px) are unchanged, so the cached map is reused.
      controller.setLensPosition(0, { x: 105, y: 103, unit: "px" });
      controller.setLensPosition(1, { x: 165, y: 103, unit: "px" });
      flushFrame();
      expect(spy).toHaveBeenCalledTimes(1);

      // One lens moves relative to the other (>= 1px): regenerate.
      controller.setLensPosition(1, { x: 171, y: 103, unit: "px" });
      flushFrame();
      expect(spy).toHaveBeenCalledTimes(2);
      controller.destroy();
    });
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
