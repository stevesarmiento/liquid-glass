import { MERGED_ALPHA_DISTANCE_RANGE } from "../engine/merged";
import type { DisplacementMap, LensParams } from "../engine/types";
import { CANVAS_STRENGTH } from "./render-utils";
import {
  BLUR_FRAGMENT_SHADER_SOURCE,
  GLASS_FRAGMENT_SHADER_SOURCE,
  GLASS_VERTEX_SHADER_SOURCE,
  gaussianBlurKernel,
  type GaussianBlurKernel,
} from "./webgl-shaders";

/**
 * GPU renderer for the glass lens. Mirrors the CPU canvas path
 * (controller.ts / local-canvas.ts) pixel math on the GPU:
 *
 * - the displacement map is uploaded as an RGBA texture (LINEAR,
 *   CLAMP_TO_EDGE) and decoded exactly like `sampleGlassChannel`
 * - the scene is blurred with a two-pass separable Gaussian into intermediate
 *   FBOs (the CPU path uses a single box blur; the Gaussian is
 *   variance-matched via `boxMatchedSigma`, which looks slightly smoother)
 * - the blurred scene is cached keyed by `sceneKey` + size + blur, like the
 *   CPU path caches blurred pixels
 *
 * The module makes no DOM assumptions beyond the canvas it is given, so it is
 * SSR-safe to import (no GL or window access at module scope).
 */

export type WebglGlassSceneSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** Lens rectangle in CSS units, in scene coordinates. */
export interface WebglGlassLensRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

/** Output rectangle in CSS units, in scene coordinates. */
export interface WebglGlassViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Glass "chrome" drawn by the shader from the merged blob SDF (maskMode
 * "map" only): backdrop saturation, tint fill, per-lens interior highlight
 * glow, border band, rim highlight, and a drop shadow composited under the
 * blob. Colors are straight
 * (non-premultiplied) 0..1 RGBA floats. The optional fields default to inert
 * values (saturation 1, transparent shadow, round wide lobe).
 */
export interface WebglGlassChrome {
  /** Fill composited src-over the refracted scene inside the blob. */
  tint: [number, number, number, number];
  /** Border band color. */
  border: [number, number, number, number];
  /** Border band width in CSS px, inward from the blob edge. */
  borderWidth: number;
  /** Rim highlight color the border blends toward on the lit side. */
  highlight: [number, number, number];
  /** 0..1 rim highlight intensity (0 disables the rim entirely). */
  highlightStrength: number;
  /** CSS-space unit vector toward the light; (0, -1) is light from above. */
  lightDir: [number, number];
  /** ~0..1 angular width of the rim lobe (wider = lower exponent). Default 0. */
  highlightSpread?: number;
  /** 0..1 tight boosted core lobe mixed into the rim peak. Default 0. */
  highlightCore?: number;
  /**
   * Anisotropic stretch of the rim lobe (highlight width/height fractions);
   * [1, 1] keeps it round. Default [1, 1].
   */
  highlightAniso?: [number, number];
  /**
   * Interior highlight glow color (straight RGBA, opacity baked into alpha).
   * Drawn per lens (`lensRects`) src-over the tint fill, under the border —
   * the CSS chrome's radial-gradient background layer + blurred `::before`
   * hot-spot. Alpha 0 (default) disables the glow.
   */
  glowColor?: [number, number, number, number];
  /**
   * Glow gradient anchor as fractions of each lens box (can be negative /
   * out of box, e.g. [0.24, -0.2] anchors above the lens). Default [0.5, 0.5].
   */
  glowAnchor?: [number, number];
  /** Glow gradient radii as fractions of the lens width/height. Default [1, 1]. */
  glowRadii?: [number, number];
  /** Hot-spot rotation in radians (CSS clockwise). Default 0. */
  glowRotation?: number;
  /** Backdrop saturation applied inside the blob; 1 (default) is a no-op. */
  saturation?: number;
  /**
   * Uniform brightness lift inside the blob, 0..1 toward white — press
   * illumination ("the light turns on"). Evaluated inside the blob mask, so
   * it morphs with the deformed glass. Default 0 (no-op).
   */
  innerBrightness?: number;
  /**
   * Pointer-anchored interior light (straight RGBA, alpha = strength).
   * Radial falloff around `innerLightPos`, clipped by the blob — the glass
   * knows where the light source is. Alpha 0 (default) disables it.
   */
  innerLight?: [number, number, number, number];
  /** Interior light center in region CSS px. Default [0, 0]. */
  innerLightPos?: [number, number];
  /** Interior light falloff radius in CSS px. Default 110. */
  innerLightRadius?: number;
  /** Drop shadow color; alpha 0 (default) disables the shadow. */
  shadowColor?: [number, number, number, number];
  /**
   * Shadow offset in CSS px. |offset| + blur must stay within the map's
   * alpha-band range (alphaDistRange) or the shadow clips to a hard ring.
   */
  shadowOffset?: [number, number];
  /** Shadow fade distance past the blob edge, in CSS px. */
  shadowBlur?: number;
}

