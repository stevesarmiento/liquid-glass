import { deriveLensParams, type LensParams, type LensSizeProfile } from "liquid-glass";

export type GlassComponentSize = "sm" | "md" | "lg" | "xl";

/**
 * Preset lens optics deliberately omit `mapSize`: GlassNode derives it from
 * the lens size in device pixels (`autoMapSize`), so small controls get
 * proportionally small, cheap, cache-friendly displacement maps. Pass an
 * explicit `mapSize` through a component's `glassLens` override to pin it.
 */
export type GlassPresetLens = Omit<LensParams, "mapSize"> & { mapSize?: number };

export type GlassSliderSizePreset = {
  sliderWidth: number;
  controlHeight: number;
  trackHeight: number;
  lens: GlassPresetLens;
};

export type GlassSwitchSizePreset = {
  switchWidth: number;
  controlHeight: number;
  trackHeight: number;
  trackInsetX: number;
  thumbInsetX: number;
  lens: GlassPresetLens;
};

export type GlassButtonSizePreset = {
  height: number;
  paddingX: number;
  fontSize: number;
  radius: number;
  lens: GlassPresetLens;
};

/*
 * Tier optics are GENERATED from one ratio profile per component role,
 * anchored at the md tier's short side — sm..xl render the same material at
 * different scales instead of drifting apart (the old hand tables let e.g.
 * the switch's relative displacement climb from 22% of the lens at sm to 79%
 * at xl, with dome flipping 0 → 100). All curves are 0 (strictly
 * proportional). Deliberate per-tier deviations belong in the *_TIER_OVERRIDES
 * maps below, not in edited output values, so every departure from the
 * continuous profile stays enumerable.
 */

function tierLens(
  width: number,
  height: number,
  radius: number,
  profile: LensSizeProfile,
  overrides?: Partial<GlassPresetLens>,
): GlassPresetLens {
  const { mapSize: _mapSize, ...optics } = deriveLensParams(width, height, profile);
  return { ...optics, radius, ...overrides };
}

/**
 * Anchored at the md thumb short side 22 (ratio anchor; thumb geometry now
 * trackHeight − 4 per tier so the resting thumb nearly fills the track —
 * optics scale with the short side). glow/edge
 * retuned 1 → 0.5 (Sep 2026): at full strength the in-filter specular
 * saturates to a solid white band across a thumb-sized lens top.
 */
const SWITCH_OPTICS_PROFILE: LensSizeProfile = {
  anchorMinSide: 22,
  scaleX: 7.5 / 22,
  scaleY: 2 / 22,
  depth: 7.5 / 22,
  dome: 0,
  blur: 2 / 22,
  chroma: 0.6,
  splay: 0.1,
  glow: 0.5,
  edge: 0.5,
};

/**
 * Anchored at the md face (104×38), mirroring the switch's resting
 * magnitudes. The optics are tuned as a RESTING state — the button's glass is
 * always on, so each size reads as a subtle dome + edge at rest; GlassButton
 * boosts scaleX/scaleY/glow while pressed. Lens width/height are nominal:
 * GlassButton replaces them with the measured face size at render time.
 */
const BUTTON_OPTICS_PROFILE: LensSizeProfile = {
  anchorMinSide: 38,
  scaleX: 7.5 / 38,
  scaleY: 2 / 38,
  depth: 7.5 / 38,
  dome: 0,
  blur: 2 / 38,
  chroma: 0.6,
  splay: 0.1,
  // Retuned 1 -> 0.5 with the switch (solid-white spec band at small sizes).
  glow: 0.5,
  edge: 0.5,
};

/**
 * Baked Sep 2026 from a playground preset tuned on the 220×220 stage lens
 * (Copy preset -> ratios of anchor 220): strong negative (demagnifying)
 * scaleX wraps the track around the pill ends, gentler positive scaleY,
 * dome carries the bend, near-zero depth (dome-led field), no chroma/blur.
 * The px values scale per tier — the raw stage numbers overshoot a thumb
 * (scaleY 79.5 > thumb height reads as flat "clipped" bands).
 * Thumb geometry shrunk one notch per tier (Sep 2026): the resting pills
 * read too large; optics follow the smaller short side automatically.
 */
