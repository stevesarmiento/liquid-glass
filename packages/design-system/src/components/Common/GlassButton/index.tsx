import {
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  useEffect,
  useRef,
  useState
} from "react";
import {
  type GlassCanvasSource,
  type GlassTintInput,
  type GlassTintName,
  type LensParams
} from "liquid-glass";
import {
  GlassNode,
  GlassPressEffects,
  isGlassActivationKey,
  updateGlassPointerLight,
  useGlassDeformation,
  useGlassGrab,
  useGlassHoverTint,
  useGlassPress
} from "liquid-glass/react";

import {
  ButtonRoot,
  FaceReplica,
  GrabLayer,
  Label,
  Lens,
  LensSourceBackground,
  Spinner,
  buttonGlobalCss,
  glassContentClassName,
  glassNodeClassName,
  glassSurfaceClassName
} from "./styles";
import type { GlassButtonProps } from "./types";
import { GLASS_BUTTON_SIZE_PRESETS } from "../sizes";
import {
  computeCoverSlice,
  drawRoundedRect,
  getCanvasBackgroundColor,
  isTransparentCssColor
} from "../../../lib/canvas";
import { useGlobalCssOnce } from "../../../lib/globalCss";
import useGlassTheme from "../../../hooks/useGlassTheme";

const ACTIVE_RELEASE_MS = 320;
/**
 * Pressed-state intensity cue: the glass is always on, so a press raises the
 * lens optics (scaleX/scaleY x 1.15, a touch more glow) instead of mounting
 * the lens. The boost is held for ACTIVE_RELEASE_MS after release.
 */
const PRESSED_OPTICS_SCALE = 1.15;
const PRESSED_GLOW_BOOST = 0.45;
const MAX_GLOW = 2;
/** Peak opacity of the press overexposure bloom (0 = off). */
const PRESS_EXPOSURE = 0.34;
/** Hover = the glass gets slightly denser and more saturated — no CSS filter. */
const HOVER_TINT_OPACITY_BOOST = 0.06;
const HOVER_SATURATION_SCALE = 1.4;
/** Extra saturation at full press, layered on the hover/rest tint. */
const PRESS_SATURATION_BOOST = 0.9;
const MAX_SATURATION = 3;
const PRESS_TWEEN_IN_MS = 150;
const PRESS_TWEEN_OUT_MS = 260;
/**
 * Press squish: the glass face constricts vertically (~2.5% at full press for
 * the md height) and springs back with the material's release bounce. The
 * pull depth runs through the deformation rubberband:
 * rubberband(14, 2, 12) ≈ 1.08px of axis deformation.
 */
const PRESS_SQUISH_PULL_PX = 14;
const PRESS_SQUISH_MAX_PX = 2;
const PRESS_SQUISH_FALLOFF_PX = 12;
/** Gentler-than-default cross-axis bulge so wide buttons don't visibly swell. */
const PRESS_SQUISH_VOLUME = 0.3;
/**
 * Grab deformation: press-and-drag does not move the button (it is anchored
 * UI), it elastically stretches the glass toward the pull and bounces back on
 * release. Subtle on a button: deflection asymptote 8px, 40% of it applied as
 * translation.
 */
const GRAB_MAX_PX = 8;
const GRAB_TRANSLATE_FACTOR = 0.4;

/** Backdrop images are cached per URL so N buttons share one decode. */
const backdropImageCache = new Map<string, HTMLImageElement>();

const getBackdropImage = (url: string): HTMLImageElement => {
  let image = backdropImageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    backdropImageCache.set(url, image);
  }
  return image;
};

const isBackdropImageReady = (image: HTMLImageElement | undefined): image is HTMLImageElement =>
  Boolean(image && image.complete && image.naturalWidth > 0);

