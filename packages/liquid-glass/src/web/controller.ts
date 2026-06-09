import { normalizeLensParams } from "../engine/defaults";
import { createLiquidGlassEngine } from "../engine/create-engine";
import { colorMatrixStringForScale, mapKey } from "../engine/ts-engine";
import type {
  DisplacementMap,
  LensGeometry,
  LensParams,
  LensPosition,
  LiquidGlassEngine,
  LiquidGlassRenderMode,
} from "../engine/types";
import { setAttr, setHref, setStyle } from "./dom";
import { displacementMapToPngDataUrl } from "./png";
import { createSvgFilter, type SvgFilterElements } from "./svg-filter";

export interface LiquidGlassControllerStats {
  activeEngine: "wasm" | "ts";
  activeRenderer: LiquidGlassRenderer;
  applyCount: number;
  domWrites: number;
  lastMapMs: number;
  lastApplyMs: number;
}

export type LiquidGlassRenderer = "auto" | "svg" | "canvas";

export interface LiquidGlassControllerOptions {
  container: HTMLElement;
  source?: HTMLElement;
  target?: HTMLElement;
  lens?: Partial<LensParams>;
  position?: LensPosition;
  engine?: LiquidGlassEngine;
  mode?: LiquidGlassRenderMode;
  renderer?: LiquidGlassRenderer;
  sourceImageUrl?: string;
  safariRefresh?: boolean;
  fullDragFilter?: boolean;
  onStats?: (stats: LiquidGlassControllerStats) => void;
}

export interface LiquidGlassController {
  readonly stats: LiquidGlassControllerStats;
  update(next: Partial<LiquidGlassControllerOptions>): void;
  setPosition(position: LensPosition): void;
  destroy(): void;
}

let nextFilterId = 0;

