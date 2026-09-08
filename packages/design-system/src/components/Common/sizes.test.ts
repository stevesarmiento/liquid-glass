import { describe, expect, it } from "vitest";

import { LENS_PARAM_LIMITS, normalizeLensParams, type ResolvedLensParams } from "liquid-glass";

import {
  GLASS_BUTTON_SIZE_PRESETS,
  GLASS_SLIDER_SIZE_PRESETS,
  GLASS_SWITCH_SIZE_PRESETS,
  type GlassComponentSize,
  type GlassPresetLens,
} from "./sizes";

const SIZES: GlassComponentSize[] = ["sm", "md", "lg", "xl"];

/**
 * The pre-derivation hand-tuned tables, kept verbatim as A/B references: md
 * is the anchor the profiles must reproduce, and the sm/lg/xl rows document
 * exactly what the strict-identity derivation changed (relative displacement
 * used to climb toward xl, dome flipped on at lg, blur was a constant 2px).
 * Grep target for playground A/B sessions; not shipped.
 */
const LEGACY_SWITCH_OPTICS: Record<GlassComponentSize, Partial<GlassPresetLens>> = {
  sm: { scaleX: 4, scaleY: 1.5, chroma: 0.6, depth: 4, dome: 0, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  md: { scaleX: 7.5, scaleY: 2, chroma: 0.6, depth: 7.5, dome: 0, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  lg: { scaleX: 21.5, scaleY: 7.5, chroma: 0.6, depth: 8.5, dome: 75, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  xl: { scaleX: 27, scaleY: 11, chroma: 0.6, depth: 10, dome: 100, splay: 0.1, glow: 1, edge: 1, blur: 2 },
};

const LEGACY_BUTTON_OPTICS: Record<GlassComponentSize, Partial<GlassPresetLens>> = {
  sm: { scaleX: 4, scaleY: 1.5, chroma: 0.6, depth: 4, dome: 0, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  md: { scaleX: 7.5, scaleY: 2, chroma: 0.6, depth: 7.5, dome: 0, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  lg: { scaleX: 11, scaleY: 4, chroma: 0.6, depth: 8, dome: 44, splay: 0.1, glow: 1, edge: 1, blur: 2 },
  xl: { scaleX: 15, scaleY: 6, chroma: 0.6, depth: 9, dome: 64, splay: 0.1, glow: 1, edge: 1, blur: 2 },
};

/** One fixed optic set formerly shared by every slider tier. */
const LEGACY_SLIDER_OPTICS: Partial<GlassPresetLens> = {
  scaleX: 38,
  scaleY: 38,
  chroma: 0.45,
  depth: 3.5,
  dome: 0,
  splay: 0.49,
  glow: 0.55,
  edge: 0.55,
  blur: 0.8,
};

/**
 * Slider md anchor after the Sep 2026 playground bake: a stage-tuned preset
 * (anchor 220) converted to ratios — negative scaleX (demagnify/wrap),
 * dome-led bend, no chroma/blur. md thumb short side is 26 (thumb geometry
 * shrunk one notch per tier, Sep 2026).
 */
const RETUNED_SLIDER_MD: Partial<GlassPresetLens> = {
  scaleX: (-211.5 / 220) * 26,
  scaleY: (79.5 / 220) * 26,
  depth: (4.5 / 220) * 26,
  dome: (130 / 220) * 26,
  blur: 0,
  chroma: 0,
  splay: 0.72,
  glow: 0.75,
  edge: 0.78,
  glowSpread: 0.05,
  specularRotation: -80,
  maxSlope: 15.55,
};

/**
 * Switch md anchor after the spec retune (glow/edge 1 → 0.5) and the thumb
 * height bump (short side 22 → 26; ratios anchored at 22 scale with it).
 */
const RETUNED_SWITCH_MD: Partial<GlassPresetLens> = {
  scaleX: (7.5 / 22) * 26,
  scaleY: (2 / 22) * 26,
  depth: (7.5 / 22) * 26,
  dome: 0,
  blur: (2 / 22) * 26,
  chroma: 0.6,
  splay: 0.1,
  glow: 0.5,
  edge: 0.5,
};
const RETUNED_BUTTON_MD: Partial<GlassPresetLens> = { ...LEGACY_BUTTON_OPTICS.md, glow: 0.5, edge: 0.5 };

const ROLES = [
  { name: "switch", presets: GLASS_SWITCH_SIZE_PRESETS },
  { name: "button", presets: GLASS_BUTTON_SIZE_PRESETS },
  { name: "slider", presets: GLASS_SLIDER_SIZE_PRESETS },
] as const;

const PX_OPTICS = ["scaleX", "scaleY", "depth", "dome", "blur"] as const;
const DIMENSIONLESS_OPTICS = ["chroma", "splay", "glow", "edge"] as const;

describe("size tier derivation", () => {
  it("md reproduces the legacy anchor optics per role", () => {
    const anchors = [
      { lens: GLASS_SWITCH_SIZE_PRESETS.md.lens, legacy: RETUNED_SWITCH_MD },
      { lens: GLASS_BUTTON_SIZE_PRESETS.md.lens, legacy: RETUNED_BUTTON_MD },
      { lens: GLASS_SLIDER_SIZE_PRESETS.md.lens, legacy: RETUNED_SLIDER_MD },
    ];
    for (const { lens, legacy } of anchors) {
      for (const [key, expected] of Object.entries(legacy)) {
        expect(lens[key as keyof GlassPresetLens], key).toBeCloseTo(expected as number, 10);
      }
    }
  });

  it("every tier carries full optics and stays within engine limits, unclamped", () => {
    for (const { name, presets } of ROLES) {
      for (const size of SIZES) {
        const lens = presets[size].lens;
        for (const key of [...PX_OPTICS, ...DIMENSIONLESS_OPTICS, "maxSlope"] as const) {
          expect(lens[key], `${name}/${size}/${key}`).toBeTypeOf("number");
        }
        expect(lens.mapSize, `${name}/${size} pins mapSize`).toBeUndefined();

        const normalized = normalizeLensParams(lens);
        for (const key of PX_OPTICS) {
          const limit = LENS_PARAM_LIMITS[key];
          expect(lens[key], `${name}/${size}/${key} min`).toBeGreaterThanOrEqual(limit.min);
          expect(lens[key], `${name}/${size}/${key} max`).toBeLessThanOrEqual(limit.max);
          // Radius intentionally exceeds min-side/2 for capsules; every other
          // px optic must survive normalization untouched.
          expect(normalized[key], `${name}/${size}/${key} clamped`).toBeCloseTo(
            lens[key] as number,
            10,
          );
        }
      }
    }
  });

  it("px optics scale strictly with the lens short side (same material at every tier)", () => {
    for (const { name, presets } of ROLES) {
      const md = presets.md.lens;
      const mdMinSide = Math.min(md.width, md.height);
      for (const size of SIZES) {
        const lens = presets[size].lens;
        const scale = Math.min(lens.width, lens.height) / mdMinSide;
        for (const key of PX_OPTICS) {
          expect(lens[key], `${name}/${size}/${key}`).toBeCloseTo((md[key] as number) * scale, 10);
        }
        for (const key of DIMENSIONLESS_OPTICS) {
          expect(lens[key], `${name}/${size}/${key}`).toBe(md[key]);
        }
      }
    }
  });

  it("enumerates the intended departures from the legacy hand tables", () => {
    // The strict-identity derivation deliberately softens lg/xl: relative
    // displacement no longer climbs with size and the lg/xl dome step is
    // gone. These assertions document the change (and fail loudly if someone
    // reintroduces drift by hand-editing generated tiers instead of using
    // the override maps).
    expect(GLASS_SWITCH_SIZE_PRESETS.xl.lens.scaleX).toBeLessThan(
      LEGACY_SWITCH_OPTICS.xl.scaleX as number,
    );
    expect(GLASS_SWITCH_SIZE_PRESETS.lg.lens.dome).toBe(0);
    expect(GLASS_SWITCH_SIZE_PRESETS.xl.lens.dome).toBe(0);
    expect(GLASS_BUTTON_SIZE_PRESETS.lg.lens.dome).toBe(0);
    expect(GLASS_BUTTON_SIZE_PRESETS.xl.lens.dome).toBe(0);
    // Blur is proportional now, not a constant 2px.
    expect(GLASS_SWITCH_SIZE_PRESETS.sm.lens.blur).toBeLessThan(2);
    expect(GLASS_SWITCH_SIZE_PRESETS.xl.lens.blur).toBeGreaterThan(2);
    // Slider tiers scale around the md anchor instead of sharing one set;
    // scaleX is negative (demagnifying wrap), so |xl| > |sm|.
    expect(Math.abs(GLASS_SLIDER_SIZE_PRESETS.sm.lens.scaleX)).toBeLessThan(
      Math.abs(GLASS_SLIDER_SIZE_PRESETS.xl.lens.scaleX),
    );
    expect(GLASS_SLIDER_SIZE_PRESETS.xl.lens.scaleX).toBeLessThan(0);
  });

  it("tier geometry (width/height/radius) matches the legacy tables", () => {
    const legacyGeometry: Record<GlassComponentSize, ResolvedLensParams["width"][]> = {
      sm: [28, 20, 34, 22, 84, 30],
      md: [36, 26, 40, 26, 104, 38],
      lg: [54, 32, 46, 30, 128, 44],
      xl: [64, 38, 54, 34, 152, 52],
    };
    for (const size of SIZES) {
      const [sw, sh, slw, slh, bw, bh] = legacyGeometry[size];
      expect(GLASS_SWITCH_SIZE_PRESETS[size].lens.width).toBe(sw);
      expect(GLASS_SWITCH_SIZE_PRESETS[size].lens.height).toBe(sh);
      expect(GLASS_SLIDER_SIZE_PRESETS[size].lens.width).toBe(slw);
      expect(GLASS_SLIDER_SIZE_PRESETS[size].lens.height).toBe(slh);
      expect(GLASS_BUTTON_SIZE_PRESETS[size].lens.width).toBe(bw);
      expect(GLASS_BUTTON_SIZE_PRESETS[size].lens.height).toBe(bh);
    }
  });
});
