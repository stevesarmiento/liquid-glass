import type { ButtonHTMLAttributes, RefObject } from "react";
import type {
  GlassRendererMode,
  GlassTint,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode
} from "liquid-glass";
import type { GlassComponentSize } from "../sizes";
import type { GlassPressHighlight } from "../press";

export type GlassButtonVariant = "glass" | "tinted" | "ghost";

export interface GlassButtonBackdrop {
  /** Same-origin image URL painted into the refraction source. */
  image: string;
  /**
   * Element the image visually covers (CSS `background-size: cover` semantics).
   * The draw source paints the image with the same cover transform, translated
   * so the button refracts exactly the slice behind it. Defaults to the
   * button's `offsetParent`.
   */
  anchor?: RefObject<HTMLElement | null>;
}

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Holds the pressed optics boost for demos or externally controlled interactions. */
  active?: boolean;
  /** Stretches the button to fill its container width. */
  fullWidth?: boolean;
  /**
   * Image backdrop refracted by the always-on glass face. The slice is sampled
   * with live `getBoundingClientRect` measurements at draw time, so it stays
   * aligned with what is visually behind the button. Because the SVG renderer
   * cannot replicate the live cover slice, a backdrop routes `renderer: "auto"`
   * to the pixel path (WebGL first, CPU canvas fallback); explicit renderer
   * choices are honored as-is.
   */
  glassBackdrop?: GlassButtonBackdrop;
  /** Glass lens tuning for the always-on face node. */
  glassLens?: Partial<LensParams>;
  /** Optional frosted background blur in px for the glass face surface. Defaults to 0. */
  glassSurfaceBlur?: number | string;
  /** Dynamic tint forwarded to the glass face node. */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /** Renderer mode forwarded to liquid-glass. */
  renderer?: GlassRendererMode;
  /** Shows a spinner, sets aria-busy, and ignores activation while pending. */
  loading?: boolean;
  /**
   * Press highlight style. "natural" (default) lets the glass itself carry
   * the press cue — boosted lens optics and saturation, no composited
   * layers. "additive" also mounts a hot overexposure bloom (light blowing
   * out through the glass) on top of the natural cue.
   */
  pressHighlight?: GlassPressHighlight;
  /** Preset size for the button geometry and lens optics. */
  size?: GlassComponentSize;
  /** Visual style of the button chrome. */
  variant?: GlassButtonVariant;
}
