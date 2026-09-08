import { DEFAULT_LENS_PARAMS } from "./defaults";
import { roundedRectSdf } from "./ts-engine";
import type { DisplacementMap, LensParams } from "./types";

/**
 * No-fold displacement guard.
 *
 * The rendered displacement at a texel is `(byte/255 - 0.5) * scaleAxis *
 * (1 + 0.2 * chroma)` (worst chroma channel). When the *spatial gradient* of
 * that field exceeds 1 px/px, adjacent backdrop samples reverse order and the
 * refracted content visibly folds/mirrors near edges — reachable with in-range
 * params (small lenses, low depth, high scale). The map generator normalizes
 * the MEAN dome slope, not the max, so nothing map-side prevents this.
 *
 * Rather than baking a slope limit into the map (which would break the map's
 * scale-agnostic caching and drift the reference look), this module measures
 * the maximum per-texel byte slope of the *actual encoded map* — the exact
 * quantity that folds — and lets each render sink soft-limit its effective
 * scale to `maxSlope / measuredSlope`. Below the cap the clamp is an exact
 * arithmetic no-op, so default renders are bit-identical.
 *
 * Only INTERIOR texel pairs count: the jump from the last inside texel to the
 * neutral (128) outside is the intended edge-refraction ring, present at
 * defaults, and must not drive the clamp. Inside-ness is decided the same way
 * the generator decides it (rounded-rect SDF at the texel center for
 * single-lens maps; alpha >= 128 for merged maps).
 *
 * Slopes are memoized by map identity — the global map cache shares map
 * instances 1:1 with lens geometry, so this is one O(size²) pass per unique
 * map, garbage-collected with the map itself.
 */

export interface MapTexelSlope {
  /** Max |ΔR|/255 between horizontally adjacent interior texels. */
  x: number;
  /** Max |ΔG|/255 between vertically adjacent interior texels. */
  y: number;
}

const lensSlopeCache = new WeakMap<DisplacementMap, MapTexelSlope>();
const mergedSlopeCache = new WeakMap<DisplacementMap, MapTexelSlope>();

/**
 * Max interior texel slope of a single-lens map. `generatingLens` must be the
 * lens the map was generated from (its width/height/radius decide which
 * texels are inside the glass); callers that stretch a map over a different
 * box still pass the generating lens here and the render box to
 * `clampScalesForMap`'s span.
 */
export function computeLensMapTexelSlope(
  map: DisplacementMap,
  generatingLens: LensParams,
): MapTexelSlope {
  const cached = lensSlopeCache.get(map);
  if (cached) return cached;

  const halfW = generatingLens.width / 2;
  const halfH = generatingLens.height / 2;
  const radius = Math.min(Math.max(0, generatingLens.radius), halfW, halfH);
  const slope = scanTexelSlope(map, (px, py) => {
    // Same texel-center mapping as the generator (ts-engine.ts).
    const x = ((px + 0.5) / map.width) * (2 * halfW) - halfW;
    const y = ((py + 0.5) / map.height) * (2 * halfH) - halfH;
    return roundedRectSdf(x, y, halfW, halfH, radius) < 0;
  });
  lensSlopeCache.set(map, slope);
  return slope;
}

/**
 * Max interior texel slope of a merged (metaball) map. Inside-ness comes from
 * the alpha-encoded signed distance: the generator writes neutral RGB when
 * d >= 0, and alpha > 127.5 ⇔ d < 0.
 */
export function computeMergedMapTexelSlope(map: DisplacementMap): MapTexelSlope {
  const cached = mergedSlopeCache.get(map);
  if (cached) return cached;

  const rgba = map.rgba;
  const width = map.width;
  const slope = scanTexelSlope(map, (px, py) => rgba[(py * width + px) * 4 + 3] >= 128);
  mergedSlopeCache.set(map, slope);
  return slope;
}