export interface WebglGlassDrawInput {
  /** Image, canvas, or bitmap holding the scene behind the lens. */
  scene: WebglGlassSceneSource;
  /**
   * Cache key for the blurred scene (should capture the scene content
   * identity). Omit for mutable canvases to re-upload and re-blur each frame;
   * blur radius and scene size are folded into cache validity automatically.
   */
  sceneKey?: string;
  map: DisplacementMap;
  /** Normalized lens params (see normalizeLensParams). */
  lens: LensParams;
  geometry: WebglGlassLensRect;
  /** Scene size in CSS units. */
  sceneWidth: number;
  sceneHeight: number;
  /** Output rect in scene CSS coordinates; defaults to the full scene. */
  viewport?: WebglGlassViewport;
  /**
   * How the scene source maps onto the scene rect: "cover" replicates the CPU
   * path's cover-fit with blur bleed (default for images), "fill" stretches
   * (default for canvases/bitmaps already drawn at scene size).
   */
  fit?: "cover" | "fill";
  pixelRatio?: number;
  strength?: number;
  /**
   * "rect" (default) masks the output with the rounded-rect SDF of
   * `geometry`. "map" decodes a signed distance from the displacement map's
   * alpha channel instead — used for merged multi-lens (metaball) maps,
   * whose alpha encodes an SDF band and whose `geometry` is the merged
   * region rect.
   */
  maskMode?: "rect" | "map";
  /**
   * Chrome (saturation + tint fill + border + rim highlight + drop shadow)
   * drawn from the merged blob SDF. Only takes effect with maskMode "map";
   * omitted = no chrome.
   */
  chrome?: WebglGlassChrome;
  /**
   * Per-lens rects (center + half size, in region px relative to
   * `geometry`'s top-left) the interior glow is anchored to. Up to 4 entries
   * (extra entries are ignored); only takes effect with maskMode "map" and a
   * chrome whose `glowColor` alpha is > 0.
   */
  lensRects?: Array<{ x: number; y: number; halfW: number; halfH: number }>;
  /**
   * Half-range (px) of the signed-distance band encoded in the map's alpha
   * channel. Defaults to the engine's MERGED_ALPHA_DISTANCE_RANGE.
   */
  alphaDistRange?: number;
}

export interface WebglGlassRendererOptions {
  /** Overrides window.devicePixelRatio (clamped to [1, 3]). */
  pixelRatio?: number;
  /** Called when the GL context is lost; callers should fall back to CPU. */
  onContextLost?: () => void;
  /** Called when the GL context is restored and resources were rebuilt. */
  onContextRestored?: () => void;
}

export interface WebglGlassRenderer {
  readonly canvas: HTMLCanvasElement;
  isContextLost(): boolean;
  render(input: WebglGlassDrawInput): void;
  clear(): void;
  destroy(): void;
}

const COPY_KERNEL: GaussianBlurKernel = { weights: [1], stride: 1, taps: 1 };

const REQUIRED_GL_METHODS = [
  "createShader",
  "shaderSource",
  "compileShader",
  "createProgram",
  "attachShader",
  "linkProgram",
  "createTexture",
  "bindTexture",
  "texImage2D",
  "texParameteri",
  "createFramebuffer",
  "bindFramebuffer",
  "framebufferTexture2D",
  "createBuffer",
  "bindBuffer",
  "bufferData",
  "createVertexArray",
  "bindVertexArray",
  "enableVertexAttribArray",
  "vertexAttribPointer",
  "getUniformLocation",
  "useProgram",
  "uniform1fv",
  "viewport",
  "drawArrays",
] as const;

