import { normalizeLensParams } from "../engine/defaults";
import { getSharedLiquidGlassEngine } from "../engine/create-engine";
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
import { isSafari } from "./is-safari";
import { displacementMapToPngDataUrl } from "./png";
import {
  CANVAS_STRENGTH,
  applyCanvasBlur,
  resizeCanvas,
  roundedRectInside,
  sampleGlassChannel,
  specularAlpha,
} from "./render-utils";
import { createSvgFilter, type SvgFilterElements } from "./svg-filter";
import { createWebglGlassRenderer, type WebglGlassRenderer } from "./webgl-renderer";

export interface LiquidGlassControllerStats {
  activeEngine: "wasm" | "ts";
  activeRenderer: LiquidGlassRenderer;
  applyCount: number;
  domWrites: number;
  lastMapMs: number;
  lastApplyMs: number;
}

export type LiquidGlassRenderer = "auto" | "svg" | "canvas" | "webgl";

export interface LiquidGlassControllerOptions {
  container: HTMLElement;
  source?: HTMLElement;
  target?: HTMLElement;
  lens?: Partial<LensParams>;
  position?: LensPosition;
  engine?: LiquidGlassEngine;
  mode?: LiquidGlassRenderMode;
  /**
   * "svg" filters live DOM; "webgl"/"canvas" refract an image scene
   * (`sourceImageUrl`). "auto" (default) picks svg, except Safari + target
   * mode + image scene where it tries WebGL and falls back to the CPU canvas.
   * An explicit "webgl" also downgrades to "canvas" when WebGL2 is
   * unavailable or the context is lost.
   */
  renderer?: LiquidGlassRenderer;
  sourceImageUrl?: string;
  safariRefresh?: boolean;
  /**
   * When true (the default), honor `prefers-reduced-transparency: reduce` by
   * skipping the displacement filter entirely.
   */
  respectReducedTransparency?: boolean;
  onStats?: (stats: LiquidGlassControllerStats) => void;
}

export interface LiquidGlassController {
  readonly stats: LiquidGlassControllerStats;
  update(next: Partial<LiquidGlassControllerOptions>): void;
  setPosition(position: LensPosition): void;
  destroy(): void;
}

const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

let nextFilterId = 0;

