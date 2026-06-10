import { createLiquidGlassEngine } from "../engine/create-engine";
import { normalizeLensParams } from "../engine/defaults";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
import type { GlassCanvasSource } from "./local-canvas";
import { CANVAS_STRENGTH, resizeCanvas } from "./render-utils";
import type { WebglGlassRenderer } from "./webgl-renderer";

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
  sourceWidth: number;
  sourceHeight: number;
  lensX: number;
  lensY: number;
  pixelRatio?: number;
  source: GlassCanvasSource;
  strength?: number;
}

let defaultEngine: LiquidGlassEngine | null = null;

export function renderLocalGlassWebgl(input: LocalGlassWebglRenderInput): boolean {
  if (input.renderer.isContextLost()) return false;
  const engine = input.engine ?? (defaultEngine ??= createLiquidGlassEngine({ mode: "auto" }));
  const lens = normalizeLensParams(input.lens);
  const pixelRatio = Math.max(1, Math.min(input.pixelRatio ?? window.devicePixelRatio ?? 1, 3));
  const sceneWidth = Math.max(1, Math.round(input.sourceWidth * pixelRatio));
  const sceneHeight = Math.max(1, Math.round(input.sourceHeight * pixelRatio));
  const sceneCtx = input.sceneCanvas.getContext("2d", { alpha: true });
  if (!sceneCtx) return false;

  resizeCanvas(input.sceneCanvas, sceneWidth, sceneHeight);
  sceneCtx.clearRect(0, 0, sceneWidth, sceneHeight);
  sceneCtx.save();
  sceneCtx.scale(pixelRatio, pixelRatio);
  input.source({
    ctx: sceneCtx,
    metrics: {
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      lensWidth: lens.width,
      lensHeight: lens.height,
      lensX: input.lensX,
      lensY: input.lensY,
      pixelRatio,
    },
  });
  sceneCtx.restore();

  const map = engine.generateDisplacementMap(lens);
  input.renderer.canvas.style.width = `${lens.width}px`;
  input.renderer.canvas.style.height = `${lens.height}px`;

  try {
    input.renderer.render({
      scene: input.sceneCanvas,
      // No sceneKey: the local source can change every render, so always
      // re-upload and re-blur.
      map,
      lens,
      geometry: {
        left: input.lensX,
        top: input.lensY,
        width: lens.width,
        height: lens.height,
        radius: lens.radius,
      },
      sceneWidth: input.sourceWidth,
      sceneHeight: input.sourceHeight,
      viewport: { left: input.lensX, top: input.lensY, width: lens.width, height: lens.height },
      fit: "fill",
      pixelRatio,
      strength: input.strength ?? CANVAS_STRENGTH,
    });
  } catch {
    return false;
  }
  return !input.renderer.isContextLost();
}
