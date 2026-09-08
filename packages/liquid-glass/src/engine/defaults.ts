import type { LensParams, ResolvedLensParams } from "./types";

export const DEFAULT_LENS_PARAMS: ResolvedLensParams = {
  width: 180,
  height: 120,
  radius: 36,
  scaleX: 18,
  scaleY: 18,
  chroma: 0.35,
  depth: 18,
  dome: 90,
  splay: 0.78,
  glow: 0.45,
  edge: 0.45,
  glowSpread: 0.62,
  glowExponent: 1.5,
  edgeExponent: 1.2,
  specularRotation: 45,
  // Just above the defaults preset's own measured peak slope (~1.29 on the
  // short axis) so the reference look is untouched; see LensParams.maxSlope.
  maxSlope: 1.4,
  blur: 2.4,
  mapSize: 256,
};

export type LensParamLimit = {
  min: number;
  max: number;
  /** Effective max is additionally capped at min(width, height) / 2. */
  halfMinSideCap?: boolean;
  /** Effective max is additionally capped at min(width, height). */
  minSideCap?: boolean;
  /** Rounded to an integer before clamping (mapSize). */
  round?: boolean;
};

/**
 * Clamp ranges applied by `normalizeLensParams`, one entry per lens param in
 * `DEFAULT_LENS_PARAMS` key order (docs tables iterate this alongside the
 * defaults). radius/depth carry `halfMinSideCap`: their static max only
 * matters for lenses larger than 4096px — the live cap is min(w, h) / 2.
 */
export const LENS_PARAM_LIMITS: Record<keyof ResolvedLensParams, LensParamLimit> = {
  width: { min: 1, max: 4096 },
  height: { min: 1, max: 4096 },
  radius: { min: 0, max: 2048, halfMinSideCap: true },
  // Negative scale inverts the sample direction: the lens demagnifies
  // (zoom-out), pulling backdrop in from beyond its bounds.
  scaleX: { min: -512, max: 512 },
  scaleY: { min: -512, max: 512 },
  chroma: { min: 0, max: 8 },
  // Depth beyond min(w,h)/2 still matters: the inner rect is already
  // collapsed, but the erf falloff sigma keeps growing, softening the ramp
  // toward a full-face gradient (the key to uniform demagnification with
  // negative scale). Capped at the full short side, where it saturates.
  depth: { min: 0, max: 4096, minSideCap: true },
  dome: { min: 0, max: 4096 },
  splay: { min: 0.001, max: 1 },
  glow: { min: 0, max: 4 },
  edge: { min: 0, max: 4 },
  glowSpread: { min: 0.05, max: 2 },
  glowExponent: { min: 0.1, max: 8 },
  edgeExponent: { min: 0.1, max: 8 },
  specularRotation: { min: -360, max: 360 },
  maxSlope: { min: 0.05, max: 100 },
  blur: { min: 0, max: 128 },
  mapSize: { min: 8, max: 2048, round: true },
};

export function normalizeLensParams(input: Partial<LensParams> = {}): ResolvedLensParams {
  const width = resolveLensParam("width", input.width);
  const height = resolveLensParam("height", input.height);
  const halfMinSide = Math.min(width, height) * 0.5;

  const result = { width, height } as ResolvedLensParams;
  for (const key of Object.keys(DEFAULT_LENS_PARAMS) as Array<keyof ResolvedLensParams>) {
    if (key === "width" || key === "height") continue;
    result[key] = resolveLensParam(key, input[key], halfMinSide);
  }
  return result;
}

function resolveLensParam(
  key: keyof ResolvedLensParams,
  value: number | undefined,
  halfMinSide = Number.POSITIVE_INFINITY,
): number {
  const limit = LENS_PARAM_LIMITS[key];
  let resolved = finiteOr(value, DEFAULT_LENS_PARAMS[key]);
  if (limit.round) resolved = Math.round(resolved);
  let max = limit.max;
  if (limit.halfMinSideCap) max = Math.min(max, halfMinSide);
  if (limit.minSideCap) max = Math.min(max, halfMinSide * 2);
  return clamp(resolved, limit.min, max);
}

/**
 * Default map resolution for a lens of the given CSS size: the next power of
 * two covering the lens's longest side in device pixels, clamped to [32, 512].
 * Small controls (switch knobs, button faces) get proportionally small maps —
 * a 36×22 knob at 2× dpr resolves to 128² instead of the global 256–512²
 * default, a 4–16× cut in per-map generation cost. Powers of two keep the
 * cache key space small so the global LRU map cache stays hot.
 *
 * Used by component-local rendering (GlassNode); the scene-level controller
 * and merged maps keep their explicit sizes.
 */
export function autoMapSize(width: number, height: number, pixelRatio = 1): number {
  const longest = Math.max(1, Math.max(width, height)) * Math.max(1, pixelRatio);
  return clamp(ceilPow2(longest), 32, 512);
}

function ceilPow2(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

/** Grid density for `quantizeLensSizeUp`: 4 steps per octave ≈ 19% buckets. */
export const QUANT_STEPS_PER_OCTAVE = 4;

/**
 * Snaps a lens dimension UP to a geometric grid (2^(k/stepsPerOctave), ~19%
 * steps at the default density). Used to bound the number of distinct map
 * cache keys a continuous resize can produce: during a burst the map is
 * generated at the quantized size and stretched over the exact box, so a
 * 168→460px morph crosses ≤7 buckets instead of ~300 exact sizes — and a
 * repeat morph between the same endpoints crosses 0 new ones. Rounding up
 * (never down) guarantees the quantized map's radius is never clamped
 * tighter than the real lens (`normalizeLensParams` caps radius at
 * min(w,h)/2). Idempotent on grid points.
 */
export function quantizeLensSizeUp(value: number, stepsPerOctave = QUANT_STEPS_PER_OCTAVE): number {
  const v = Math.max(1, Math.ceil(value));
  const steps = Math.max(1, Math.round(stepsPerOctave));
  // Smallest integer grid point round(2^(k/steps)) >= v. Searching (instead
  // of solving for k directly) keeps the function idempotent despite the
  // integer rounding of grid points.
  let k = Math.floor(Math.log2(v) * steps);
  let grid = Math.round(2 ** (k / steps));
  while (grid < v) {
    k += 1;
    grid = Math.round(2 ** (k / steps));
  }
  return grid;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