export function createLiquidGlassController(options: LiquidGlassControllerOptions): LiquidGlassController {
  const engine = options.engine ?? getSharedLiquidGlassEngine({ mode: "auto" });
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
  let rafId: number | null = null;
  // Created lazily on the first apply that wants WebGL; renderer stays null
  // when context creation fails so apply() falls back to the CPU canvas.
  let webglState: { canvas: HTMLCanvasElement; renderer: WebglGlassRenderer | null } | null = null;

  // Reduced-transparency media query (guard absence, e.g. jsdom/older engines).
  let reducedTransparency = false;
  let transparencyQuery: MediaQueryList | null = null;
  const onTransparencyChange = (event: MediaQueryListEvent): void => {
    reducedTransparency = event.matches;
    scheduleApply();
  };
  if (typeof matchMedia === "function") {
    try {
      transparencyQuery = matchMedia(REDUCED_TRANSPARENCY_QUERY);
      reducedTransparency = transparencyQuery.matches;
      transparencyQuery.addEventListener?.("change", onTransparencyChange);
    } catch {
      transparencyQuery = null;
    }
  }

  // Resize handling (guard absence in non-browser test environments).
  let resizeObserver: ResizeObserver | null = null;
  const observedElements = new Set<Element>();
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => scheduleApply());
  }

  state.container.prepend(elements.svg);
  state.container.append(canvasRenderer.canvas);
  syncResizeObserver();
  apply();
  void engine.ready.then(() => {
    if (!destroyed) scheduleApply();
  }).catch(() => undefined);

  return {
    stats,
    update(next) {
      if (destroyed) return;
      state = normalizeOptions({ ...state, ...next, engine });
      syncResizeObserver();
      scheduleApply();
    },
    setPosition(position) {
      if (destroyed) return;
      // Fast path for pointer-driven drags: skip the full option/lens
      // re-normalization and only swap the (already cheap) position.
      state = {
        ...state,
        position: {
          x: position.x ?? state.position.x,
          y: position.y ?? state.position.y,
          unit: position.unit ?? state.position.unit,
        },
      };
      scheduleApply();
    },
    destroy() {
      destroyed = true;
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
      resizeObserver?.disconnect();
      observedElements.clear();
      transparencyQuery?.removeEventListener?.("change", onTransparencyChange);
      elements.svg.remove();
      canvasRenderer.canvas.remove();
      webglState?.renderer?.destroy();
      webglState?.canvas.remove();
      webglState = null;
      if (state.source) setStyle(state.source, "filter", "");
      if (state.target) setStyle(state.target, "filter", "");
      if (state.target) setStyle(state.target, "visibility", "");
    },
  };

  /** Coalesce all applies into one per frame (latest state wins). */
  function scheduleApply(): void {
    if (destroyed) return;
    if (typeof requestAnimationFrame !== "function") {
      apply();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      apply();
    });
  }

  function syncResizeObserver(): void {
    if (!resizeObserver) return;
    const wanted = new Set<Element>([state.container]);
    if (state.mode === "target" && state.target) wanted.add(state.target);
    for (const element of observedElements) {
      if (!wanted.has(element)) {
        resizeObserver.unobserve(element);
        observedElements.delete(element);
      }
    }
    for (const element of wanted) {
      if (!observedElements.has(element)) {
        resizeObserver.observe(element);
        observedElements.add(element);
      }
    }
  }

  function apply(): void {
    if (destroyed) return;
    const applyStarted = performance.now();
    const targetElement = state.mode === "target" ? state.target ?? state.source : state.source;
    if (!targetElement) return;

    if (state.respectReducedTransparency && reducedTransparency) {
      let domWrites = 0;
      domWrites += Number(setStyle(canvasRenderer.canvas, "display", "none"));
      canvasRenderer.clear();
      domWrites += Number(hideWebglCanvas());
      domWrites += Number(setStyle(targetElement, "filter", ""));
      if (state.source) domWrites += Number(setStyle(state.source, "filter", ""));
      if (state.target) {
        domWrites += Number(setStyle(state.target, "filter", ""));
        domWrites += Number(setStyle(state.target, "visibility", ""));
      }
      finishApply(applyStarted, domWrites, resolveRenderer(state));
      return;
    }

    // The SVG filter applies in the filtered element's user space, so in
    // "source" mode geometry must come from the source element's rect (it can
    // differ from the container), while "target" mode positions the overlay
    // within the container.
    const geometryElement =
      state.mode === "source" ? state.source ?? state.container : state.container;
    const rect = geometryElement.getBoundingClientRect();
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

    let activeRenderer = resolveRenderer(state);
    let webglRenderer: WebglGlassRenderer | null = null;
    if (activeRenderer === "webgl") {
      webglRenderer = ensureWebglRenderer();
      if (!webglRenderer) activeRenderer = "canvas";
    }

    if (activeRenderer === "webgl" && webglRenderer && webglState) {
      const image = ensureCanvasImage(state.sourceImageUrl);
      domWrites += Number(setStyle(webglState.canvas, "display", "block"));
      domWrites += Number(setStyle(canvasRenderer.canvas, "display", "none"));
      canvasRenderer.clear();
      domWrites += Number(setStyle(targetElement, "filter", ""));
      domWrites += Number(setStyle(targetElement, "visibility", "hidden"));
      const inactive = state.mode === "target" ? state.source : state.target;
      if (inactive && inactive !== targetElement) {
        domWrites += Number(setStyle(inactive, "filter", ""));
      }
      if (image && lastMap) {
        const containerRect = state.container.getBoundingClientRect();
        webglRenderer.render({
          scene: image,
          sceneKey: [
            image.currentSrc || image.src,
            image.naturalWidth,
            image.naturalHeight,
            Math.round(state.lens.blur * 100),
          ].join("|"),
          map: lastMap,
          lens: state.lens,
          geometry,
          sceneWidth: containerRect.width,
          sceneHeight: containerRect.height,
        });
      } else {
        webglRenderer.clear();
      }
      finishApply(applyStarted, domWrites, activeRenderer);
      return;
    }

    if (activeRenderer === "canvas") {
      const image = ensureCanvasImage(state.sourceImageUrl);
      domWrites += Number(setStyle(canvasRenderer.canvas, "display", "block"));
      domWrites += Number(hideWebglCanvas());
      domWrites += Number(setStyle(targetElement, "filter", ""));
      domWrites += Number(setStyle(targetElement, "visibility", "hidden"));
      const inactive = state.mode === "target" ? state.source : state.target;
      if (inactive && inactive !== targetElement) {
        domWrites += Number(setStyle(inactive, "filter", ""));
      }
      if (image && lastMap) {
        canvasRenderer.draw({
          containerRect: state.container.getBoundingClientRect(),
          geometry,
          image,
          lens: state.lens,
          map: lastMap,
        });
      } else {
        canvasRenderer.clear();
      }
      finishApply(applyStarted, domWrites, activeRenderer);
      return;
    }

    domWrites += Number(setStyle(canvasRenderer.canvas, "display", "none"));
    canvasRenderer.clear();
    domWrites += Number(hideWebglCanvas());
    if (state.target) domWrites += Number(setStyle(state.target, "visibility", ""));

    let primitiveWrites = 0;
    if (lastMap && !lastMapUrl) {
      lastMapUrl = displacementMapToPngDataUrl(lastMap);
      primitiveWrites += Number(setHref(elements.mapImage, lastMapUrl));
    }
    const geometryWrites = updateSvgGeometry(elements, geometry, state.lens);
    primitiveWrites += geometryWrites.primitiveWrites;
    domWrites += primitiveWrites + geometryWrites.regionWrites;

    // Historically WebKit failed to repaint a filtered HTML element when only
    // filter *primitive* attributes mutated (the classic Safari stale-filter
    // bug), which is why the original aave implementation versions filter ids.
    // Empirically probed (Playwright WebKit 26.4, 2026-06): primitive x/y,
    // href, scale, and region mutations ALL repaint correctly now, and an id
    // cycle costs ~8µs — so we keep cycling as belt-and-braces for older
    // Safari, but only for primitive-only changes. During target-mode drags
    // the <filter> region attributes move every frame (which invalidates the
    // filter on its own), so drags never pay for id churn.
    if (state.safariRefresh && primitiveWrites > 0 && geometryWrites.regionWrites === 0) {
      filterVersion += 1;
    }
    const nextId = filterVersion > 0 ? `${baseId}-${filterVersion}` : baseId;
    if (nextId !== currentFilterId) {
      currentFilterId = nextId;
      domWrites += Number(setAttr(elements.filter, "id", currentFilterId));
    }

    domWrites += Number(setStyle(targetElement, "filter", `url(#${currentFilterId})`));

    const inactive = state.mode === "target" ? state.source : state.target;
    if (inactive && inactive !== targetElement) {
      domWrites += Number(setStyle(inactive, "filter", ""));
    }

    finishApply(applyStarted, domWrites, activeRenderer);
  }

  function finishApply(
    applyStarted: number,
    domWrites: number,
    activeRenderer: Exclude<LiquidGlassRenderer, "auto">,
  ): void {
    stats.activeRenderer = activeRenderer;
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
      if (!destroyed) scheduleApply();
    };
    imageState = { url, image };
    return null;
  }

  /**
   * Lazily create the WebGL overlay canvas + renderer. Returns null when
   * WebGL2 is unavailable or the context is currently lost, so apply() falls
   * back to the CPU canvas renderer.
   */
  function ensureWebglRenderer(): WebglGlassRenderer | null {
    if (destroyed) return null;
    if (!webglState) {
      const canvas = document.createElement("canvas");
      styleOverlayCanvas(canvas);
      const renderer = createWebglGlassRenderer(canvas, {
        onContextLost: () => scheduleApply(),
        onContextRestored: () => scheduleApply(),
      });
      if (renderer) state.container.append(canvas);
      webglState = { canvas, renderer };
    }
    const renderer = webglState.renderer;
    if (!renderer || renderer.isContextLost()) return null;
    return renderer;
  }

  function hideWebglCanvas(): boolean {
    if (!webglState?.renderer) return false;
    const changed = setStyle(webglState.canvas, "display", "none");
    webglState.renderer.clear();
    return changed;
  }
}

