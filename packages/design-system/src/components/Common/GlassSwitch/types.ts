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

export interface GlassSwitchProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "checked" | "children" | "defaultChecked" | "onChange" | "size" | "type"
  > {
  /** Holds the active glass stage for demos or externally controlled interactions. */
  active?: boolean;
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
