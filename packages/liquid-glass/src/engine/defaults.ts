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

export function normalizeLensParams(input: Partial<LensParams> = {}): ResolvedLensParams {
  const width = clamp(finiteOr(input.width, DEFAULT_LENS_PARAMS.width), 1, 4096);
  const height = clamp(finiteOr(input.height, DEFAULT_LENS_PARAMS.height), 1, 4096);
  const maxRadius = Math.min(width, height) * 0.5;

  return {
    width,
    height,
    radius: clamp(finiteOr(input.radius, DEFAULT_LENS_PARAMS.radius), 0, maxRadius),
    scaleX: clamp(finiteOr(input.scaleX, DEFAULT_LENS_PARAMS.scaleX), 0, 512),
    scaleY: clamp(finiteOr(input.scaleY, DEFAULT_LENS_PARAMS.scaleY), 0, 512),
    chroma: clamp(finiteOr(input.chroma, DEFAULT_LENS_PARAMS.chroma), 0, 8),
    depth: clamp(finiteOr(input.depth, DEFAULT_LENS_PARAMS.depth), 0, maxRadius),
    dome: clamp(finiteOr(input.dome, DEFAULT_LENS_PARAMS.dome), 0, 4096),
    splay: clamp(finiteOr(input.splay, DEFAULT_LENS_PARAMS.splay), 0.001, 1),
    glow: clamp(finiteOr(input.glow, DEFAULT_LENS_PARAMS.glow), 0, 4),
    edge: clamp(finiteOr(input.edge, DEFAULT_LENS_PARAMS.edge), 0, 4),
    glowSpread: clamp(finiteOr(input.glowSpread, DEFAULT_LENS_PARAMS.glowSpread), 0.05, 2),
    glowExponent: clamp(finiteOr(input.glowExponent, DEFAULT_LENS_PARAMS.glowExponent), 0.1, 8),
    edgeExponent: clamp(finiteOr(input.edgeExponent, DEFAULT_LENS_PARAMS.edgeExponent), 0.1, 8),
    specularRotation: clamp(
      finiteOr(input.specularRotation, DEFAULT_LENS_PARAMS.specularRotation),
      -360,
      360,
    ),
    maxSlope: clamp(finiteOr(input.maxSlope, DEFAULT_LENS_PARAMS.maxSlope), 0.05, 100),
    blur: clamp(finiteOr(input.blur, DEFAULT_LENS_PARAMS.blur), 0, 128),
    mapSize: clamp(Math.round(input.mapSize ?? DEFAULT_LENS_PARAMS.mapSize), 8, 2048),
  };
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
