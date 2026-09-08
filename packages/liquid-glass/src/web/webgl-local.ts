import { createLiquidGlassEngine } from "../engine/create-engine";
import { normalizeLensParams } from "../engine/defaults";
import { getCachedDisplacementMap } from "../engine/map-cache";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
import type { GlassCanvasSource } from "./local-canvas";
import { CANVAS_STRENGTH, resizeCanvas } from "./render-utils";
import type { WebglGlassDrawInput, WebglGlassRenderer } from "./webgl-renderer";

/**
 * WebGL twin of renderLocalGlassCanvas: draws the component's local source
 * scene into a scratch 2D canvas (the `GlassCanvasSource` contract is a 2D
 * drawing callback), then refracts it through the given WebGL renderer.
 *
 * Returns false when the render could not happen (lost context, no 2D scratch
 * context, GL error) so callers can fall back to the CPU canvas path.
 */
export interface LocalGlassWebglRenderInput {
  renderer: WebglGlassRenderer;
  /** Offscreen scratch canvas the source scene is drawn into. */
  sceneCanvas: HTMLCanvasElement;
  engine?: LiquidGlassEngine;
  lens: Partial<LensParams>;
  /**
   * Lens to resolve the displacement map with, when it differs from `lens`
   * (e.g. a transiently quantized size during a resize burst — see
   * useTransientMapLens). Geometry/viewport always come from `lens`; the map
   * stretches over the exact box in normalized lens space.
   */
  mapLens?: Partial<LensParams>;
  sourceWidth: number;
  sourceHeight: number;
  lensX: number;
  lensY: number;
  pixelRatio?: number;
  source: GlassCanvasSource;
  strength?: number;
  /**
   * Content version of the source scene. When provided, the renderer's
   * blurred-scene cache can skip the re-upload + two-pass Gaussian blur for
   * unchanged content (e.g. during a press tween where only the lens optics
   * animate). Omit when the source content can change without a trackable
   * version — the scene is then re-uploaded and re-blurred every render.
   */
  sceneKey?: string;
  /** Source zoom about the lens center (see LocalGlassCanvasRenderInput.sourceZoom). */
  sourceZoom?: number;
}

/** buildLocalGlassDrawInput's input: everything but the renderer. */
export type LocalGlassDrawSpec = Omit<LocalGlassWebglRenderInput, "renderer">;

export interface LocalGlassDrawBuild {
  /** Ready-to-render draw input for a WebglGlassRenderer or the compositor. */
  input: WebglGlassDrawInput;
  /** CSS size the output canvas should be styled to. */
  cssWidth: number;
  cssHeight: number;
}

let defaultEngine: LiquidGlassEngine | null = null;

/** Last content drawn into each scratch scene canvas, keyed by sceneKey+size. */
const lastSceneContent = new WeakMap<HTMLCanvasElement, string>();

/**
 * Prepares the component-local glass pipeline: draws the source scene into
 * the scratch 2D canvas (skipped when `sceneKey` says it is unchanged),
 * resolves the displacement map from the global cache, and assembles the
 * `WebglGlassDrawInput`. Shared by `renderLocalGlassWebgl` (standalone
 * renderer) and GlassNode's shared-compositor path.
 *
 * Returns null when the scratch canvas cannot provide a 2D context.
 */
export function buildLocalGlassDrawInput(spec: LocalGlassDrawSpec): LocalGlassDrawBuild | null {
  const engine = spec.engine ?? (defaultEngine ??= createLiquidGlassEngine({ mode: "auto" }));
  const lens = normalizeLensParams(spec.lens);
  const pixelRatio = Math.max(1, Math.min(spec.pixelRatio ?? window.devicePixelRatio ?? 1, 3));
  const sceneWidth = Math.max(1, Math.round(spec.sourceWidth * pixelRatio));
  const sceneHeight = Math.max(1, Math.round(spec.sourceHeight * pixelRatio));
  const sceneCtx = spec.sceneCanvas.getContext("2d", { alpha: true });
  if (!sceneCtx) return null;

  // With a sceneKey, skip re-running the source draw callback entirely when
  // the content (and canvas size) is unchanged — e.g. press tweens animate
  // lens optics over a static source.
  const sourceZoom = spec.sourceZoom ?? 1;
  const contentKey =
    spec.sceneKey !== undefined ? `${spec.sceneKey}|z${sourceZoom}|${sceneWidth}x${sceneHeight}` : null;
  const sceneUnchanged = contentKey !== null && lastSceneContent.get(spec.sceneCanvas) === contentKey;

  if (!sceneUnchanged) {
    resizeCanvas(spec.sceneCanvas, sceneWidth, sceneHeight);
    sceneCtx.clearRect(0, 0, sceneWidth, sceneHeight);
    sceneCtx.save();
    sceneCtx.scale(pixelRatio, pixelRatio);
    if (sourceZoom !== 1) {
      const zoomCx = spec.lensX + lens.width / 2;
      const zoomCy = spec.lensY + lens.height / 2;
      sceneCtx.translate(zoomCx, zoomCy);
      sceneCtx.scale(sourceZoom, sourceZoom);
      sceneCtx.translate(-zoomCx, -zoomCy);
    }
    spec.source({
      ctx: sceneCtx,
      metrics: {
        sourceWidth: spec.sourceWidth,
        sourceHeight: spec.sourceHeight,
        lensWidth: lens.width,
        lensHeight: lens.height,
        lensX: spec.lensX,
        lensY: spec.lensY,
        pixelRatio,
      },
    });
    sceneCtx.restore();
    if (contentKey !== null) lastSceneContent.set(spec.sceneCanvas, contentKey);
    else lastSceneContent.delete(spec.sceneCanvas);
  }

  const mapLens = spec.mapLens ? normalizeLensParams(spec.mapLens) : lens;
  const map = getCachedDisplacementMap(engine, mapLens);

  return {
    input: {
      scene: spec.sceneCanvas,
      // sceneKey lets the renderer skip re-upload + re-blur for unchanged
      // content; undefined preserves the legacy always-re-blur behavior.
      sceneKey: spec.sceneKey,
      map,
      lens,
      mapLens: mapLens !== lens ? mapLens : undefined,
      geometry: {
        left: spec.lensX,
        top: spec.lensY,
        width: lens.width,
        height: lens.height,
        radius: lens.radius,
      },
      sceneWidth: spec.sourceWidth,
      sceneHeight: spec.sourceHeight,
      viewport: { left: spec.lensX, top: spec.lensY, width: lens.width, height: lens.height },
      fit: "fill",
      pixelRatio,
      strength: spec.strength ?? CANVAS_STRENGTH,
    },
    cssWidth: lens.width,
    cssHeight: lens.height,
  };
}

export function renderLocalGlassWebgl(input: LocalGlassWebglRenderInput): boolean {
  if (input.renderer.isContextLost()) return false;
  const build = buildLocalGlassDrawInput(input);
  if (!build) return false;

  input.renderer.canvas.style.width = `${build.cssWidth}px`;
  input.renderer.canvas.style.height = `${build.cssHeight}px`;

  try {
    input.renderer.render(build.input);
  } catch {
    return false;
  }
  return !input.renderer.isContextLost();
}
