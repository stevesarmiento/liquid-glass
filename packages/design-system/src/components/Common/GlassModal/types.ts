import type { CSSProperties, ReactNode, RefObject } from "react";
import type {
  GlassCanvasSource,
  GlassRendererMode,
  GlassTint,
  GlassTintInput,
  GlassTintName,
  LensParams,
  LiquidGlassEngineMode
} from "liquid-glass";
import type { GlassTone } from "liquid-glass/react";

export type GlassModalGlassSettings = {
  /** Modal lens defaults. Width and height are normally replaced by the measured modal surface. */
  lens: Omit<LensParams, "width" | "height">;
  /** Tint forwarded to the glass modal node. */
  tint: GlassTintName | GlassTintInput | GlassTint;
  /** Background blur in px for the glass modal surface. */
  surfaceBlur: number | string;
  /** Base glass surface tone. */
  surfaceTone: GlassTone;
};

export type GlassModalProps = {
  /** Modal content. */
  children?: ReactNode;
  /** Additional class name for the portal-rendered modal root. */
  className?: string;
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Set to false to prevent backdrop, escape, and close-button dismissal. */
  dismissible?: boolean;
  /** Footer content rendered below the modal body. */
  footer?: ReactNode;
  /** Glass lens tuning for the modal surface. Width, height, and radius are size-derived unless provided. */
  glassLens?: Partial<LensParams>;
  /** Canvas source used by Safari/forced canvas rendering. */
  glassDrawSource?: GlassCanvasSource;
  /** Grouped modal glass tuning. Direct glass props override this when both are provided. */
  glassSettings?: Partial<Omit<GlassModalGlassSettings, "lens">> & {
    lens?: Partial<GlassModalGlassSettings["lens"]>;
  };
  /** Viewport-sized source content refracted by the modal glass node. Overrides the default app DOM snapshot source. */
  glassSource?: ReactNode;
  /** Selector for the app DOM node cloned as the default modal glass source. */
  glassSourceSelector?: string;
  /** Optional frosted background blur in px for the glass modal surface. Defaults to 0. */
  glassSurfaceBlur?: number | string;
  /** Base glass surface tone forwarded to the modal node. */
  glassSurfaceTone?: GlassTone;
  /** Dynamic tint forwarded to the glass modal node. */
  glassTint?: GlassTintName | GlassTintInput | GlassTint;
  /** Engine mode forwarded to liquid-glass. */
  engineMode?: LiquidGlassEngineMode;
  /** Header content rendered above the modal body. Strings render as modal titles. */
  header?: ReactNode;
  /** Ref focused when the modal opens. Defaults to the dialog surface. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Controls modal visibility. */
  isVisible: boolean;
  /** Maximum modal width. */
  maxWidth?: CSSProperties["maxWidth"];
  /** Called when the modal requests to close. */
  onClose?: () => void;
  /** Custom portal root id. */
  portalId?: string;
  /** Renderer mode forwarded to liquid-glass. */
  renderer?: GlassRendererMode;
  /** Style applied to the modal surface. */
  style?: CSSProperties;
  /** Scales the modal back visually for stacked modal states. */
  stackedOffset?: boolean | number;
  /** Modal width. */
  width?: CSSProperties["width"];
};
