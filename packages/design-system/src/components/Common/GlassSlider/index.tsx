import {
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEventHandler,
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
  Header,
  Input,
  LabelText,
  Lens,
  LensSourceBackground,
  Rail,
  SliderContainer,
  Thumb,
  Track,
  ValueText,
  Visual,
  glassContentClassName,
  glassNodeClassName,
  glassSurfaceClassName,
  sliderGlobalCss
} from "./styles";
import type { GlassSliderProps } from "./types";
import { GLASS_SLIDER_SIZE_PRESETS } from "../sizes";
import { drawRoundedRect, getCanvasBackgroundColor } from "../../../lib/canvas";
import { useGlobalCssOnce } from "../../../lib/globalCss";
import { safeReleasePointerCapture, safeSetPointerCapture } from "../../../lib/pointer";
import useGlassTheme from "../../../hooks/useGlassTheme";

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
const KEYBOARD_ACTIVE_RELEASE_MS = 320;
const DEFAULT_SLIDER_OPTICS: Omit<LensParams, "width" | "height" | "radius"> = {
  scaleX: 38,
  scaleY: 38,
  chroma: 0.45,
  depth: 3.5,
  dome: 0,
  splay: 0.49,
  glow: 0.55,
  edge: 0.55,
  blur: 0.8,
  mapSize: 256
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function getPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

function getDecimalPlaces(value: number): number {
  if (Number.isInteger(value)) return 0;

  const valueString = value.toString().toLowerCase();
  const exponentParts = valueString.split("e-");
  if (exponentParts.length === 2) return Number(exponentParts[1]);

  return valueString.split(".")[1]?.length ?? 0;
}

function snapValueToStep(
  value: number,
  min: number,
  max: number,
  step: InputHTMLAttributes<HTMLInputElement>["step"]
): number {
  const clampedValue = clamp(value, min, max);
  if (step === "any") return clampedValue;

  const stepValue = Number(step ?? DEFAULT_STEP);
  if (!Number.isFinite(stepValue) || stepValue <= 0) return clampedValue;

  const snappedValue = min + Math.round((clampedValue - min) / stepValue) * stepValue;
  const precision = Math.max(getDecimalPlaces(stepValue), getDecimalPlaces(min));

  return Number(clamp(snappedValue, min, max).toFixed(precision));
}

const SliderVisual = ({ inert = false }: { inert?: boolean }) => (
  <Visual aria-hidden={inert ? "true" : undefined}>
    <Track>
      <Fill />
    </Track>
  </Visual>
);

const GlassSlider = ({
  className,
  controlHeight,
  defaultValue,
  disabled = false,
  engineMode = "auto",
  fillColor,
  glassLens,
  glassSurfaceBlur = 0,
  glassTint,
  id,
  label,
  max = DEFAULT_MAX,
  min = DEFAULT_MIN,
  onBlur,
  onChange,
  onKeyDown,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  onValueChange,
  renderer,
  showValue = false,
  size = "md",
  sliderWidth,
  step,
  style,
  trackColor,
  trackHeight,
  value,
  valueFormatter,
  ...props
}: GlassSliderProps) => {
  useGlobalCssOnce("lgds-slider", sliderGlobalCss);
  const theme = useGlassTheme();
  const resolvedFillColor = fillColor ?? theme.component.accent;
  const resolvedTrackColor = trackColor ?? theme.component.track;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const controlRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipDispatchedInputRef = useRef(false);
  const keyboardReleaseTimerRef = useRef<number | null>(null);
  const isControlled = value !== undefined;
  const initialValue = defaultValue ?? min;
  const currentValueRef = useRef(initialValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isKeyboardEngaged, setIsKeyboardEngaged] = useState(false);
  const currentValue = isControlled ? value : uncontrolledValue;
  currentValueRef.current = currentValue;

  const valuePercent = getPercent(currentValue, min, max);
  const valueRatio = valuePercent / 100;
  const sizePreset = GLASS_SLIDER_SIZE_PRESETS[size];
  const lens: LensParams = {
    ...DEFAULT_SLIDER_OPTICS,
    ...sizePreset.lens,
    ...glassLens
  };
  const isGlassActive = !disabled && (isDragging || isKeyboardEngaged);
  const formattedValue = valueFormatter ? valueFormatter(currentValue) : currentValue;
  const formattedValueText =
    valueFormatter && (typeof formattedValue === "string" || typeof formattedValue === "number")
      ? String(formattedValue)
      : undefined;
  const resolvedControlHeight = controlHeight ?? Math.max(sizePreset.controlHeight, lens.height);
  const resolvedSliderWidthValue = sliderWidth ?? sizePreset.sliderWidth;
  const resolvedSliderWidth =
    typeof resolvedSliderWidthValue === "number" ? `${resolvedSliderWidthValue}px` : String(resolvedSliderWidthValue);
  const resolvedTrackHeight = trackHeight ?? sizePreset.trackHeight;
  const lensGeometry = useMemo(() => {
    const travel = Math.max(0, controlSize.width - lens.width);
    const lensX = travel * valueRatio;
    const lensY = Math.max(0, (controlSize.height - lens.height) / 2);

    return {
      lensCenterX: lensX + lens.width / 2,
      lensTravelCenterX: travel / 2,
      lensX,
      lensY
    };
  }, [controlSize.height, controlSize.width, lens.height, lens.width, valueRatio]);
  const lensSourceX =
    lensGeometry.lensTravelCenterX + (lensGeometry.lensX - lensGeometry.lensTravelCenterX) * 0.86;
  const canRenderGlass = isGlassActive && controlSize.width > 0 && controlSize.height > 0;

  const drawSource: GlassCanvasSource = ({ ctx, metrics }) => {
    const hostStyle = getComputedStyle(controlRef.current ?? ctx.canvas);
    const trackColor =
      hostStyle.getPropertyValue("--lgds-slider-track-bg").trim() || resolvedTrackColor;
    const fillColor = hostStyle.getPropertyValue("--lgds-slider-fill-bg").trim() || resolvedFillColor;
    const sourceBackground = getCanvasBackgroundColor(controlRef.current ?? ctx.canvas);
    const trackLeft = metrics.lensWidth / 2;
    const trackWidth = Math.max(0, metrics.sourceWidth - metrics.lensWidth);
    const trackTop = metrics.sourceHeight / 2 - resolvedTrackHeight / 2;

    ctx.fillStyle = sourceBackground;
    ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);
    drawRoundedRect(ctx, trackLeft, trackTop, trackWidth, resolvedTrackHeight, resolvedTrackHeight / 2);
    ctx.fillStyle = trackColor;
    ctx.fill();
    drawRoundedRect(
      ctx,
      trackLeft,
      trackTop,
      trackWidth * (valuePercent / 100),
      resolvedTrackHeight,
      resolvedTrackHeight / 2
    );
    ctx.fillStyle = fillColor;
    ctx.fill();
  };

  const applyValue = (nextValue: number) => {
    if (nextValue === currentValueRef.current) return false;

    currentValueRef.current = nextValue;
    if (!isControlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);

    return true;
  };

  const dispatchInputChange = (nextValue: number) => {
    const input = inputRef.current;
    if (!input) return;

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    skipDispatchedInputRef.current = true;
    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    skipDispatchedInputRef.current = false;
  };

  const updateValueFromPointer = (clientX: number) => {
    const control = controlRef.current;
    if (!control) return;

    const rect = control.getBoundingClientRect();
    const travel = Math.max(1, rect.width - lens.width);
    const pointerRatio = clamp((clientX - rect.left - lens.width / 2) / travel, 0, 1);
    const nextValue = snapValueToStep(min + pointerRatio * (max - min), min, max, step);

    if (applyValue(nextValue)) dispatchInputChange(nextValue);
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
      if (keyboardReleaseTimerRef.current) {
        window.clearTimeout(keyboardReleaseTimerRef.current);
      }
    },
    []
  );

  const holdKeyboardEngagement = () => {
    setIsKeyboardEngaged(true);

    if (keyboardReleaseTimerRef.current) {
      window.clearTimeout(keyboardReleaseTimerRef.current);
    }

    keyboardReleaseTimerRef.current = window.setTimeout(() => {
      setIsKeyboardEngaged(false);
      keyboardReleaseTimerRef.current = null;
    }, KEYBOARD_ACTIVE_RELEASE_MS);
  };

  const releaseKeyboardEngagement = () => {
    if (keyboardReleaseTimerRef.current) {
      window.clearTimeout(keyboardReleaseTimerRef.current);
      keyboardReleaseTimerRef.current = null;
    }
    setIsKeyboardEngaged(false);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    const isValueKey =
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "Home" ||
      event.key === "End" ||
      event.key === "PageUp" ||
      event.key === "PageDown";

    if (!disabled && isValueKey) holdKeyboardEngagement();
    onKeyDown?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.currentTarget.valueAsNumber;
    if (!skipDispatchedInputRef.current) applyValue(nextValue);
    onChange?.(event);
  };

  const handlePointerDown: PointerEventHandler<HTMLSpanElement> = (event) => {
    if (disabled) return;

    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    setIsDragging(true);
    updateValueFromPointer(event.clientX);
    safeSetPointerCapture(event.currentTarget, event.pointerId);
    onPointerDown?.(event as never);
  };

  const handlePointerMove: PointerEventHandler<HTMLSpanElement> = (event) => {
    if (!isDragging || disabled) return;

    event.preventDefault();
    updateValueFromPointer(event.clientX);
  };

  const handlePointerUp: PointerEventHandler<HTMLSpanElement> = (event) => {
    setIsDragging(false);
    safeReleasePointerCapture(event.currentTarget, event.pointerId);
    onPointerUp?.(event as never);
  };

  const handlePointerCancel: PointerEventHandler<HTMLSpanElement> = (event) => {
    setIsDragging(false);
    safeReleasePointerCapture(event.currentTarget, event.pointerId);
    onPointerCancel?.(event as never);
  };

  const handleBlur: InputHTMLAttributes<HTMLInputElement>["onBlur"] = (event) => {
    setIsDragging(false);
    releaseKeyboardEngagement();
    onBlur?.(event);
  };

  const handleLostPointerCapture: PointerEventHandler<HTMLSpanElement> = (event) => {
    setIsDragging(false);
    onLostPointerCapture?.(event as never);
  };

  return (
    <SliderContainer
      $active={isGlassActive}
      $disabled={disabled}
      $sliderWidth={resolvedSliderWidth}
      className={className}
      htmlFor={inputId}
      style={
        {
          "--lgds-slider-percent": `${valuePercent}%`,
          "--lgds-slider-hit-area": `${resolvedControlHeight}px`,
          "--lgds-slider-lens-height": `${lens.height}px`,
          "--lgds-slider-lens-left": `${lensGeometry.lensX}px`,
          "--lgds-slider-lens-radius": `${lens.radius}px`,
          "--lgds-slider-lens-top": `${lensGeometry.lensY}px`,
          "--lgds-slider-lens-width": `${lens.width}px`,
          "--lgds-slider-fill-bg": resolvedFillColor,
          "--lgds-slider-track-height": `${resolvedTrackHeight}px`,
          "--lgds-slider-track-bg": resolvedTrackColor,
          "--lgds-slider-text": theme.component.text,
          "--lgds-slider-muted": theme.component.textMuted,
          ...style
        } as CSSProperties
      }
    >
      {(label || showValue) && (
        <Header>
          {label && <LabelText>{label}</LabelText>}
          {showValue && <ValueText>{formattedValue}</ValueText>}
        </Header>
      )}
      <Control
        $disabled={disabled}
        ref={controlRef}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <Rail aria-hidden="true">
          <SliderVisual inert />
          <Lens $active={isGlassActive}>
            {canRenderGlass ? (
              <GlassNode
                className={glassNodeClassName}
                contentClassName={glassContentClassName}
                drawSource={drawSource}
                engineMode={engineMode}
                lens={lens}
                lensX={lensSourceX}
                lensY={lensGeometry.lensY}
                renderer={renderer}
                sourceChildren={
                  <>
                    <LensSourceBackground />
                    <SliderVisual inert />
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
        <Input
          {...props}
          aria-valuetext={props["aria-valuetext"] ?? formattedValueText}
          disabled={disabled}
          id={inputId}
          max={max}
          min={min}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          ref={inputRef}
          step={step}
          type="range"
          value={currentValue}
        />
      </Control>
    </SliderContainer>
  );
};

GlassSlider.displayName = "GlassSlider";

export default GlassSlider;
