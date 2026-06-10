import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeLensParams } from "../engine/defaults";
import type { DisplacementMap } from "../engine/types";
import { createWebglGlassRenderer, type WebglGlassDrawInput } from "./webgl-renderer";
import {
  BLUR_FRAGMENT_SHADER_SOURCE,
  GLASS_FRAGMENT_SHADER_SOURCE,
  GLASS_VERTEX_SHADER_SOURCE,
  MAX_BLUR_TAPS,
  boxMatchedSigma,
  gaussianBlurKernel,
} from "./webgl-shaders";

/**
 * Minimal hand-rolled WebGL2 stub: records call names so tests can assert the
 * renderer's behavior without a real GL context (jsdom has none).
 */
function createStubGl() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name);
    };
  const constants = [
    "VERTEX_SHADER",
    "FRAGMENT_SHADER",
    "COMPILE_STATUS",
    "LINK_STATUS",
    "ARRAY_BUFFER",
    "STATIC_DRAW",
    "FLOAT",
    "TEXTURE_2D",
    "TEXTURE0",
    "TEXTURE1",
    "TEXTURE_MIN_FILTER",
    "TEXTURE_MAG_FILTER",
    "TEXTURE_WRAP_S",
    "TEXTURE_WRAP_T",
    "LINEAR",
    "CLAMP_TO_EDGE",
    "RGBA",
    "UNSIGNED_BYTE",
    "FRAMEBUFFER",
    "COLOR_ATTACHMENT0",
    "TRIANGLE_STRIP",
    "BLEND",
    "COLOR_BUFFER_BIT",
    "UNPACK_FLIP_Y_WEBGL",
    "UNPACK_PREMULTIPLY_ALPHA_WEBGL",
  ] as const;
  const gl: Record<string, unknown> = {};
  constants.forEach((name, index) => {
    gl[name] = index + 1;
  });
  Object.assign(gl, {
    createShader: () => ({}),
    shaderSource: record("shaderSource"),
    compileShader: record("compileShader"),
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: record("deleteShader"),
    createProgram: () => ({}),
    attachShader: record("attachShader"),
    linkProgram: record("linkProgram"),
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: record("deleteProgram"),
    createBuffer: () => ({}),
    bindBuffer: record("bindBuffer"),
    bufferData: record("bufferData"),
    deleteBuffer: record("deleteBuffer"),
    createVertexArray: () => ({}),
    bindVertexArray: record("bindVertexArray"),
    deleteVertexArray: record("deleteVertexArray"),
    enableVertexAttribArray: record("enableVertexAttribArray"),
    vertexAttribPointer: record("vertexAttribPointer"),
    createTexture: () => ({}),
    bindTexture: record("bindTexture"),
    texParameteri: record("texParameteri"),
    texImage2D: record("texImage2D"),
    deleteTexture: record("deleteTexture"),
    pixelStorei: record("pixelStorei"),
    activeTexture: record("activeTexture"),
    createFramebuffer: () => ({}),
    bindFramebuffer: record("bindFramebuffer"),
    framebufferTexture2D: record("framebufferTexture2D"),
    deleteFramebuffer: record("deleteFramebuffer"),
    useProgram: record("useProgram"),
    getUniformLocation: () => ({}),
    uniform1i: record("uniform1i"),
    uniform1f: record("uniform1f"),
    uniform2f: record("uniform2f"),
    uniform3f: record("uniform3f"),
    uniform1fv: record("uniform1fv"),
    viewport: record("viewport"),
    disable: record("disable"),
    drawArrays: record("drawArrays"),
    clearColor: record("clearColor"),
    clear: record("clear"),
    isContextLost: () => false,
    getExtension: (name: string) =>
      name === "WEBGL_lose_context" ? { loseContext: record("loseContext") } : null,
  });
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function createStubCanvas(gl: WebGL2RenderingContext | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getContext").mockImplementation((type: string) =>
    type === "webgl2" ? (gl as never) : null,
  );
  return canvas;
}

function makeMap(size = 4): DisplacementMap {
  return { width: size, height: size, rgba: new Uint8ClampedArray(size * size * 4).fill(128) };
}

