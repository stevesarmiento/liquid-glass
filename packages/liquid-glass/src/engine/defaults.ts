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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
