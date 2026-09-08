import { normalizeLensParams } from "../engine/defaults";
import { getSharedLiquidGlassEngine } from "../engine/create-engine";
import { getCachedDisplacementMap } from "../engine/map-cache";
import {
  MERGED_ALPHA_DISTANCE_RANGE,
  generateMergedDisplacementMap,
  mergedMapKey,
} from "../engine/merged";
import { clampLensScales, clampMergedScales } from "../engine/map-slope";
import { colorMatrixStringForScale, mapKey, targetBleed } from "../engine/ts-engine";
import type {
  DisplacementMap,
  LensGeometry,
  LensParams,
  LensPosition,
  LiquidGlassEngine,
  LiquidGlassRenderMode,
  MergedMapInput,
} from "../engine/types";
import { setAttr, setHref, setStyle } from "./dom";
import { isSafari } from "./is-safari";
import { countGlassDraw, countMapGeneratedOutsideCache } from "./perf-stats";
import { displacementMapToPngBlobUrl, revokeMapBlobUrl } from "./png";
import { createRenderGate, type RenderGate } from "./render-gate";
import {
  CANVAS_STRENGTH,
  applyCanvasBlur,
  resizeCanvas,
  roundedRectInside,
  sampleGlassChannel,
  sampleMapDistance,
  specularAlpha,
} from "./render-utils";
import { createSvgFilter, type SvgFilterElements } from "./svg-filter";
import {
  parseCssColor,
  resolveGlassTint,
  type GlassTint,
  type GlassTintInput,
  type GlassTintName,
} from "./tints";
import {
  createWebglGlassRenderer,
  type WebglGlassChrome,
  type WebglGlassRenderer,
} from "./webgl-renderer";

export interface LiquidGlassControllerStats {
  activeEngine: "wasm" | "ts";
  activeRenderer: LiquidGlassRenderer;
  applyCount: number;
  domWrites: number;
  lastMapMs: number;
  lastApplyMs: number;
}

export type LiquidGlassRenderer = "auto" | "svg" | "canvas" | "webgl";

export interface LensInstanceInput {
  /** Same units handling as the top-level `position` option. */
  position: LensPosition;
  /** Defaults to the shared lens params' width. */
  width?: number;
  /** Defaults to the shared lens params' height. */
  height?: number;
  /** Defaults to the shared lens params' radius (clamped to the lens size). */
  radius?: number;
}

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
  /**
   * Multiple lens instances sharing the optics of `lens`. Two or more
   * entries enable merged "liquid blend" (metaball) rendering, which needs a
   * pixel-readable scene: it requires `sourceImageUrl` and the webgl/canvas
   * renderers. With renderer "svg" or without an image scene, only the first
   * lens is rendered through the regular single-lens path (a dev-only warning
   * is logged once). A single entry behaves exactly like `position` (+ the
   * optional per-lens size overrides).
   */
  lenses?: LensInstanceInput[];
  /** Smooth-union blend distance for merged lenses, in px. Default 40. */
  blend?: number;
  /**
   * Glass chrome tint for merged (multi-lens) rendering. The WebGL shader
   * derives backdrop saturation, a tint fill, border band, angular rim
   * highlight, and a drop shadow from the merged blob SDF, so the chrome
   * merges with the metaball instead of being drawn as separate DOM circles
   * (the CPU canvas fallback draws the same saturation + fill + border +
   * shadow but shades the border flat — no rim highlight). Single-lens paths
   * ignore it.
   */
  tint?: GlassTintName | GlassTintInput | GlassTint;
  sourceImageUrl?: string;
  safariRefresh?: boolean;
  /**
   * When true (the default), honor `prefers-reduced-transparency: reduce` by
   * skipping the displacement filter entirely.
   */
  respectReducedTransparency?: boolean;
  /**
   * When true (the default), defer applies while the container is offscreen
   * or the tab is hidden; the deferred apply runs on re-entry.
   */
  pauseOffscreen?: boolean;
  onStats?: (stats: LiquidGlassControllerStats) => void;
}

export interface LiquidGlassController {
  readonly stats: LiquidGlassControllerStats;
  update(next: Partial<LiquidGlassControllerOptions>): void;
  setPosition(position: LensPosition): void;
  /**
   * Fast path for dragging one lens of a multi-lens setup. Index 0 also works
   * in single-lens mode (alias of `setPosition`).
   */
  setLensPosition(index: number, position: LensPosition): void;
  destroy(): void;
}

const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

/** Default smooth-union blend distance (px) for merged multi-lens scenes. */
export const DEFAULT_MERGED_BLEND = 40;

/**
 * CSS reference for the merged chrome's drop shadow: the playground's
 * `.glassChrome` uses `box-shadow: 0 18px 48px <tint shadow>`.
 */
const CSS_SHADOW_OFFSET_Y = 18;
const CSS_SHADOW_BLUR = 48;
/**
 * The shader reads the shadow's distance from the merged map's alpha band,
 * which saturates at ±MERGED_ALPHA_DISTANCE_RANGE px from the blob edge —
 * beyond it the decoded distance is constant and the shadow would clip into a
 * hard-edged ring. Scale the CSS geometry (offset 18px + blur 48px = 66px of
 * extent) uniformly so |offset| + blur fits the band exactly: with a 40px
 * band that yields ≈10.9px offset and ≈29.1px blur.
 */