interface NormalizedControllerState {
  container: HTMLElement;
  source?: HTMLElement;
  target?: HTMLElement;
  lens: LensParams;
  position: Required<LensPosition>;
  engine: LiquidGlassEngine;
  mode: LiquidGlassRenderMode;
  renderer: LiquidGlassRenderer;
  sourceImageUrl?: string;
  safariRefresh: boolean;
  respectReducedTransparency: boolean;
  onStats?: (stats: LiquidGlassControllerStats) => void;
}

function normalizeOptions(
  options: LiquidGlassControllerOptions & { engine: LiquidGlassEngine },
): NormalizedControllerState {
  return {
    container: options.container,
    source: options.source,
    target: options.target,
    engine: options.engine,
    onStats: options.onStats,
    sourceImageUrl: options.sourceImageUrl,
    lens: normalizeLensParams(options.lens),
    mode: options.mode ?? "source",
    renderer: options.renderer ?? "auto",
    position: {
      x: options.position?.x ?? 0.5,
      y: options.position?.y ?? 0.5,
      unit: options.position?.unit ?? "normalized",
    },
    safariRefresh: options.safariRefresh ?? isSafari(),
    respectReducedTransparency: options.respectReducedTransparency ?? true,
  };
}

interface SvgGeometryWrites {
  /** Writes to the <filter> element's own region attributes (x/y/w/h). */
  regionWrites: number;
  /** Writes to filter primitive attributes (feImage, matrices, scales…). */
  primitiveWrites: number;
}