export function createLiquidGlassController(options: LiquidGlassControllerOptions): LiquidGlassController {
  const engine = options.engine ?? createLiquidGlassEngine({ mode: "auto" });
  const baseId = `liquid-glass-filter-${nextFilterId++}`;
  const elements = createSvgFilter(baseId);
  const canvasRenderer = createCanvasRenderer();
  const stats: LiquidGlassControllerStats = {
    activeEngine: engine.mode,
    activeRenderer: "svg",
    applyCount: 0,
    domWrites: 0,
    lastMapMs: 0,
    lastApplyMs: 0,
  };
  let state = normalizeOptions({ ...options, engine });
  let filterVersion = 0;
  let currentFilterId = baseId;
  let lastMapKey = "";
  let lastMapUrl = "";
  let lastMap: DisplacementMap | null = null;
  let imageState: CanvasImageState | null = null;
  let destroyed = false;

  state.container.prepend(elements.svg);
  state.container.append(canvasRenderer.canvas);
  apply();
  void engine.ready.then(() => {
    if (!destroyed) apply();
  }).catch(() => undefined);

  return {
    stats,
    update(next) {
      if (destroyed) return;
      state = normalizeOptions({ ...state, ...next, engine });
      apply();
    },
    setPosition(position) {
      if (destroyed) return;
      state = normalizeOptions({ ...state, position, engine });
      apply();
    },
    destroy() {
      destroyed = true;
      elements.svg.remove();
      canvasRenderer.canvas.remove();
      if (state.source) setStyle(state.source, "filter", "");
      if (state.target) setStyle(state.target, "filter", "");
      if (state.target) setStyle(state.target, "visibility", "");
    },
  };

  function apply(): void {
    const applyStarted = performance.now();
    const targetElement = state.mode === "target" ? state.target ?? state.source : state.source;
    if (!targetElement) return;

    const rect = state.container.getBoundingClientRect();
    const geometry = engine.computeLensGeometry({
      containerWidth: rect.width,
      containerHeight: rect.height,
      x: state.position.x,
      y: state.position.y,
      unit: state.position.unit,
      mode: state.mode,
      lens: state.lens,
    });
    const key = mapKey(state.lens);
    let domWrites = 0;

    if (key !== lastMapKey || !lastMap) {
      const mapStarted = performance.now();
      lastMap = engine.generateDisplacementMap(state.lens);
      lastMapUrl = "";
      lastMapKey = key;
      stats.lastMapMs = performance.now() - mapStarted;
      filterVersion += 1;
    }

    const activeRenderer = resolveRenderer(state);
    stats.activeRenderer = activeRenderer;

    if (activeRenderer === "canvas") {
      const image = ensureCanvasImage(state.sourceImageUrl);
      domWrites += Number(setStyle(canvasRenderer.canvas, "display", "block"));
      domWrites += Number(setStyle(targetElement, "filter", ""));
      domWrites += Number(setStyle(targetElement, "visibility", "hidden"));
      const inactive = state.mode === "target" ? state.source : state.target;
      if (inactive && inactive !== targetElement) {
        domWrites += Number(setStyle(inactive, "filter", ""));
      }
      if (image && lastMap) {
        canvasRenderer.draw({
          container: state.container,
          geometry,
          image,
          lens: state.lens,
          map: lastMap,
        });
      } else {
        canvasRenderer.clear();
      }
      stats.activeEngine = engine.mode;
      stats.applyCount += 1;
      stats.domWrites += domWrites;
      stats.lastApplyMs = performance.now() - applyStarted;
      state.onStats?.({ ...stats });
      return;
    }

    domWrites += Number(setStyle(canvasRenderer.canvas, "display", "none"));
    canvasRenderer.clear();
    if (state.target) domWrites += Number(setStyle(state.target, "visibility", ""));

    if (lastMap && !lastMapUrl) {
      lastMapUrl = displacementMapToPngDataUrl(lastMap);
      domWrites += Number(setHref(elements.mapImage, lastMapUrl));
    }

    if (state.safariRefresh || filterVersion > 0) {
      const nextId = `${baseId}-${filterVersion}`;
      if (nextId !== currentFilterId) {
        currentFilterId = nextId;
        domWrites += Number(setAttr(elements.filter, "id", currentFilterId));
      }
    }

    domWrites += updateSvgGeometry(elements, geometry, state.lens);
    domWrites += Number(setStyle(targetElement, "filter", `url(#${currentFilterId})`));

    const inactive = state.mode === "target" ? state.source : state.target;
    if (inactive && inactive !== targetElement) {
      domWrites += Number(setStyle(inactive, "filter", ""));
    }

    stats.activeEngine = engine.mode;
    stats.applyCount += 1;
    stats.domWrites += domWrites;
    stats.lastApplyMs = performance.now() - applyStarted;
    state.onStats?.({ ...stats });
  }

  function ensureCanvasImage(url: string | undefined): HTMLImageElement | null {
    if (!url) return null;
    if (imageState?.url === url) {
      return imageState.image.complete && imageState.image.naturalWidth ? imageState.image : null;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = url;
    image.onload = () => {
      if (!destroyed) apply();
    };
    imageState = { url, image };
    return null;
  }
}

function normalizeOptions(
  options: LiquidGlassControllerOptions & { engine: LiquidGlassEngine },
): Required<Pick<LiquidGlassControllerOptions, "container" | "engine" | "mode" | "position" | "renderer" | "safariRefresh" | "fullDragFilter">> &
  Omit<LiquidGlassControllerOptions, "container" | "engine" | "mode" | "position" | "renderer" | "safariRefresh" | "fullDragFilter"> & {
    lens: LensParams;
  } {
  return {
    ...options,
    lens: normalizeLensParams(options.lens),
    mode: options.mode ?? "source",
    renderer: options.renderer ?? "auto",
    position: {
      x: options.position?.x ?? 0.5,
      y: options.position?.y ?? 0.5,
      unit: options.position?.unit ?? "normalized",
    },
    safariRefresh: options.safariRefresh ?? isSafari(),
    fullDragFilter: options.fullDragFilter ?? true,
  };
}

function updateSvgGeometry(elements: SvgFilterElements, geometry: LensGeometry, lens: LensParams): number {
  let writes = 0;
  writes += Number(setAttr(elements.filter, "x", geometry.filterX));
  writes += Number(setAttr(elements.filter, "y", geometry.filterY));
  writes += Number(setAttr(elements.filter, "width", geometry.filterWidth));
  writes += Number(setAttr(elements.filter, "height", geometry.filterHeight));
  writes += Number(setAttr(elements.mapImage, "x", geometry.left));
  writes += Number(setAttr(elements.mapImage, "y", geometry.top));
  writes += Number(setAttr(elements.mapImage, "width", geometry.width));
  writes += Number(setAttr(elements.mapImage, "height", geometry.height));
  writes += Number(setAttr(elements.mapMatrix, "values", colorMatrixStringForScale(lens.scaleX, lens.scaleY)));
  writes += Number(setAttr(elements.sourceBlur, "stdDeviation", String(lens.blur * 0.18)));
  const baseScale = Math.max(lens.scaleX, lens.scaleY);
  writes += Number(setAttr(elements.displacementR, "scale", baseScale * (1 + 0.2 * lens.chroma)));
  writes += Number(setAttr(elements.displacementG, "scale", baseScale * (1 + 0.1 * lens.chroma)));
  writes += Number(setAttr(elements.displacementB, "scale", baseScale));
  const specStrength = Math.max(0, Math.min(3, lens.glow + lens.edge));
  writes += Number(setAttr(elements.specFlood, "flood-opacity", String(Math.min(0.72, specStrength * 0.22))));
  writes += Number(
    setAttr(
      elements.specMatrix,
      "values",
      `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${specStrength} 0 ${-0.5 * specStrength}`,
    ),
  );
  return writes;
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function resolveRenderer(
  state: ReturnType<typeof normalizeOptions>,
): Exclude<LiquidGlassRenderer, "auto"> {
  if (state.renderer === "svg" || state.renderer === "canvas") return state.renderer;
  if (state.mode === "target" && state.sourceImageUrl && isSafari()) return "canvas";
  return "svg";
}

interface CanvasImageState {
  url: string;
  image: HTMLImageElement;
}

interface CanvasDrawInput {
  container: HTMLElement;
  geometry: LensGeometry;
  image: HTMLImageElement;
  lens: LensParams;
  map: DisplacementMap;
}

function createCanvasRenderer() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const sceneCanvas = document.createElement("canvas");
  const sceneCtx = sceneCanvas.getContext("2d", { alpha: false, willReadFrequently: true });

  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.zIndex = "3";
  canvas.style.pointerEvents = "none";
  canvas.style.display = "none";

  return {
    canvas,
    clear() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    draw(input: CanvasDrawInput) {
      if (!ctx || !sceneCtx) return;
      const rect = input.container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      resizeCanvas(canvas, width, height);
      resizeCanvas(sceneCanvas, width, height);
      ctx.clearRect(0, 0, width, height);
      const blur = input.lens.blur;
      sceneCtx.save();
      sceneCtx.filter = blur > 0 ? `blur(${blur}px)` : "none";
      drawCoverImage(sceneCtx, input.image, width, height, blur);
      sceneCtx.restore();

      const scenePixels = sceneCtx.getImageData(0, 0, width, height);
      const lensW = Math.max(1, Math.round(input.geometry.width));
      const lensH = Math.max(1, Math.round(input.geometry.height));
      const left = Math.round(input.geometry.left);
      const top = Math.round(input.geometry.top);
      const output = ctx.createImageData(lensW, lensH);
      const out = output.data;
      const scene = scenePixels.data;
      const map = input.map.rgba;
      const mapSize = input.map.width;
      const rawBaseScale = Math.max(input.lens.scaleX, input.lens.scaleY);
      const canvasStrength = 0.62;
      const baseScale = rawBaseScale * canvasStrength;
      const ratioX = rawBaseScale > 0 ? input.lens.scaleX / rawBaseScale : 0;
      const ratioY = rawBaseScale > 0 ? input.lens.scaleY / rawBaseScale : 0;
      const scaleR = baseScale * (1 + 0.2 * input.lens.chroma);
      const scaleG = baseScale * (1 + 0.1 * input.lens.chroma);
      const scaleB = baseScale;

      for (let y = 0; y < lensH; y += 1) {
        for (let x = 0; x < lensW; x += 1) {
          const outIndex = (y * lensW + x) * 4;
          if (!roundedRectInside(x + 0.5, y + 0.5, lensW, lensH, input.geometry.radius)) {
            out[outIndex + 3] = 0;
            continue;
          }

          const mx = Math.max(0, Math.min(mapSize - 1, Math.floor((x / lensW) * mapSize)));
          const my = Math.max(0, Math.min(mapSize - 1, Math.floor((y / lensH) * mapSize)));
          const mapIndex = (my * mapSize + mx) * 4;
          const mapDx = (map[mapIndex] / 255 - 0.5) * ratioX;
          const mapDy = (map[mapIndex + 1] / 255 - 0.5) * ratioY;
          const gx = left + x;
          const gy = top + y;

          out[outIndex] = sampleScene(scene, width, height, gx + mapDx * scaleR, gy + mapDy * scaleR, 0);
          out[outIndex + 1] = sampleScene(scene, width, height, gx + mapDx * scaleG, gy + mapDy * scaleG, 1);
          out[outIndex + 2] = sampleScene(scene, width, height, gx + mapDx * scaleB, gy + mapDy * scaleB, 2);
          out[outIndex + 3] = 255;

          const spec = Math.max(0, map[mapIndex + 2] - 128) / 127;
          if (spec > 0) {
            const alpha = Math.min(0.52, spec * 0.52);
            out[outIndex] = Math.round(out[outIndex] * (1 - alpha) + 255 * alpha);
            out[outIndex + 1] = Math.round(out[outIndex + 1] * (1 - alpha) + 255 * alpha);
            out[outIndex + 2] = Math.round(out[outIndex + 2] * (1 - alpha) + 255 * alpha);
          }
        }
      }

      ctx.putImageData(output, left, top);
    },
  };
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  bleed = 0,
): void {
  const scale = Math.max(
    (width + bleed * 4) / image.naturalWidth,
    (height + bleed * 4) / image.naturalHeight,
  );
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
}

function roundedRectInside(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  const rx = Math.min(radius, width / 2);
  const ry = Math.min(radius, height / 2);
  const px = x < rx ? rx - x : x > width - rx ? x - (width - rx) : 0;
  const py = y < ry ? ry - y : y > height - ry ? y - (height - ry) : 0;
  return px * px + py * py <= rx * ry;
}

function sampleScene(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const sx = Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;
  const a = data[i00] * (1 - tx) + data[i10] * tx;
  const b = data[i01] * (1 - tx) + data[i11] * tx;
  return a * (1 - ty) + b * ty;
}
