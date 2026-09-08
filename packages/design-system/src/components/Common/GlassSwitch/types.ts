import type {
  ChangeEventHandler,
  CSSProperties,
  InputHTMLAttributes,
  KeyboardEventHandler,
  ReactNode,
} from "react";
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

export interface GlassSwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "checked" | "children" | "defaultChecked" | "onChange" | "onKeyDown" | "onKeyUp" | "size" | "type"
> {
  /** Keyboard handler attached to the visible switch button control. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  /** Keyboard handler attached to the visible switch button control. */
  onKeyUp?: KeyboardEventHandler<HTMLButtonElement>;
  /** Holds the active glass stage for demos or externally controlled interactions. */
  active?: boolean;
  /**
   * Same-origin image painted into the glass refraction source (CSS cover
   * semantics against the anchor, like GlassButton's backdrop) so the glass
   * refracts real content instead of a flat sampled surface color. Forces
   * the canvas/webgl render path.
   */
  glassBackdrop?: GlassBackdrop;
  /**
   * Uniform zoom of the glass source about the lens center (< 1 zooms out,
   * showing a literal minified view of the track + surround; the lens optics
   * then only carry edge character). Default 1.
   */
  glassSourceZoom?: number;
  /** Controlled checked state. */
  checked?: boolean;
  /** Height of the switch interaction area. */
  controlHeight?: number;
  /** Initial checked state for uncontrolled switches. */
  defaultChecked?: boolean;
  /** Glass lens tuning for the thumb node. */
  glassLens?: Partial<LensParams>;
  /** Color used for the switch fill when checked. */
  fillColor?: CSSProperties["backgroundColor"];
  /** Color used for the unchecked switch track. */
  trackColor?: CSSProperties["backgroundColor"];
  /** Optional frosted background blur in px for the glass thumb surface. Defaults to 0. */
  glassSurfaceBlur?: number | string;
  /** Dynamic tint forwarded to the glass thumb node. */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /**
   * Enables the liquid material deformation: dragging the knob past the
   * on/off ends stretches it with rubberband resistance and releasing it
   * bounces back through an underdamped spring. Keyboard interactions never
   * deform, and `prefers-reduced-motion: reduce` disables it regardless of
   * this prop. Defaults to true.
   */
  materialDeformation?: boolean;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /** Renderer mode forwarded to liquid-glass. */
  renderer?: GlassRendererMode;
  /** Text rendered beside the switch. */
  label?: ReactNode;
  /** Preset size for the switch geometry. Manual sizing props override preset values. */
  size?: GlassComponentSize;
  /** Native change handler for the hidden checkbox input. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /** Boolean checked callback for controlled or uncontrolled usage. */
  onCheckedChange?: (checked: boolean) => void;
  /** Width of the switch control. */
  switchWidth?: CSSProperties["width"];
  /** Height of the switch track. */
  trackHeight?: number;
}
