import { DEFAULT_LENS_PARAMS } from "./defaults";
import type { LensParams } from "./types";

/**
 * A px-valued optic expressed relative to the lens's short side:
 *
 *   value = ratio * minSide * (minSide / anchorMinSide) ** curve
 *
 * curve  0 → strictly proportional: the rendered look is size-invariant.
 * curve −1 → constant px regardless of lens size (legacy hand-tuned tables
 *            kept e.g. blur at a fixed 2px; the curve encodes that choice
 *            explicitly instead of leaving it implied).
 * curve >0 → deliberate "bigger reads deeper" progression.
 *
 * At minSide === anchorMinSide the curve term is 1, so the anchor tier always
 * reproduces ratio * anchorMinSide exactly — tuning at the anchor is lossless.
 * A bare number is shorthand for { ratio: value, curve: 0 }.
 */
export type RatioTerm = number | { ratio: number; curve?: number };

/**
 * Size-invariant description of a lens material: px-valued optics as
 * `RatioTerm`s of min(width, height), dimensionless optics carried verbatim.
 * `mapSize` is deliberately absent — component-local rendering derives it
 * from the lens's device-pixel size (`autoMapSize`).
 */
export interface LensSizeProfile {
  /** Short side (px) the ratio terms were authored/tuned at. */
  anchorMinSide: number;
  /** px-valued optics, derived from min(width, height). */
  radius?: RatioTerm;
  scaleX: RatioTerm;
  scaleY: RatioTerm;
  depth: RatioTerm;
  dome: RatioTerm;
  blur: RatioTerm;
  /** Dimensionless optics, copied through verbatim (defaults fill the rest). */
  chroma?: number;
  splay?: number;
  glow?: number;
  edge?: number;
  glowSpread?: number;
  glowExponent?: number;
  edgeExponent?: number;
  specularRotation?: number;
  maxSlope?: number;
}

export type DerivedLensParams = Omit<LensParams, "mapSize"> & { mapSize?: undefined };

/**
 * Computes absolute-px lens params for a width×height lens from a ratio
 * profile. Pure; runs before `normalizeLensParams`, which still clamps the
 * result (radius in particular relies on its min(w,h)/2 cap for capsule
 * shapes). Omits `mapSize` so `autoMapSize` stays in charge.
 */
export function deriveLensParams(
  width: number,
  height: number,
  profile: LensSizeProfile,
): DerivedLensParams {
  const minSide = Math.min(Math.max(1, width), Math.max(1, height));
  const px = (term: RatioTerm): number => resolveRatioTerm(term, minSide, profile.anchorMinSide);

  return {
    width,
    height,
    radius: px(profile.radius ?? DEFAULT_LENS_PARAMS.radius / DEFAULT_ANCHOR_MIN_SIDE),
    scaleX: px(profile.scaleX),
    scaleY: px(profile.scaleY),
    depth: px(profile.depth),
    dome: px(profile.dome),
    blur: px(profile.blur),
    chroma: profile.chroma ?? DEFAULT_LENS_PARAMS.chroma,
    splay: profile.splay ?? DEFAULT_LENS_PARAMS.splay,
    glow: profile.glow ?? DEFAULT_LENS_PARAMS.glow,
    edge: profile.edge ?? DEFAULT_LENS_PARAMS.edge,
    glowSpread: profile.glowSpread ?? DEFAULT_LENS_PARAMS.glowSpread,
    glowExponent: profile.glowExponent ?? DEFAULT_LENS_PARAMS.glowExponent,
    edgeExponent: profile.edgeExponent ?? DEFAULT_LENS_PARAMS.edgeExponent,
    specularRotation: profile.specularRotation ?? DEFAULT_LENS_PARAMS.specularRotation,
    maxSlope: profile.maxSlope ?? DEFAULT_LENS_PARAMS.maxSlope,
  };
}

function resolveRatioTerm(term: RatioTerm, minSide: number, anchorMinSide: number): number {
  const ratio = typeof term === "number" ? term : term.ratio;
  const curve = typeof term === "number" ? 0 : (term.curve ?? 0);
  const base = ratio * minSide;
  if (curve === 0) return base;
  return base * (minSide / anchorMinSide) ** curve;
}

/** Short side of the reference lens `DEFAULT_LENS_PARAMS` was authored at. */
const DEFAULT_ANCHOR_MIN_SIDE = 120;

/**
 * `DEFAULT_LENS_PARAMS` re-expressed as ratios of its 180×120 reference lens.
 * The reference look was already ratio-shaped — depth and scale are 15% of the
 * short side, radius 30%, dome 75%, blur 2% — this makes it official:
 * `deriveLensParams(180, 120, DEFAULT_LENS_PROFILE)` reproduces the defaults
 * exactly, and any other size renders the same material.
 */
export const DEFAULT_LENS_PROFILE: LensSizeProfile = {
  anchorMinSide: DEFAULT_ANCHOR_MIN_SIDE,
  radius: DEFAULT_LENS_PARAMS.radius / DEFAULT_ANCHOR_MIN_SIDE,
  scaleX: DEFAULT_LENS_PARAMS.scaleX / DEFAULT_ANCHOR_MIN_SIDE,
  scaleY: DEFAULT_LENS_PARAMS.scaleY / DEFAULT_ANCHOR_MIN_SIDE,
  depth: DEFAULT_LENS_PARAMS.depth / DEFAULT_ANCHOR_MIN_SIDE,
  dome: DEFAULT_LENS_PARAMS.dome / DEFAULT_ANCHOR_MIN_SIDE,
  blur: DEFAULT_LENS_PARAMS.blur / DEFAULT_ANCHOR_MIN_SIDE,
  chroma: DEFAULT_LENS_PARAMS.chroma,
  splay: DEFAULT_LENS_PARAMS.splay,
  glow: DEFAULT_LENS_PARAMS.glow,
  edge: DEFAULT_LENS_PARAMS.edge,
  glowSpread: DEFAULT_LENS_PARAMS.glowSpread,
  glowExponent: DEFAULT_LENS_PARAMS.glowExponent,
  edgeExponent: DEFAULT_LENS_PARAMS.edgeExponent,
  specularRotation: DEFAULT_LENS_PARAMS.specularRotation,
  maxSlope: DEFAULT_LENS_PARAMS.maxSlope,
};
