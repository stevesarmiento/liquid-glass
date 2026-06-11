import { memo, type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type {
  GlassCanvasSource,
  LiquidGlassEngineMode,
  LiquidGlassRenderer,
  ResolvedLensParams,
} from "liquid-glass";
import { GlassNode, type GlassNodeProps } from "liquid-glass/react";
import { IconLocationFill, IconSunMaxFill } from "symbols-react";

import { INITIAL_ISLAND_SIZE, type IslandDemo, type IslandSize } from "../playgroundConfig";
import { computeCoverSlice } from "../playgroundUtils";

interface DynamicIslandDemoProps {
  backgroundUrl: string;
  containerRef: RefObject<HTMLDivElement | null>;
  engineMode: LiquidGlassEngineMode;
  glassTint: GlassNodeProps["tint"];
  islandDemo: IslandDemo;
  islandExpanded: boolean;
  lens: ResolvedLensParams;
  onCycle: () => void;
  renderer: LiquidGlassRenderer;
}

const islandBackdropImageCache = new Map<string, HTMLImageElement>();

export const DynamicIslandDemo = memo(function DynamicIslandDemo({
  backgroundUrl,
  containerRef,
  engineMode,
  glassTint,
  islandDemo,
  islandExpanded,
  lens,
  onCycle,
  renderer,
}: DynamicIslandDemoProps) {
  const dynamicIslandRef = useRef<HTMLButtonElement | null>(null);
  const [islandSize, setIslandSize] = useState<IslandSize>(INITIAL_ISLAND_SIZE);
  const [islandBackdropVersion, setIslandBackdropVersion] = useState(0);
  const islandLens = useMemo(
    () => ({
      width: Math.max(1, islandSize.width),
      height: Math.max(1, islandSize.height),
      radius: lens.radius,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: lens.depth,
      dome: lens.dome,
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: lens.blur,
      mapSize: lens.mapSize,
    }),
    [islandSize.height, islandSize.width, lens],
  );
  const islandDrawSource = useMemo<GlassCanvasSource>(
    () =>
      ({ ctx, metrics }) => {
        ctx.fillStyle = "#101014";
        ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);

        const island = dynamicIslandRef.current;
        const screen = containerRef.current;
        const image = getIslandBackdropImage(backgroundUrl);
        if (!island || !screen || !isImageReady(image)) return;

        const slice = computeCoverSlice({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          anchor: screen.getBoundingClientRect(),
          target: island.getBoundingClientRect(),
        });
        ctx.drawImage(image, slice.x, slice.y, slice.width, slice.height);
      },
    [backgroundUrl, containerRef, islandBackdropVersion],
  );

  useEffect(() => {
    const island = dynamicIslandRef.current;
    if (!island) return;

    const updateSize = () => {
      const rect = island.getBoundingClientRect();
      setIslandSize((current) => {
        const next = {
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(island);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const image = getIslandBackdropImage(backgroundUrl);
    if (isImageReady(image)) {
      setIslandBackdropVersion((version) => version + 1);
      return undefined;
    }

    const handleLoad = () => setIslandBackdropVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);
    return () => image.removeEventListener("load", handleLoad);
  }, [backgroundUrl]);

  return (
    <button
      aria-expanded={islandExpanded}
      aria-label={islandExpanded ? "Collapse Dynamic Island" : "Expand Dynamic Island"}
      className={`dynamicIsland${islandExpanded ? " islandExpanded" : ""}${islandDemo === "weather" ? " demoWeather" : ""}`}
      onClick={onCycle}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      ref={dynamicIslandRef}
      style={
        {
          "--dynamic-island-radius": `${Math.max(0, lens.radius)}px`,
        } as CSSProperties
      }
      type="button"
    >
      <GlassNode
        className="dynamicIslandGlass"
        disabled={!islandExpanded}
        drawSource={islandDrawSource}
        engineMode={engineMode}
        lens={islandLens}
        lensX={0}
        lensY={0}
        renderer={renderer}
        sourceHeight={islandSize.height}
        sourceWidth={islandSize.width}
        surfaceBlur={0}
        surfaceClassName="dynamicIslandGlassSurface"
        surfaceTone="clear"
        tint={glassTint}
      />
      <span className="islandContent" aria-hidden={!islandExpanded}>
        {islandDemo === "messages" ? <MessagesIslandContent /> : <WeatherIslandContent />}
      </span>
    </button>
  );
});

function MessagesIslandContent() {
  return (
    <>
      <span className="islandHeadline">Here, I found the door code in your messages from Mac.</span>
      <span className="islandMessage">
        <span className="islandAvatar">MT</span>
        <span className="islandMessageBody">
          <span className="islandMessageHead">
            <b>Mac Tyler</b>
            <small>Thursday</small>
          </span>
          <span className="islandMessageText">
            There&rsquo;s a spare key on the hook by the coat rack! Door code is #1997
          </span>
        </span>
      </span>
    </>
  );
}

function WeatherIslandContent() {
  return (
    <>
      <span className="islandHeadline">
        It&rsquo;ll be fantastic weather for your upcoming tennis lesson this Sunday.
      </span>
      <span className="islandWeather">
        <span className="islandWeatherTop">
          <span className="islandWeatherCity">
            San Francisco
            <IconLocationFill aria-hidden="true" />
          </span>
          <IconSunMaxFill aria-hidden="true" className="islandWeatherSun" />
        </span>
        <span className="islandWeatherBottom">
          <span className="islandWeatherTemp">63&deg;</span>
          <span className="islandWeatherMeta">
            <b>Sunny</b>
            <small>H:63&deg; L:52&deg;</small>
          </span>
        </span>
      </span>
    </>
  );
}

function getIslandBackdropImage(url: string): HTMLImageElement {
  const cached = islandBackdropImageCache.get(url);
  if (cached) return cached;

  const image = new Image();
  image.decoding = "async";
  image.src = url;
  islandBackdropImageCache.set(url, image);
  return image;
}

function isImageReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}