function scanTexelSlope(
  map: DisplacementMap,
  inside: (px: number, py: number) => boolean,
): MapTexelSlope {
  const { width, height, rgba } = map;
  let maxR = 0;
  let maxG = 0;
  let prevRow = new Uint8Array(width);
  let row = new Uint8Array(width);

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) row[px] = inside(px, py) ? 1 : 0;
    const base = py * width * 4;
    for (let px = 0; px < width; px += 1) {
      if (!row[px]) continue;
      const index = base + px * 4;
      if (px + 1 < width && row[px + 1]) {
        const dr = Math.abs(rgba[index + 4] - rgba[index]);
        if (dr > maxR) maxR = dr;
      }
      if (py > 0 && prevRow[px]) {
        const dg = Math.abs(rgba[index + 1] - rgba[index - width * 4 + 1]);
        if (dg > maxG) maxG = dg;
      }
    }
    const swap = prevRow;
    prevRow = row;
    row = swap;
  }

  return { x: maxR / 255, y: maxG / 255 };
}

export interface ClampScalesInput {
  texelSlope: MapTexelSlope;
  mapWidth: number;
  mapHeight: number;
  /** CSS size of the box the map is stretched over at render time. */
  spanWidth: number;
  spanHeight: number;
  scaleX: number;
  scaleY: number;
  chroma: number;
  maxSlope: number;
  strength?: number;
}

export interface ClampedScales {
  scaleX: number;
  scaleY: number;
}

/**
 * Soft-limits the per-axis displacement scales so the rendered gradient stays
 * below `maxSlope`. Rendered slope per axis is
 * `texelSlope * (mapSize / span) * scaleAxis * strength * (1 + 0.2*chroma)`
 * (the R channel's chroma multiplier is the worst case and applies to both
 * axes of that displacement pass). Pure; returns the input scales untouched
 * whenever they are already under the cap.
 */
export function clampScalesForMap(input: ClampScalesInput): ClampedScales {
  const strength = input.strength ?? 1;
  const chromaFactor = 1 + 0.2 * Math.max(0, input.chroma);
  const maxSlope = input.maxSlope;
  if (!Number.isFinite(maxSlope) || maxSlope <= 0 || strength <= 0) {
    return { scaleX: input.scaleX, scaleY: input.scaleY };
  }

  const slopePerScaleX =
    input.texelSlope.x * (input.mapWidth / Math.max(input.spanWidth, 1e-6)) * strength * chromaFactor;
  const slopePerScaleY =
    input.texelSlope.y * (input.mapHeight / Math.max(input.spanHeight, 1e-6)) * strength * chromaFactor;

  return {
    scaleX: slopePerScaleX > 1e-9 ? Math.min(input.scaleX, maxSlope / slopePerScaleX) : input.scaleX,
    scaleY: slopePerScaleY > 1e-9 ? Math.min(input.scaleY, maxSlope / slopePerScaleY) : input.scaleY,
  };
}

export interface ClampLensScalesOptions {
  /** Displacement strength multiplier the sink applies (canvas/webgl). */
  strength?: number;
  /**
   * Lens the map was generated from, when it differs from the rendered lens
   * (e.g. a transiently quantized map stretched over the exact box).
   */
  generatingLens?: LensParams;
}

/** Clamped scales for a single-lens map rendered over `lens`'s box. */
export function clampLensScales(
  map: DisplacementMap,
  lens: LensParams,
  options?: ClampLensScalesOptions,
): ClampedScales {
  return clampScalesForMap({
    texelSlope: computeLensMapTexelSlope(map, options?.generatingLens ?? lens),
    mapWidth: map.width,
    mapHeight: map.height,
    spanWidth: lens.width,
    spanHeight: lens.height,
    scaleX: lens.scaleX,
    scaleY: lens.scaleY,
    chroma: lens.chroma,
    maxSlope: lens.maxSlope ?? DEFAULT_LENS_PARAMS.maxSlope,
    strength: options?.strength,
  });
}

/** Clamped scales for a merged map spanning a region of the given CSS size. */
export function clampMergedScales(
  map: DisplacementMap,
  lens: LensParams,
  regionWidth: number,
  regionHeight: number,
  strength?: number,
): ClampedScales {
  return clampScalesForMap({
    texelSlope: computeMergedMapTexelSlope(map),
    mapWidth: map.width,
    mapHeight: map.height,
    spanWidth: regionWidth,
    spanHeight: regionHeight,
    scaleX: lens.scaleX,
    scaleY: lens.scaleY,
    chroma: lens.chroma,
    maxSlope: lens.maxSlope ?? DEFAULT_LENS_PARAMS.maxSlope,
    strength,
  });
}
