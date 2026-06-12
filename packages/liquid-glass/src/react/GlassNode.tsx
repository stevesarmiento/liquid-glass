import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { getSharedLiquidGlassEngine } from "../engine/create-engine";
import { DEFAULT_LENS_PARAMS, autoMapSize, normalizeLensParams } from "../engine/defaults";
import { colorMatrixStringForScale, mapKey } from "../engine/ts-engine";
import type { LensParams, LiquidGlassEngineMode } from "../engine/types";
import { getGlassFilterBleed, getGlassFilterVersion } from "../web/filter-version";
import {
  renderLocalGlassCanvas,
  type GlassCanvasSource,
  type GlassRendererMode,
} from "../web/local-canvas";
import { getSharedGlassCompositor, type GlassCompositorInstance } from "../web/glass-compositor";
import { getCachedDisplacementMapPngUrl } from "../web/map-url-cache";
import { countGlassDraw } from "../web/perf-stats";
import { buildLocalGlassDrawInput } from "../web/webgl-local";
import {
  resolveGlassTint,
  withTintBackgroundAlpha,
  type GlassTint,
  type GlassTintInput,
  type GlassTintName,
} from "../web/tints";
import { GlassSurface, type GlassTone } from "./GlassSurface";
import { ensureLiquidGlassStyles } from "./inject-styles";
import { useGlassQualityLevel } from "./useGlassQualityLevel";
import { useIsSafari } from "./useIsSafari";
import { usePrefersReducedTransparency } from "./usePrefersReducedTransparency";
import { useRenderGate } from "./useRenderGate";

export interface GlassNodeProps {
  lens?: Partial<LensParams>;
  sourceWidth: number;
  sourceHeight: number;
  lensX: number;
  lensY: number;
  renderer?: GlassRendererMode;
  engineMode?: LiquidGlassEngineMode;
  sourceChildren?: ReactNode;
  drawSource?: GlassCanvasSource;
  /**
   * Content version of `drawSource`'s output. When provided, redraws are
   * keyed on this value instead of the callback's identity — parents can pass
   * a fresh closure every render without forcing a repaint, and bump the
   * version when (and only when) the drawn content actually changes. Fold in
   * EVERYTHING that affects the drawn pixels (state, theme colors, sizes).
   * When omitted, the legacy behavior applies: a new `drawSource` identity
   * triggers a redraw.
   */
  sourceVersion?: string | number;
  className?: string;
  contentClassName?: string;
  surfaceClassName?: string;
  surfaceTone?: GlassTone;
  surfaceBlur?: number | string;
  tint?: GlassTintName | GlassTintInput | GlassTint;
  safariRefresh?: boolean;
  /**
   * When true (the default), honor `prefers-reduced-transparency: reduce` by
   * skipping refraction and rendering an opaque-ish tinted surface instead.
   */
  respectReducedTransparency?: boolean;
  /**
   * When true (the default), participate in the global adaptive quality
   * governor: under sustained main-thread pressure the node degrades in steps
   * (smaller maps → no chroma separation → surface-only) and recovers when
   * the budget allows. Set false to always render at full quality.
   */
  adaptiveQuality?: boolean;
  /**
   * When true (the default), suspend drawing while the node is offscreen or
   * the tab is hidden (the last rendered frame is kept), and repaint on
   * re-entry.
   */
  pauseOffscreen?: boolean;
  disabled?: boolean;
}