const SLIDER_ANCHOR = 220;
const SLIDER_OPTICS_PROFILE: LensSizeProfile = {
  anchorMinSide: SLIDER_ANCHOR,
  scaleX: -211.5 / SLIDER_ANCHOR,
  scaleY: 79.5 / SLIDER_ANCHOR,
  depth: 4.5 / SLIDER_ANCHOR,
  dome: 130 / SLIDER_ANCHOR,
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
 * Deliberate per-tier deviations from the continuous profiles. Empty today —
 * every tier is strictly the same material. Reintroduce e.g. a lg/xl dome
 * here if flat reads boring at large sizes; keeping the values in these maps
 * (instead of hand-editing generated output) keeps every deviation
 * enumerable and test-visible.
 */
const SWITCH_TIER_OVERRIDES: Partial<Record<GlassComponentSize, Partial<GlassPresetLens>>> = {};
const BUTTON_TIER_OVERRIDES: Partial<Record<GlassComponentSize, Partial<GlassPresetLens>>> = {};
const SLIDER_TIER_OVERRIDES: Partial<Record<GlassComponentSize, Partial<GlassPresetLens>>> = {};

/** Capsule idiom: radius > minSide / 2; normalizeLensParams clamps to a pill. */
const CAPSULE_RADIUS = 80;

export const GLASS_SLIDER_SIZE_PRESETS: Record<GlassComponentSize, GlassSliderSizePreset> = {
  sm: {
    sliderWidth: 180,
    controlHeight: 34,
    trackHeight: 7,
    lens: tierLens(34, 22, CAPSULE_RADIUS, SLIDER_OPTICS_PROFILE, SLIDER_TIER_OVERRIDES.sm),
  },
  md: {
    sliderWidth: 220,
    controlHeight: 38,
    trackHeight: 8,
    lens: tierLens(40, 26, CAPSULE_RADIUS, SLIDER_OPTICS_PROFILE, SLIDER_TIER_OVERRIDES.md),
  },
  lg: {
    sliderWidth: 244,
    controlHeight: 44,
    trackHeight: 9,
    lens: tierLens(46, 30, CAPSULE_RADIUS, SLIDER_OPTICS_PROFILE, SLIDER_TIER_OVERRIDES.lg),
  },
  xl: {
    sliderWidth: 320,
    controlHeight: 52,
    trackHeight: 11,
    lens: tierLens(54, 34, CAPSULE_RADIUS, SLIDER_OPTICS_PROFILE, SLIDER_TIER_OVERRIDES.xl),
  },
};

export const GLASS_BUTTON_SIZE_PRESETS: Record<GlassComponentSize, GlassButtonSizePreset> = {
  sm: {
    height: 30,
    paddingX: 14,
    fontSize: 12,
    radius: 15,
    lens: tierLens(84, 30, 15, BUTTON_OPTICS_PROFILE, BUTTON_TIER_OVERRIDES.sm),
  },
  md: {
    height: 38,
    paddingX: 18,
    fontSize: 13,
    radius: 19,
    lens: tierLens(104, 38, 19, BUTTON_OPTICS_PROFILE, BUTTON_TIER_OVERRIDES.md),
  },
  lg: {
    height: 44,
    paddingX: 22,
    fontSize: 14,
    radius: 22,
    lens: tierLens(128, 44, 22, BUTTON_OPTICS_PROFILE, BUTTON_TIER_OVERRIDES.lg),
  },
  xl: {
    height: 52,
    paddingX: 28,
    fontSize: 15,
    radius: 26,
    lens: tierLens(152, 52, 26, BUTTON_OPTICS_PROFILE, BUTTON_TIER_OVERRIDES.xl),
  },
};

export const GLASS_SWITCH_SIZE_PRESETS: Record<GlassComponentSize, GlassSwitchSizePreset> = {
  sm: {
    switchWidth: 54,
    controlHeight: 30,
    trackHeight: 24,
    trackInsetX: 3,
    thumbInsetX: 4,
    lens: tierLens(28, 20, CAPSULE_RADIUS, SWITCH_OPTICS_PROFILE, SWITCH_TIER_OVERRIDES.sm),
  },
  md: {
    switchWidth: 68,
    controlHeight: 36,
    trackHeight: 30,
    trackInsetX: 3,
    thumbInsetX: 5,
    lens: tierLens(36, 26, CAPSULE_RADIUS, SWITCH_OPTICS_PROFILE, SWITCH_TIER_OVERRIDES.md),
  },
  lg: {
    switchWidth: 98,
    controlHeight: 44,
    trackHeight: 36,
    trackInsetX: 4,
    thumbInsetX: 6,
    lens: tierLens(54, 32, CAPSULE_RADIUS, SWITCH_OPTICS_PROFILE, SWITCH_TIER_OVERRIDES.lg),
  },
  xl: {
    switchWidth: 116,
    controlHeight: 52,
    trackHeight: 42,
    trackInsetX: 5,
    thumbInsetX: 7,
    lens: tierLens(64, 38, CAPSULE_RADIUS, SWITCH_OPTICS_PROFILE, SWITCH_TIER_OVERRIDES.xl),
  },
};