interface BlurUniforms {
  source: WebGLUniformLocation | null;
  uvScale: WebGLUniformLocation | null;
  uvOffset: WebGLUniformLocation | null;
  direction: WebGLUniformLocation | null;
  kernel: WebGLUniformLocation | null;
  taps: WebGLUniformLocation | null;
}

interface GlassUniforms {
  scene: WebGLUniformLocation | null;
  map: WebGLUniformLocation | null;
  sceneSize: WebGLUniformLocation | null;
  viewportOrigin: WebGLUniformLocation | null;
  viewportSize: WebGLUniformLocation | null;
  lensOrigin: WebGLUniformLocation | null;
  lensSize: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  ratio: WebGLUniformLocation | null;
  chromaScale: WebGLUniformLocation | null;
  maskMode: WebGLUniformLocation | null;
  alphaDistRange: WebGLUniformLocation | null;
  tintColor: WebGLUniformLocation | null;
  borderColor: WebGLUniformLocation | null;
  borderWidth: WebGLUniformLocation | null;
  highlightColor: WebGLUniformLocation | null;
  highlightStrength: WebGLUniformLocation | null;
  lightDir: WebGLUniformLocation | null;
  highlightSpread: WebGLUniformLocation | null;
  highlightCore: WebGLUniformLocation | null;
  highlightAniso: WebGLUniformLocation | null;
  glassLensCount: WebGLUniformLocation | null;
  glassLensRect: Array<WebGLUniformLocation | null>;
  glowColor: WebGLUniformLocation | null;
  glowAnchor: WebGLUniformLocation | null;
  glowRadii: WebGLUniformLocation | null;
  glowRotation: WebGLUniformLocation | null;
  saturation: WebGLUniformLocation | null;
  innerBrightness: WebGLUniformLocation | null;
  innerLight: WebGLUniformLocation | null;
  innerLightPos: WebGLUniformLocation | null;
  innerLightRadius: WebGLUniformLocation | null;
  shadowColor: WebGLUniformLocation | null;
  shadowOffset: WebGLUniformLocation | null;
  shadowBlur: WebGLUniformLocation | null;
}

interface GlResources {
  blurProgram: WebGLProgram;
  glassProgram: WebGLProgram;
  blurUniforms: BlurUniforms;
  glassUniforms: GlassUniforms;
  quadBuffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  sourceTexture: WebGLTexture;
  mapTexture: WebGLTexture;
  /** The blurred scene lives here after prepareBlurredScene. */
  pingTexture: WebGLTexture;
  pongTexture: WebGLTexture;
  pingFbo: WebGLFramebuffer;
  pongFbo: WebGLFramebuffer;
  fboWidth: number;
  fboHeight: number;
  cache: {
    sceneKey: string | null;
    sceneWidth: number;
    sceneHeight: number;
    blurRadiusPx: number;
    map: DisplacementMap | null;
  };
}

