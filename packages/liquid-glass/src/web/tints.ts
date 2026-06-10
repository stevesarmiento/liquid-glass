export type GlassTintName = "clear" | "frost" | "smoke" | "aqua" | "amber" | "rose";

export interface GlassTint {
  name?: string;
  background: string;
  border: string;
  highlight: string;
  highlightWidth: number;
  highlightHeight: number;
  highlightCore: number;
  highlightSpread: number;
  highlightRotation: number;
  highlightX: number;
  highlightY: number;
  shadow: string;
  saturation: number;
}

export interface GlassTintInput {
  name?: string;
  color?: string;
  opacity?: number;
  borderOpacity?: number;
  highlightColor?: string;
  highlightWidth?: number;
  highlightHeight?: number;
  highlightCore?: number;
  highlightSpread?: number;
  highlightRotation?: number;
  highlightX?: number;
  highlightY?: number;
  highlightOpacity?: number;
  shadowOpacity?: number;
  saturation?: number;
}

export type GlassTintPreset = GlassTint & { name: GlassTintName };

const DEFAULT_HIGHLIGHT_X = 0.24;
const DEFAULT_HIGHLIGHT_Y = -0.2;
const DEFAULT_HIGHLIGHT_WIDTH = 1.16;
const DEFAULT_HIGHLIGHT_HEIGHT = 0.74;
const DEFAULT_HIGHLIGHT_CORE = 0.36;
const DEFAULT_HIGHLIGHT_SPREAD = 0.68;
const DEFAULT_HIGHLIGHT_ROTATION = -10;
const DEFAULT_HIGHLIGHT_OPACITY = 0;

export const GLASS_TINTS: Record<GlassTintName, GlassTintPreset> = {
  clear: {
    name: "clear",
    background: "rgba(255, 255, 255, 0.045)",
    border: "rgba(255, 255, 255, 0.5)",
    highlight: "rgba(255, 255, 255, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(0, 0, 0, 0.28)",
    saturation: 1.08,
  },
  frost: {
    name: "frost",
    background: "rgba(255, 255, 255, 0.18)",
    border: "rgba(255, 255, 255, 0.62)",
    highlight: "rgba(255, 255, 255, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(60, 68, 72, 0.22)",
    saturation: 1.02,
  },
  smoke: {
    name: "smoke",
    background: "rgba(17, 20, 22, 0.18)",
    border: "rgba(255, 255, 255, 0.28)",
    highlight: "rgba(255, 255, 255, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(0, 0, 0, 0.36)",
    saturation: 1.14,
  },
  aqua: {
    name: "aqua",
    background: "rgba(72, 186, 190, 0.16)",
    border: "rgba(178, 245, 246, 0.56)",
    highlight: "rgba(221, 255, 255, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(7, 71, 79, 0.28)",
    saturation: 1.22,
  },
  amber: {
    name: "amber",
    background: "rgba(255, 179, 80, 0.16)",
    border: "rgba(255, 231, 171, 0.58)",
    highlight: "rgba(255, 244, 218, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(92, 54, 16, 0.28)",
    saturation: 1.18,
  },
  rose: {
    name: "rose",
    background: "rgba(255, 125, 157, 0.15)",
    border: "rgba(255, 216, 226, 0.56)",
    highlight: "rgba(255, 240, 244, 0)",
    highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
    highlightHeight: DEFAULT_HIGHLIGHT_HEIGHT,
    highlightCore: DEFAULT_HIGHLIGHT_CORE,
    highlightSpread: DEFAULT_HIGHLIGHT_SPREAD,
    highlightRotation: DEFAULT_HIGHLIGHT_ROTATION,
    highlightX: DEFAULT_HIGHLIGHT_X,
    highlightY: DEFAULT_HIGHLIGHT_Y,
    shadow: "rgba(90, 28, 48, 0.26)",
    saturation: 1.18,
  },
};

export function createGlassTint(input: GlassTintInput = {}): GlassTint {
  const color = input.color ?? "#ffffff";
  const opacity = clamp(input.opacity ?? 0.08, 0, 1);
  const borderOpacity = clamp(input.borderOpacity ?? Math.max(0.12, opacity + 0.34), 0, 1);
  const highlightOpacity = clamp(input.highlightOpacity ?? DEFAULT_HIGHLIGHT_OPACITY, 0, 1);
  const highlightColor = input.highlightColor ?? "#ffffff";
  const highlightCore = clamp(finiteOr(input.highlightCore, DEFAULT_HIGHLIGHT_CORE), 0, 0.9);
  const shadowOpacity = clamp(input.shadowOpacity ?? 0.28, 0, 1);

  return {
    name: input.name,
    background: colorToRgba(color, opacity),
    border: colorToRgba(color, borderOpacity),
    highlight: colorToRgba(highlightColor, highlightOpacity),
    highlightWidth: clamp(finiteOr(input.highlightWidth, DEFAULT_HIGHLIGHT_WIDTH), 0.1, 2.5),
    highlightHeight: clamp(finiteOr(input.highlightHeight, DEFAULT_HIGHLIGHT_HEIGHT), 0.1, 2),
    highlightCore,
    highlightSpread: clamp(Math.max(highlightCore + 0.02, finiteOr(input.highlightSpread, DEFAULT_HIGHLIGHT_SPREAD)), 0.05, 1.4),
    highlightRotation: clamp(finiteOr(input.highlightRotation, DEFAULT_HIGHLIGHT_ROTATION), -180, 180),
    highlightX: clamp(finiteOr(input.highlightX, DEFAULT_HIGHLIGHT_X), -0.5, 1.5),
    highlightY: clamp(finiteOr(input.highlightY, DEFAULT_HIGHLIGHT_Y), -0.75, 1.5),
    shadow: colorToRgba("#000000", shadowOpacity),
    saturation: clamp(input.saturation ?? 1.08, 0, 3),
  };
}

