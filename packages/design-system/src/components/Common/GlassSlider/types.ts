import type { ChangeEventHandler, CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import type {
  GlassRendererMode,
  GlassTint,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode,
} from "liquid-glass";
import type { GlassBackdrop } from "../../../lib/backdrop";
import type { GlassComponentSize } from "../sizes";

export interface GlassSliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "defaultValue" | "max" | "min" | "onChange" | "size" | "type" | "value"
> {
  /** Holds the active glass stage for demos or externally controlled interactions. */
  active?: boolean;
  /**
   * Uniform zoom of the glass source about the lens center (< 1 zooms out,
   * showing a literal minified view of the track + surround; the lens optics
   * then only carry edge character). Default 1.
   */
  glassSourceZoom?: number;
  /**
   * Same-origin image painted into the glass refraction source (CSS cover
   * semantics against the anchor, like GlassButton's backdrop) so the glass
   * refracts real content instead of a flat sampled surface color. Forces
   * the canvas/webgl render path.
   */
  glassBackdrop?: GlassBackdrop;
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
  /** Color used for the filled portion of the slider track. */
  fillColor?: CSSProperties["backgroundColor"];
  /** Color used for the unfilled slider track. */
  trackColor?: CSSProperties["backgroundColor"];
  /** Dynamic tint forwarded to the glass thumb node. */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /** Optional frosted background blur in px for the glass thumb surface. Defaults to 0. */
  glassSurfaceBlur?: number | string;
  /**
   * Enables the liquid material deformation: dragging past the track ends
   * stretches the thumb with rubberband resistance and releasing it bounces
   * back through an underdamped spring. Keyboard interactions never deform,
   * and `prefers-reduced-motion: reduce` disables it regardless of this prop.
   * Defaults to true.
   */
  materialDeformation?: boolean;
  /**
   * Adds a subtle velocity-based stretch while dragging anywhere on the
   * track (capped at ~40% of the apex deformation) so the material carries a
   * hint of inertia. Requires `materialDeformation`. Defaults to true.
   */
  materialLag?: boolean;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /** Renderer mode forwarded to liquid-glass. */
  renderer?: GlassRendererMode;
}
