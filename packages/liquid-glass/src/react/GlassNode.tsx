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

import { createLiquidGlassEngine } from "../engine/create-engine";
import { normalizeLensParams } from "../engine/defaults";
import { colorMatrixStringForScale, mapKey } from "../engine/ts-engine";
import type { LensParams, LiquidGlassEngineMode } from "../engine/types";
import { getGlassFilterBleed, getGlassFilterVersion } from "../web/filter-version";
import {
  renderLocalGlassCanvas,
  type GlassCanvasSource,
  type GlassRendererMode,
} from "../web/local-canvas";
import { displacementMapToPngDataUrl } from "../web/png";
import { resolveGlassTint, type GlassTint, type GlassTintInput, type GlassTintName } from "../web/tints";
import { GlassSurface, type GlassTone } from "./GlassSurface";
import { useIsSafari } from "./useIsSafari";
import "./styles.css";

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
  className?: string;
  contentClassName?: string;
  surfaceClassName?: string;
  surfaceTone?: GlassTone;
  surfaceBlur?: number | string;
  tint?: GlassTintName | GlassTintInput | GlassTint;
  safariRefresh?: boolean;
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
  className,
  contentClassName,
  surfaceClassName,
  surfaceTone = "clear",
  surfaceBlur = 0,
  tint: tintInput = "clear",
  safariRefresh = true,
  disabled = false,
}: GlassNodeProps): ReactElement {
  const id = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSafari = useIsSafari();
  const [readyVersion, setReadyVersion] = useState(0);
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);
  const lens = useMemo(() => normalizeLensParams(lensInput), [JSON.stringify(lensInput ?? {})]);
  const tint = useMemo(() => resolveGlassTint(tintInput), [JSON.stringify(tintInput)]);
  const activeRenderer = resolveRenderer({ renderer, isSafari, hasCanvasSource: Boolean(drawSource), hasSvgSource: Boolean(sourceChildren) });
  const canRender = !disabled && sourceWidth > 0 && sourceHeight > 0;
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
  const mapUrl = useMemo(() => {
    if (!canRender || activeRenderer !== "svg" || typeof document === "undefined") return "";
    return displacementMapToPngDataUrl(engine.generateDisplacementMap(lens));
  }, [activeRenderer, canRender, engine, mapKey(lens), readyVersion]);

  useEffect(() => {
    let cancelled = false;
    void engine.ready.then(() => {
      if (!cancelled) setReadyVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    if (!canRender || activeRenderer !== "canvas" || !drawSource || !canvasRef.current) return;
    renderLocalGlassCanvas({
      canvas: canvasRef.current,
      engine,
      lens,
      sourceWidth,
      sourceHeight,
      lensX,
      lensY,
      source: drawSource,
    });
  }, [
    activeRenderer,
    canRender,
    drawSource,
    engine,
    lens,
    lensX,
    lensY,
    sourceHeight,
    sourceWidth,
    readyVersion,
  ]);

  const classes = ["lg-glass-node", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
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
            href={mapUrl}
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
          <feBlend in="redChannel" in2="greenChannel" mode="screen" result="redGreen" />
          <feBlend in="redGreen" in2="blueChannel" mode="screen" result="lensResult" />
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
}): Exclude<GlassRendererMode, "auto"> {
  if (renderer === "canvas" || renderer === "svg") return renderer;
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
