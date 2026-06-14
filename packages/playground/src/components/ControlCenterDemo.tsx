import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useState,
} from "react";
import { GlassButton, type GlassPressHighlight } from "@liquid-glass/design-system";
import type {
  GlassCanvasSource,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode,
  LiquidGlassRenderer,
  ResolvedLensParams,
} from "liquid-glass";
import { GlassNode, useElementSize } from "liquid-glass/react";
import {
  IconAirplane,
  IconAntennaRadiowavesLeftAndRight,
  IconBackwardEndFill,
  IconBellSlashFill,
  IconCameraFill,
  IconCellularbars,
  IconFlashlightOnFill,
  IconForwardEndFill,
  IconGlobe,
  IconLockFill,
  IconLockRotation,
  IconPersonFill,
  IconPlayFill,
  IconPower,
  IconPlus,
  IconQrcodeViewfinder,
  IconRecordCircleFill,
  IconRectangleOnRectangle,
  IconShazamLogoFill,
  IconSpeakerWave2Fill,
  IconSunMaxFill,
  IconTimer,
  IconWifi,
} from "symbols-react";

interface ControlCenterDemoProps {
  backgroundUrl: string;
  containerRef: RefObject<HTMLDivElement | null>;
  engineMode: LiquidGlassEngineMode;
  glassTint: GlassTintName | GlassTintInput;
  lens: ResolvedLensParams;
  pressHighlight: GlassPressHighlight;
  renderer: LiquidGlassRenderer;
}

interface ControlCenterGlassProps {
  backgroundUrl: string;
  containerRef: RefObject<HTMLDivElement | null>;
  engineMode: LiquidGlassEngineMode;
  renderer: LiquidGlassRenderer;
}

interface GlassControlButtonProps extends ControlCenterGlassProps {
  "aria-label": string;
  children: ReactNode;
  className?: string;
  glassLens: Partial<LensParams>;
  glassTint: GlassTintName | GlassTintInput;
  pressHighlight: GlassPressHighlight;
}

interface GlassPanelProps extends ControlCenterGlassProps {
  children: ReactNode;
  className: string;
  glassLens: Partial<LensParams>;
  glassTint: GlassTintName | GlassTintInput;
}

/** Backdrop images are cached per URL so the panel nodes share one decode. */
const backdropImageCache = new Map<string, HTMLImageElement>();

const stopPointerPropagation = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();

function getBackdropImage(url: string): HTMLImageElement {
  let image = backdropImageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    backdropImageCache.set(url, image);
  }
  return image;
}

function isBackdropImageReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  anchor: DOMRect,
  target: DOMRect,
) {
  const scale = Math.max(anchor.width / image.naturalWidth, anchor.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  ctx.drawImage(
    image,
    anchor.left + (anchor.width - width) / 2 - target.left,
    anchor.top + (anchor.height - height) / 2 - target.top,
    width,
    height,
  );
}

function BluetoothGlyph() {
  return (
    <svg aria-hidden="true" className="ccBluetoothGlyph" viewBox="0 0 24 24">
      <path d="M8 5.2 16.1 12 8 18.8V5.2Z" />
      <path d="m8.3 5.4 7.8 6.6-7.8 6.6M5.8 8.2l10.3 7.6M5.8 15.8 16.1 8.2" />
    </svg>
  );
}

function CalculatorGlyph() {
  return (
    <span aria-hidden="true" className="ccCalculatorGlyph">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

function GlassPanel({
  backgroundUrl,
  children,
  className,
  containerRef,
  engineMode,
  glassLens,
  glassTint,
  renderer,
}: GlassPanelProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [backdropLoadVersion, setBackdropLoadVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const image = getBackdropImage(backgroundUrl);
    if (image.complete && image.naturalWidth > 0) return undefined;

    const handleLoad = () => setBackdropLoadVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);

    return () => image.removeEventListener("load", handleLoad);
  }, [backgroundUrl]);

  const drawSource: GlassCanvasSource = ({ ctx, metrics }) => {
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);

    const panel = ref.current;
    const image = backdropImageCache.get(backgroundUrl);
    if (!panel || !isBackdropImageReady(image)) return;

    drawCoverImage(
      ctx,
      image,
      (containerRef.current ?? panel).getBoundingClientRect(),
      panel.getBoundingClientRect(),
    );
  };

  return (
    <div className={`ccGlassPanel ${className}`} ref={ref}>
      {width > 0 && height > 0 && (
        <GlassNode
          className="ccPanelGlassNode"
          contentClassName="ccPanelGlassContent"
          drawSource={drawSource}
          engineMode={engineMode}
          lens={{ ...glassLens, width, height }}
          lensX={0}
          lensY={0}
          renderer={renderer}
          sourceHeight={height}
          sourceVersion={`${backgroundUrl}|${backdropLoadVersion}|${Math.round(width)}x${Math.round(height)}|${glassLens.radius ?? 0}`}
          sourceWidth={width}
          surfaceBlur={0}
          surfaceClassName="ccPanelGlassSurface"
          surfaceTone="clear"
          tint={glassTint}
        />
      )}
      <div className="ccPanelContent">{children}</div>
    </div>
  );
}

