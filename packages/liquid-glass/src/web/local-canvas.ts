import { normalizeLensParams } from "../engine/defaults";
import { createLiquidGlassEngine } from "../engine/create-engine";
import { getCachedDisplacementMap } from "../engine/map-cache";
import { clampLensScales } from "../engine/map-slope";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
import { countGlassDraw } from "./perf-stats";
import {
  CANVAS_STRENGTH,
  applyCanvasBlur,
  resizeCanvas,
  roundedRectInside,
  sampleGlassChannel,
  specularAlpha,
} from "./render-utils";

export type GlassRendererMode = "auto" | "svg" | "canvas" | "webgl";

export interface GlassNodeMetrics {
  sourceWidth: number;
  sourceHeight: number;
  lensWidth: number;
  lensHeight: number;
  lensX: number;
  lensY: number;
  pixelRatio: number;
}

export interface GlassCanvasSourceInput {
  ctx: CanvasRenderingContext2D;
  metrics: GlassNodeMetrics;
}

export type GlassCanvasSource = (input: GlassCanvasSourceInput) => void;

export interface LocalGlassCanvasRenderInput {
  canvas: HTMLCanvasElement;
  engine?: LiquidGlassEngine;
  lens: Partial<LensParams>;
  /**
   * Lens to resolve the displacement map with, when it differs from `lens`
   * (e.g. a transiently quantized size during a resize burst — see
   * useTransientMapLens). Output geometry always comes from `lens`.
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
   * Uniform zoom applied to the drawn source about the LENS CENTER before
   * blur/displacement. < 1 zooms out (a literal minified view) so the
   * displacement field only has to carry edge character, not the
   * minification itself. Default 1.
   */
  sourceZoom?: number;
}

export interface LocalGlassCanvasRenderResult {
  renderer: "canvas";
  mapMs: number;
  renderMs: number;
  pixelRatio: number;
}

let defaultEngine: LiquidGlassEngine | null = null;

export function renderLocalGlassCanvas(input: LocalGlassCanvasRenderInput): LocalGlassCanvasRenderResult {
  const renderStarted = performance.now();
  const engine = input.engine ?? (defaultEngine ??= createLiquidGlassEngine({ mode: "auto" }));
  const lens = normalizeLensParams(input.lens);
  const pixelRatio = Math.max(1, Math.min(input.pixelRatio ?? window.devicePixelRatio ?? 1, 3));
  const sourceWidth = Math.max(1, Math.round(input.sourceWidth * pixelRatio));
  const sourceHeight = Math.max(1, Math.round(input.sourceHeight * pixelRatio));
  const lensWidth = Math.max(1, Math.round(lens.width * pixelRatio));
  const lensHeight = Math.max(1, Math.round(lens.height * pixelRatio));
  const sourceCanvas = document.createElement("canvas");
  const blurredCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const blurredCtx = blurredCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const ctx = input.canvas.getContext("2d", { alpha: true, willReadFrequently: true });

  if (!sourceCtx || !blurredCtx || !ctx) {
    return { renderer: "canvas", mapMs: 0, renderMs: performance.now() - renderStarted, pixelRatio };
  }

  resizeCanvas(input.canvas, lensWidth, lensHeight);
  resizeCanvas(sourceCanvas, sourceWidth, sourceHeight);
  resizeCanvas(blurredCanvas, sourceWidth, sourceHeight);
  input.canvas.style.width = `${lens.width}px`;
  input.canvas.style.height = `${lens.height}px`;

  sourceCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  sourceCtx.save();
  sourceCtx.scale(pixelRatio, pixelRatio);
  const sourceZoom = input.sourceZoom ?? 1;
  if (sourceZoom !== 1) {
    const zoomCx = input.lensX + lens.width / 2;
    const zoomCy = input.lensY + lens.height / 2;
    sourceCtx.translate(zoomCx, zoomCy);
    sourceCtx.scale(sourceZoom, sourceZoom);
    sourceCtx.translate(-zoomCx, -zoomCy);
  }
  input.source({
    ctx: sourceCtx,
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
  sourceCtx.restore();

  blurredCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  blurredCtx.drawImage(sourceCanvas, 0, 0);
  applyCanvasBlur(blurredCtx, sourceWidth, sourceHeight, lens.blur, pixelRatio);

  const mapStarted = performance.now();
  const mapLens = input.mapLens ? normalizeLensParams(input.mapLens) : lens;
  const map = getCachedDisplacementMap(engine, mapLens);
  const mapMs = performance.now() - mapStarted;
  // No-fold guard (see engine/map-slope.ts): same clamp as the WebGL sink.
  const strength = input.strength ?? CANVAS_STRENGTH;
  const clamped = clampLensScales(map, lens, { strength, generatingLens: mapLens });
  const sampleLens =
    clamped.scaleX !== lens.scaleX || clamped.scaleY !== lens.scaleY
      ? { ...lens, scaleX: clamped.scaleX, scaleY: clamped.scaleY }
      : lens;
  const scenePixels = blurredCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  const output = ctx.createImageData(lensWidth, lensHeight);
  const out = output.data;

  for (let y = 0; y < lensHeight; y += 1) {
    for (let x = 0; x < lensWidth; x += 1) {
      const index = (y * lensWidth + x) * 4;
      const cssX = (x + 0.5) / pixelRatio;
      const cssY = (y + 0.5) / pixelRatio;

      if (!roundedRectInside(cssX, cssY, lens.width, lens.height, lens.radius)) {
        out[index + 3] = 0;
        continue;
      }

      const sampleInput = {
        source: scenePixels.data,
        sourceWidth,
        sourceHeight,
        map,
        lens: sampleLens,
        lensWidth: lens.width,
        lensHeight: lens.height,
        lensX: input.lensX,
        lensY: input.lensY,
        localX: cssX,
        localY: cssY,
        pixelRatio,
        strength,
      };

      out[index] = sampleGlassChannel(sampleInput, 0);
      out[index + 1] = sampleGlassChannel(sampleInput, 1);
      out[index + 2] = sampleGlassChannel(sampleInput, 2);
      out[index + 3] = 255;

      const alpha = specularAlpha(map, cssX, cssY, lens.width, lens.height);
      if (alpha > 0) {
        out[index] = Math.round(out[index] * (1 - alpha) + 255 * alpha);
        out[index + 1] = Math.round(out[index + 1] * (1 - alpha) + 255 * alpha);
        out[index + 2] = Math.round(out[index + 2] * (1 - alpha) + 255 * alpha);
      }
    }
  }

  ctx.putImageData(output, 0, 0);
  countGlassDraw("canvas");

  return {
    renderer: "canvas",
    mapMs,
    renderMs: performance.now() - renderStarted,
    pixelRatio,
  };
}
