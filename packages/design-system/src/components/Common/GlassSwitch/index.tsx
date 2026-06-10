import {
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type PointerEventHandler,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { type GlassCanvasSource, type LensParams } from "liquid-glass";
import { GlassNode } from "liquid-glass/react";

import {
  Control,
  Fill,
  Input,
  LabelText,
  Lens,
  LensSourceBackground,
  Rail,
  SwitchContainer,
  Thumb,
  Track,
  Visual,
  glassContentClassName,
  glassNodeClassName,
  glassSurfaceClassName,
  switchGlobalCss
} from "./styles";
import type { GlassSwitchProps } from "./types";
import { GLASS_SWITCH_SIZE_PRESETS } from "../sizes";
import { drawRoundedRect, getCanvasBackgroundColor } from "../../../lib/canvas";
import { useGlobalCssOnce } from "../../../lib/globalCss";
import { safeReleasePointerCapture, safeSetPointerCapture } from "../../../lib/pointer";
import useGlassTheme from "../../../hooks/useGlassTheme";

const ACTIVE_RELEASE_MS = 320;
const ACTIVE_LENS_SCALE = 1.85;
const DRAG_THRESHOLD_PX = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const SwitchVisual = ({ inert = false }: { inert?: boolean }) => (
  <Visual aria-hidden={inert ? "true" : undefined}>
    <Track>
      <Fill />
    </Track>
  </Visual>
);

const GlassSwitch = ({
  active,
  checked,
  className,
  controlHeight,
  defaultChecked = false,
  disabled = false,
  engineMode = "auto",
  fillColor,
  glassLens,
  glassSurfaceBlur = 0,
  glassTint,
  id,
  label,
  onBlur,
  onChange,
  onCheckedChange,
  onKeyDown,
  onKeyUp,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  renderer,
  size = "md",
  style,
  switchWidth,
  trackColor,
  trackHeight,
  ...props
}: GlassSwitchProps) => {
  useGlobalCssOnce("lgds-switch", switchGlobalCss);
  const theme = useGlassTheme();
  const resolvedFillColor = fillColor ?? theme.component.accent;
  const resolvedTrackColor = trackColor ?? theme.component.track;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = label ? `${inputId}-label` : undefined;
  const controlRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartXRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const isPointerActiveRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  const skipDispatchedChangeRef = useRef(false);
  const suppressClickRef = useRef(false);
  const isControlled = checked !== undefined;
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  const [isPressed, setIsPressed] = useState(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const currentChecked = isControlled ? checked : uncontrolledChecked;
  const checkedRatio = currentChecked ? 1 : 0;
  const visualRatio = dragRatio ?? checkedRatio;
  const sizePreset = GLASS_SWITCH_SIZE_PRESETS[size];
  const trackInsetX = sizePreset.trackInsetX;
  const thumbInsetX = sizePreset.thumbInsetX;
  const lens: LensParams = {
    ...sizePreset.lens,
    ...glassLens
  };
  const isActive = isPressed || active === true;
  const resolvedControlHeight = controlHeight ?? Math.max(sizePreset.controlHeight, lens.height);
  const resolvedSwitchWidthValue = switchWidth ?? sizePreset.switchWidth;
  const resolvedSwitchWidth =
    typeof resolvedSwitchWidthValue === "number" ? `${resolvedSwitchWidthValue}px` : String(resolvedSwitchWidthValue);
  const resolvedTrackHeight = trackHeight ?? sizePreset.trackHeight;
  const canRenderGlass = !disabled && isActive && controlSize.width > 0 && controlSize.height > 0;
  const lensGeometry = useMemo(() => {
    const availableWidth = Math.max(0, controlSize.width - thumbInsetX * 2);
    const travel = Math.max(0, availableWidth - lens.width);
    const lensX = thumbInsetX + travel * visualRatio;
    const lensY = Math.max(0, (controlSize.height - lens.height) / 2);

    return {
      lensTravelCenterX: thumbInsetX + travel / 2,
      lensX,
      lensY
    };
  }, [controlSize.height, controlSize.width, lens.height, lens.width, thumbInsetX, visualRatio]);
  const renderedLensWidth = isActive ? lens.width * ACTIVE_LENS_SCALE : lens.width;
  const renderedLensHeight = isActive ? lens.height * ACTIVE_LENS_SCALE : lens.height;
  const renderedLensX = lensGeometry.lensX - (renderedLensWidth - lens.width) / 2;
  const renderedLensY = lensGeometry.lensY - (renderedLensHeight - lens.height) / 2;
  const lensSourceX =
    lensGeometry.lensTravelCenterX + (lensGeometry.lensX - lensGeometry.lensTravelCenterX) * 0.55;

  const drawSource: GlassCanvasSource = ({ ctx, metrics }) => {
    const hostStyle = getComputedStyle(controlRef.current ?? ctx.canvas);
    const trackColor =
      hostStyle.getPropertyValue("--lgds-switch-track-bg").trim() || resolvedTrackColor;
    const fillColor = hostStyle.getPropertyValue("--lgds-switch-fill-bg").trim() || resolvedFillColor;
    const sourceBackground = getCanvasBackgroundColor(controlRef.current ?? ctx.canvas);
    const trackWidth = Math.max(0, metrics.sourceWidth - trackInsetX * 2);
    const trackTop = metrics.sourceHeight / 2 - resolvedTrackHeight / 2;

    ctx.fillStyle = sourceBackground;
    ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);
    drawRoundedRect(ctx, trackInsetX, trackTop, trackWidth, resolvedTrackHeight, resolvedTrackHeight / 2);
    ctx.fillStyle = trackColor;
    ctx.fill();
    ctx.globalAlpha = visualRatio;
    drawRoundedRect(ctx, trackInsetX, trackTop, trackWidth, resolvedTrackHeight, resolvedTrackHeight / 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.globalAlpha = 1;
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

  const updateHiddenInput = (nextChecked: boolean) => {
    const input = inputRef.current;
    if (!input) return;

    const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
    skipDispatchedChangeRef.current = true;
    checkedSetter?.call(input, nextChecked);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    skipDispatchedChangeRef.current = false;
  };

  const applyChecked = (nextChecked: boolean, dispatchChange = false) => {
    if (nextChecked === currentChecked) return;

    if (!isControlled) {
      setUncontrolledChecked(nextChecked);
    }

    onCheckedChange?.(nextChecked);
    if (dispatchChange) updateHiddenInput(nextChecked);
  };

  const holdActiveState = () => {
    setIsPressed(true);

    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
    }

    releaseTimerRef.current = window.setTimeout(() => {
      setIsPressed(false);
      releaseTimerRef.current = null;
    }, ACTIVE_RELEASE_MS);
  };

  const getPointerRatio = (clientX: number) => {
    const control = controlRef.current;
    if (!control) return checkedRatio;

    const rect = control.getBoundingClientRect();
    const availableWidth = Math.max(0, rect.width - thumbInsetX * 2);
    const travel = Math.max(1, availableWidth - lens.width);

    return clamp((clientX - rect.left - thumbInsetX - lens.width / 2) / travel, 0, 1);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextChecked = event.currentTarget.checked;
    if (!skipDispatchedChangeRef.current) {
      if (!isControlled) setUncontrolledChecked(nextChecked);
      onCheckedChange?.(nextChecked);
    }
    onChange?.(event);
  };

  const handleControlClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      hasDraggedRef.current = false;
      suppressClickRef.current = false;
      return;
    }

    holdActiveState();
    applyChecked(!currentChecked, true);
  };

  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (disabled) return;

    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    dragStartXRef.current = event.clientX;
    hasDraggedRef.current = false;
    isPointerActiveRef.current = true;
    suppressClickRef.current = false;
    setIsPressed(true);
    setDragRatio(null);

    safeSetPointerCapture(event.currentTarget, event.pointerId);

    onPointerDown?.(event as never);
  };

  const handlePointerMove: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (!isPointerActiveRef.current || disabled) return;

    event.preventDefault();

    const dragDistance = Math.abs(event.clientX - dragStartXRef.current);
    if (dragDistance >= DRAG_THRESHOLD_PX) {
      hasDraggedRef.current = true;
      suppressClickRef.current = true;
      setDragRatio(getPointerRatio(event.clientX));
    }
  };

  const handlePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    const nextRatio = getPointerRatio(event.clientX);
    const dragDistance = Math.abs(event.clientX - dragStartXRef.current);
    const isDragGesture = hasDraggedRef.current || dragDistance >= DRAG_THRESHOLD_PX;

    isPointerActiveRef.current = false;
    setDragRatio(null);

    if (isDragGesture) {
      event.preventDefault();
      hasDraggedRef.current = true;
      suppressClickRef.current = true;
      applyChecked(nextRatio >= 0.5, true);
    }

    holdActiveState();

    safeReleasePointerCapture(event.currentTarget, event.pointerId);

    onPointerUp?.(event as never);
  };

  const handlePointerCancel: PointerEventHandler<HTMLButtonElement> = (event) => {
    isPointerActiveRef.current = false;
    suppressClickRef.current = false;
    setIsPressed(false);
    setDragRatio(null);
    safeReleasePointerCapture(event.currentTarget, event.pointerId);
    onPointerCancel?.(event as never);
  };

  const handleLostPointerCapture: PointerEventHandler<HTMLButtonElement> = (event) => {
    isPointerActiveRef.current = false;

    if (!releaseTimerRef.current) {
      suppressClickRef.current = false;
      setIsPressed(false);
      setDragRatio(null);
    }

    onLostPointerCapture?.(event as never);
  };

  const handleBlur: InputHTMLAttributes<HTMLInputElement>["onBlur"] = (event) => {
    setIsPressed(false);
    setDragRatio(null);
    onBlur?.(event);
  };

  return (
    <SwitchContainer
      $disabled={disabled}
      $switchWidth={resolvedSwitchWidth}
      className={className}
      style={
        {
          "--lgds-switch-hit-area": `${resolvedControlHeight}px`,
          "--lgds-switch-lens-height": `${renderedLensHeight}px`,
          "--lgds-switch-lens-left": `${renderedLensX}px`,
          "--lgds-switch-lens-radius": `${lens.radius}px`,
          "--lgds-switch-lens-top": `${renderedLensY}px`,
          "--lgds-switch-lens-width": `${renderedLensWidth}px`,
          "--lgds-switch-color-opacity": visualRatio,
          "--lgds-switch-fill-bg": resolvedFillColor,
          "--lgds-switch-track-height": `${resolvedTrackHeight}px`,
          "--lgds-switch-track-bg": resolvedTrackColor,
          "--lgds-switch-thumb-inset-x": `${thumbInsetX}px`,
          "--lgds-switch-track-inset-x": `${trackInsetX}px`,
          "--lgds-switch-text": theme.component.text,
          "--lgds-switch-muted": theme.component.textMuted,
          ...style
        } as CSSProperties
      }
    >
      <Control
        $disabled={disabled}
        aria-checked={currentChecked}
        aria-label={label ? undefined : props["aria-label"]}
        aria-labelledby={labelId}
        disabled={disabled}
        onBlur={() => {
          isPointerActiveRef.current = false;
          setIsPressed(false);
          setDragRatio(null);
        }}
        onClick={handleControlClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={controlRef}
        role="switch"
        type="button"
      >
        <Rail aria-hidden="true">
          <SwitchVisual inert />
          <Lens $active={canRenderGlass}>
            {canRenderGlass ? (
              <GlassNode
                className={glassNodeClassName}
                contentClassName={glassContentClassName}
                drawSource={drawSource}
                engineMode={engineMode}
                lens={{ ...lens, width: renderedLensWidth, height: renderedLensHeight }}
                lensX={lensSourceX - (renderedLensWidth - lens.width) / 2}
                lensY={renderedLensY}
                renderer={renderer}
                sourceChildren={
                  <>
                    <LensSourceBackground />
                    <SwitchVisual inert />
                  </>
                }
                sourceHeight={controlSize.height}
                sourceWidth={controlSize.width}
                surfaceClassName={glassSurfaceClassName}
                surfaceBlur={glassSurfaceBlur}
                surfaceTone="clear"
                tint={glassTint}
              />
            ) : (
              <Thumb />
            )}
          </Lens>
        </Rail>
      </Control>
      {/*
        The hidden checkbox only mirrors form semantics (name/value submission and
        native change events). The button above already exposes the switch role, so
        the input is removed from both the tab order and the accessibility tree to
        avoid duplicate announcements and a second tab stop.
      */}
      <Input
        {...props}
        aria-hidden="true"
        checked={currentChecked}
        disabled={disabled}
        id={inputId}
        onBlur={handleBlur}
        onChange={handleChange}
        ref={inputRef}
        tabIndex={-1}
        type="checkbox"
      />
      {label && <LabelText id={labelId}>{label}</LabelText>}
    </SwitchContainer>
  );
};

GlassSwitch.displayName = "GlassSwitch";

export default GlassSwitch;
