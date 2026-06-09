import {
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
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
  SliderCss,
  Thumb,
  Track,
  ValueText,
  Visual,
  glassContentClassName,
  glassNodeClassName,
  glassSurfaceClassName
} from "./styles";
import type { GlassSliderProps } from "./types";

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_CONTROL_HEIGHT = 44;
const DEFAULT_LENS_WIDTH = 63;
const DEFAULT_LENS_HEIGHT = 34;
const DEFAULT_LENS_RADIUS = 80;
const DEFAULT_SLIDER_WIDTH = 244;
const DEFAULT_STEP = 1;
const DEFAULT_TRACK_HEIGHT = 9;

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function isTransparentColor(color: string): boolean {
  return (
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color === "rgb(0 0 0 / 0)" ||
    color.endsWith("/ 0)")
  );
}

function getCanvasBackgroundColor(element: HTMLElement | null): string {
  let current: HTMLElement | null = element;

  while (current) {
    const backgroundColor = getComputedStyle(current).backgroundColor.trim();
    if (backgroundColor && !isTransparentColor(backgroundColor)) return backgroundColor;
    current = current.parentElement;
  }

  return "#ffffff";
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
  glassLens,
  glassSurfaceBlur = 0,
  glassTint,
  id,
  label,
  max = DEFAULT_MAX,
  min = DEFAULT_MIN,
  onBlur,
  onChange,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerUp,
  onValueChange,
  renderer,
  showValue = false,
  sliderWidth = DEFAULT_SLIDER_WIDTH,
  step,
  style,
  trackHeight = DEFAULT_TRACK_HEIGHT,
  value,
  valueFormatter,
  ...props
}: GlassSliderProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const controlRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipDispatchedInputRef = useRef(false);
  const isControlled = value !== undefined;
  const initialValue = defaultValue ?? min;
  const currentValueRef = useRef(initialValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const [controlSize, setControlSize] = useState({ height: 0, width: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const currentValue = isControlled ? value : uncontrolledValue;
  currentValueRef.current = currentValue;

  const valuePercent = getPercent(currentValue, min, max);
  const valueRatio = valuePercent / 100;
  const lens: LensParams = {
    width: glassLens?.width ?? DEFAULT_LENS_WIDTH,
    height: glassLens?.height ?? DEFAULT_LENS_HEIGHT,
    radius: glassLens?.radius ?? DEFAULT_LENS_RADIUS,
    scaleX: glassLens?.scaleX ?? 38,
    scaleY: glassLens?.scaleY ?? 38,
    chroma: glassLens?.chroma ?? 0.45,
    depth: glassLens?.depth ?? 3.5,
    dome: glassLens?.dome ?? 0,
    splay: glassLens?.splay ?? 0.49,
    glow: glassLens?.glow ?? 0.55,
    edge: glassLens?.edge ?? 0.55,
    blur: glassLens?.blur ?? 0.8,
    mapSize: glassLens?.mapSize ?? 256
  };
  const isGlassActive = !disabled && isDragging;
  const formattedValue = valueFormatter ? valueFormatter(currentValue) : currentValue;
  const resolvedControlHeight = controlHeight ?? Math.max(DEFAULT_CONTROL_HEIGHT, lens.height);
  const resolvedSliderWidth = typeof sliderWidth === "number" ? `${sliderWidth}px` : String(sliderWidth);
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
      hostStyle.getPropertyValue("--lgds-slider-track-bg").trim() || "rgba(148, 163, 184, 0.34)";
    const fillColor = hostStyle.getPropertyValue("--lgds-slider-fill-bg").trim() || "#1a88f8";
    const sourceBackground = getCanvasBackgroundColor(controlRef.current ?? ctx.canvas);
    const trackLeft = metrics.lensWidth / 2;
    const trackWidth = Math.max(0, metrics.sourceWidth - metrics.lensWidth);
    const trackTop = metrics.sourceHeight / 2 - trackHeight / 2;

    ctx.fillStyle = sourceBackground;
    ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);
    drawRoundedRect(ctx, trackLeft, trackTop, trackWidth, trackHeight, trackHeight / 2);
    ctx.fillStyle = trackColor;
    ctx.fill();
    drawRoundedRect(ctx, trackLeft, trackTop, trackWidth * (valuePercent / 100), trackHeight, trackHeight / 2);
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
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onPointerDown?.(event as never);
  };

  const handlePointerMove: PointerEventHandler<HTMLSpanElement> = (event) => {
    if (!isDragging || disabled) return;

    event.preventDefault();
    updateValueFromPointer(event.clientX);
  };

  const handlePointerUp: PointerEventHandler<HTMLSpanElement> = (event) => {
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onPointerUp?.(event as never);
  };

  const handlePointerCancel: PointerEventHandler<HTMLSpanElement> = (event) => {
    setIsDragging(false);
    onPointerCancel?.(event as never);
  };

  const handleBlur: InputHTMLAttributes<HTMLInputElement>["onBlur"] = (event) => {
    setIsDragging(false);
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
          "--lgds-slider-track-height": `${trackHeight}px`,
          ...style
        } as CSSProperties
      }
    >
      <SliderCss />
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
          disabled={disabled}
          id={inputId}
          max={max}
          min={min}
          onBlur={handleBlur}
          onChange={handleChange}
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
