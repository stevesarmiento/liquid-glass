import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeLensParams } from "../engine/defaults";
import { clampLensScales } from "../engine/map-slope";
import { MERGED_ALPHA_DISTANCE_RANGE } from "../engine/merged";
import { generateDisplacementMap } from "../engine/ts-engine";
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
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    // Record uniform writes with their target name and values so tests can
    // assert specific uniforms (e.g. u_maskMode, the chrome uniforms).
    uniform1i: recordUniform("uniform1i", calls),
    uniform1f: recordUniform("uniform1f", calls),
    uniform2f: recordUniform("uniform2f", calls),
    uniform3f: recordUniform("uniform3f", calls),
    uniform4f: recordUniform("uniform4f", calls),
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

function recordUniform(name: string, calls: string[]) {
  return (location: { name?: string } | null, ...values: number[]) => {
    calls.push(`${name}:${location?.name ?? "?"}=${values.join(",")}`);
  };
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
      "u_maskMode",
      "u_alphaDistRange",
      "u_tintColor",
      "u_borderColor",
      "u_borderWidth",
      "u_highlightColor",
      "u_highlightStrength",
      "u_lightDir",
      "u_highlightSpread",
      "u_highlightCore",
      "u_highlightAniso",
      "u_glassLensCount",
      "u_glassLensRect",
      "u_glowColor",
      "u_glowAnchor",
      "u_glowRadii",
      "u_glowRotation",
      "u_saturation",
      "u_shadowColor",
      "u_shadowOffset",
      "u_shadowBlur",
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

  it("writes unclamped u_chromaScale for a defaults-look map (no-fold clamp is a no-op)", () => {
    const { gl, calls } = createStubGl();
    const renderer = createWebglGlassRenderer(createStubCanvas(gl));
    const lens = normalizeLensParams();
    const map = generateDisplacementMap(lens);

    renderer?.render(
      makeDrawInput({
        map,
        lens,
        geometry: { left: 0, top: 0, width: lens.width, height: lens.height, radius: lens.radius },
      }),
    );

    const base = Math.max(lens.scaleX, lens.scaleY);
    expect(calls).toContain(
      `uniform3f:u_chromaScale=${base * (1 + 0.2 * lens.chroma)},${base * (1 + 0.1 * lens.chroma)},${base}`,
    );
    renderer?.destroy();
  });

  it("clamps u_chromaScale for a folding lens (no-fold clamp)", () => {
    const { gl, calls } = createStubGl();
    const renderer = createWebglGlassRenderer(createStubCanvas(gl));
    const lens = normalizeLensParams({ width: 36, height: 22, radius: 11, mapSize: 128 });
    const map = generateDisplacementMap(lens);

    renderer?.render(
      makeDrawInput({
        map,
        lens,
        geometry: { left: 0, top: 0, width: lens.width, height: lens.height, radius: lens.radius },
      }),
    );

    const clamped = clampLensScales(map, lens, { strength: 1 });
    expect(clamped.scaleX).toBeLessThan(lens.scaleX);
    const base = Math.max(clamped.scaleX, clamped.scaleY);
    expect(calls).toContain(
      `uniform3f:u_chromaScale=${base * (1 + 0.2 * lens.chroma)},${base * (1 + 0.1 * lens.chroma)},${base}`,
    );
    renderer?.destroy();
  });

  it("sets u_maskMode to 1 for map coverage and 0 for the rect mask", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);

    // Non-square merged map: upload path uses map.width/height directly.
    const map: DisplacementMap = {
      width: 8,
      height: 4,
      rgba: new Uint8ClampedArray(8 * 4 * 4).fill(128),
    };
    renderer?.render(makeDrawInput({ map, maskMode: "map" }));
    expect(calls).toContain("uniform1i:u_maskMode=1");

    renderer?.render(makeDrawInput());
    expect(calls).toContain("uniform1i:u_maskMode=0");
    renderer?.destroy();
  });

  it("sets the chrome uniforms from the draw input in map mode", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);

    renderer?.render(
      makeDrawInput({
        maskMode: "map",
        alphaDistRange: 24,
        lensRects: [
          { x: 30, y: 40, halfW: 30, halfH: 30 },
          { x: 90, y: 40, halfW: 20, halfH: 25 },
        ],
        chrome: {
          tint: [0.1, 0.2, 0.3, 0.4],
          border: [0.5, 0.6, 0.7, 0.8],
          borderWidth: 1.5,
          highlight: [1, 0.9, 0.8],
          highlightStrength: 0.35,
          lightDir: [0, -1],
          highlightSpread: 0.68,
          highlightCore: 0.36,
          highlightAniso: [1.16, 0.74],
          glowColor: [1, 0.95, 0.9, 0.62],
          glowAnchor: [0.24, -0.2],
          glowRadii: [1.16, 0.74],
          glowRotation: -0.1745,
          saturation: 1.22,
          shadowColor: [0, 0.1, 0.2, 0.28],
          shadowOffset: [0, 11],
          shadowBlur: 29,
        },
      }),
    );

    expect(calls).toContain("uniform1i:u_maskMode=1");
    expect(calls).toContain("uniform1f:u_alphaDistRange=24");
    expect(calls).toContain("uniform4f:u_tintColor=0.1,0.2,0.3,0.4");
    expect(calls).toContain("uniform4f:u_borderColor=0.5,0.6,0.7,0.8");
    expect(calls).toContain("uniform1f:u_borderWidth=1.5");
    expect(calls).toContain("uniform3f:u_highlightColor=1,0.9,0.8");
    expect(calls).toContain("uniform1f:u_highlightStrength=0.35");
    expect(calls).toContain("uniform2f:u_lightDir=0,-1");
    expect(calls).toContain("uniform1f:u_highlightSpread=0.68");
    expect(calls).toContain("uniform1f:u_highlightCore=0.36");
    expect(calls).toContain("uniform2f:u_highlightAniso=1.16,0.74");
    // Interior glow: per-lens rects (center + half size) and glow params.
    expect(calls).toContain("uniform1i:u_glassLensCount=2");
    expect(calls).toContain("uniform4f:u_glassLensRect[0]=30,40,30,30");
    expect(calls).toContain("uniform4f:u_glassLensRect[1]=90,40,20,25");
    expect(calls).toContain("uniform4f:u_glassLensRect[2]=0,0,0,0");
    expect(calls).toContain("uniform4f:u_glassLensRect[3]=0,0,0,0");
    expect(calls).toContain("uniform4f:u_glowColor=1,0.95,0.9,0.62");
    expect(calls).toContain("uniform2f:u_glowAnchor=0.24,-0.2");
    expect(calls).toContain("uniform2f:u_glowRadii=1.16,0.74");
    expect(calls).toContain("uniform1f:u_glowRotation=-0.1745");
    expect(calls).toContain("uniform1f:u_saturation=1.22");
    expect(calls).toContain("uniform4f:u_shadowColor=0,0.1,0.2,0.28");
    expect(calls).toContain("uniform2f:u_shadowOffset=0,11");
    expect(calls).toContain("uniform1f:u_shadowBlur=29");
    renderer?.destroy();
  });

  it("defaults chrome uniforms to inert no-ops in rect mode", () => {
    const { gl, calls } = createStubGl();
    const canvas = createStubCanvas(gl);
    const renderer = createWebglGlassRenderer(canvas);

    renderer?.render(makeDrawInput());

    expect(calls).toContain("uniform1i:u_maskMode=0");
    // Zero alphas / zero strength / saturation 1 make the chrome a no-op in
    // the shader (the rect-mask output stays bit-identical to pre-chrome).
    expect(calls).toContain(`uniform1f:u_alphaDistRange=${MERGED_ALPHA_DISTANCE_RANGE}`);
    expect(calls).toContain("uniform4f:u_tintColor=0,0,0,0");
    expect(calls).toContain("uniform4f:u_borderColor=0,0,0,0");
    expect(calls).toContain("uniform1f:u_borderWidth=0");
    expect(calls).toContain("uniform1f:u_highlightStrength=0");
    expect(calls).toContain("uniform2f:u_lightDir=0,-1");
    expect(calls).toContain("uniform1f:u_highlightSpread=0");
    expect(calls).toContain("uniform1f:u_highlightCore=0");
    expect(calls).toContain("uniform2f:u_highlightAniso=1,1");
    // Interior glow stays inert: no lens rects, transparent glow color.
    expect(calls).toContain("uniform1i:u_glassLensCount=0");
    expect(calls).toContain("uniform4f:u_glassLensRect[0]=0,0,0,0");
    expect(calls).toContain("uniform4f:u_glowColor=0,0,0,0");
    expect(calls).toContain("uniform2f:u_glowAnchor=0.5,0.5");
    expect(calls).toContain("uniform2f:u_glowRadii=1,1");
    expect(calls).toContain("uniform1f:u_glowRotation=0");
    expect(calls).toContain("uniform1f:u_saturation=1");
    expect(calls).toContain("uniform4f:u_shadowColor=0,0,0,0");
    expect(calls).toContain("uniform2f:u_shadowOffset=0,0");
    expect(calls).toContain("uniform1f:u_shadowBlur=0");
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