const GlassButton = ({
  active,
  children,
  className,
  disabled = false,
  engineMode = "auto",
  fullWidth = false,
  glassBackdrop,
  glassLens,
  glassSurfaceBlur = 0,
  glassTint,
  loading = false,
  onBlur,
  onClick,
  onKeyDown,
  onKeyUp,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  renderer,
  size = "md",
  style,
  type = "button",
  variant = "glass",
  ...props
}: GlassButtonProps) => {
  useGlobalCssOnce("lgds-button", buttonGlobalCss);
  const theme = useGlassTheme();
  const controlRef = useRef<HTMLButtonElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const grabRef = useRef<HTMLSpanElement>(null);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  // Bumped when the backdrop image finishes loading; the new render produces a
  // fresh drawSource closure, which is in GlassNode's draw-effect deps, so the
  // lens repaints with the image without remounting.
  const [, setBackdropLoadVersion] = useState(0);
  const sizePreset = GLASS_BUTTON_SIZE_PRESETS[size];
  const restingLens: LensParams = {
    ...sizePreset.lens,
    ...glassLens
  };
  const isInteractive = !disabled && !loading;
  // The glass face is always on: it renders whenever the button is measured.
  // While disabled or loading, refraction is turned off (GlassNode `disabled`)
  // to save work and keep the spinner/label readable; the surface chrome stays
  // but is dimmed.
  const canRenderGlass = controlSize.width > 0 && controlSize.height > 0;
  const refractGlass = isInteractive;
  // Press machinery comes from the material layer: pointer/keyboard parity,
  // pointer-capture safety, the post-release hold, and the rAF press tween.
  const press = useGlassPress<HTMLButtonElement>({
    disabled: !isInteractive,
    forcePressed: active === true,
    holdMs: ACTIVE_RELEASE_MS,
    tweenInMs: PRESS_TWEEN_IN_MS,
    tweenOutMs: PRESS_TWEEN_OUT_MS
  });
  const pressProgress = press.progress;
  // Pressing does not remount the lens; it tweens boosted optics from the
  // resting preset so state transitions are fluid (a hard param swap reads as
  // a one-frame refraction snap). The map regenerates per tween frame, which
  // is a short, bounded burst.
  const lens = press.boostLens(restingLens, {
    scale: PRESSED_OPTICS_SCALE,
    glow: PRESSED_GLOW_BOOST,
    maxGlow: MAX_GLOW
  });
  // Press squish: the glass material constricts vertically under the finger
  // (the label is content ON the glass, so it stays steady above) and bounces
  // back on release via the shared deformation springs.
  const squish = useGlassDeformation(lensRef, {
    enabled: isInteractive,
    axis: "y",
    mode: "press",
    sizePx: controlSize.height || undefined,
    maxPx: PRESS_SQUISH_MAX_PX,
    falloffPx: PRESS_SQUISH_FALLOFF_PX,
    volumeConservation: PRESS_SQUISH_VOLUME
  });
  // Grab deformation rides its OWN wrapper (GrabLayer) around the lens: the
  // press squish above owns the Lens element's inline transform, so the two
  // spring transforms compose by nesting instead of fighting over one style.
  // Pointer-only by design — keyboard activation squishes but never grabs.
  const grab = useGlassGrab(grabRef, {
    enabled: isInteractive,
    maxPx: GRAB_MAX_PX,
    translateFactor: GRAB_TRANSLATE_FACTOR
  });
  // The SVG source replica cannot reproduce the live cover slice (it would
  // need scroll-synced rect measurements), so a backdrop upgrades "auto" to
  // the pixel path: WebGL first, CPU canvas fallback. Explicit choices win.
  const resolvedRenderer =
    glassBackdrop && (renderer === undefined || renderer === "auto") ? "webgl" : renderer;

  // The button has no CSS face — variants are expressed entirely through the
  // glass material's tint. An explicit glassTint prop wins over the variant.
  const variantTint: GlassTintName | GlassTintInput =
    variant === "tinted"
      ? { color: theme.component.accent, opacity: 0.26, borderOpacity: 0.5 }
      : variant === "glass"
        ? "frost"
        : "clear";
  const effectiveTint = glassTint ?? variantTint;

  // Hover comes from the glass itself: a slightly denser, more saturated tint
  // (no CSS filter on the button). The surface transitions background-color /
  // backdrop-filter, so the swap is fluid.
  const [isHovered, setIsHovered] = useState(false);
  const { restingTint, hoverTint } = useGlassHoverTint(effectiveTint, {
    opacityBoost: HOVER_TINT_OPACITY_BOOST,
    saturationScale: HOVER_SATURATION_SCALE
  });
  const baseSurfaceTint = isHovered && isInteractive ? hoverTint : restingTint;
  // Pressing surges saturation along the same tween as the bloom/optics.
  const surfaceTint =
    pressProgress > 0
      ? {
          ...baseSurfaceTint,
          saturation: Math.min(
            MAX_SATURATION,
            baseSurfaceTint.saturation * (1 + PRESS_SATURATION_BOOST * pressProgress)
          )
        }
      : baseSurfaceTint;

  const drawSource: GlassCanvasSource = ({ ctx, metrics }) => {
    const control = controlRef.current;
    const hostStyle = control ? getComputedStyle(control) : null;
    const sourceBackground = getCanvasBackgroundColor(control?.parentElement ?? null);

    ctx.fillStyle = sourceBackground;
    ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);

    if (glassBackdrop && control) {
      const image = backdropImageCache.get(glassBackdrop.image);
      if (isBackdropImageReady(image)) {
        const anchorElement =
          glassBackdrop.anchor?.current ?? (control.offsetParent as HTMLElement | null) ?? control;
        // Rects are sampled at draw time so the slice tracks the live layout:
        // CSS cover scale around the anchor, translated by the button's offset
        // within it.
        const slice = computeCoverSlice({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          anchor: anchorElement.getBoundingClientRect(),
          target: control.getBoundingClientRect()
        });
        ctx.drawImage(image, slice.x, slice.y, slice.width, slice.height);
      }
    }

    // Transparent/ghost faces skip the fill so the backdrop shows through the
    // refraction fully.
    const faceColor = hostStyle?.backgroundColor.trim() ?? "";
    if (faceColor && !isTransparentCssColor(faceColor)) {
      drawRoundedRect(ctx, 0, 0, metrics.sourceWidth, metrics.sourceHeight, lens.radius);
      ctx.fillStyle = faceColor;
      ctx.fill();
    }

    // Deliberately NOT painting the label into the refraction source: the
    // label is content ON the glass, not behind it — the real DOM label
    // renders crisp above the lens (Label z-index > Lens). Refraction only
    // applies to the backdrop + face material.
  };

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return undefined;

    const updateSize = () => {
      const rect = control.getBoundingClientRect();
      setControlSize({ height: rect.height, width: rect.width });
    };
    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(control);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    // Drop any in-flight squish/grab (and their inline transforms) if the
    // button is disabled mid-press.
    if (!isInteractive) {
      squish.cancel();
      grab.cancel();
    }
  }, [grab, isInteractive, squish]);

  const backdropImageUrl = glassBackdrop?.image;

  useEffect(() => {
    if (!backdropImageUrl || typeof window === "undefined") return undefined;

    const image = getBackdropImage(backdropImageUrl);
    if (image.complete && image.naturalWidth > 0) return undefined;

    const handleLoad = () => setBackdropLoadVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);

    return () => image.removeEventListener("load", handleLoad);
  }, [backdropImageUrl]);

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (loading) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onPointerDown(event);
    if (isInteractive) squish.setPull(PRESS_SQUISH_PULL_PX);
    // The grab anchors at the press origin; the button itself never moves, so
    // engaging it costs nothing until the pointer actually drags.
    grab.handlers.onPointerDown(event);
    onPointerDown?.(event);
  };

  const handlePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onPointerUp(event);
    squish.release();
    grab.handlers.onPointerUp(event);
    onPointerUp?.(event);
  };

  const handlePointerCancel: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onPointerCancel(event);
    squish.release();
    grab.handlers.onPointerCancel(event);
    onPointerCancel?.(event);
  };

  const handleLostPointerCapture: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onLostPointerCapture(event);
    squish.release();
    grab.handlers.onLostPointerCapture(event);
    onLostPointerCapture?.(event);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onKeyDown(event);
    if (isInteractive && !event.repeat && isGlassActivationKey(event.key)) {
      squish.setPull(PRESS_SQUISH_PULL_PX);
    }
    onKeyDown?.(event);
  };

  const handleKeyUp: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onKeyUp(event);
    if (isGlassActivationKey(event.key)) squish.release();
    onKeyUp?.(event);
  };

  const handleBlur: FocusEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onBlur(event);
    squish.release();
    onBlur?.(event);
  };

  return (
    <ButtonRoot
      {...props}
      $fullWidth={fullWidth}
      $variant={variant}
      aria-busy={loading ? true : props["aria-busy"]}
      className={className}
      disabled={disabled}
      onBlur={handleBlur}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerEnter={(event) => {
        setIsHovered(true);
        updateGlassPointerLight(event.currentTarget, event);
        props.onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setIsHovered(false);
        props.onPointerLeave?.(event);
      }}
      onPointerMove={(event) => {
        updateGlassPointerLight(event.currentTarget, event);
        grab.handlers.onPointerMove(event);
        props.onPointerMove?.(event);
      }}
      onPointerUp={handlePointerUp}
      ref={controlRef}
      style={
        {
          "--lgds-button-accent": theme.component.accent,
          "--lgds-button-font-size": `${sizePreset.fontSize}px`,
          "--lgds-button-height": `${sizePreset.height}px`,
          "--lgds-button-padding-x": `${sizePreset.paddingX}px`,
          "--lgds-button-radius": `${lens.radius}px`,
          "--lgds-button-text": theme.component.buttonText,
          ...style
        } as CSSProperties
      }
      type={type}
    >
      <Label>
        {loading && <Spinner aria-hidden="true" />}
        <span>{children}</span>
      </Label>
      <GrabLayer aria-hidden="true" data-lgds-button-grab="" ref={grabRef}>
        <Lens $active={canRenderGlass} $dimmed={!refractGlass} ref={lensRef}>
          {canRenderGlass && (
            <GlassNode
              className={glassNodeClassName}
              contentClassName={glassContentClassName}
              disabled={!refractGlass}
              drawSource={drawSource}
              engineMode={engineMode}
              lens={{ ...lens, width: controlSize.width, height: controlSize.height }}
              lensX={0}
              lensY={0}
              renderer={resolvedRenderer}
              sourceChildren={
                // Face material only — the label stays out of the refraction
                // source so text renders crisp above the glass.
                <>
                  <LensSourceBackground />
                  <FaceReplica aria-hidden="true" />
                </>
              }
              sourceHeight={controlSize.height}
              sourceWidth={controlSize.width}
              surfaceBlur={glassSurfaceBlur}
              surfaceClassName={glassSurfaceClassName}
              surfaceTone="clear"
              tint={surfaceTint}
            />
          )}
          {/* Pointer light + overexposure bloom ride the press tween with the
              optics/saturation; the layer renders nothing at zero progress. */}
          <GlassPressEffects exposure={PRESS_EXPOSURE} progress={pressProgress} />
        </Lens>
      </GrabLayer>
    </ButtonRoot>
  );
};

GlassButton.displayName = "GlassButton";

export default GlassButton;