export function createWebglGlassRenderer(
  canvas: HTMLCanvasElement,
  options: WebglGlassRendererOptions = {},
): WebglGlassRenderer | null {
  const gl = getWebgl2Context(canvas);
  if (!gl) return null;

  let destroyed = false;
  let contextLost = false;
  let resources: GlResources | null = null;
  const loseContextExt = safeGetLoseContextExtension(gl);

  const onContextLost = (event: Event): void => {
    event.preventDefault?.();
    contextLost = true;
    // All GL objects are invalid after a loss; drop them so a restore rebuilds.
    resources = null;
    options.onContextLost?.();
  };
  const onContextRestored = (): void => {
    if (destroyed) return;
    try {
      resources = createResources(gl);
      contextLost = false;
    } catch {
      contextLost = true;
      resources = null;
    }
    if (!contextLost) options.onContextRestored?.();
  };

  canvas.addEventListener("webglcontextlost", onContextLost, false);
  canvas.addEventListener("webglcontextrestored", onContextRestored, false);

  try {
    resources = createResources(gl);
  } catch {
    canvas.removeEventListener("webglcontextlost", onContextLost, false);
    canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
    return null;
  }

  return {
    canvas,
    isContextLost() {
      return contextLost || destroyed;
    },
    render(input) {
      if (destroyed || contextLost || !resources) return;
      if (typeof gl.isContextLost === "function" && gl.isContextLost()) {
        contextLost = true;
        return;
      }
      const r = resources;
      const pixelRatio = clampPixelRatio(input.pixelRatio ?? options.pixelRatio ?? defaultPixelRatio());
      const sceneW = Math.max(1, Math.round(input.sceneWidth * pixelRatio));
      const sceneH = Math.max(1, Math.round(input.sceneHeight * pixelRatio));
      const viewport = input.viewport ?? {
        left: 0,
        top: 0,
        width: input.sceneWidth,
        height: input.sceneHeight,
      };
      const outW = Math.max(1, Math.round(viewport.width * pixelRatio));
      const outH = Math.max(1, Math.round(viewport.height * pixelRatio));
      if (canvas.width !== outW || canvas.height !== outH) {
        canvas.width = outW;
        canvas.height = outH;
      }

      // Match the CPU path: blur radius in device pixels.
      const blurRadiusPx = Math.round(Math.max(0, input.lens.blur) * pixelRatio);
      const sceneKey = input.sceneKey ?? null;
      const cacheValid =
        sceneKey !== null &&
        r.cache.sceneKey === sceneKey &&
        r.cache.sceneWidth === sceneW &&
        r.cache.sceneHeight === sceneH &&
        r.cache.blurRadiusPx === blurRadiusPx;
      if (!cacheValid) {
        prepareBlurredScene(gl, r, input, sceneW, sceneH, blurRadiusPx, pixelRatio);
        r.cache.sceneKey = sceneKey;
        r.cache.sceneWidth = sceneW;
        r.cache.sceneHeight = sceneH;
        r.cache.blurRadiusPx = blurRadiusPx;
      }

      if (r.cache.map !== input.map) {
        uploadMapTexture(gl, r.mapTexture, input.map);
        r.cache.map = input.map;
      }

      drawGlassPass(gl, r, input, viewport, outW, outH);
    },
    clear() {
      if (destroyed || contextLost || !resources) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener("webglcontextlost", onContextLost, false);
      canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
      if (resources) {
        deleteResources(gl, resources);
        resources = null;
      }
      try {
        loseContextExt?.loseContext();
      } catch {
        // Already lost — nothing to release.
      }
    },
  };
}

function getWebgl2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  if (typeof canvas.getContext !== "function") return null;
  let gl: unknown = null;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }
  return isWebgl2Like(gl) ? (gl as WebGL2RenderingContext) : null;
}

/**
 * Validates that the returned object actually looks like a WebGL2 context.
 * jsdom and canvas mocks can return null or 2D-ish stubs for "webgl2".
 */
function isWebgl2Like(gl: unknown): boolean {
  if (!gl || typeof gl !== "object") return false;
  const candidate = gl as Record<string, unknown>;
  return REQUIRED_GL_METHODS.every((method) => typeof candidate[method] === "function");
}

function safeGetLoseContextExtension(gl: WebGL2RenderingContext): { loseContext(): void } | null {
  try {
    return (gl.getExtension?.("WEBGL_lose_context") as { loseContext(): void } | null) ?? null;
  } catch {
    return null;
  }
}

