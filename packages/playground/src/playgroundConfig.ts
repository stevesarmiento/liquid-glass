import { type GlassComponentSize, type GlassDropdownItem } from "@liquid-glass/design-system";
import {
  DEFAULT_LENS_PARAMS,
  GLASS_TINTS,
  type GlassTintInput,
  type GlassTintName,
  type LensParams,
  type LiquidGlassRenderer,
  type ResolvedLensParams,
} from "liquid-glass";
import {
  IconHouseFill,
  IconLocationFill,
  IconLockFill,
  IconMessageFill,
  IconSquareGrid2x2Fill,
  IconSunMaxFill,
} from "symbols-react";

export const CONTROL_GROUPS: Array<Array<keyof LensParams>> = [
  ["width", "height", "radius", "mapSize"],
  ["scaleX", "scaleY", "chroma", "blur", "maxSlope"],
  ["depth", "dome", "splay", "glow", "edge", "glowSpread", "glowExponent", "edgeExponent", "specularRotation"],
];

export const CONTROL_LIMITS: Record<keyof LensParams, { min: number; max: number; step: number }> = {
  width: { min: 24, max: 420, step: 1 },
  height: { min: 24, max: 300, step: 1 },
  radius: { min: 0, max: 210, step: 1 },
  scaleX: { min: 0, max: 240, step: 0.5 },
  scaleY: { min: 0, max: 240, step: 0.5 },
  chroma: { min: 0, max: 2, step: 0.01 },
  depth: { min: 0, max: 80, step: 0.5 },
  dome: { min: 0, max: 220, step: 1 },
  splay: { min: 0.001, max: 1, step: 0.001 },
  glow: { min: 0, max: 2, step: 0.01 },
  edge: { min: 0, max: 2, step: 0.01 },
  glowSpread: { min: 0.05, max: 2, step: 0.01 },
  glowExponent: { min: 0.1, max: 8, step: 0.05 },
  edgeExponent: { min: 0.1, max: 8, step: 0.05 },
  specularRotation: { min: -360, max: 360, step: 1 },
  // Lower toward ~1 for fold-free physics; high values keep the heavily
  // folded "liquid" edge look presets like INITIAL_LENS were tuned with.
  maxSlope: { min: 0.05, max: 16, step: 0.05 },
  blur: { min: 0, max: 12, step: 0.1 },
  mapSize: { min: 32, max: 1024, step: 32 },
};

export const PAINTING_URL = "/images/rinaldo-armida.jpg";
export const LOCATION_MAP_URL = "/images/map.png";

export type WallpaperId = "painting" | "ferry" | "macaw";
export type TintMode = "preset" | "custom";
export type StageMode = "painting" | "iphone";
export type IslandDemo = "messages" | "weather" | "location";
export type IphoneScreen = "home" | "passcode" | "control-center";
export type FloatingControlsPosition = { x: number; y: number };
export type IslandSize = { width: number; height: number };
export type FloatingControlsDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};
export type VisibilityKey = "glass" | "slider" | "switch" | "button" | "dropdown" | "modal";
export type ComponentVisibility = Record<VisibilityKey, boolean>;

export const WALLPAPERS: Array<{ id: WallpaperId; label: string; url: string }> = [
  { id: "painting", label: "Painting", url: PAINTING_URL },
  { id: "ferry", label: "Ferry", url: "/images/IMG_5299.jpeg" },
  { id: "macaw", label: "Macaw", url: "/images/photo-1452570053594-1b985d6ea890.jpeg" },
];

export const INITIAL_LENS: ResolvedLensParams = {
  ...DEFAULT_LENS_PARAMS,
  width: 220,
  height: 220,
  radius: 46,
  scaleX: 86.5,
  scaleY: 123,
  chroma: 0.75,
  depth: 14,
  dome: 130,
  splay: 0.72,
  glow: 0.75,
  edge: 0.78,
  glowSpread: 0.05,
  glowExponent: 1.5,
  edgeExponent: 1.2,
  specularRotation: -80,
  // This preset's edge look was tuned WITH heavy folding (rendered slope
  // ~10); keep the cap above it so the no-fold guard stays a no-op here.
  maxSlope: 16,
  blur: 1.3,
  mapSize: 1024,
};