const MERGED_SHADOW_SCALE = MERGED_ALPHA_DISTANCE_RANGE / (CSS_SHADOW_OFFSET_Y + CSS_SHADOW_BLUR);
const MERGED_SHADOW_OFFSET: [number, number] = [0, CSS_SHADOW_OFFSET_Y * MERGED_SHADOW_SCALE];
const MERGED_SHADOW_BLUR = CSS_SHADOW_BLUR * MERGED_SHADOW_SCALE;
/**
 * Subtle top-rim fallback: presets ship transparent highlights (opacity 0),
 * but the CSS chrome's bright border still catches light at the top, so the
 * shader rim keeps a faint floor instead of going fully flat.
 */
const MIN_RIM_STRENGTH = 0.18;

/**
 * During a param-drag burst, regenerate the displacement map at most this
 * often; between regens the previous map keeps rendering (feImage stretches
 * it over the lens box, `preserveAspectRatio: none`), so a mapSize/width drag
 * swaps multi-MB feImage hrefs ~8x/s instead of per pointermove — churn that
 * could silently wedge Chrome's SVG filter pipeline into rendering black.
 */
const MAP_REGEN_MIN_INTERVAL_MS = 120;
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
  let lastMergedMapKey = "";
  let lastMergedMap: DisplacementMap | null = null;
  // Burst control (see MAP_REGEN_MIN_INTERVAL_MS / FILTER_SETTLE_REFRESH_MS):
  // rapid param churn (slider drags) used to mutate the SVG filter hard
  // enough to silently wedge Chrome's filter pipeline into rendering black.
  let lastMapRegenAt = 0;
  let lastMapUrl0Revoke = "";
  let mapRegenTimer: number | null = null;

  let warnedMergedFallback = false;
  let imageState: CanvasImageState | null = null;
  let destroyed = false;
  let rafId: number | null = null;
  // Created lazily on the first apply that wants WebGL; renderer stays null
  // when context creation fails so apply() falls back to the CPU canvas.
  let webglState: { canvas: HTMLCanvasElement; renderer: WebglGlassRenderer | null } | null = null;
  // Chrome uniforms parsed from the resolved tint, cached per tint identity
  // so merged drag frames never re-parse CSS color strings.
  let chromeCache: { key: string; chrome: WebglGlassChrome } | null = null;
  // Idle hardening: skip renderer draws / SVG geometry formatting when the
  // full set of draw inputs is unchanged (e.g. ResizeObserver no-op ticks).
  let lastWebglDrawKey = "";
  let lastCanvasDrawKey = "";
  let lastSvgGeometryKey = "";
  // Offscreen/hidden gating (pauseOffscreen): applies are deferred while
  // gated and replayed on re-entry.
  let renderGate: RenderGate | null = null;
  let pendingWhileGated = false;

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

  if (options.pauseOffscreen ?? true) {
    renderGate = createRenderGate(state.container);
    renderGate.subscribe((active) => {
      if (active && pendingWhileGated && !destroyed) {
        pendingWhileGated = false;
        scheduleApply();
      }
    });
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
    setPosition: setPositionFast,
    setLensPosition(index, position) {
      if (destroyed) return;
      if (!state.lenses || state.lenses.length === 0) {
        // Single-lens mode: index 0 aliases setPosition.
        if (index !== 0) return;
        setPositionFast(position);
        return;
      }
      const current = state.lenses[index];
      if (!current) return;
      // Fast path mirroring setPosition: skip the full option/lens
      // re-normalization and only swap that lens's (already cheap) position.
      const lenses = state.lenses.slice();
      lenses[index] = {
        ...current,
        position: {
          x: position.x ?? current.position.x,
          y: position.y ?? current.position.y,
          unit: position.unit ?? current.position.unit,
        },
      };
      state = { ...state, lenses };
      scheduleApply();
    },
    destroy() {
      destroyed = true;
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
      if (mapRegenTimer !== null) {
        clearTimeout(mapRegenTimer);
        mapRegenTimer = null;
      }
      if (lastMapUrl0Revoke) {
        revokeMapBlobUrl(lastMapUrl0Revoke);
        lastMapUrl0Revoke = "";
      }
      resizeObserver?.disconnect();
      observedElements.clear();
      renderGate?.destroy();
      renderGate = null;
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

  /**
   * Fast path for pointer-driven drags: skip the full option/lens
   * re-normalization and only swap the (already cheap) position.
   */
  function setPositionFast(position: LensPosition): void {
    if (destroyed) return;
    state = {
      ...state,
      position: {
        x: position.x ?? state.position.x,
        y: position.y ?? state.position.y,
        unit: position.unit ?? state.position.unit,
      },
    };
    scheduleApply();
  }

  /** Coalesce all applies into one per frame (latest state wins). */
  function scheduleApply(): void {
    if (destroyed) return;
    // Offscreen/hidden: remember that work is pending and run it on re-entry
    // (the latest state wins, exactly like rAF coalescing).
    if (renderGate && !renderGate.active) {
      pendingWhileGated = true;
      return;
    }
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

    // Two or more lens instances request merged "liquid blend" rendering,
    // which needs a pixel-readable scene (webgl/canvas + image). Otherwise
    // warn once (dev only) and fall through rendering only the primary lens.
    if (state.lenses && state.lenses.length >= 2) {
      const mergedRenderer = resolveMergedRenderer(state);
      if (mergedRenderer) {
        applyMerged(applyStarted, targetElement, mergedRenderer);
        return;
      }
      warnMergedFallback();
    }

    // Single-lens path. When a `lenses` array is present the primary entry
    // supplies the position and per-lens size overrides.
    const primary = state.lenses && state.lenses.length > 0 ? state.lenses[0] : null;
    const lens = primary ? lensParamsForInstance(state.lens, primary) : state.lens;
    const position = primary ? primary.position : state.position;

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
      x: position.x,
      y: position.y,
      unit: position.unit,
      mode: state.mode,
      lens,
    });
    const key = mapKey(lens);
    let domWrites = 0;

    if (key !== lastMapKey || !lastMap) {
      const now = performance.now();
      if (lastMap && now - lastMapRegenAt < MAP_REGEN_MIN_INTERVAL_MS) {
        // Mid-burst: keep the previous map on screen and regenerate once the
        // interval elapses (trailing edge), so the final value always lands.
        if (mapRegenTimer === null && typeof window !== "undefined") {
          mapRegenTimer = window.setTimeout(() => {
            mapRegenTimer = null;
            scheduleApply();
          }, MAP_REGEN_MIN_INTERVAL_MS);
        }
      } else {
        const mapStarted = performance.now();
        // Served from the global cross-controller map cache (identity-stable,
        // so the WebGL renderer skips re-uploading an unchanged map texture).
        lastMap = getCachedDisplacementMap(engine, lens);
        lastMapUrl = "";
        lastMapKey = key;
        lastMapRegenAt = now;
        stats.lastMapMs = performance.now() - mapStarted;
        filterVersion += 1;
      }
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
        const sceneKey = [
          image.currentSrc || image.src,
          image.naturalWidth,
          image.naturalHeight,
          Math.round(lens.blur * 100),
        ].join("|");
        // Skip the GPU pass entirely when every draw input is unchanged
        // (e.g. a ResizeObserver tick that didn't actually move anything).
        const drawKey = [
          "w",
          sceneKey,
          key,
          geometry.left,
          geometry.top,
          geometry.width,
          geometry.height,
          geometry.radius,
          containerRect.width,
          containerRect.height,
          lens.scaleX,
          lens.scaleY,
          lens.chroma,
          lens.maxSlope,
        ].join("|");
        if (drawKey !== lastWebglDrawKey) {
          webglRenderer.render({
            scene: image,
            sceneKey,
            map: lastMap,
            lens,
            geometry,
            sceneWidth: containerRect.width,
            sceneHeight: containerRect.height,
          });
          lastWebglDrawKey = drawKey;
        }
      } else {
        webglRenderer.clear();
        lastWebglDrawKey = "";
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
        const containerRect = state.container.getBoundingClientRect();
        // Skip the CPU per-pixel loop entirely on no-op applies.
        const drawKey = [
          "c",
          image.currentSrc || image.src,
          key,
          geometry.left,
          geometry.top,
          geometry.width,
          geometry.height,
          geometry.radius,
          containerRect.width,
          containerRect.height,
          lens.scaleX,
          lens.scaleY,
          lens.chroma,
          lens.maxSlope,
        ].join("|");
        if (drawKey !== lastCanvasDrawKey) {
          canvasRenderer.draw({
            containerRect,
            geometry,
            image,
            lens,
            map: lastMap,
          });
          countGlassDraw("canvas");
          lastCanvasDrawKey = drawKey;
        }
      } else {
        canvasRenderer.clear();
        lastCanvasDrawKey = "";
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
      // Deferred revocation: the previous blob stays fetchable while any
      // in-flight decode/rebuild may still reference it.
      const previousUrl = lastMapUrl0Revoke;
      lastMapUrl = displacementMapToPngBlobUrl(lastMap);
      lastMapUrl0Revoke = lastMapUrl;
      primitiveWrites += Number(setHref(elements.mapImage, lastMapUrl));
      if (previousUrl && typeof window !== "undefined") {
        window.setTimeout(() => revokeMapBlobUrl(previousUrl), 5000);
      }
    }
    // Skip the ~14 attribute reads + string formatting in updateSvgGeometry
    // when the full set of geometry/optics inputs is unchanged (the DOM
    // setters are already value-stable; this avoids even the read pass).
    const svgGeometryKey = [
      key,
      geometry.left,
      geometry.top,
      geometry.width,
      geometry.height,
      geometry.radius,
      geometry.filterX,
      geometry.filterY,
      geometry.filterWidth,
      geometry.filterHeight,
      geometry.bleed,
      lens.scaleX,
      lens.scaleY,
      lens.blur,
      lens.chroma,
      lens.glow,
      lens.edge,
      lens.maxSlope,
    ].join("|");
    let geometryWrites = { primitiveWrites: 0, regionWrites: 0 };
    if (svgGeometryKey !== lastSvgGeometryKey) {
      geometryWrites = updateSvgGeometry(elements, geometry, lens, lastMap);
      lastSvgGeometryKey = svgGeometryKey;
    }
    primitiveWrites += geometryWrites.primitiveWrites;
    domWrites += primitiveWrites + geometryWrites.regionWrites;
    if (primitiveWrites + geometryWrites.regionWrites > 0) countGlassDraw("svg");

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

  /**
   * Merged "liquid blend" apply: all lenses share one displacement map that
   * covers the bounding region of every lens rect (plus blend + bleed
   * margin). The map's alpha channel carries the blob coverage mask, so the
   * webgl/canvas renderers draw the region rect with maskMode "map".
   */
  function applyMerged(
    applyStarted: number,
    targetElement: HTMLElement,
    requestedRenderer: "webgl" | "canvas",
  ): void {
    const rect = state.container.getBoundingClientRect();
    const containerWidth = Math.max(1, rect.width);
    const containerHeight = Math.max(1, rect.height);
    const instances = state.lenses ?? [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const centers = instances.map((instance) => {
      const cx =
        instance.position.unit === "px" ? instance.position.x : instance.position.x * containerWidth;
      const cy =
        instance.position.unit === "px" ? instance.position.y : instance.position.y * containerHeight;
      minX = Math.min(minX, cx - instance.width / 2);
      minY = Math.min(minY, cy - instance.height / 2);
      maxX = Math.max(maxX, cx + instance.width / 2);
      maxY = Math.max(maxY, cy + instance.height / 2);
      return { cx, cy, instance };
    });

    // Region = lens bbox expanded by the blend distance plus the same bleed
    // margin target mode uses (displacement + blur tails), clamped to the
    // container. When the chrome casts a drop shadow the margin also covers
    // its offset + blur so the shadow is not clipped at the region edge.
    const chrome = chromeForTint(state.tint);
    const shadowMargin =
      chrome && chrome.shadowColor && chrome.shadowColor[3] > 0
        ? Math.hypot(chrome.shadowOffset?.[0] ?? 0, chrome.shadowOffset?.[1] ?? 0) +
          (chrome.shadowBlur ?? 0)
        : 0;
    const margin = state.blend + targetBleed(state.lens) + shadowMargin;
    const regionLeft = Math.max(0, minX - margin);
    const regionTop = Math.max(0, minY - margin);
    const regionWidth = Math.max(1, Math.min(containerWidth, maxX + margin) - regionLeft);
    const regionHeight = Math.max(1, Math.min(containerHeight, maxY + margin) - regionTop);

    const mergedInput: MergedMapInput = {
      regionWidth,
      regionHeight,
      blend: state.blend,
      lens: state.lens,
      lenses: centers.map(({ cx, cy, instance }) => ({
        x: cx - regionLeft,
        y: cy - regionTop,
        width: instance.width,
        height: instance.height,
        radius: instance.radius,
      })),
    };

    // mergedMapKey quantizes lens offsets relative to the first lens, so a
    // static blob (or the whole group translating) reuses the cached map;
    // dragging one lens regenerates per frame inside this rAF'd apply.
    const key = mergedMapKey(mergedInput);
    if (key !== lastMergedMapKey || !lastMergedMap) {
      const mapStarted = performance.now();
      lastMergedMap = engine.generateMergedDisplacementMap
        ? engine.generateMergedDisplacementMap(mergedInput)
        : generateMergedDisplacementMap(mergedInput);
      lastMergedMapKey = key;
      stats.lastMapMs = performance.now() - mapStarted;
      countMapGeneratedOutsideCache();
    }

    const geometry = {
      left: regionLeft,
      top: regionTop,
      width: regionWidth,
      height: regionHeight,
      radius: 0,
    };

    // Per-lens rects (region px) anchor the chrome's interior highlight glow
    // to each lens box, like the CSS chrome's per-element radial gradient.
    const lensRects = mergedInput.lenses.map((instance) => ({
      x: instance.x,
      y: instance.y,
      halfW: instance.width / 2,
      halfH: instance.height / 2,
    }));

    let activeRenderer: "webgl" | "canvas" = requestedRenderer;
    let webglRenderer: WebglGlassRenderer | null = null;
    if (activeRenderer === "webgl") {
      webglRenderer = ensureWebglRenderer();
      if (!webglRenderer) activeRenderer = "canvas";
    }

    let domWrites = 0;
    const image = ensureCanvasImage(state.sourceImageUrl);
    domWrites += Number(setStyle(targetElement, "filter", ""));
    domWrites += Number(setStyle(targetElement, "visibility", "hidden"));
    const inactive = state.mode === "target" ? state.source : state.target;
    if (inactive && inactive !== targetElement) {
      domWrites += Number(setStyle(inactive, "filter", ""));
    }

    // Full draw-input identity for no-op apply skips: the merged map key
    // quantizes to 1px, so the UNQUANTIZED centers are folded in to keep
    // sub-pixel drags rendering.
    const mergedDrawKey = [
      key,
      chromeCache?.key ?? "",
      rect.width,
      rect.height,
      geometry.left,
      geometry.top,
      geometry.width,
      geometry.height,
      centers.map(({ cx, cy }) => `${cx},${cy}`).join(";"),
      image ? image.currentSrc || image.src : "",
    ].join("|");

    if (activeRenderer === "webgl" && webglRenderer && webglState) {
      domWrites += Number(setStyle(webglState.canvas, "display", "block"));
      domWrites += Number(setStyle(canvasRenderer.canvas, "display", "none"));
      canvasRenderer.clear();
      if (image && lastMergedMap) {
        if (`mw|${mergedDrawKey}` !== lastWebglDrawKey) {
          webglRenderer.render({
            scene: image,
            sceneKey: [
              image.currentSrc || image.src,
              image.naturalWidth,
              image.naturalHeight,
              Math.round(state.lens.blur * 100),
            ].join("|"),
            map: lastMergedMap,
            lens: state.lens,
            geometry,
            maskMode: "map",
            chrome,
            lensRects,
            alphaDistRange: MERGED_ALPHA_DISTANCE_RANGE,
            sceneWidth: rect.width,
            sceneHeight: rect.height,
          });
          lastWebglDrawKey = `mw|${mergedDrawKey}`;
        }
      } else {
        webglRenderer.clear();
        lastWebglDrawKey = "";
      }
      finishApply(applyStarted, domWrites, activeRenderer);
      return;
    }

    domWrites += Number(setStyle(canvasRenderer.canvas, "display", "block"));
    domWrites += Number(hideWebglCanvas());
    if (image && lastMergedMap) {
      if (`mc|${mergedDrawKey}` !== lastCanvasDrawKey) {
        canvasRenderer.draw({
          containerRect: rect,
          geometry,
          image,
          lens: state.lens,
          map: lastMergedMap,
          maskMode: "map",
          chrome,
          lensRects,
        });
        countGlassDraw("canvas");
        lastCanvasDrawKey = `mc|${mergedDrawKey}`;
      }
    } else {
      canvasRenderer.clear();
      lastCanvasDrawKey = "";
    }
    finishApply(applyStarted, domWrites, activeRenderer);
  }

  /**
   * Chrome uniforms for the merged renderers, derived from the resolved
   * tint: fill from `background`, border from `border` (1px band), rim
   * highlight from `highlight` (its alpha is the strength, floored at
   * MIN_RIM_STRENGTH so presets keep a subtle top rim), the lobe shape from
   * highlightSpread/Core/Width/Height, the light direction from the
   * highlight position (center → highlight, top-light fallback) rotated by
   * highlightRotation, backdrop saturation from `saturation`, and the drop
   * shadow color from `shadow` with the CSS-derived (band-capped) geometry.
   */
  function chromeForTint(tint: GlassTint | undefined): WebglGlassChrome | undefined {
    if (!tint) return undefined;
    const key = [
      tint.background,
      tint.border,
      tint.highlight,
      tint.highlightX,
      tint.highlightY,
      tint.highlightRotation,
      tint.highlightSpread,
      tint.highlightCore,
      tint.highlightWidth,
      tint.highlightHeight,
      tint.shadow,
      tint.saturation,
    ].join("|");
    if (chromeCache?.key === key) return chromeCache.chrome;
    const highlight = parseCssColor(tint.highlight);
    const shadow = parseCssColor(tint.shadow);
    const chrome: WebglGlassChrome = {
      tint: parseCssColor(tint.background) ?? [0, 0, 0, 0],
      border: parseCssColor(tint.border) ?? [0, 0, 0, 0],
      // Match the CSS chrome's `border: 1px solid` (single-lens mode). The
      // shader AA softens both edges of the band, so anything wider reads
      // visibly fatter than the CSS border it replaces.
      borderWidth: 1,
      highlight: highlight ? [highlight[0], highlight[1], highlight[2]] : [1, 1, 1],
      highlightStrength: Math.max(highlight ? highlight[3] : 0, MIN_RIM_STRENGTH),
      lightDir: rotateDir(
        lightDirFromHighlight(tint.highlightX, tint.highlightY),
        tint.highlightRotation,
      ),
      highlightSpread: tint.highlightSpread,
      highlightCore: tint.highlightCore,
      highlightAniso: [tint.highlightWidth, tint.highlightHeight],
      // Interior glow (the CSS chrome's radial-gradient background layer +
      // blurred ::before hot-spot): color straight from `highlight` (alpha =
      // highlightOpacity, NOT floored — presets with transparent highlights
      // get no interior wash), anchored/sized by the highlight fractions of
      // each lens box, hot-spot rotated by highlightRotation. The gradient
      // stops reuse highlightCore/Spread via the uniforms above.
      glowColor: highlight ?? [1, 1, 1, 0],
      glowAnchor: [tint.highlightX, tint.highlightY],
      glowRadii: [tint.highlightWidth, tint.highlightHeight],
      glowRotation: (tint.highlightRotation * Math.PI) / 180,
      saturation: tint.saturation,
      shadowColor: shadow ?? [0, 0, 0, 0],
      shadowOffset: MERGED_SHADOW_OFFSET,
      shadowBlur: MERGED_SHADOW_BLUR,
    };
    chromeCache = { key, chrome };
    return chrome;
  }

  /** Dev-only, once per controller: merged mode needs webgl/canvas + image. */
  function warnMergedFallback(): void {
    if (warnedMergedFallback) return;
    warnedMergedFallback = true;
    const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
      ?.NODE_ENV;
    if (env === "production") return;
    // eslint-disable-next-line no-console
    console.warn(
      "[liquid-glass] Multiple lenses (liquid blend) require a pixel-readable scene: " +
        'set `sourceImageUrl` and use renderer "webgl", "canvas", or "auto". ' +
        "Rendering only the first lens.",
    );
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
        onContextLost: () => {
          lastWebglDrawKey = "";
          scheduleApply();
        },
        onContextRestored: () => {
          // The draw key must not skip the first post-restore render.
          lastWebglDrawKey = "";
          scheduleApply();
        },
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

interface NormalizedLensInstance {
  position: Required<LensPosition>;
  width: number;
  height: number;
  radius: number;
}

interface NormalizedControllerState {
  container: HTMLElement;
  source?: HTMLElement;
  target?: HTMLElement;
  lens: LensParams;
  position: Required<LensPosition>;
  lenses?: NormalizedLensInstance[];
  blend: number;
  tint?: GlassTint;
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
  const lens = normalizeLensParams(options.lens);
  return {
    container: options.container,
    source: options.source,
    target: options.target,
    engine: options.engine,
    onStats: options.onStats,
    sourceImageUrl: options.sourceImageUrl,
    lens,
    mode: options.mode ?? "source",
    renderer: options.renderer ?? "auto",
    position: {
      x: options.position?.x ?? 0.5,
      y: options.position?.y ?? 0.5,
      unit: options.position?.unit ?? "normalized",
    },
    // Merged maps support up to 4 lenses; extra entries are ignored.
    lenses: options.lenses
      ? options.lenses.slice(0, 4).map((input) => normalizeLensInstance(input, lens))
      : undefined,
    blend: Math.max(0, options.blend ?? DEFAULT_MERGED_BLEND),
    tint: options.tint ? resolveGlassTint(options.tint) : undefined,
    safariRefresh: options.safariRefresh ?? isSafari(),
    respectReducedTransparency: options.respectReducedTransparency ?? true,
  };
}

function normalizeLensInstance(input: LensInstanceInput, lens: LensParams): NormalizedLensInstance {
  const width = Math.max(1, input.width ?? lens.width);
  const height = Math.max(1, input.height ?? lens.height);
  return {
    position: {
      x: input.position.x,
      y: input.position.y,
      unit: input.position.unit ?? "normalized",
    },
    width,
    height,
    radius: Math.max(0, Math.min(input.radius ?? lens.radius, width / 2, height / 2)),
  };
}

/** Shared optics + one instance's geometry (used by the single-lens path). */
function lensParamsForInstance(lens: LensParams, instance: NormalizedLensInstance): LensParams {
  return normalizeLensParams({
    ...lens,
    width: instance.width,
    height: instance.height,
    radius: instance.radius,
  });
}

/**
 * CSS-space unit vector from the element center toward the tint's highlight
 * position. Highlight positions are fractions of the element (0.5, 0.5 =
 * center); a near-center highlight has no meaningful direction, so default to
 * top-light (0, -1).
 */
function lightDirFromHighlight(highlightX: number, highlightY: number): [number, number] {
  const dx = highlightX - 0.5;
  const dy = highlightY - 0.5;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.05) return [0, -1];
  return [dx / length, dy / length];
}

/**
 * Rotates a CSS-space direction by `degrees` (clockwise on screen, matching
 * the CSS chrome's `transform: rotate(var(--glass-highlight-rotation))`).
 */
function rotateDir(dir: [number, number], degrees: number): [number, number] {
  if (!Number.isFinite(degrees) || degrees === 0) return dir;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dir[0] * cos - dir[1] * sin, dir[0] * sin + dir[1] * cos];
}

/**
 * Merged mode needs a pixel-readable scene, so it always renders through the
 * webgl/canvas overlay (on all browsers, not just Safari). Returns null when
 * merged rendering is impossible (svg renderer, or no image scene).
 */
function resolveMergedRenderer(state: NormalizedControllerState): "webgl" | "canvas" | null {
  if (!state.sourceImageUrl || state.renderer === "svg") return null;
  return state.renderer === "canvas" ? "canvas" : "webgl";
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
  map: DisplacementMap | null,
): SvgGeometryWrites {
  // No-fold guard: soft-limit the effective displacement scales so the map's
  // measured slope never folds the backdrop (exact no-op below the cap).
  const { scaleX, scaleY } = map ? clampLensScales(map, lens) : lens;
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
    setAttr(elements.mapMatrix, "values", colorMatrixStringForScale(scaleX, scaleY)),
  );
  primitiveWrites += Number(setAttr(elements.sourceBlur, "stdDeviation", String(lens.blur * 0.18)));
  const baseScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
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

/** Minimal draw rect (LensGeometry satisfies it; merged regions use radius 0). */
interface CanvasDrawRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

interface CanvasDrawInput {
  containerRect: DOMRect;
  geometry: CanvasDrawRect;
  image: HTMLImageElement;
  lens: LensParams;
  map: DisplacementMap;
  /**
   * "rect" (default) clips to the rounded rect; "map" decodes the merged
   * map's alpha-encoded signed distance into a crisp (~1px AA) blob mask.
   */
  maskMode?: "rect" | "map";
  /**
   * Saturation + tint fill + interior highlight glow + border + drop shadow
   * drawn from the decoded blob distance ("map" mode only). Unlike WebGL,
   * the canvas path shades the border flat — no rim highlight — to keep the
   * per-pixel loop cheap.
   */
  chrome?: WebglGlassChrome;
  /**
   * Per-lens rects (center + half size, region px) the chrome's interior
   * glow is anchored to ("map" mode only). Mirrors WebglGlassDrawInput.
   */
  lensRects?: Array<{ x: number; y: number; halfW: number; halfH: number }>;
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
      const mapMask = input.maskMode === "map";
      const chrome = mapMask ? input.chrome : undefined;
      // No-fold guard (see engine/map-slope.ts): identical clamp to the SVG
      // and WebGL sinks so all renderers stay visually consistent.
      const clampedScales = mapMask
        ? clampMergedScales(input.map, input.lens, input.geometry.width, input.geometry.height, CANVAS_STRENGTH)
        : clampLensScales(input.map, input.lens, { strength: CANVAS_STRENGTH });
      const sampleLens =
        clampedScales.scaleX !== input.lens.scaleX || clampedScales.scaleY !== input.lens.scaleY
          ? { ...input.lens, scaleX: clampedScales.scaleX, scaleY: clampedScales.scaleY }
          : input.lens;
      const shadowColor = chrome?.shadowColor;
      const hasShadow = Boolean(shadowColor && shadowColor[3] > 0);
      const shadowOffsetX = chrome?.shadowOffset?.[0] ?? 0;
      const shadowOffsetY = chrome?.shadowOffset?.[1] ?? 0;
      const shadowBlur = Math.max(1e-3, chrome?.shadowBlur ?? 0);
      const saturation = chrome?.saturation ?? 1;
      // Interior highlight glow (CPU mirror of the shader's per-lens
      // radial-gradient + hot-spot lobes): precompute per-lens anchors and
      // radii outside the pixel loop. Glow alpha 0 / no lens rects disable.
      const glowColor = chrome?.glowColor ?? [0, 0, 0, 0];
      const glowLenses =
        chrome && glowColor[3] > 0 && input.lensRects
          ? input.lensRects.slice(0, 4).map((rect) => {
              const anchor = chrome.glowAnchor ?? [0.5, 0.5];
              const radiiFrac = chrome.glowRadii ?? [1, 1];
              const rx = Math.max(radiiFrac[0] * rect.halfW * 2, 1e-3);
              const ry = Math.max(radiiFrac[1] * rect.halfH * 2, 1e-3);
              // Hot-spot mask radii = sqrt(2) * (0.34, 0.39) * gradient radii.
              const hx = Math.max(0.480833 * rx, 1e-3);
              const hy = Math.max(0.551543 * ry, 1e-3);
              return {
                ax: rect.x - rect.halfW + anchor[0] * rect.halfW * 2,
                ay: rect.y - rect.halfH + anchor[1] * rect.halfH * 2,
                rx,
                ry,
                hx,
                hy,
                // ~CSS blur(10px) widening of the hot-spot fade, ray units.
                blurFrac: 10 / Math.max(Math.min(hx, hy), 1),
              };
            })
          : [];
      const glowSpread = chrome?.highlightSpread ?? 0;
      const glowFade = Math.max(glowSpread - (chrome?.highlightCore ?? 0), 1e-3);
      const glowRotation = chrome?.glowRotation ?? 0;
      const glowCos = Math.cos(glowRotation);
      const glowSin = Math.sin(glowRotation);

      for (let y = 0; y < lensH; y += 1) {
        for (let x = 0; x < lensW; x += 1) {
          const outIndex = (y * lensW + x) * 4;
          const cssX = (x + 0.5) / pixelRatio;
          const cssY = (y + 0.5) / pixelRatio;
          // "map" decodes the alpha-encoded signed distance and rebuilds a
          // crisp ~1px-AA coverage edge (the raw alpha ramp spans the whole
          // ±MERGED_ALPHA_DISTANCE_RANGE band); "rect" keeps the binary
          // rounded-rect test.
          let coverage = 1;
          let distance = 0;
          if (mapMask) {
            distance = sampleMapDistance(input.map, cssX, cssY, input.geometry.width, input.geometry.height);
            coverage = Math.min(1, Math.max(0, 0.5 - distance));
          } else if (!roundedRectInside(cssX, cssY, input.geometry.width, input.geometry.height, input.geometry.radius)) {
            coverage = 0;
          }
          // Drop shadow under the glass: decode the blob distance at the
          // point the shadow is cast from and fade it over the blur radius
          // (same curve as the shader's smoothstep(-blur * 0.25, blur, d)).
          let shadowAlpha = 0;
          if (hasShadow && coverage < 1) {
            const dShadow = sampleMapDistance(
              input.map,
              cssX - shadowOffsetX,
              cssY - shadowOffsetY,
              input.geometry.width,
              input.geometry.height,
            );
            shadowAlpha = shadowColor![3] * (1 - smoothstep(-shadowBlur * 0.25, shadowBlur, dShadow));
          }
          if (coverage <= 0) {
            if (shadowAlpha > 0) {
              out[outIndex] = Math.round(shadowColor![0] * 255);
              out[outIndex + 1] = Math.round(shadowColor![1] * 255);
              out[outIndex + 2] = Math.round(shadowColor![2] * 255);
              out[outIndex + 3] = Math.round(shadowAlpha * 255);
            } else {
              out[outIndex + 3] = 0;
            }
            continue;
          }

          const sampleInput = {
            source: scenePixels.data,
            sourceWidth: width,
            sourceHeight: height,
            map: input.map,
            lens: sampleLens,
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
          out[outIndex + 3] = coverage >= 1 ? 255 : Math.round(coverage * 255);

          const alpha = specularAlpha(input.map, cssX, cssY, input.geometry.width, input.geometry.height);
          if (alpha > 0) {
            out[outIndex] = Math.round(out[outIndex] * (1 - alpha) + 255 * alpha);
            out[outIndex + 1] = Math.round(out[outIndex + 1] * (1 - alpha) + 255 * alpha);
            out[outIndex + 2] = Math.round(out[outIndex + 2] * (1 - alpha) + 255 * alpha);
          }

          if (chrome) {
            // Backdrop saturation (Rec. 709 luma, same weights as the
            // shader), applied before tint compositing.
            if (saturation !== 1) {
              const lum =
                0.2126 * out[outIndex] + 0.7152 * out[outIndex + 1] + 0.0722 * out[outIndex + 2];
              out[outIndex] = Math.round(lum + (out[outIndex] - lum) * saturation);
              out[outIndex + 1] = Math.round(lum + (out[outIndex + 1] - lum) * saturation);
              out[outIndex + 2] = Math.round(lum + (out[outIndex + 2] - lum) * saturation);
            }
            // Tint fill: src-over the refracted color inside the blob.
            const tintAlpha = chrome.tint[3];
            if (tintAlpha > 0) {
              out[outIndex] = Math.round(out[outIndex] * (1 - tintAlpha) + chrome.tint[0] * 255 * tintAlpha);
              out[outIndex + 1] = Math.round(out[outIndex + 1] * (1 - tintAlpha) + chrome.tint[1] * 255 * tintAlpha);
              out[outIndex + 2] = Math.round(out[outIndex + 2] * (1 - tintAlpha) + chrome.tint[2] * 255 * tintAlpha);
            }
            // Interior highlight glow src-over the tint, under the border:
            // per-lens primary gradient lobe + rotated, blur-widened
            // hot-spot lobe (same math as the WebGL shader's glow).
            if (glowLenses.length > 0) {
              let combined = 0;
              for (const lens of glowLenses) {
                const relX = cssX - lens.ax;
                const relY = cssY - lens.ay;
                const r1 = Math.hypot(relX / lens.rx, relY / lens.ry);
                const t1 = Math.min(1, Math.max(0, (glowSpread - r1) / glowFade));
                // Rotate by -glowRotation into the hot-spot's local frame.
                const localX = relX * glowCos + relY * glowSin;
                const localY = -relX * glowSin + relY * glowCos;
                const r2 = Math.hypot(localX / lens.hx, localY / lens.hy);
                const t2 = Math.min(
                  1,
                  Math.max(0, (glowSpread + lens.blurFrac - r2) / (glowFade + 2 * lens.blurFrac)),
                );
                combined = Math.max(combined, Math.min(1, t1 + 0.62 * t2));
              }
              const glowAlpha = combined * glowColor[3];
              if (glowAlpha > 0) {
                out[outIndex] = Math.round(out[outIndex] * (1 - glowAlpha) + glowColor[0] * 255 * glowAlpha);
                out[outIndex + 1] = Math.round(out[outIndex + 1] * (1 - glowAlpha) + glowColor[1] * 255 * glowAlpha);
                out[outIndex + 2] = Math.round(out[outIndex + 2] * (1 - glowAlpha) + glowColor[2] * 255 * glowAlpha);
              }
            }
            // Border band -borderWidth < d < 0 with ~1px AA on both edges
            // (flat shading; the WebGL shader adds the rim highlight).
            const band =
              Math.min(1, Math.max(0, 0.5 - distance)) *
              Math.min(1, Math.max(0, distance + chrome.borderWidth + 0.5));
            const borderAlpha = chrome.border[3] * band;
            if (borderAlpha > 0) {
              out[outIndex] = Math.round(out[outIndex] * (1 - borderAlpha) + chrome.border[0] * 255 * borderAlpha);
              out[outIndex + 1] = Math.round(out[outIndex + 1] * (1 - borderAlpha) + chrome.border[1] * 255 * borderAlpha);
              out[outIndex + 2] = Math.round(out[outIndex + 2] * (1 - borderAlpha) + chrome.border[2] * 255 * borderAlpha);
            }
          }

          // Glass over drop shadow on the antialiased edge (straight alpha,
          // mirroring the shader's premultiplied glass-over-shadow blend).
          if (shadowAlpha > 0) {
            const outA = coverage + shadowAlpha * (1 - coverage);
            const shadowWeight = (shadowAlpha * (1 - coverage)) / outA;
            const glassWeight = coverage / outA;
            out[outIndex] = Math.round(out[outIndex] * glassWeight + shadowColor![0] * 255 * shadowWeight);
            out[outIndex + 1] = Math.round(out[outIndex + 1] * glassWeight + shadowColor![1] * 255 * shadowWeight);
            out[outIndex + 2] = Math.round(out[outIndex + 2] * glassWeight + shadowColor![2] * 255 * shadowWeight);
            out[outIndex + 3] = Math.round(outA * 255);
          }
        }
      }

      ctx.putImageData(output, left, top);
    },
  };
}

/** GLSL-style smoothstep (edge0 < edge1 assumed, as in the shader). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