function createResources(gl: WebGL2RenderingContext): GlResources {
  const blurProgram = createProgram(gl, GLASS_VERTEX_SHADER_SOURCE, BLUR_FRAGMENT_SHADER_SOURCE);
  let glassProgram: WebGLProgram;
  try {
    glassProgram = createProgram(gl, GLASS_VERTEX_SHADER_SOURCE, GLASS_FRAGMENT_SHADER_SOURCE);
  } catch (error) {
    gl.deleteProgram(blurProgram);
    throw error;
  }

  const quadBuffer = requireResource(gl.createBuffer(), "buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const vao = requireResource(gl.createVertexArray(), "vertex array");
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const sourceTexture = createLinearTexture(gl);
  const mapTexture = createLinearTexture(gl);
  const pingTexture = createLinearTexture(gl);
  const pongTexture = createLinearTexture(gl);

  const pingFbo = requireResource(gl.createFramebuffer(), "framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, pingFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pingTexture, 0);
  const pongFbo = requireResource(gl.createFramebuffer(), "framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, pongFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pongTexture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    blurProgram,
    glassProgram,
    blurUniforms: {
      source: gl.getUniformLocation(blurProgram, "u_source"),
      uvScale: gl.getUniformLocation(blurProgram, "u_uvScale"),
      uvOffset: gl.getUniformLocation(blurProgram, "u_uvOffset"),
      direction: gl.getUniformLocation(blurProgram, "u_direction"),
      kernel: gl.getUniformLocation(blurProgram, "u_kernel"),
      taps: gl.getUniformLocation(blurProgram, "u_taps"),
    },
    glassUniforms: {
      scene: gl.getUniformLocation(glassProgram, "u_scene"),
      map: gl.getUniformLocation(glassProgram, "u_map"),
      sceneSize: gl.getUniformLocation(glassProgram, "u_sceneSize"),
      viewportOrigin: gl.getUniformLocation(glassProgram, "u_viewportOrigin"),
      viewportSize: gl.getUniformLocation(glassProgram, "u_viewportSize"),
      lensOrigin: gl.getUniformLocation(glassProgram, "u_lensOrigin"),
      lensSize: gl.getUniformLocation(glassProgram, "u_lensSize"),
      radius: gl.getUniformLocation(glassProgram, "u_radius"),
      ratio: gl.getUniformLocation(glassProgram, "u_ratio"),
      chromaScale: gl.getUniformLocation(glassProgram, "u_chromaScale"),
      maskMode: gl.getUniformLocation(glassProgram, "u_maskMode"),
      alphaDistRange: gl.getUniformLocation(glassProgram, "u_alphaDistRange"),
      tintColor: gl.getUniformLocation(glassProgram, "u_tintColor"),
      borderColor: gl.getUniformLocation(glassProgram, "u_borderColor"),
      borderWidth: gl.getUniformLocation(glassProgram, "u_borderWidth"),
      highlightColor: gl.getUniformLocation(glassProgram, "u_highlightColor"),
      highlightStrength: gl.getUniformLocation(glassProgram, "u_highlightStrength"),
      lightDir: gl.getUniformLocation(glassProgram, "u_lightDir"),
      highlightSpread: gl.getUniformLocation(glassProgram, "u_highlightSpread"),
      highlightCore: gl.getUniformLocation(glassProgram, "u_highlightCore"),
      highlightAniso: gl.getUniformLocation(glassProgram, "u_highlightAniso"),
      glassLensCount: gl.getUniformLocation(glassProgram, "u_glassLensCount"),
      glassLensRect: [0, 1, 2, 3].map((i) =>
        gl.getUniformLocation(glassProgram, `u_glassLensRect[${i}]`),
      ),
      glowColor: gl.getUniformLocation(glassProgram, "u_glowColor"),
      glowAnchor: gl.getUniformLocation(glassProgram, "u_glowAnchor"),
      glowRadii: gl.getUniformLocation(glassProgram, "u_glowRadii"),
      glowRotation: gl.getUniformLocation(glassProgram, "u_glowRotation"),
      saturation: gl.getUniformLocation(glassProgram, "u_saturation"),
      innerBrightness: gl.getUniformLocation(glassProgram, "u_innerBrightness"),
      innerLight: gl.getUniformLocation(glassProgram, "u_innerLight"),
      innerLightPos: gl.getUniformLocation(glassProgram, "u_innerLightPos"),
      innerLightRadius: gl.getUniformLocation(glassProgram, "u_innerLightRadius"),
      shadowColor: gl.getUniformLocation(glassProgram, "u_shadowColor"),
      shadowOffset: gl.getUniformLocation(glassProgram, "u_shadowOffset"),
      shadowBlur: gl.getUniformLocation(glassProgram, "u_shadowBlur"),
    },
    quadBuffer,
    vao,
    sourceTexture,
    mapTexture,
    pingTexture,
    pongTexture,
    pingFbo,
    pongFbo,
    fboWidth: 0,
    fboHeight: 0,
    cache: { sceneKey: null, sceneWidth: 0, sceneHeight: 0, blurRadiusPx: -1, map: null },
  };
}

function deleteResources(gl: WebGL2RenderingContext, r: GlResources): void {
  try {
    gl.deleteProgram(r.blurProgram);
    gl.deleteProgram(r.glassProgram);
    gl.deleteBuffer(r.quadBuffer);
    gl.deleteVertexArray(r.vao);
    gl.deleteTexture(r.sourceTexture);
    gl.deleteTexture(r.mapTexture);
    gl.deleteTexture(r.pingTexture);
    gl.deleteTexture(r.pongTexture);
    gl.deleteFramebuffer(r.pingFbo);
    gl.deleteFramebuffer(r.pongFbo);
  } catch {
    // Deleting on a lost context is a no-op; ignore.
  }
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  } catch (error) {
    gl.deleteShader(vertex);
    throw error;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("createProgram failed");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (
    typeof gl.getProgramParameter === "function" &&
    !gl.getProgramParameter(program, gl.LINK_STATUS) &&
    !(typeof gl.isContextLost === "function" && gl.isContextLost())
  ) {
    const log = gl.getProgramInfoLog?.(program) ?? "";
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (
    typeof gl.getShaderParameter === "function" &&
    !gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
    !(typeof gl.isContextLost === "function" && gl.isContextLost())
  ) {
    const log = gl.getShaderInfoLog?.(shader) ?? "";
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createLinearTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = requireResource(gl.createTexture(), "texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function requireResource<T>(resource: T | null, label: string): T {
  if (!resource) throw new Error(`Could not create WebGL ${label}`);
  return resource;
}

function prepareBlurredScene(
  gl: WebGL2RenderingContext,
  r: GlResources,
  input: WebglGlassDrawInput,
  sceneW: number,
  sceneH: number,
  blurRadiusPx: number,
  pixelRatio: number,
): void {
  // Upload the raw scene source.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, r.sourceTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.scene);

  // (Re)allocate the ping/pong scene framebuffers when the size changes.
  if (r.fboWidth !== sceneW || r.fboHeight !== sceneH) {
    for (const texture of [r.pingTexture, r.pongTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sceneW, sceneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    r.fboWidth = sceneW;
    r.fboHeight = sceneH;
  }

  const fit = input.fit ?? (isImageElement(input.scene) ? "cover" : "fill");
  // Match the CPU path's drawCoverImage bleed: blur (CSS) * pixelRatio.
  const fitTransform = computeFitTransform(
    fit,
    sceneSourceSize(input.scene),
    sceneW,
    sceneH,
    Math.max(0, input.lens.blur) * pixelRatio,
  );

  gl.useProgram(r.blurProgram);
  gl.bindVertexArray(r.vao);
  gl.disable(gl.BLEND);

  // Pass 0: fit-blit the source into the scene-sized ping buffer.
  runBlurPass(gl, r, {
    sourceTexture: r.sourceTexture,
    targetFbo: r.pingFbo,
    width: sceneW,
    height: sceneH,
    uvScale: fitTransform.uvScale,
    uvOffset: fitTransform.uvOffset,
    direction: [0, 0],
    kernel: COPY_KERNEL,
  });

  if (blurRadiusPx > 0) {
    const kernel = gaussianBlurKernel(blurRadiusPx);
    // Pass 1: horizontal blur ping -> pong.
    runBlurPass(gl, r, {
      sourceTexture: r.pingTexture,
      targetFbo: r.pongFbo,
      width: sceneW,
      height: sceneH,
      uvScale: [1, 1],
      uvOffset: [0, 0],
      direction: [kernel.stride / sceneW, 0],
      kernel,
    });
    // Pass 2: vertical blur pong -> ping (blurred scene ends in ping).
    runBlurPass(gl, r, {
      sourceTexture: r.pongTexture,
      targetFbo: r.pingFbo,
      width: sceneW,
      height: sceneH,
      uvScale: [1, 1],
      uvOffset: [0, 0],
      direction: [0, kernel.stride / sceneH],
      kernel,
    });
  }
}

interface BlurPass {
  sourceTexture: WebGLTexture;
  targetFbo: WebGLFramebuffer;
  width: number;
  height: number;
  uvScale: [number, number];
  uvOffset: [number, number];
  direction: [number, number];
  kernel: GaussianBlurKernel;
}

function runBlurPass(gl: WebGL2RenderingContext, r: GlResources, pass: BlurPass): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, pass.targetFbo);
  gl.viewport(0, 0, pass.width, pass.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pass.sourceTexture);
  gl.uniform1i(r.blurUniforms.source, 0);
  gl.uniform2f(r.blurUniforms.uvScale, pass.uvScale[0], pass.uvScale[1]);
  gl.uniform2f(r.blurUniforms.uvOffset, pass.uvOffset[0], pass.uvOffset[1]);
  gl.uniform2f(r.blurUniforms.direction, pass.direction[0], pass.direction[1]);
  gl.uniform1fv(r.blurUniforms.kernel, Float32Array.from(pass.kernel.weights));
  gl.uniform1i(r.blurUniforms.taps, pass.kernel.taps);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function uploadMapTexture(gl: WebGL2RenderingContext, texture: WebGLTexture, map: DisplacementMap): void {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    map.width,
    map.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(map.rgba.buffer, map.rgba.byteOffset, map.rgba.byteLength),
  );
}

function drawGlassPass(
  gl: WebGL2RenderingContext,
  r: GlResources,
  input: WebglGlassDrawInput,
  viewport: WebglGlassViewport,
  outW: number,
  outH: number,
): void {
  const lens = input.lens;
  const rawBaseScale = Math.max(lens.scaleX, lens.scaleY);
  const baseScale = rawBaseScale * (input.strength ?? CANVAS_STRENGTH);
  const ratioX = rawBaseScale > 0 ? lens.scaleX / rawBaseScale : 0;
  const ratioY = rawBaseScale > 0 ? lens.scaleY / rawBaseScale : 0;
  const geometry = input.geometry;
  const radius = Math.max(0, Math.min(geometry.radius, geometry.width / 2, geometry.height / 2));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, outW, outH);
  gl.disable(gl.BLEND);
  gl.useProgram(r.glassProgram);
  gl.bindVertexArray(r.vao);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, r.pingTexture);
  gl.uniform1i(r.glassUniforms.scene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, r.mapTexture);
  gl.uniform1i(r.glassUniforms.map, 1);

  gl.uniform2f(r.glassUniforms.sceneSize, Math.max(1e-6, input.sceneWidth), Math.max(1e-6, input.sceneHeight));
  gl.uniform2f(r.glassUniforms.viewportOrigin, viewport.left, viewport.top);
  gl.uniform2f(r.glassUniforms.viewportSize, viewport.width, viewport.height);
  gl.uniform2f(r.glassUniforms.lensOrigin, geometry.left, geometry.top);
  gl.uniform2f(r.glassUniforms.lensSize, Math.max(1e-6, geometry.width), Math.max(1e-6, geometry.height));
  gl.uniform1f(r.glassUniforms.radius, radius);
  gl.uniform2f(r.glassUniforms.ratio, ratioX, ratioY);
  gl.uniform3f(
    r.glassUniforms.chromaScale,
    baseScale * (1 + 0.2 * lens.chroma),
    baseScale * (1 + 0.1 * lens.chroma),
    baseScale,
  );
  gl.uniform1i(r.glassUniforms.maskMode, input.maskMode === "map" ? 1 : 0);

  // Chrome uniforms: zero alphas / zero strength are exact no-ops in the
  // shader, so the rect-mask path stays byte-identical to the pre-chrome one.
  const chrome = input.chrome;
  gl.uniform1f(r.glassUniforms.alphaDistRange, input.alphaDistRange ?? MERGED_ALPHA_DISTANCE_RANGE);
  const tint = chrome?.tint ?? [0, 0, 0, 0];
  gl.uniform4f(r.glassUniforms.tintColor, tint[0], tint[1], tint[2], tint[3]);
  const border = chrome?.border ?? [0, 0, 0, 0];
  gl.uniform4f(r.glassUniforms.borderColor, border[0], border[1], border[2], border[3]);
  gl.uniform1f(r.glassUniforms.borderWidth, chrome?.borderWidth ?? 0);
  const highlight = chrome?.highlight ?? [1, 1, 1];
  gl.uniform3f(r.glassUniforms.highlightColor, highlight[0], highlight[1], highlight[2]);
  gl.uniform1f(r.glassUniforms.highlightStrength, chrome?.highlightStrength ?? 0);
  const lightDir = chrome?.lightDir ?? [0, -1];
  gl.uniform2f(r.glassUniforms.lightDir, lightDir[0], lightDir[1]);
  gl.uniform1f(r.glassUniforms.highlightSpread, chrome?.highlightSpread ?? 0);
  gl.uniform1f(r.glassUniforms.highlightCore, chrome?.highlightCore ?? 0);
  const aniso = chrome?.highlightAniso ?? [1, 1];
  gl.uniform2f(r.glassUniforms.highlightAniso, aniso[0], aniso[1]);
  // Interior glow: per-lens rects + gradient params. A zero lens count (or
  // zero glow alpha) keeps the glow loop inert; the shader only evaluates it
  // in mask mode 1 anyway.
  const lensRects = input.lensRects ?? [];
  const lensCount = Math.min(4, lensRects.length);
  gl.uniform1i(r.glassUniforms.glassLensCount, lensCount);
  for (let i = 0; i < 4; i += 1) {
    const rect = i < lensCount ? lensRects[i] : null;
    gl.uniform4f(
      r.glassUniforms.glassLensRect[i],
      rect?.x ?? 0,
      rect?.y ?? 0,
      rect?.halfW ?? 0,
      rect?.halfH ?? 0,
    );
  }
  const glowColor = chrome?.glowColor ?? [0, 0, 0, 0];
  gl.uniform4f(r.glassUniforms.glowColor, glowColor[0], glowColor[1], glowColor[2], glowColor[3]);
  const glowAnchor = chrome?.glowAnchor ?? [0.5, 0.5];
  gl.uniform2f(r.glassUniforms.glowAnchor, glowAnchor[0], glowAnchor[1]);
  const glowRadii = chrome?.glowRadii ?? [1, 1];
  gl.uniform2f(r.glassUniforms.glowRadii, glowRadii[0], glowRadii[1]);
  gl.uniform1f(r.glassUniforms.glowRotation, chrome?.glowRotation ?? 0);
  gl.uniform1f(r.glassUniforms.saturation, chrome?.saturation ?? 1);
  gl.uniform1f(r.glassUniforms.innerBrightness, chrome?.innerBrightness ?? 0);
  const innerLight = chrome?.innerLight ?? [0, 0, 0, 0];
  gl.uniform4f(r.glassUniforms.innerLight, innerLight[0], innerLight[1], innerLight[2], innerLight[3]);
  const innerLightPos = chrome?.innerLightPos ?? [0, 0];
  gl.uniform2f(r.glassUniforms.innerLightPos, innerLightPos[0], innerLightPos[1]);
  gl.uniform1f(r.glassUniforms.innerLightRadius, chrome?.innerLightRadius ?? 110);
  const shadowColor = chrome?.shadowColor ?? [0, 0, 0, 0];
  gl.uniform4f(r.glassUniforms.shadowColor, shadowColor[0], shadowColor[1], shadowColor[2], shadowColor[3]);
  const shadowOffset = chrome?.shadowOffset ?? [0, 0];
  gl.uniform2f(r.glassUniforms.shadowOffset, shadowOffset[0], shadowOffset[1]);
  gl.uniform1f(r.glassUniforms.shadowBlur, chrome?.shadowBlur ?? 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function computeFitTransform(
  fit: "cover" | "fill",
  source: { width: number; height: number },
  sceneW: number,
  sceneH: number,
  bleedPx: number,
): { uvScale: [number, number]; uvOffset: [number, number] } {
  if (fit === "fill" || source.width <= 0 || source.height <= 0) {
    return { uvScale: [1, 1], uvOffset: [0, 0] };
  }
  // Same cover math as the CPU path's drawCoverImage (bleed * 4 oversize).
  const scale = Math.max(
    (sceneW + bleedPx * 4) / source.width,
    (sceneH + bleedPx * 4) / source.height,
  );
  const drawW = source.width * scale;
  const drawH = source.height * scale;
  const offsetX = (sceneW - drawW) / 2;
  const offsetY = (sceneH - drawH) / 2;
  return {
    uvScale: [sceneW / drawW, sceneH / drawH],
    uvOffset: [-offsetX / drawW, -offsetY / drawH],
  };
}

function sceneSourceSize(scene: WebglGlassSceneSource): { width: number; height: number } {
  if (isImageElement(scene)) {
    return { width: scene.naturalWidth, height: scene.naturalHeight };
  }
  return { width: scene.width, height: scene.height };
}

function isImageElement(scene: WebglGlassSceneSource): scene is HTMLImageElement {
  return typeof HTMLImageElement !== "undefined" && scene instanceof HTMLImageElement;
}

function clampPixelRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.max(1, Math.min(ratio, 3));
}

function defaultPixelRatio(): number {
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}