export const TINT_NAMES = Object.keys(GLASS_TINTS) as GlassTintName[];

export const INITIAL_CUSTOM_TINT: Required<
  Pick<
    GlassTintInput,
    | "color"
    | "opacity"
    | "borderOpacity"
    | "highlightColor"
    | "highlightWidth"
    | "highlightHeight"
    | "highlightCore"
    | "highlightSpread"
    | "highlightRotation"
    | "highlightX"
    | "highlightY"
    | "highlightOpacity"
    | "shadowOpacity"
    | "saturation"
  >
> = {
  color: "#000000",
  opacity: 0,
  borderOpacity: 0.48,
  highlightColor: "#000000",
  highlightWidth: 1.58,
  highlightHeight: 1.07,
  highlightCore: 0.67,
  highlightSpread: 1.13,
  highlightRotation: -10,
  highlightX: 0.5,
  highlightY: -0.03,
  highlightOpacity: 0.92,
  shadowOpacity: 0.19,
  saturation: 1.38,
};

export const FLOATING_CONTROLS_WIDTH = 326;
export const FLOATING_CONTROLS_MARGIN = 16;
export const FLOATING_CONTROLS_BAR_HEIGHT = 44;
export const INITIAL_ISLAND_SIZE: IslandSize = { width: 122, height: 36 };
export const SWITCH_PREVIEW_SIZES: GlassComponentSize[] = ["sm", "md", "lg", "xl"];
export const INITIAL_LENS_POSITION = { x: 0.5, y: 0.5 };
export const INITIAL_LENS_POSITIONS = [
  { x: 0.44, y: 0.5 },
  { x: 0.56, y: 0.5 },
];
export const INITIAL_BLEND = 48;
export const STATS_FLUSH_MS = 250;

export const INITIAL_VISIBILITY: ComponentVisibility = {
  glass: true,
  slider: false,
  switch: false,
  button: false,
  dropdown: false,
  modal: false,
};

export const VISIBILITY_OPTIONS: Array<{ key: VisibilityKey; label: string }> = [
  { key: "glass", label: "Draggable" },
  { key: "slider", label: "Slider" },
  { key: "switch", label: "Switch" },
  { key: "button", label: "Button" },
  { key: "dropdown", label: "Dropdown" },
  { key: "modal", label: "Modal" },
];

export const STAGE_SCENES: Array<{ id: StageMode; label: string; hint: string }> = [
  { id: "painting", label: "Painting", hint: "Full-bleed canvas" },
  { id: "iphone", label: "iPhone 17", hint: "Device frame" },
];

export const ISLAND_DEMOS: Array<{ id: IslandDemo; label: string; Icon: typeof IconMessageFill }> = [
  { id: "messages", label: "Messages notification", Icon: IconMessageFill },
  { id: "weather", label: "Weather forecast", Icon: IconSunMaxFill },
  { id: "location", label: "Find My location", Icon: IconLocationFill },
];

export const IPHONE_SCREENS: Array<{ id: IphoneScreen; label: string; Icon: typeof IconMessageFill }> = [
  { id: "home", label: "Home screen", Icon: IconHouseFill },
  { id: "passcode", label: "Passcode keypad", Icon: IconLockFill },
  { id: "control-center", label: "Control Center", Icon: IconSquareGrid2x2Fill },
];

/** The door code Mac shares in the Messages island demo. */
export const PASSCODE = "1997";

export const KEYPAD_KEYS: Array<{ digit: string; letters: string }> = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "0", letters: "" },
];

export const DROPDOWN_PREVIEW_ITEMS: GlassDropdownItem[] = [
  { id: "view", label: "View painting" },
  { id: "favorite", label: "Add to favorites" },
  { id: "share", label: "Share…" },
  { id: "download", label: "Download", disabled: true },
  { id: "remove", label: "Remove" },
];

export function getInitialRenderer(): LiquidGlassRenderer {
  if (typeof window === "undefined") return "auto";
  return new URLSearchParams(window.location.search).get("renderer") === "canvas" ? "canvas" : "auto";
}

export const INITIAL_RENDERER = getInitialRenderer();

export type CustomTint = typeof INITIAL_CUSTOM_TINT;
