import { normalizeLensParams } from "../engine/defaults";
import { createLiquidGlassEngine } from "../engine/create-engine";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
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
  sourceWidth: number;
  sourceHeight: number;
  lensX: number;
  lensY: number;
  pixelRatio?: number;
  source: GlassCanvasSource;
  strength?: number;
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
  const map = engine.generateDisplacementMap(lens);
  const mapMs = performance.now() - mapStarted;
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
        lens,
        lensWidth: lens.width,
        lensHeight: lens.height,
        lensX: input.lensX,
        lensY: input.lensY,
        localX: cssX,
        localY: cssY,
        pixelRatio,
        strength: input.strength ?? CANVAS_STRENGTH,
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

  return {
    renderer: "canvas",
    mapMs,
    renderMs: performance.now() - renderStarted,
    pixelRatio,
  };
}
