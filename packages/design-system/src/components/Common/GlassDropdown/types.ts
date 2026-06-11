import type { ReactNode, RefObject } from "react";
import type {
  GlassTint,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode
} from "liquid-glass";
import type { GlassPressHighlight } from "../press";

export interface GlassDropdownItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}

export type GlassDropdownPlacement = "bottom-start" | "bottom" | "bottom-end";

export interface GlassDropdownBackdrop {
  /** Same-origin image URL sliced into the goo refraction scene. */
  image: string;
  /**
   * Element the image visually covers (CSS `background-size: cover` semantics).
   * The scene slice is sampled with live `getBoundingClientRect` measurements,
   * so the goo refracts exactly the pixels behind the dropdown region.
   * Defaults to the dropdown's `offsetParent`.
   */
  anchor?: RefObject<HTMLElement | null>;
}

export interface GlassDropdownProps {
  /** Menu entries. Up to the caller to keep ids unique. */
  items: GlassDropdownItem[];
  /** Trigger content; defaults to an inline three-dots glyph. */
  icon?: ReactNode;
  /** Accessible name for the icon-only trigger. Defaults to "Open menu". */
  label?: string;
  /** Controlled open state. Leave undefined for uncontrolled. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  /** Fired on every open/close intent (also in controlled mode). */
  onOpenChange?: (open: boolean) => void;
  /** Fired when any enabled item is selected (after the item's own onSelect). */
  onSelect?: (item: GlassDropdownItem) => void;
  /** Trigger circle diameter in px. Defaults to 48. */
  triggerSize?: number;
  /** Menu panel width in px. Defaults to 224. */
  menuWidth?: number;
  /** Horizontal alignment of the menu against the trigger. Defaults to "bottom-start". */
  placement?: GlassDropdownPlacement;
  /** Gap between the trigger and the open menu, in px. Defaults to 10. */
  gap?: number;
  /** Smooth-union (goo) blend distance in px. Defaults to 36. */
  blend?: number;
  /**
   * Image backdrop the merged-lens goo refracts. REQUIRED for the liquid
   * morph: the merged WebGL renderer needs a pixel-readable scene. Without it
   * (or without WebGL2) the dropdown falls back to a CSS-animated glass panel.
   */
  glassBackdrop?: GlassDropdownBackdrop;
  /** Glass chrome tint (fill, border, rim light, shadow, saturation). */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /** Optics overrides for the shared merged-lens params. */
  glassLens?: Partial<LensParams>;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /**
   * Press highlight grade on the trigger. Both modes render IN the glass
   * (shader chrome: a brightness lift + a pointer-anchored interior light,
   * clipped by the blob so they morph with the deformed goo — never a DOM
   * overlay). "natural" (default) is the material's subtle response;
   * "additive" is the hotter, bloom-like grade.
   */
  pressHighlight?: GlassPressHighlight;
  /**
   * Enables the grab-the-material behavior on the open menu: press-and-drag
   * elastically deforms the menu lens (it stretches toward the pull, the goo
   * neck reacts) and springs back with a bounce on release. Defaults to true.
   */
  materialDeformation?: boolean;
  className?: string;
}
