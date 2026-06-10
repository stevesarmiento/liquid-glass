import { clamp, normalizeLensParams } from "./defaults";
import { computeDomeConstants, domeGradient, erfApprox, roundedRectSdf } from "./ts-engine";
import type { DisplacementMap, MergedLensShape, MergedMapInput } from "./types";

const MAX_LENSES = 4;
const EDGE_RANGE = 3;
const GRADIENT_EPS = 0.5;

/**
 * Half-range in region px of the signed-distance band encoded in the merged
 * map's alpha channel.
 *
 * - encode: alpha = clamp(0.5 - d / (2 * MERGED_ALPHA_DISTANCE_RANGE), 0, 1)
 * - decode (renderer side): d = (0.5 - alpha) * (2 * MERGED_ALPHA_DISTANCE_RANGE)
 *
 * Alpha is 255 at d <= -MERGED_ALPHA_DISTANCE_RANGE (deep inside), 128/127
 * straddle the surface (d = 0), and 0 at d >= +MERGED_ALPHA_DISTANCE_RANGE.
 *
 * 40px (≈0.31px per alpha step) leaves enough outward band for the shader's
 * drop shadow (offset + blur are capped to this range, see controller.ts)
 * while keeping the quantization error well under the renderers' ~1px AA.
 */
export const MERGED_ALPHA_DISTANCE_RANGE = 40;

/**
 * Polynomial smooth-min. With k <= 0 this degrades to a hard `min(a, b)`.
 * Folded left-to-right over the lens list to build the merged SDF.
 */
export function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/**
 * Cache key for a merged displacement map. Lens centers are quantized to 1px
 * RELATIVE to the first lens, so translating the whole group together
 * preserves the key. Includes only optical params that affect map output
 * (width/height/radius/splay of the shared lens params are ignored in merged
 * mode and excluded).
 */
export function mergedMapKey(input: MergedMapInput): string {
  const params = normalizeLensParams(input.lens);
  const lenses = input.lenses;
  const baseX = lenses.length > 0 ? lenses[0].x : 0;
  const baseY = lenses.length > 0 ? lenses[0].y : 0;
  const lensKey = lenses
    .map((lens) =>
      [
        Math.round(lens.x - baseX),
        Math.round(lens.y - baseY),
        lens.width,
        lens.height,
        lens.radius,
      ].join(","),
    )
    .join(";");

  return [
    lensKey,
    Math.round(input.regionWidth),
    Math.round(input.regionHeight),
    input.blend,
    params.depth,
    params.dome,
    params.glow,
    params.edge,
    params.glowSpread,
    params.glowExponent,
    params.edgeExponent,
    params.specularRotation,
    params.mapSize,
  ].join("|");
}

/**
 * Generates a multi-lens "liquid blend" (metaball) displacement map.
 *
 * - Per-lens rounded-rect SDFs are merged with a polynomial smooth-min.
 * - Output may be non-square: the longest side equals the normalized
 *   `mapSize`, the other side is scaled by the region aspect (min 8).
 * - R/G encode displacement around 128 and B encodes specular, matching the
 *   single-lens generator's conventions. A encodes signed distance to the
 *   blob edge over a ±MERGED_ALPHA_DISTANCE_RANGE px band (see the constant
 *   for the encode/decode formulas); single-lens maps use A=255 everywhere.
 *   Outside the blob (d >= 0) RGB stay neutral — only alpha carries
 *   information there.
 * - The smooth-min k is attenuated per fold step as lenses overlap
 *   (anti-bloat): with two lenses this keeps the full liquid neck while they
 *   approach/touch, then eases to a clean union as they overlap, instead of
 *   swelling the merged blob by up to k/4.
 * - `splay` is ignored in merged mode.
 *
 * Float operations are kept simple and ordered for byte parity with the
 * upcoming Rust port.
 */