export function resolveGlassTint(input: GlassTintName | GlassTintInput | GlassTint): GlassTint {
  if (typeof input === "string") return GLASS_TINTS[input];
  if (isResolvedTint(input)) {
    return {
      ...input,
      highlightWidth: finiteOr(input.highlightWidth, DEFAULT_HIGHLIGHT_WIDTH),
      highlightHeight: finiteOr(input.highlightHeight, DEFAULT_HIGHLIGHT_HEIGHT),
      highlightCore: finiteOr(input.highlightCore, DEFAULT_HIGHLIGHT_CORE),
      highlightSpread: finiteOr(input.highlightSpread, DEFAULT_HIGHLIGHT_SPREAD),
      highlightRotation: finiteOr(input.highlightRotation, DEFAULT_HIGHLIGHT_ROTATION),
      highlightX: finiteOr(input.highlightX, DEFAULT_HIGHLIGHT_X),
      highlightY: finiteOr(input.highlightY, DEFAULT_HIGHLIGHT_Y),
    };
  }
  return createGlassTint(input);
}

/**
 * Returns a copy of the tint with its background alpha raised (or lowered) to
 * `alpha`. Used as the opaque-ish fallback when the user prefers reduced
 * transparency.
 */
export function withTintBackgroundAlpha(tint: GlassTint, alpha: number): GlassTint {
  return {
    ...tint,
    background: colorToRgba(tint.background, clamp(alpha, 0, 1)),
  };
}

/** Straight (non-premultiplied) 0..1 RGBA floats. */
export type ParsedCssColor = [number, number, number, number];

/**
 * Parses the CSS color formats this module produces/accepts — `#rgb`,
 * `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)`, and `rgba(r, g, b, a)`
 * (whitespace-tolerant, integer or float channels) — into 0..1 RGBA floats
 * for shader uniforms. Returns null for anything else (named colors, hsl…).
 */
export function parseCssColor(color: string): ParsedCssColor | null {
  const value = color.trim();
  if (value.startsWith("#")) return parseHexColor(value);
  const match = /^rgba?\(([^)]*)\)$/i.exec(value);
  if (!match) return null;
  const parts = match[1]!.split(",").map((part) => part.trim());
  if (parts.length < 3 || parts.length > 4) return null;
  const channels: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const channel = Number.parseFloat(parts[i]!);
    if (!Number.isFinite(channel) || parts[i] === "") return null;
    channels.push(clamp(channel, 0, 255) / 255);
  }
  let alpha = 1;
  if (parts.length === 4) {
    alpha = Number.parseFloat(parts[3]!);
    if (!Number.isFinite(alpha)) return null;
  }
  return [channels[0]!, channels[1]!, channels[2]!, clamp(alpha, 0, 1)];
}

function parseHexColor(hex: string): ParsedCssColor | null {
  const digits = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  const expanded =
    digits.length === 3 || digits.length === 4
      ? digits
          .split("")
          .map((char) => char + char)
          .join("")
      : digits;
  if (expanded.length !== 6 && expanded.length !== 8) return null;
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const a = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function isResolvedTint(input: GlassTintInput | GlassTint): input is GlassTint {
  return "background" in input && "border" in input && "highlight" in input && "shadow" in input;
}

function colorToRgba(color: string, opacity: number): string {
  if (color.startsWith("rgba(")) return replaceRgbaAlpha(color, opacity);
  if (color.startsWith("rgb(")) return rgbToRgba(color, opacity);
  if (color.startsWith("#")) return hexToRgba(color, opacity);
  return color;
}

function hexToRgba(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "").trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  if (expanded.length !== 6) return hex;
  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${roundAlpha(opacity)})`;
}

function rgbToRgba(rgb: string, opacity: number): string {
  return rgb.replace(/^rgb\((.*)\)$/i, `rgba($1, ${roundAlpha(opacity)})`);
}

function replaceRgbaAlpha(rgba: string, opacity: number): string {
  return rgba.replace(/^rgba\((.*),\s*[\d.]+\)$/i, `rgba($1, ${roundAlpha(opacity)})`);
}

function roundAlpha(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