function updateSvgGeometry(
  elements: SvgFilterElements,
  geometry: LensGeometry,
  lens: LensParams,
): SvgGeometryWrites {
  let regionWrites = 0;
  regionWrites += Number(setAttr(elements.filter, "x", geometry.filterX));
  regionWrites += Number(setAttr(elements.filter, "y", geometry.filterY));
  regionWrites += Number(setAttr(elements.filter, "width", geometry.filterWidth));
  regionWrites += Number(setAttr(elements.filter, "height", geometry.filterHeight));
  let primitiveWrites = 0;
  primitiveWrites += Number(setAttr(elements.mapImage, "x", geometry.left));
  primitiveWrites += Number(setAttr(elements.mapImage, "y", geometry.top));
  primitiveWrites += Number(setAttr(elements.mapImage, "width", geometry.width));
  primitiveWrites += Number(setAttr(elements.mapImage, "height", geometry.height));
  primitiveWrites += Number(
    setAttr(elements.mapMatrix, "values", colorMatrixStringForScale(lens.scaleX, lens.scaleY)),
  );
  primitiveWrites += Number(setAttr(elements.sourceBlur, "stdDeviation", String(lens.blur * 0.18)));
  const baseScale = Math.max(lens.scaleX, lens.scaleY);
  primitiveWrites += Number(setAttr(elements.displacementR, "scale", baseScale * (1 + 0.2 * lens.chroma)));
  primitiveWrites += Number(setAttr(elements.displacementG, "scale", baseScale * (1 + 0.1 * lens.chroma)));
  primitiveWrites += Number(setAttr(elements.displacementB, "scale", baseScale));
  const specStrength = Math.max(0, Math.min(3, lens.glow + lens.edge));
  primitiveWrites += Number(
    setAttr(elements.specFlood, "flood-opacity", String(Math.min(0.72, specStrength * 0.22))),
  );
  primitiveWrites += Number(
    setAttr(
      elements.specMatrix,
      "values",
      `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${specStrength} 0 ${-0.5 * specStrength}`,
    ),
  );
  return { regionWrites, primitiveWrites };
}

function resolveRenderer(state: NormalizedControllerState): Exclude<LiquidGlassRenderer, "auto"> {
  if (state.renderer !== "auto") return state.renderer;
  // Where auto used to pick the CPU canvas (Safari + target + image scene),
  // prefer WebGL; apply() downgrades to "canvas" when creation fails.
  if (state.mode === "target" && state.sourceImageUrl && isSafari()) return "webgl";
  return "svg";
}

