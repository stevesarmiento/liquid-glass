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
  resolveGlassTint,
  type GlassCanvasSource,
  type GlassTintInput,
  type GlassTintName
} from "liquid-glass";
import {
  GlassNode,
  GlassPressEffects,
  isGlassActivationKey,
  useGlassGrab,
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
import useCanvasSourceStyles from "../../../hooks/useCanvasSourceStyles";

/**
 * Press feel: the attack is near-instant (~90ms) so the button responds the
 * moment the pointer goes down. On release the material holds its excited
 * state briefly (ACTIVE_RELEASE_MS), then relaxes over PRESS_TWEEN_OUT_MS.
 * Keep the hold + decay SHORT: every ms a released button stays inflated
 * reads as input lag on quick taps (~450ms release-to-rest total here).
 */
const ACTIVE_RELEASE_MS = 150;
/**
 * Pressed-state intensity cue: the glass is always on, so a press raises the
 * lens optics (scaleX/scaleY x 1.15, a touch more glow) instead of mounting
 * the lens. The boost is held for ACTIVE_RELEASE_MS after release.
 */
const PRESSED_OPTICS_SCALE = 1.15;
const PRESSED_GLOW_BOOST = 0.45;
const MAX_GLOW = 2;
/**
 * Peak opacity of the press overexposure bloom (0 = off). Deliberately hot —
 * the additive press reads as light blowing out through the glass.
 */
const PRESS_EXPOSURE = 0.62;
/** Extra saturation at full press, layered on the resting tint. */
const PRESS_SATURATION_BOOST = 0.9;
const MAX_SATURATION = 3;
const PRESS_TWEEN_IN_MS = 90;
const PRESS_TWEEN_OUT_MS = 300;
/**
 * Glow is the only press-boosted param baked into the displacement map, so
 * quantizing it caps a full press tween at GLOW_TWEEN_STEPS+1 cached maps
 * (shared by every button of the same optics) instead of one fresh
 * O(mapSize²) generation per frame. ~0.06 glow per step is sub-perceptual;
 * the scale boost stays continuous via shader uniforms.
 */
const GLOW_TWEEN_STEPS = 8;
/**
 * Press growth: the WHOLE button (glass face + label) scales up with the
 * press tween — the material rises toward the finger instead of compressing.
 * Applied as a CSS var on the button root so pointer, keyboard, and the
 * `active` prop all grow identically. 10% is a confident, tactile rise that
 * still doesn't displace neighboring layout (transforms don't affect flow).
 */
const PRESS_SCALE_BOOST = 0.1;
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
  pressHighlight = "natural",
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
  const grabRef = useRef<HTMLSpanElement>(null);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  // Bumped when the backdrop image finishes loading; flows into the lens
  // sourceVersion (and, on the backdrop path, produces a fresh drawSource
  // closure) so the lens repaints with the image without remounting.
  const [backdropLoadVersion, setBackdropLoadVersion] = useState(0);
  const sizePreset = GLASS_BUTTON_SIZE_PRESETS[size];
  const restingLens = {
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
  // a one-frame refraction snap). The glow term is quantized so the tween
  // rides the global map cache instead of generating a map per frame.
  const lens = press.boostLens(restingLens, {
    scale: PRESSED_OPTICS_SCALE,
    glow: PRESSED_GLOW_BOOST,
    maxGlow: MAX_GLOW,
    glowSteps: GLOW_TWEEN_STEPS
  });
  // Grab deformation rides its OWN wrapper (GrabLayer) around the lens, so
  // its spring transform composes by nesting with the root press scale.
  // Pointer-only by design — keyboard activation grows but never grabs.
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

  // No hover treatment by design: the glass face rests until pressed (the
  // old hover glow — denser/saturated tint — read as noise). Press remains
  // the only state cue.
  const baseSurfaceTint = useMemo(
    () => resolveGlassTint(effectiveTint),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value identity
    [JSON.stringify(effectiveTint)]
  );
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

  // Style sampling is hoisted out of the draw path: drawSource runs per draw
  // (every press-tween frame), and computed-style reads there can force
  // style/layout flushes. The sampled key also feeds sourceVersion so theme/
  // CSS changes still repaint.
  const sourceStyles = useCanvasSourceStyles(
    controlRef,
    (control) => ({
      faceColor: getComputedStyle(control).backgroundColor.trim(),
      sourceBackground: getCanvasBackgroundColor(control.parentElement)
    }),
    [theme, variant, disabled, loading, controlSize.width, controlSize.height]
  );

  // Content version of the lens source. With a backdrop the cover slice is
  // sampled from live layout rects at draw time (scroll/layout shifts change
  // the pixels without any prop changing), so that path deliberately keeps
  // legacy identity keying — sourceVersion stays undefined.
  const sourceVersion = glassBackdrop
    ? undefined
    : `${backdropLoadVersion}|${sourceStyles.key}|${restingLens.radius}`;

  const drawSource: GlassCanvasSource = ({ ctx, metrics }) => {
    const control = controlRef.current;
    const styles = sourceStyles.get();
    const sourceBackground =
      styles?.sourceBackground ?? getCanvasBackgroundColor(control?.parentElement ?? null);

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
    const faceColor = styles?.faceColor ?? "";
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
    // Drop any in-flight grab (and its inline transform) if the button is
    // disabled mid-press.
    if (!isInteractive) grab.cancel();
  }, [grab, isInteractive]);

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
    // The grab anchors at the press origin; the button itself never moves, so
    // engaging it costs nothing until the pointer actually drags.
    grab.handlers.onPointerDown(event);
    onPointerDown?.(event);
  };

  const handlePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onPointerUp(event);
    grab.handlers.onPointerUp(event);
    onPointerUp?.(event);
  };

  const handlePointerCancel: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onPointerCancel(event);
    grab.handlers.onPointerCancel(event);
    onPointerCancel?.(event);
  };

  const handleLostPointerCapture: PointerEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onLostPointerCapture(event);
    grab.handlers.onLostPointerCapture(event);
    onLostPointerCapture?.(event);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onKeyDown(event);
    onKeyDown?.(event);
  };

  const handleKeyUp: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onKeyUp(event);
    onKeyUp?.(event);
  };

  const handleBlur: FocusEventHandler<HTMLButtonElement> = (event) => {
    press.handlers.onBlur(event);
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
      onPointerMove={(event) => {
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
          // Whole-button press growth, riding the rAF press tween exactly.
          "--lgds-button-press-scale": 1 + PRESS_SCALE_BOOST * pressProgress,
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
        <Lens $active={canRenderGlass} $dimmed={!refractGlass}>
          {canRenderGlass && (
            <GlassNode
              className={glassNodeClassName}
              contentClassName={glassContentClassName}
              disabled={!refractGlass}
              drawSource={drawSource}
              engineMode={engineMode}
              sourceVersion={sourceVersion}
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
          {/* Additive press layer is opt-in: the default "natural" press cue
              is the glass itself — boosted optics and saturation riding the
              same tween. Additive = a hot overexposure bloom only (the
              cursor-following hover light was removed by design — the press
              flash carries the state, not pointer position). */}
          {pressHighlight === "additive" && (
            <GlassPressEffects exposure={PRESS_EXPOSURE} glowIntensity={0} progress={pressProgress} />
          )}
        </Lens>
      </GrabLayer>
    </ButtonRoot>
  );
};

GlassButton.displayName = "GlassButton";

export default GlassButton;