function makeDrawInput(overrides: Partial<WebglGlassDrawInput> = {}): WebglGlassDrawInput {
  const lens = normalizeLensParams({ width: 32, height: 20, radius: 8, mapSize: 16 });
  const scene = document.createElement("canvas");
  scene.width = 64;
  scene.height = 48;
  return {
    scene,
    sceneKey: "scene-a",
    map: makeMap(),
    lens,
    geometry: { left: 10, top: 6, width: lens.width, height: lens.height, radius: lens.radius },
    sceneWidth: 64,
    sceneHeight: 48,
    pixelRatio: 1,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gaussianBlurKernel", () => {
  it("returns an identity kernel for radius 0", () => {
    expect(gaussianBlurKernel(0)).toEqual({ weights: [1], stride: 1, taps: 1 });
  });

  it("produces normalized symmetric weights", () => {
    const kernel = gaussianBlurKernel(6);
    const total = kernel.weights[0] + 2 * kernel.weights.slice(1).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("produces monotonically decreasing weights", () => {
    const kernel = gaussianBlurKernel(8);
    for (let i = 1; i < kernel.weights.length; i += 1) {
      expect(kernel.weights[i]).toBeLessThan(kernel.weights[i - 1]);
    }
  });

  it("never exceeds MAX_BLUR_TAPS, striding for very large blurs", () => {
    const kernel = gaussianBlurKernel(384);
    expect(kernel.taps).toBeLessThanOrEqual(MAX_BLUR_TAPS);
    expect(kernel.weights.length).toBe(kernel.taps);
    expect(kernel.stride).toBeGreaterThan(1);
  });

  it("matches the box-blur variance via boxMatchedSigma", () => {
    // box variance = r(r+1)/3
    expect(boxMatchedSigma(3) ** 2).toBeCloseTo(4, 6);
    expect(boxMatchedSigma(0)).toBe(0);
  });
});

describe("shader sources", () => {
  it("declares the expected uniforms in the glass fragment shader", () => {
    for (const uniform of [
      "u_scene",
      "u_map",
      "u_sceneSize",
      "u_viewportOrigin",
      "u_viewportSize",
      "u_lensOrigin",
      "u_lensSize",
      "u_radius",
      "u_ratio",
      "u_chromaScale",
    ]) {
      expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain(`uniform`);
      expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain(uniform);
    }
    expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain("roundedRectSdf");
    // Specular math matches render-utils specularAlpha.
    expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain("min(0.52, spec * 0.52)");
    // Per-channel chroma sampling of the blurred scene.
    expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain("u_chromaScale.r");
    expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain("u_chromaScale.g");
    expect(GLASS_FRAGMENT_SHADER_SOURCE).toContain("u_chromaScale.b");
  });

  it("declares the blur kernel array sized to MAX_BLUR_TAPS", () => {
    expect(BLUR_FRAGMENT_SHADER_SOURCE).toContain(`u_kernel[${MAX_BLUR_TAPS}]`);
    expect(BLUR_FRAGMENT_SHADER_SOURCE).toContain("u_direction");
    expect(BLUR_FRAGMENT_SHADER_SOURCE).toContain("u_taps");
  });

  it("targets GLSL ES 3.00 (WebGL2)", () => {
    expect(GLASS_VERTEX_SHADER_SOURCE.startsWith("#version 300 es")).toBe(true);
    expect(GLASS_FRAGMENT_SHADER_SOURCE.startsWith("#version 300 es")).toBe(true);
    expect(BLUR_FRAGMENT_SHADER_SOURCE.startsWith("#version 300 es")).toBe(true);
  });
});

describe("createWebglGlassRenderer", () => {
  it("returns null when getContext returns null (jsdom default)", () => {
    const canvas = document.createElement("canvas");
    expect(createWebglGlassRenderer(canvas)).toBeNull();
  });

  it("returns null when getContext returns a non-WebGL2 object", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({
      clearRect: () => undefined,
      putImageData: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    expect(createWebglGlassRenderer(canvas)).toBeNull();
  });

  it("creates a renderer over a WebGL2-like context and draws", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);

    expect(renderer).not.toBeNull();
    renderer?.render(makeDrawInput());

    // Blit + glass passes at minimum (blur 2.4 adds two more).
    expect(calls.filter((name) => name === "drawArrays").length).toBeGreaterThanOrEqual(2);
    // Scene and map textures uploaded.
    expect(calls.filter((name) => name === "texImage2D").length).toBeGreaterThanOrEqual(2);
    renderer?.destroy();
  });

  it("caches the blurred scene by sceneKey and re-blurs when it changes", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);
    const input = makeDrawInput();

    renderer?.render(input);
    const drawsAfterFirst = calls.filter((name) => name === "drawArrays").length;

    renderer?.render(input);
    const drawsAfterSecond = calls.filter((name) => name === "drawArrays").length;
    // Cached: only the glass pass runs again.
    expect(drawsAfterSecond - drawsAfterFirst).toBe(1);

    renderer?.render({ ...input, sceneKey: "scene-b" });
    const drawsAfterThird = calls.filter((name) => name === "drawArrays").length;
    expect(drawsAfterThird - drawsAfterSecond).toBeGreaterThan(1);
    renderer?.destroy();
  });

  it("re-blurs every render when no sceneKey is provided", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);
    const input = makeDrawInput({ sceneKey: undefined });

    renderer?.render(input);
    const drawsAfterFirst = calls.filter((name) => name === "drawArrays").length;
    renderer?.render(input);
    const drawsAfterSecond = calls.filter((name) => name === "drawArrays").length;

    expect(drawsAfterSecond - drawsAfterFirst).toBe(drawsAfterFirst);
    renderer?.destroy();
  });

  it("stops rendering and reports loss after webglcontextlost", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();
    const renderer = createWebglGlassRenderer(canvas, { onContextLost, onContextRestored });

    expect(renderer?.isContextLost()).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(renderer?.isContextLost()).toBe(true);
    expect(onContextLost).toHaveBeenCalledTimes(1);

    const drawsBefore = calls.filter((name) => name === "drawArrays").length;
    renderer?.render(makeDrawInput());
    expect(calls.filter((name) => name === "drawArrays").length).toBe(drawsBefore);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(renderer?.isContextLost()).toBe(false);
    expect(onContextRestored).toHaveBeenCalledTimes(1);
    renderer?.render(makeDrawInput());
    expect(calls.filter((name) => name === "drawArrays").length).toBeGreaterThan(drawsBefore);
    renderer?.destroy();
  });

  it("disposes all GL resources on destroy and is idempotent", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);

    renderer?.destroy();
    expect(calls.filter((name) => name === "deleteProgram").length).toBe(2);
    expect(calls.filter((name) => name === "deleteTexture").length).toBe(4);
    expect(calls.filter((name) => name === "deleteFramebuffer").length).toBe(2);
    expect(calls.filter((name) => name === "deleteBuffer").length).toBe(1);
    expect(calls.filter((name) => name === "deleteVertexArray").length).toBe(1);
    expect(calls.filter((name) => name === "loseContext").length).toBe(1);

    const total = calls.length;
    renderer?.destroy();
    expect(calls.length).toBe(total);
    expect(renderer?.isContextLost()).toBe(true);

    // Render after destroy is a no-op.
    renderer?.render(makeDrawInput());
    expect(calls.length).toBe(total);
  });
});
