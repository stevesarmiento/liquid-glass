export type GlassTintName = "clear" | "frost" | "smoke" | "aqua" | "amber" | "rose";

export interface GlassTint {
  name?: string;
  background: string;
  border: string;
  highlight: string;
  shadow: string;
  saturation: number;
}

export interface GlassTintInput {
  name?: string;
  color?: string;
  opacity?: number;
  borderOpacity?: number;
  highlightOpacity?: number;
  shadowOpacity?: number;
  saturation?: number;
}

export type GlassTintPreset = GlassTint & { name: GlassTintName };

export const GLASS_TINTS: Record<GlassTintName, GlassTintPreset> = {
  clear: {
    name: "clear",
    background: "rgba(255, 255, 255, 0.045)",
    border: "rgba(255, 255, 255, 0.5)",
    highlight: "rgba(255, 255, 255, 0.58)",
    shadow: "rgba(0, 0, 0, 0.28)",
    saturation: 1.08,
  },
  frost: {
    name: "frost",
    background: "rgba(255, 255, 255, 0.18)",
    border: "rgba(255, 255, 255, 0.62)",
    highlight: "rgba(255, 255, 255, 0.72)",
    shadow: "rgba(60, 68, 72, 0.22)",
    saturation: 1.02,
  },
  smoke: {
    name: "smoke",
    background: "rgba(17, 20, 22, 0.18)",
    border: "rgba(255, 255, 255, 0.28)",
    highlight: "rgba(255, 255, 255, 0.35)",
    shadow: "rgba(0, 0, 0, 0.36)",
    saturation: 1.14,
  },
  aqua: {
    name: "aqua",
    background: "rgba(72, 186, 190, 0.16)",
    border: "rgba(178, 245, 246, 0.56)",
    highlight: "rgba(221, 255, 255, 0.58)",
    shadow: "rgba(7, 71, 79, 0.28)",
    saturation: 1.22,
  },
  amber: {
    name: "amber",
    background: "rgba(255, 179, 80, 0.16)",
    border: "rgba(255, 231, 171, 0.58)",
    highlight: "rgba(255, 244, 218, 0.62)",
    shadow: "rgba(92, 54, 16, 0.28)",
    saturation: 1.18,
  },
  rose: {
    name: "rose",
    background: "rgba(255, 125, 157, 0.15)",
    border: "rgba(255, 216, 226, 0.56)",
    highlight: "rgba(255, 240, 244, 0.6)",
    shadow: "rgba(90, 28, 48, 0.26)",
    saturation: 1.18,
  },
};

export function createGlassTint(input: GlassTintInput = {}): GlassTint {
  const color = input.color ?? "#ffffff";
  const opacity = clamp(input.opacity ?? 0.08, 0, 1);
  const borderOpacity = clamp(input.borderOpacity ?? Math.max(0.12, opacity + 0.34), 0, 1);
  const highlightOpacity = clamp(input.highlightOpacity ?? Math.max(0.16, opacity + 0.46), 0, 1);
  const shadowOpacity = clamp(input.shadowOpacity ?? 0.28, 0, 1);

  return {
    name: input.name,
    background: colorToRgba(color, opacity),
    border: colorToRgba(color, borderOpacity),
    highlight: colorToRgba("#ffffff", highlightOpacity),
    shadow: colorToRgba("#000000", shadowOpacity),
    saturation: clamp(input.saturation ?? 1.08, 0, 3),
  };
}

export function resolveGlassTint(input: GlassTintName | GlassTintInput | GlassTint): GlassTint {
  if (typeof input === "string") return GLASS_TINTS[input];
  if (isResolvedTint(input)) return input;
  return createGlassTint(input);
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