function GlassControlButton({
  backgroundUrl,
  children,
  className = "",
  containerRef,
  engineMode,
  glassLens,
  glassTint,
  pressHighlight,
  renderer,
  ...props
}: GlassControlButtonProps) {
  return (
    <GlassButton
      {...props}
      className={`ccGlassButton ${className}`}
      engineMode={engineMode}
      glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
      glassLens={glassLens}
      glassSurfaceBlur={0}
      glassTint={glassTint}
      onPointerDown={stopPointerPropagation}
      onPointerMove={stopPointerPropagation}
      onPointerUp={stopPointerPropagation}
      pressHighlight={pressHighlight}
      renderer={renderer}
      variant="ghost"
    >
      <span className="ccButtonContent">{children}</span>
    </GlassButton>
  );
}

export const ControlCenterDemo = memo(function ControlCenterDemo({
  backgroundUrl,
  containerRef,
  engineMode,
  glassTint,
  lens,
  pressHighlight,
  renderer,
}: ControlCenterDemoProps) {
  const panelLens = useMemo(
    () => controlCenterLens(lens, { radius: 32, depth: 16, dome: 94, blur: 3, mapSize: 512 }),
    [lens],
  );
  const roundLens = useMemo(
    () => controlCenterLens(lens, { radius: 999, depth: 13, dome: 90, blur: 3, mapSize: 320 }),
    [lens],
  );
  const miniLens = useMemo(
    () => controlCenterLens(lens, { radius: 999, depth: 10, dome: 72, blur: 2.6, mapSize: 224 }),
    [lens],
  );
  const pillLens = useMemo(
    () => controlCenterLens(lens, { radius: 999, depth: 13, dome: 74, blur: 3, mapSize: 384 }),
    [lens],
  );
  const sliderLens = useMemo(
    () => controlCenterLens(lens, { radius: 38, depth: 15, dome: 104, blur: 3, mapSize: 384 }),
    [lens],
  );
  const sharedGlassProps = { backgroundUrl, containerRef, engineMode, renderer };

  return (
    <div aria-label="Control Center" className="controlCenter">
      <div className="ccTopActions" aria-hidden="true">
        <IconPlus />
        <IconPower />
      </div>

      <div className="ccStatusRow" aria-hidden="true">
        <div className="ccCarrier">
          <span className="ccSignalBars">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Xfinity Mobile</span>
          <IconWifi />
        </div>
        <div className="ccStatusMeta">
          <IconLockRotation />
          <IconPersonFill />
          <span>20%</span>
          <span className="ccBattery">
            <span />
          </span>
        </div>
      </div>

      <div className="ccPrimaryGrid">
        <GlassPanel className="ccConnectivity" glassLens={panelLens} glassTint={glassTint} {...sharedGlassProps}>
          <GlassControlButton
            aria-label="Airplane Mode"
            className="ccLargeToggle"
            glassLens={roundLens}
            glassTint={glassTint}
            pressHighlight={pressHighlight}
            {...sharedGlassProps}
          >
            <IconAirplane />
          </GlassControlButton>
          <GlassControlButton
            aria-label="Cellular"
            className="ccLargeToggle"
            glassLens={roundLens}
            glassTint={glassTint}
            pressHighlight={pressHighlight}
            {...sharedGlassProps}
          >
            <IconAntennaRadiowavesLeftAndRight />
          </GlassControlButton>
          <GlassControlButton
            aria-label="Wi-Fi"
            className="ccLargeToggle"
            glassLens={roundLens}
            glassTint={glassTint}
            pressHighlight={pressHighlight}
            {...sharedGlassProps}
          >
            <IconWifi />
          </GlassControlButton>
          <div className="ccMiniCluster">
            <GlassControlButton
              aria-label="Cellular Data"
              className="ccMiniToggle"
              glassLens={miniLens}
              glassTint={glassTint}
              pressHighlight={pressHighlight}
              {...sharedGlassProps}
            >
              <IconCellularbars />
            </GlassControlButton>
            <GlassControlButton
              aria-label="Bluetooth"
              className="ccMiniToggle"
              glassLens={miniLens}
              glassTint={glassTint}
              pressHighlight={pressHighlight}
              {...sharedGlassProps}
            >
              <BluetoothGlyph />
            </GlassControlButton>
            <GlassControlButton
              aria-label="AirDrop"
              className="ccMiniToggle ccSubdued"
              glassLens={miniLens}
              glassTint={glassTint}
              pressHighlight={pressHighlight}
              {...sharedGlassProps}
            >
              <IconAntennaRadiowavesLeftAndRight />
            </GlassControlButton>
            <GlassControlButton
              aria-label="Personal Hotspot"
              className="ccMiniToggle ccSubdued"
              glassLens={miniLens}
              glassTint={glassTint}
              pressHighlight={pressHighlight}
              {...sharedGlassProps}
            >
              <IconGlobe />
            </GlassControlButton>
          </div>
        </GlassPanel>

        <GlassPanel className="ccMedia" glassLens={panelLens} glassTint={glassTint} {...sharedGlassProps}>
          <span className="ccMediaThumb" />
          <span className="ccAirplay">
            <IconAntennaRadiowavesLeftAndRight />
          </span>
          <b>Slack</b>
          <div className="ccPlayback">
            <span className="ccSkip">
              <IconBackwardEndFill />
              <span>15</span>
            </span>
            <IconPlayFill className="ccPlay" />
            <span className="ccSkip">
              <IconForwardEndFill />
              <span>15</span>
            </span>
          </div>
        </GlassPanel>
      </div>

      <div className="ccSecondaryGrid">
        <GlassControlButton
          aria-label="Rotation Lock"
          className="ccRoundLight ccRotation"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconLockFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Silent Mode"
          className="ccRoundLight ccBell"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconBellSlashFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Focus Personal"
          className="ccFocus"
          glassLens={pillLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <span className="ccFocusAvatar">
            <IconPersonFill />
          </span>
          <b>Personal</b>
          <span className="ccFocusChevron" />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Brightness"
          className="ccVerticalSlider ccBrightness"
          glassLens={sliderLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <span className="ccSliderFill" />
          <IconSunMaxFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Volume"
          className="ccVerticalSlider ccVolume"
          glassLens={sliderLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <span className="ccSliderFill" />
          <IconSpeakerWave2Fill />
        </GlassControlButton>
      </div>

      <div className="ccUtilityGrid">
        <GlassControlButton
          aria-label="Flashlight"
          className="ccUtilityButton"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconFlashlightOnFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Timer"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconTimer />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Calculator"
          className="ccUtilityButton"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <CalculatorGlyph />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Camera"
          className="ccUtilityButton"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconCameraFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Low Power Mode"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <span className="ccBatteryGlyph" />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Screen Recording"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconRecordCircleFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Screen Mirroring"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconRectangleOnRectangle />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Music Recognition"
          className="ccUtilityButton"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconShazamLogoFill />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Code Scanner"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconQrcodeViewfinder />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Quick Note"
          className="ccUtilityButton"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <span className="ccNoteGlyph" />
        </GlassControlButton>
        <GlassControlButton
          aria-label="Visual Intelligence"
          className="ccUtilityButton ccSubdued"
          glassLens={roundLens}
          glassTint={glassTint}
          pressHighlight={pressHighlight}
          {...sharedGlassProps}
        >
          <IconShazamLogoFill />
        </GlassControlButton>
      </div>

    </div>
  );
});

function controlCenterLens(
  lens: ResolvedLensParams,
  caps: { radius: number; depth: number; dome: number; blur: number; mapSize: number },
): Partial<LensParams> {
  return {
    radius: caps.radius,
    scaleX: lens.scaleX,
    scaleY: lens.scaleY,
    chroma: lens.chroma,
    depth: Math.min(lens.depth, caps.depth),
    dome: Math.min(lens.dome, caps.dome),
    splay: lens.splay,
    glow: lens.glow,
    edge: lens.edge,
    glowSpread: lens.glowSpread,
    glowExponent: lens.glowExponent,
    edgeExponent: lens.edgeExponent,
    specularRotation: lens.specularRotation,
    blur: Math.min(lens.blur, caps.blur),
    mapSize: Math.min(lens.mapSize, caps.mapSize),
  };
}
