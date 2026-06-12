import type { DisplacementMap } from "../engine/types";
import { countBlurCache, countGlassDraw, glassWebglContextCreated, glassWebglContextDestroyed } from "./perf-stats";
import {
  clampPixelRatio,
  createLinearMapTexture,
  createResources,
  defaultPixelRatio,
  deleteResources,
  drawGlassPass,
  getWebgl2Context,
  prepareBlurredScene,
  safeGetLoseContextExtension,
  uploadMapTexture,
  type GlResources,
  type WebglGlassDrawInput,
} from "./webgl-renderer";

/**
 * Shared glass compositor: ONE WebGL2 context per page for every
 * component-local glass node, instead of one context per GlassNode.
 *
 * Browsers cap live WebGL contexts (~8–16; Safari ~8); a screen with ten
 * always-on glass buttons used to allocate ten. The compositor holds a single
 * detached offscreen canvas + GL context, renders each registered instance's
 * glass pass there, and blits the result into the instance's own VISIBLE
 * canvas with `ctx2d.drawImage`. Per-node canvases keep DOM stacking, scroll
 * sync, ancestor transforms, and `border-radius` clipping working untouched —
 * a fullscreen overlay canvas could not interleave with the existing z-layers
 * and portals.
 *
 * Rendering is synchronous inside `update()` — the same timing as the old
 * per-instance renderers (React effect commit = one draw), and it keeps the
 * draw→blit pair in one task, which `preserveDrawingBuffer: false` requires.
 *
 * Resource sharing:
 * - one program pair / VAO / quad / blur FBOs for the whole page;
 * - the blurred-scene cache is instance-scoped by key prefix, so consecutive
 *   frames of the same animating instance still skip the re-blur;
 * - displacement-map textures are pooled by map identity (the global map
 *   cache returns stable instances), so N controls with the same optics share
 *   one GPU texture and re-draws skip the upload.
 *
 * Context loss: per-node canvases retain their last blitted pixels (no blank
 * flash). On restore the compositor rebuilds resources and re-renders every
 * instance from its stored input — an improvement over the old per-node
 * behavior, which treated any loss as permanent. Repeated losses (>2 / 30s)
 * or a failed rebuild fan out `onFallback` so nodes drop to the CPU path.
 */

/** Largest backing size the shared canvas will grow to, per axis. */
const MAX_SHARED_CANVAS_SIZE = 4096;
/** Pooled map textures kept alive (LRU). */
const MAX_MAP_TEXTURES = 32;
/** More context losses than this within LOSS_WINDOW_MS = permanent failure. */
const MAX_LOSSES = 2;
const LOSS_WINDOW_MS = 30_000;

export interface GlassCompositorTarget {
  /** Visible canvas the rendered glass is blitted into (gets a 2D context). */
  canvas: HTMLCanvasElement;
  /** Called when the compositor permanently fails; switch to the CPU path. */
  onFallback?: () => void;
}

export interface GlassCompositorInstance {
  /**
   * Renders `input` through the shared context and blits into the target
   * canvas, synchronously. Returns false when the compositor cannot render
   * (lost/failed context) — fall back to the CPU canvas path.
   */
  update(input: WebglGlassDrawInput): boolean;
  /** Re-renders the last input, if any (used after restores). */
  invalidate(): boolean;
  destroy(): void;
}

export interface GlassCompositor {
  isAvailable(): boolean;
  register(target: GlassCompositorTarget): GlassCompositorInstance;
  readonly instanceCount: number;
  /** @internal */
  destroy(): void;
}

interface InstanceRecord {
  id: number;
  target: GlassCompositorTarget;
  lastInput: WebglGlassDrawInput | null;
  destroyed: boolean;
}

export interface CreateGlassCompositorOptions {
  /** Test seam: the canvas to create the shared GL context on. */
  canvas?: HTMLCanvasElement;
}

