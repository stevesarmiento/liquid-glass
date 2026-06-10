import {
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  parseCssColor,
  resolveGlassTint,
  withTintBackgroundAlpha,
  type GlassCanvasSource,
  type GlassTintInput,
  type GlassTintName,
  type LensParams
} from "liquid-glass";
import { GlassNode } from "liquid-glass/react";

import {
  ButtonRoot,
  CursorGlow,
  ExposureFlash,
  FaceReplica,
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
import { safeReleasePointerCapture, safeSetPointerCapture } from "../../../lib/pointer";
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

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Tweens 0..1 toward the pressed state with rAF so the optics boost is fluid
 * instead of a one-frame map swap. Jumps instantly under reduced motion.
 */
function usePressProgress(pressed: boolean): number {
  const [progress, setProgress] = useState(pressed ? 1 : 0);
  const progressRef = useRef(progress);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const target = pressed ? 1 : 0;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (progressRef.current === target) return undefined;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      progressRef.current = target;
      setProgress(target);
      return undefined;
    }

    const from = progressRef.current;
    const duration = target > from ? PRESS_TWEEN_IN_MS : PRESS_TWEEN_OUT_MS;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const value = from + (target - from) * easeOutCubic(t);
      progressRef.current = value;
      setProgress(value);
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [pressed]);

  return progress;
}

const isActivationKey = (key: string) => key === " " || key === "Enter" || key === "Spacebar";

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
  const releaseTimerRef = useRef<number | null>(null);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  const [isPressed, setIsPressed] = useState(false);
  // Bumped when the backdrop image finishes loading; the new render produces a
  // fresh drawSource closure, which is in GlassNode's draw-effect deps, so the
  // lens repaints with the image without remounting.
  const [, setBackdropLoadVersion] = useState(0);
  const sizePreset = GLASS_BUTTON_SIZE_PRESETS[size];
  const restingLens: LensParams = {
    ...sizePreset.lens,
    ...glassLens
  };
  const isActive = isPressed || active === true;
  const isInteractive = !disabled && !loading;
  // The glass face is always on: it renders whenever the button is measured.
  // While disabled or loading, refraction is turned off (GlassNode `disabled`)
  // to save work and keep the spinner/label readable; the surface chrome stays
  // but is dimmed.
  const canRenderGlass = controlSize.width > 0 && controlSize.height > 0;
  const refractGlass = isInteractive;
  // Pressing does not remount the lens; it tweens boosted optics from the
  // resting preset so state transitions are fluid (a hard param swap reads as
  // a one-frame refraction snap). The map regenerates per tween frame, which
  // is a short, bounded burst.
  const pressProgress = usePressProgress(isActive);
  const lens: LensParams = {
    ...restingLens,
    scaleX: restingLens.scaleX * (1 + (PRESSED_OPTICS_SCALE - 1) * pressProgress),
    scaleY: restingLens.scaleY * (1 + (PRESSED_OPTICS_SCALE - 1) * pressProgress),
    glow: Math.min(MAX_GLOW, restingLens.glow + PRESSED_GLOW_BOOST * pressProgress)
  };
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
  const tintKey = typeof effectiveTint === "string" ? effectiveTint : JSON.stringify(effectiveTint);
  const restingTint = useMemo(
    () => resolveGlassTint(effectiveTint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tintKey]
  );
  const hoverTint = useMemo(() => {
    const backgroundAlpha = parseCssColor(restingTint.background)?.[3] ?? 0.1;
    return {
      ...withTintBackgroundAlpha(
        restingTint,
        Math.min(1, backgroundAlpha + HOVER_TINT_OPACITY_BOOST)
      ),
      saturation: Math.min(2.5, restingTint.saturation * HOVER_SATURATION_SCALE)
    };
  }, [restingTint]);
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

  /** Writes the cursor position as CSS vars — imperative, zero re-renders. */
  const updatePointerLight = (event: { clientX: number; clientY: number }): void => {
    const control = controlRef.current;
    if (!control) return;
    const rect = control.getBoundingClientRect();
    control.style.setProperty("--lgds-button-pointer-x", `${event.clientX - rect.left}px`);
    control.style.setProperty("--lgds-button-pointer-y", `${event.clientY - rect.top}px`);
  };

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

  useEffect(
    () => () => {
      if (releaseTimerRef.current) {
        window.clearTimeout(releaseTimerRef.current);
      }
    },
    []
  );

  const backdropImageUrl = glassBackdrop?.image;

  useEffect(() => {
    if (!backdropImageUrl || typeof window === "undefined") return undefined;

    const image = getBackdropImage(backdropImageUrl);
    if (image.complete && image.naturalWidth > 0) return undefined;

    const handleLoad = () => setBackdropLoadVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);

    return () => image.removeEventListener("load", handleLoad);
  }, [backdropImageUrl]);

  const clearReleaseTimer = () => {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  };

  const holdActiveState = () => {
    setIsPressed(true);

    clearReleaseTimer();

    releaseTimerRef.current = window.setTimeout(() => {
      setIsPressed(false);
      releaseTimerRef.current = null;
    }, ACTIVE_RELEASE_MS);
  };

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (loading) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  };

  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (isInteractive) {
      clearReleaseTimer();
      setIsPressed(true);
      safeSetPointerCapture(event.currentTarget, event.pointerId);
    }

    onPointerDown?.(event);
  };

  const handlePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (isInteractive) {
      holdActiveState();
    }

    safeReleasePointerCapture(event.currentTarget, event.pointerId);

    onPointerUp?.(event);
  };

  const handlePointerCancel: PointerEventHandler<HTMLButtonElement> = (event) => {
    clearReleaseTimer();
    setIsPressed(false);
    safeReleasePointerCapture(event.currentTarget, event.pointerId);
    onPointerCancel?.(event);
  };

  const handleLostPointerCapture: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!releaseTimerRef.current) {
      setIsPressed(false);
    }

    onLostPointerCapture?.(event);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (isInteractive && !event.repeat && isActivationKey(event.key)) {
      clearReleaseTimer();
      setIsPressed(true);
    }

    onKeyDown?.(event);
  };

  const handleKeyUp: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (isActivationKey(event.key)) {
      holdActiveState();
    }

    onKeyUp?.(event);
  };

  const handleBlur: FocusEventHandler<HTMLButtonElement> = (event) => {
    clearReleaseTimer();
    setIsPressed(false);
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
        updatePointerLight(event);
        props.onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setIsHovered(false);
        props.onPointerLeave?.(event);
      }}
      onPointerMove={(event) => {
        updatePointerLight(event);
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
      <Lens $active={canRenderGlass} $dimmed={!refractGlass} aria-hidden="true">
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
        {pressProgress > 0 && (
          <>
            {/* Pointer light only while pressed — it rides the press tween
                with the bloom/optics/saturation. */}
            <CursorGlow aria-hidden="true" style={{ opacity: pressProgress }} />
            <ExposureFlash
              aria-hidden="true"
              style={{ opacity: pressProgress * PRESS_EXPOSURE }}
            />
          </>
        )}
      </Lens>
    </ButtonRoot>
  );
};

GlassButton.displayName = "GlassButton";

export default GlassButton;
