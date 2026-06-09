import type {
  ChangeEventHandler,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode
} from "react";
import type {
  GlassRendererMode,
  GlassTint,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode
} from "liquid-glass";
import type { GlassComponentSize } from "../sizes";

export interface GlassSliderProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "children" | "defaultValue" | "max" | "min" | "onChange" | "size" | "type" | "value"
  > {
  /** Initial value for uncontrolled sliders. */
  defaultValue?: number;
  /** Label rendered above the slider. */
  label?: ReactNode;
  /** Maximum slider value. */
  max?: number;
  /** Minimum slider value. */
  min?: number;
  /** Native change handler for the underlying range input. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Numeric value callback for controlled or uncontrolled usage. */
  onValueChange?: (value: number) => void;
  /** Displays the current value beside the label. */
  showValue?: boolean;
  /** Preset size for the slider geometry. Manual sizing props override preset values. */
  size?: GlassComponentSize;
  /** Width of the full slider control. */
  sliderWidth?: CSSProperties["width"];
  /** Height of the slider interaction area. */
  controlHeight?: number;
  /** Height of the slider track. */
  trackHeight?: number;
  /** Formats the displayed value when `showValue` is enabled. */
  valueFormatter?: (value: number) => ReactNode;
  /** Controlled slider value. */
  value?: number;
  /** Glass lens tuning for the thumb node. */
  glassLens?: Partial<LensParams>;
  /** Dynamic tint forwarded to the glass thumb node. */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /** Optional frosted background blur in px for the glass thumb surface. Defaults to 0. */
  glassSurfaceBlur?: number | string;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /** Renderer mode forwarded to liquid-glass. */
  renderer?: GlassRendererMode;
}