/** @internal Exported for tests; consumers use getSharedGlassCompositor. */
export function createGlassCompositor(
  options: CreateGlassCompositorOptions = {},
): GlassCompositor | null {
  if (typeof document === "undefined") return null;
  const glCanvas = options.canvas ?? document.createElement("canvas");
  const maybeGl = getWebgl2Context(glCanvas);
  if (!maybeGl) return null;
  // Non-null rebind so hoisted function declarations below see the narrowed type.
  const gl: WebGL2RenderingContext = maybeGl;

  let resources: GlResources | null = null;
  let contextLost = false;
  let failed = false;
  let destroyed = false;
  let nextInstanceId = 1;
  const instances = new Set<InstanceRecord>();
  const lossTimestamps: number[] = [];
  const loseContextExt = safeGetLoseContextExtension(gl);

  // Pooled map textures, keyed by DisplacementMap identity. Insertion order
  // doubles as LRU order (delete + re-set on hit).
  let mapTextures = new Map<DisplacementMap, WebGLTexture>();

  const failPermanently = () => {
    if (failed) return;
    failed = true;
    for (const record of instances) record.target.onFallback?.();
  };

  const onContextLost = (event: Event): void => {
    event.preventDefault?.();
    contextLost = true;
    resources = null;
    mapTextures = new Map();
    const now = Date.now();
    lossTimestamps.push(now);
    while (lossTimestamps.length > 0 && now - lossTimestamps[0] > LOSS_WINDOW_MS) {
      lossTimestamps.shift();
    }
    if (lossTimestamps.length > MAX_LOSSES) failPermanently();
  };

  const onContextRestored = (): void => {
    if (destroyed || failed) return;
    try {
      resources = createResources(gl);
      contextLost = false;
    } catch {
      resources = null;
      failPermanently();
      return;
    }
    // Re-render every instance from its stored input; per-node canvases kept
    // their last pixels through the loss, so this just refreshes them.
    for (const record of instances) {
      if (record.lastInput) renderInstance(record, record.lastInput);
    }
  };

  glCanvas.addEventListener("webglcontextlost", onContextLost, false);
  glCanvas.addEventListener("webglcontextrestored", onContextRestored, false);

  try {
    resources = createResources(gl);
  } catch {
    glCanvas.removeEventListener("webglcontextlost", onContextLost, false);
    glCanvas.removeEventListener("webglcontextrestored", onContextRestored, false);
    return null;
  }

  glassWebglContextCreated();

  function getMapTexture(map: DisplacementMap): WebGLTexture {
    const cached = mapTextures.get(map);
    if (cached) {
      // Refresh LRU position.
      mapTextures.delete(map);
      mapTextures.set(map, cached);
      return cached;
    }
    const texture = createLinearMapTexture(gl);
    uploadMapTexture(gl, texture, map);
    mapTextures.set(map, texture);
    while (mapTextures.size > MAX_MAP_TEXTURES) {
      const oldest = mapTextures.keys().next().value as DisplacementMap;
      const oldTexture = mapTextures.get(oldest);
      mapTextures.delete(oldest);
      if (oldTexture) {
        try {
          gl.deleteTexture(oldTexture);
        } catch {
          // Lost context — nothing to release.
        }
      }
    }
    return texture;
  }

  function renderInstance(record: InstanceRecord, input: WebglGlassDrawInput): boolean {
    if (destroyed || failed || contextLost || !resources || record.destroyed) return false;
    if (typeof gl.isContextLost === "function" && gl.isContextLost()) {
      contextLost = true;
      return false;
    }
    const r = resources;
    const pixelRatio = clampPixelRatio(input.pixelRatio ?? defaultPixelRatio());
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
    if (outW > MAX_SHARED_CANVAS_SIZE || outH > MAX_SHARED_CANVAS_SIZE) return false;

    const targetCtx = record.target.canvas.getContext("2d");
    if (!targetCtx) return false;

    // Grow-only shared backing canvas. Growing clears the buffer, which is
    // fine — we draw immediately after.
    if (glCanvas.width < outW || glCanvas.height < outH) {
      glCanvas.width = Math.max(glCanvas.width, outW);
      glCanvas.height = Math.max(glCanvas.height, outH);
    }

    // Blurred-scene cache, instance-scoped: the shared ping texture holds one
    // blurred scene at a time, so the key carries the instance id. The common
    // case — one instance animating across consecutive frames — still hits.
    const blurRadiusPx = Math.round(Math.max(0, input.lens.blur) * pixelRatio);
    const scopedKey = input.sceneKey !== undefined ? `i${record.id}|${input.sceneKey}` : null;
    const cacheValid =
      scopedKey !== null &&
      r.cache.sceneKey === scopedKey &&
      r.cache.sceneWidth === sceneW &&
      r.cache.sceneHeight === sceneH &&
      r.cache.blurRadiusPx === blurRadiusPx;
    countBlurCache(cacheValid);
    if (!cacheValid) {
      prepareBlurredScene(gl, r, input, sceneW, sceneH, blurRadiusPx, pixelRatio);
      r.cache.sceneKey = scopedKey;
      r.cache.sceneWidth = sceneW;
      r.cache.sceneHeight = sceneH;
      r.cache.blurRadiusPx = blurRadiusPx;
    }

    drawGlassPass(gl, r, input, viewport, outW, outH, getMapTexture(input.map));
    countGlassDraw("webgl");

    // Blit into the node's visible canvas, same task (preserveDrawingBuffer
    // is false). The glass pass rendered into viewport (0,0,outW,outH) — the
    // BOTTOM-LEFT of the GL buffer — which in 2D image coordinates (top-left
    // origin) is the rect at y = glCanvas.height - outH.
    const target = record.target.canvas;
    if (target.width !== outW || target.height !== outH) {
      target.width = outW;
      target.height = outH;
    } else {
      targetCtx.clearRect(0, 0, outW, outH);
    }
    targetCtx.drawImage(glCanvas, 0, glCanvas.height - outH, outW, outH, 0, 0, outW, outH);
    return true;
  }

  return {
    isAvailable() {
      return !destroyed && !failed;
    },
    get instanceCount() {
      return instances.size;
    },
    register(target) {
      const record: InstanceRecord = {
        id: nextInstanceId++,
        target,
        lastInput: null,
        destroyed: false,
      };
      instances.add(record);
      if (failed) target.onFallback?.();
      return {
        update(input) {
          record.lastInput = input;
          return renderInstance(record, input);
        },
        invalidate() {
          return record.lastInput ? renderInstance(record, record.lastInput) : false;
        },
        destroy() {
          record.destroyed = true;
          record.lastInput = null;
          instances.delete(record);
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      glassWebglContextDestroyed();
      glCanvas.removeEventListener("webglcontextlost", onContextLost, false);
      glCanvas.removeEventListener("webglcontextrestored", onContextRestored, false);
      if (resources) {
        deleteResources(gl, resources);
        resources = null;
      }
      for (const texture of mapTextures.values()) {
        try {
          gl.deleteTexture(texture);
        } catch {
          // Lost context — nothing to release.
        }
      }
      mapTextures = new Map();
      instances.clear();
      try {
        loseContextExt?.loseContext();
      } catch {
        // Already lost.
      }
    },
  };
}

let sharedCompositor: GlassCompositor | null = null;
let lastFailedAttemptAt = -Infinity;

/** Throttle re-probing WebGL2 after a failed creation attempt. */
const RETRY_AFTER_MS = 5000;

/**
 * Page-level shared compositor (mirrors the shared-engine singleton pattern).
 * Returns null when WebGL2 is unavailable (SSR, jsdom, blocklisted GPU) or
 * after a permanent failure — callers fall back to the CPU canvas path.
 *
 * A failed creation is NOT cached forever: transient failures (GPU process
 * restart, dev-server hot-reload windows) are re-probed after a short
 * backoff, so one bad moment can't permanently strip the page of GPU glass.
 * A compositor that failed permanently (repeated context losses) stays null.
 */
export function getSharedGlassCompositor(): GlassCompositor | null {
  if (sharedCompositor) {
    return sharedCompositor.isAvailable() ? sharedCompositor : null;
  }
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  if (now - lastFailedAttemptAt < RETRY_AFTER_MS) return null;
  sharedCompositor = createGlassCompositor();
  if (!sharedCompositor) lastFailedAttemptAt = now;
  return sharedCompositor;
}

/** Drops the shared compositor (and its GL context). Intended for tests. */
export function resetSharedGlassCompositorForTests(): void {
  sharedCompositor?.destroy();
  sharedCompositor = null;
  lastFailedAttemptAt = -Infinity;
}