export function generateMergedDisplacementMap(input: MergedMapInput): DisplacementMap {
  if (input.lenses.length === 0) {
    throw new Error("generateMergedDisplacementMap requires at least one lens");
  }
  const lenses = input.lenses.slice(0, MAX_LENSES);
  const params = normalizeLensParams(input.lens);
  const regionWidth = Math.max(1, input.regionWidth);
  const regionHeight = Math.max(1, input.regionHeight);
  const blend = Math.max(0, input.blend);
  const mapSize = params.mapSize;

  let mapW: number;
  let mapH: number;
  if (regionWidth >= regionHeight) {
    mapW = mapSize;
    mapH = Math.max(8, Math.round((mapSize * regionHeight) / regionWidth));
  } else {
    mapH = mapSize;
    mapW = Math.max(8, Math.round((mapSize * regionWidth) / regionHeight));
  }

  const count = lenses.length;
  const cx = new Float64Array(count);
  const cy = new Float64Array(count);
  const hw = new Float64Array(count);
  const hh = new Float64Array(count);
  const rad = new Float64Array(count);
  let rRef = 0;
  for (let i = 0; i < count; i += 1) {
    const lens = lenses[i] as MergedLensShape;
    cx[i] = lens.x;
    cy[i] = lens.y;
    hw[i] = Math.max(0.5, lens.width / 2);
    hh[i] = Math.max(0.5, lens.height / 2);
    rad[i] = clamp(lens.radius, 0, Math.min(hw[i]!, hh[i]!));
    rRef = Math.max(rRef, Math.min(hw[i]!, hh[i]!));
  }

  const depth = params.depth;
  const invSigma = depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6;
  const dome = params.dome > 0 ? computeDomeConstants(params.dome, rRef, rRef) : null;
  const glowThreshold = (1 - params.glowSpread) * Math.SQRT2;
  const glowRange = params.glowSpread * Math.SQRT2;
  const specRotation = (params.specularRotation * Math.PI) / 180;
  const specX = Math.cos(specRotation);
  const specY = Math.sin(specRotation);

  // Overlap-aware blend attenuation (anti-bloat). The polynomial smooth-min
  // inflates the union by up to k/4 wherever both surfaces are within k, so
  // the merged blob visibly swells once lenses overlap. Attenuate k for each
  // fold step by how deeply lens i overlaps the lenses before it:
  //   gap >= 0 (approaching/touching) -> full blend (liquid neck),
  //   gap <= -erMin (fully swallowed) -> 0 (plain min, no bloat).
  // Effective radii use the clamped half-extents, i.e. min(width, height) / 2
  // with the same 0.5px floor as hw/hh, which also keeps erMin > 0. Computed
  // once per map and reused inside the central-difference gradient samples.
  const er = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    er[i] = Math.min(hw[i]!, hh[i]!);
  }
  const kEff = new Float64Array(count);
  for (let i = 1; i < count; i += 1) {
    let gap = Infinity;
    let erMin = er[i]!;
    for (let j = 0; j < i; j += 1) {
      const dx = cx[i]! - cx[j]!;
      const dy = cy[i]! - cy[j]!;
      const g = Math.sqrt(dx * dx + dy * dy) - er[i]! - er[j]!;
      if (g < gap) gap = g;
      if (er[j]! < erMin) erMin = er[j]!;
    }
    kEff[i] = blend * clamp(1 + gap / erMin, 0, 1);
  }

  const mergedSdf = (sx: number, sy: number): number => {
    let d = roundedRectSdf(sx - cx[0]!, sy - cy[0]!, hw[0]!, hh[0]!, rad[0]!);
    for (let i = 1; i < count; i += 1) {
      const di = roundedRectSdf(sx - cx[i]!, sy - cy[i]!, hw[i]!, hh[i]!, rad[i]!);
      d = smoothMin(d, di, kEff[i]!);
    }
    return d;
  };

  const rgba = new Uint8ClampedArray(mapW * mapH * 4);

  for (let py = 0; py < mapH; py += 1) {
    const sy = ((py + 0.5) * regionHeight) / mapH;
    for (let px = 0; px < mapW; px += 1) {
      const sx = ((px + 0.5) * regionWidth) / mapW;
      const d = mergedSdf(sx, sy);
      const alpha = Math.round(clamp(0.5 - d / (2 * MERGED_ALPHA_DISTANCE_RANGE), 0, 1) * 255);
      const index = (py * mapW + px) * 4;

      // Outside the blob only alpha carries information (the signed-distance
      // band extends to d < +MERGED_ALPHA_DISTANCE_RANGE); displacement and
      // specular stay neutral, so skip the gradient/spec work entirely.
      if (d >= 0) {
        rgba[index] = 128;
        rgba[index + 1] = 128;
        rgba[index + 2] = 128;
        rgba[index + 3] = alpha;
        continue;
      }

      // Outward-pointing gradient of the merged SDF via central differences.
      let gx = (mergedSdf(sx + GRADIENT_EPS, sy) - mergedSdf(sx - GRADIENT_EPS, sy)) /
        (2 * GRADIENT_EPS);
      let gy = (mergedSdf(sx, sy + GRADIENT_EPS) - mergedSdf(sx, sy - GRADIENT_EPS)) /
        (2 * GRADIENT_EPS);
      const gradLength = Math.hypot(gx, gy);
      if (gradLength < 1e-6) {
        gx = 0;
        gy = 0;
      } else {
        gx /= gradLength;
        gy /= gradLength;
      }

      const e = Math.max(0, -d);
      const xEquiv = clamp(rRef - e, 0, rRef);
      let m = dome ? domeGradient(xEquiv, dome.rx, dome.scaleX) : xEquiv / rRef;
      m = clamp(m, 0, 1.5);

      // For a lone circle the inset SDF equals d + depth exactly, matching
      // the single-lens falloff behavior.
      const falloff = 0.5 * (1 + erfApprox((d + depth) * invSigma));

      const dispX = clamp(gx * m * falloff, -1, 1);
      const dispY = clamp(gy * m * falloff, -1, 1);
      const r = Math.round((0.5 - 0.5 * dispX) * 255);
      const g = Math.round((0.5 - 0.5 * dispY) * 255);

      // Specular: pseudo-normalized coords from the gradient scaled by the
      // rim proximity. For a lone circle this equals the single-lens
      // normalized coords at the rim.
      const p = clamp(1 - e / rRef, 0, 1);
      const nx = gx * p;
      const ny = gy * p;
      const highlightAxis = Math.abs(nx * specX + ny * specY);
      const edgeMask = d < 0 ? Math.max(0, 1 + d / EDGE_RANGE) : 0;
      let spec = 0;
      if (params.glow > 0) {
        const t = clamp((highlightAxis - glowThreshold) / glowRange, 0, 1);
        spec += params.glow * Math.pow(t, params.glowExponent) * falloff;
      }
      if (params.edge > 0) {
        spec += params.edge * edgeMask * Math.pow(highlightAxis, params.edgeExponent);
      }
      const b = Math.round(128 + 127 * Math.min(1, spec));

      rgba[index] = r;
      rgba[index + 1] = g;
      rgba[index + 2] = b;
      rgba[index + 3] = alpha;
    }
  }

  return { width: mapW, height: mapH, rgba };
}