interface CanvasImageState {
  url: string;
  image: HTMLImageElement;
}

interface CanvasDrawInput {
  containerRect: DOMRect;
  geometry: LensGeometry;
  image: HTMLImageElement;
  lens: LensParams;
  map: DisplacementMap;
}

function getPixelRatio(): number {
  const ratio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.min(ratio, 3));
}

function styleOverlayCanvas(canvas: HTMLCanvasElement): void {
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "3";
  canvas.style.pointerEvents = "none";
  canvas.style.display = "none";
}

function createCanvasRenderer() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const sceneCanvas = document.createElement("canvas");
  const sceneCtx = sceneCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  let sceneCache: { key: string; pixels: ImageData } | null = null;

  styleOverlayCanvas(canvas);

  return {
    canvas,
    clear() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    draw(input: CanvasDrawInput) {
      if (!ctx || !sceneCtx) return;
      const pixelRatio = getPixelRatio();
      const cssWidth = Math.max(1, Math.round(input.containerRect.width));
      const cssHeight = Math.max(1, Math.round(input.containerRect.height));
      const width = Math.max(1, Math.round(cssWidth * pixelRatio));
      const height = Math.max(1, Math.round(cssHeight * pixelRatio));
      resizeCanvas(canvas, width, height);
      resizeCanvas(sceneCanvas, width, height);
      ctx.clearRect(0, 0, width, height);
      const blur = input.lens.blur;
      const cacheKey = getCanvasSceneCacheKey(input.image, width, height, blur, pixelRatio);
      if (sceneCache?.key !== cacheKey) {
        drawCoverImage(sceneCtx, input.image, width, height, blur * pixelRatio);
        applyCanvasBlur(sceneCtx, width, height, blur, pixelRatio);
        sceneCache = {
          key: cacheKey,
          pixels: sceneCtx.getImageData(0, 0, width, height),
        };
      }
      const scenePixels = sceneCache.pixels;
      const lensW = Math.max(1, Math.round(input.geometry.width * pixelRatio));
      const lensH = Math.max(1, Math.round(input.geometry.height * pixelRatio));
      const left = Math.round(input.geometry.left * pixelRatio);
      const top = Math.round(input.geometry.top * pixelRatio);
      const output = ctx.createImageData(lensW, lensH);
      const out = output.data;

      for (let y = 0; y < lensH; y += 1) {
        for (let x = 0; x < lensW; x += 1) {
          const outIndex = (y * lensW + x) * 4;
          const cssX = (x + 0.5) / pixelRatio;
          const cssY = (y + 0.5) / pixelRatio;
          if (!roundedRectInside(cssX, cssY, input.geometry.width, input.geometry.height, input.geometry.radius)) {
            out[outIndex + 3] = 0;
            continue;
          }

          const sampleInput = {
            source: scenePixels.data,
            sourceWidth: width,
            sourceHeight: height,
            map: input.map,
            lens: input.lens,
            lensWidth: input.geometry.width,
            lensHeight: input.geometry.height,
            lensX: input.geometry.left,
            lensY: input.geometry.top,
            localX: cssX,
            localY: cssY,
            pixelRatio,
            strength: CANVAS_STRENGTH,
          };

          out[outIndex] = sampleGlassChannel(sampleInput, 0);
          out[outIndex + 1] = sampleGlassChannel(sampleInput, 1);
          out[outIndex + 2] = sampleGlassChannel(sampleInput, 2);
          out[outIndex + 3] = 255;

          const alpha = specularAlpha(input.map, cssX, cssY, input.geometry.width, input.geometry.height);
          if (alpha > 0) {
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

function getCanvasSceneCacheKey(
  image: HTMLImageElement,
  width: number,
  height: number,
  blur: number,
  pixelRatio: number,
): string {
  return [
    image.currentSrc || image.src,
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
    Math.round(blur * 100),
    Math.round(pixelRatio * 100),
  ].join("|");
}