export function GlassNode({
  lens: lensInput,
  sourceWidth,
  sourceHeight,
  lensX,
  lensY,
  renderer = "auto",
  engineMode = "auto",
  sourceChildren,
  drawSource,
  sourceVersion,
  className,
  contentClassName,
  surfaceClassName,
  surfaceTone = "clear",
  surfaceBlur = 0,
  tint: tintInput = "clear",
  safariRefresh = true,
  respectReducedTransparency = true,
  adaptiveQuality = true,
  pauseOffscreen = true,
  disabled = false,
}: GlassNodeProps): ReactElement {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglRef = useRef<GlassNodeWebglState | null>(null);
  const isSafari = useIsSafari();
  const prefersReducedTransparency = usePrefersReducedTransparency();
  const qualityLevel = useGlassQualityLevel(adaptiveQuality);
  // Quality level 3 reuses the reduced-transparency fallback verbatim:
  // surface chrome + tint, no refraction.
  const reducedTransparency =
    (respectReducedTransparency && prefersReducedTransparency) || qualityLevel >= 3;
  const gateActive = useRenderGate(rootRef, { enabled: pauseOffscreen });
  const [readyVersion, setReadyVersion] = useState(0);
  const [mapUrl, setMapUrl] = useState("");
  const [webglFailed, setWebglFailed] = useState(false);
  const engine = useMemo(() => getSharedLiquidGlassEngine({ mode: engineMode }), [engineMode]);
  // When the caller doesn't pin mapSize, derive it from the lens size in
  // device pixels — small controls get proportionally small (cheap) maps.
  // Adaptive quality: L1+ halves the auto map size, L2+ drops chromatic
  // separation (one refraction sample instead of three).
  const lens = useMemo(() => {
    const input = lensInput ?? {};
    const quality = qualityLevel >= 2 ? { chroma: 0 } : null;
    if (input.mapSize !== undefined) return normalizeLensParams({ ...input, ...quality });
    const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = input.width ?? DEFAULT_LENS_PARAMS.width;
    const height = input.height ?? DEFAULT_LENS_PARAMS.height;
    const mapSize = Math.max(
      32,
      autoMapSize(width, height, pixelRatio) / (qualityLevel >= 1 ? 2 : 1),
    );
    return normalizeLensParams({ ...input, ...quality, mapSize });
  }, [JSON.stringify(lensInput ?? {}), qualityLevel]);
  const baseTint = useMemo(() => resolveGlassTint(tintInput), [JSON.stringify(tintInput)]);
  const tint = reducedTransparency ? withTintBackgroundAlpha(baseTint, 0.85) : baseTint;
  const activeRenderer = resolveRenderer({ renderer, isSafari, hasCanvasSource: Boolean(drawSource), hasSvgSource: Boolean(sourceChildren) });
  // On the canvas path, "auto"/"webgl" try the GPU first and fall back to the
  // CPU canvas when WebGL2 is unavailable or the context is lost.
  const useWebglBackend =
    activeRenderer === "canvas" && !webglFailed && (renderer === "auto" || renderer === "webgl");
  const canRender = !disabled && !reducedTransparency && sourceWidth > 0 && sourceHeight > 0;
  const filterBleed = getGlassFilterBleed(lens);
  const filterWidth = sourceWidth + filterBleed * 2;
  const filterHeight = sourceHeight + filterBleed * 2;
  const lensFilterX = lensX + filterBleed;
  const lensFilterY = lensY + filterBleed;
  const filterVersion = getGlassFilterVersion({
    blur: lens.blur,
    chroma: lens.chroma,
    sourceWidth,
    sourceHeight,
    lensWidth: lens.width,
    lensHeight: lens.height,
    radius: lens.radius,
    mapSize: lens.mapSize,
    scaleX: lens.scaleX,
    scaleY: lens.scaleY,
    depth: lens.depth,
    dome: lens.dome,
    splay: lens.splay,
    glow: lens.glow,
    edge: lens.edge,
  });
  const filterId = `lg-glass-node-filter-${sanitizeId(id)}${safariRefresh ? `-${filterVersion}-${readyVersion}` : ""}`;
  const lensMapKey = mapKey(lens);

  useEffect(() => {
    ensureLiquidGlassStyles();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void engine.ready.then(() => {
      if (!cancelled) setReadyVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [engine]);

  // Generate the displacement map post-commit instead of synchronously during
  // render; the filter renders neutral (gray flood) until the URL is ready.
  // Both the map and its PNG encoding are served from global caches shared
  // across every GlassNode with the same optical params.
  useEffect(() => {
    // Gated: keep the current filter while offscreen/hidden; re-entry flips
    // gateActive and re-runs this effect with the latest props.
    if (!gateActive) return;
    if (!canRender || activeRenderer !== "svg" || typeof document === "undefined") {
      setMapUrl("");
      return;
    }
    setMapUrl(getCachedDisplacementMapPngUrl(engine, lens));
    countGlassDraw("svg");
  }, [activeRenderer, canRender, engine, gateActive, lensMapKey, readyVersion]);

  // Release the shared-compositor registration on unmount (the page-level
  // GL context and programs stay alive for other glass nodes).
  useEffect(
    () => () => {
      webglRef.current?.instance.destroy();
      webglRef.current = null;
    },
    [],
  );

  // The draw callback lives in a ref so the draw effect can key on the
  // CONTENT version (`sourceVersion`) instead of the closure's identity while
  // still always invoking the freshest closure. Without a sourceVersion the
  // closure identity itself is the dependency (legacy behavior).
  const drawSourceRef = useRef(drawSource);
  drawSourceRef.current = drawSource;
  const hasDrawSource = Boolean(drawSource);
  const sourceContentKey: unknown = sourceVersion !== undefined ? sourceVersion : drawSource;

  useEffect(() => {
    // Gated: the canvas keeps its last frame while offscreen/hidden; re-entry
    // flips gateActive and redraws with the latest props.
    if (!gateActive) return;
    const source = drawSourceRef.current;
    if (!canRender || activeRenderer !== "canvas" || !source || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // Lets the GPU path skip the source redraw + scene upload + blur when the
    // content is unchanged. lensX/lensY are folded in because they are part
    // of the draw metrics a source may legitimately read.
    const sceneKey =
      sourceVersion !== undefined ? `v:${sourceVersion}|${lensX},${lensY}` : undefined;

    if (useWebglBackend) {
      let entry = webglRef.current;
      if (entry && entry.canvas !== canvas) {
        entry.instance.destroy();
        entry = null;
        webglRef.current = null;
      }
      if (!entry) {
        // One page-level GL context shared by every glass node; this node
        // only registers a blit target on it. Null = no WebGL2 (or the
        // compositor failed permanently) -> CPU canvas path.
        const compositor = getSharedGlassCompositor();
        const instance = compositor?.register({
          canvas,
          onFallback: () => setWebglFailed(true),
        });
        if (!instance) {
          setWebglFailed(true);
          return;
        }
        entry = { canvas, instance, sceneCanvas: document.createElement("canvas") };
        webglRef.current = entry;
      }
      const build = buildLocalGlassDrawInput({
        sceneCanvas: entry.sceneCanvas,
        engine,
        lens,
        sourceWidth,
        sourceHeight,
        lensX,
        lensY,
        source,
        sceneKey,
      });
      const rendered = build !== null && entry.instance.update(build.input);
      if (rendered && build) {
        canvas.style.width = `${build.cssWidth}px`;
        canvas.style.height = `${build.cssHeight}px`;
        return;
      }
      // Compositor could not render (no 2D scratch context, lost/failed GL).
      // The visible canvas only ever held a 2D context, so the CPU path can
      // reuse it directly.
      entry.instance.destroy();
      webglRef.current = null;
      setWebglFailed(true);
      return;
    }

    // Release any compositor registration left over from the webgl backend.
    if (webglRef.current) {
      webglRef.current.instance.destroy();
      webglRef.current = null;
    }
    renderLocalGlassCanvas({
      canvas,
      engine,
      lens,
      sourceWidth,
      sourceHeight,
      lensX,
      lensY,
      source,
    });
  }, [
    activeRenderer,
    canRender,
    gateActive,
    hasDrawSource,
    sourceContentKey,
    engine,
    lens,
    lensX,
    lensY,
    sourceHeight,
    sourceWidth,
    readyVersion,
    useWebglBackend,
  ]);

  const classes = ["lg-glass-node", className].filter(Boolean).join(" ");

  return (
    <span className={classes} ref={rootRef}>
      {canRender && activeRenderer === "svg" && sourceChildren ? (
        <>
          <LocalSvgFilter
            filterHeight={filterHeight}
            filterId={filterId}
            filterWidth={filterWidth}
            lens={lens}
            lensFilterX={lensFilterX}
            lensFilterY={lensFilterY}
            mapUrl={mapUrl}
          />
          <span
            aria-hidden="true"
            className={["lg-glass-node__content", contentClassName].filter(Boolean).join(" ")}
            style={
              {
                filter: `url(#${filterId})`,
                height: filterHeight,
                transform: `translate3d(${-lensFilterX}px, ${-lensFilterY}px, 0)`,
                width: filterWidth,
              } as CSSProperties
            }
          >
            <span
              className="lg-glass-node__source"
              style={{
                height: sourceHeight,
                transform: `translate3d(${filterBleed}px, ${filterBleed}px, 0)`,
                width: sourceWidth,
              }}
            >
              {sourceChildren}
            </span>
          </span>
        </>
      ) : null}

      {canRender && activeRenderer === "canvas" && drawSource ? (
        // No backend remount key needed: the visible canvas is always a 2D
        // blit/draw target (the shared compositor owns the only GL context),
        // so GPU -> CPU fallback reuses the same element — and the last
        // blitted pixels survive a GL context loss instead of flashing blank.
        <canvas aria-hidden="true" className="lg-glass-node__canvas" ref={canvasRef} />
      ) : null}

      <GlassSurface
        aria-hidden="true"
        blur="default"
        className={["lg-glass-node__surface", surfaceClassName].filter(Boolean).join(" ")}
        elevated
        shape="pill"
        style={
          {
            "--lg-glass-bg": tint.background,
            "--lg-glass-border": tint.border,
            "--lg-glass-highlight": tint.highlight,
            "--lg-glass-highlight-width": formatHighlightPosition(tint.highlightWidth),
            "--lg-glass-highlight-height": formatHighlightPosition(tint.highlightHeight),
            "--lg-glass-highlight-core": formatHighlightPosition(tint.highlightCore),
            "--lg-glass-highlight-spread": formatHighlightPosition(tint.highlightSpread),
            "--lg-glass-highlight-rotation": formatHighlightRotation(tint.highlightRotation),
            "--lg-glass-highlight-x": formatHighlightPosition(tint.highlightX),
            "--lg-glass-highlight-y": formatHighlightPosition(tint.highlightY),
            "--lg-glass-radius": formatCssLength(lens.radius),
            "--lg-glass-saturation": tint.saturation,
            "--lg-glass-shadow": tint.shadow,
            "--lg-glass-surface-blur": formatCssLength(surfaceBlur),
            borderRadius: lens.radius,
          } as CSSProperties
        }
        tone={surfaceTone}
      />
    </span>
  );
}

function LocalSvgFilter({
  filterHeight,
  filterId,
  filterWidth,
  lens,
  lensFilterX,
  lensFilterY,
  mapUrl,
}: {
  filterHeight: number;
  filterId: string;
  filterWidth: number;
  lens: LensParams;
  lensFilterX: number;
  lensFilterY: number;
  mapUrl: string;
}): ReactElement {
  const baseScale = Math.max(lens.scaleX, lens.scaleY);
  const specStrength = Math.max(0, Math.min(3, lens.glow + lens.edge));

  return (
    <svg aria-hidden="true" className="lg-filter-svg" focusable="false">
      <defs>
        <filter
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
          height={filterHeight}
          id={filterId}
          primitiveUnits="userSpaceOnUse"
          width={filterWidth}
          x={0}
          y={0}
        >
          <feFlood floodColor="rgb(128, 128, 128)" floodOpacity="1" result="mapBg" />
          <feImage
            height={lens.height}
            href={mapUrl || undefined}
            preserveAspectRatio="none"
            result="rawMap"
            width={lens.width}
            x={lensFilterX}
            y={lensFilterY}
          />
          <feComposite in="rawMap" in2="mapBg" operator="over" result="map" />
          <feColorMatrix
            in="map"
            result="scaledMap"
            type="matrix"
            values={colorMatrixStringForScale(lens.scaleX, lens.scaleY)}
          />
          <feGaussianBlur
            in="SourceGraphic"
            result="blurredSource"
            stdDeviation={String(lens.blur * 0.18)}
          />
          <feDisplacementMap
            in="blurredSource"
            in2="scaledMap"
            result="dispR"
            scale={baseScale * (1 + 0.2 * lens.chroma)}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispR"
            result="redChannel"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
          />
          <feDisplacementMap
            in="blurredSource"
            in2="scaledMap"
            result="dispG"
            scale={baseScale * (1 + 0.1 * lens.chroma)}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispG"
            result="greenChannel"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
          />
          <feDisplacementMap
            in="blurredSource"
            in2="scaledMap"
            result="dispB"
            scale={baseScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feColorMatrix
            in="dispB"
            result="blueChannel"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
          />
          {/* Additive channel recombination (k2=1, k3=1) per the original. */}
          <feComposite
            in="redChannel"
            in2="greenChannel"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            operator="arithmetic"
            result="redGreen"
          />
          <feComposite
            in="redGreen"
            in2="blueChannel"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            operator="arithmetic"
            result="lensResult"
          />
          <feColorMatrix
            in="scaledMap"
            result="specMask"
            type="matrix"
            values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${specStrength} 0 ${-0.5 * specStrength}`}
          />
          <feFlood
            floodColor="rgb(255, 255, 255)"
            floodOpacity={String(Math.min(0.72, specStrength * 0.22))}
            result="specColor"
          />
          <feComposite in="specColor" in2="specMask" operator="in" result="specHighlight" />
          <feComposite in="specHighlight" in2="lensResult" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

interface GlassNodeWebglState {
  canvas: HTMLCanvasElement;
  instance: GlassCompositorInstance;
  sceneCanvas: HTMLCanvasElement;
}

function resolveRenderer({
  renderer,
  isSafari,
  hasCanvasSource,
  hasSvgSource,
}: {
  renderer: GlassRendererMode;
  isSafari: boolean;
  hasCanvasSource: boolean;
  hasSvgSource: boolean;
}): "svg" | "canvas" {
  if (renderer === "svg") return "svg";
  // "webgl" renders into the canvas slot; the backend choice happens in the
  // draw effect (GPU first, CPU fallback).
  if (renderer === "canvas" || renderer === "webgl") return "canvas";
  if (isSafari && hasCanvasSource) return "canvas";
  if (hasSvgSource) return "svg";
  return "canvas";
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function formatCssLength(value: number | string): string {
  return typeof value === "number" ? `${Math.max(0, value)}px` : value;
}

function formatHighlightPosition(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatHighlightRotation(value: number): string {
  return `${Math.round(value * 100) / 100}deg`;
}
