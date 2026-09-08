import { describe, expect, it } from "vitest";

import { normalizeLensParams } from "./defaults";
import {
  clampLensScales,
  clampMergedScales,
  clampScalesForMap,
  computeLensMapTexelSlope,
  computeMergedMapTexelSlope,
} from "./map-slope";
import { generateMergedDisplacementMap } from "./merged";
import { generateDisplacementMap, roundedRectSdf } from "./ts-engine";
import type { DisplacementMap, LensParams, ResolvedLensParams } from "./types";

/** Rendered chroma worst-case multiplier (R displacement pass). */
function chromaFactor(lens: ResolvedLensParams): number {
  return 1 + 0.2 * lens.chroma;
}

/**
 * Walks the horizontal mid-row and returns the max |Δdisp/Δx| between
 * INTERIOR-adjacent texel pairs at the given effective scaleX, plus the min
 * forward difference of the sampled position `x + disp(x)` (folding ⇔ min <= 0).
 */
function midRowSlopeStats(
  map: DisplacementMap,
  lens: ResolvedLensParams,
  effectiveScaleX: number,
): { maxSlope: number; minForwardStep: number } {
  const halfW = lens.width / 2;
  const halfH = lens.height / 2;
  const radius = Math.min(lens.radius, halfW, halfH);
  const py = Math.floor(map.height / 2);
  const y = ((py + 0.5) / map.height) * lens.height - halfH;
  const texelW = lens.width / map.width;
  const factor = effectiveScaleX * chromaFactor(lens);
  let maxSlope = 0;
  let minForwardStep = Infinity;

  for (let px = 0; px + 1 < map.width; px += 1) {
    const x0 = ((px + 0.5) / map.width) * lens.width - halfW;
    const x1 = x0 + texelW;
    const inside0 = roundedRectSdf(x0, y, halfW, halfH, radius) < 0;
    const inside1 = roundedRectSdf(x1, y, halfW, halfH, radius) < 0;
    if (!inside0 || !inside1) continue;
    const index = (py * map.width + px) * 4;
    const d0 = (map.rgba[index] / 255 - 0.5) * factor;
    const d1 = (map.rgba[index + 4] / 255 - 0.5) * factor;
    const slope = Math.abs(d1 - d0) / texelW;
    if (slope > maxSlope) maxSlope = slope;
    const step = x1 + d1 - (x0 + d0);
    if (step < minForwardStep) minForwardStep = step;
  }

  return { maxSlope, minForwardStep };
}

const DEFAULTS = normalizeLensParams();

/** Fold-reproducing lens presets from the investigation (all in-range). */
const FOLD_CASES: Array<{ name: string; lens: Partial<LensParams> }> = [
  { name: "high scale", lens: { scaleX: 40, scaleY: 40 } },
  { name: "low depth", lens: { depth: 4 } },
  { name: "small knob", lens: { width: 36, height: 22, radius: 11, mapSize: 128 } },
];

describe("computeLensMapTexelSlope", () => {
  it("memoizes by map identity", () => {
    const map = generateDisplacementMap(DEFAULTS);
    const first = computeLensMapTexelSlope(map, DEFAULTS);
    expect(computeLensMapTexelSlope(map, DEFAULTS)).toBe(first);
  });

  it("measures the interior slope of the defaults map near the known 0.645 figure", () => {
    const map = generateDisplacementMap(DEFAULTS);
    const slope = computeLensMapTexelSlope(map, DEFAULTS);
    const rendered =
      slope.x * (map.width / DEFAULTS.width) * DEFAULTS.scaleX * chromaFactor(DEFAULTS);
    expect(rendered).toBeGreaterThan(0.5);
    expect(rendered).toBeLessThan(0.8);
  });

  it("excludes the inside→outside rim jump from the measurement", () => {
    // The rim transition is ~0.5/texel; interior-only measurement must be far
    // below it at defaults (byte slope, not rendered slope).
    const map = generateDisplacementMap(DEFAULTS);
    const slope = computeLensMapTexelSlope(map, DEFAULTS);
    expect(slope.x).toBeLessThan(0.25);
    expect(slope.y).toBeLessThan(0.25);
  });
});

describe("clampLensScales", () => {
  it("is an exact no-op at defaults (product-look guarantee)", () => {
    const map = generateDisplacementMap(DEFAULTS);
    const clamped = clampLensScales(map, DEFAULTS);
    expect(clamped.scaleX).toBe(DEFAULTS.scaleX);
    expect(clamped.scaleY).toBe(DEFAULTS.scaleY);
  });

  for (const { name, lens: partial } of FOLD_CASES) {
    it(`caps the folding "${name}" case under the default maxSlope`, () => {
      const lens = normalizeLensParams(partial);
      const map = generateDisplacementMap(lens);
      const slope = computeLensMapTexelSlope(map, lens);

      // The unclamped configuration folds (rendered slope > 1)…
      const unclamped = midRowSlopeStats(map, lens, lens.scaleX);
      expect(unclamped.maxSlope).toBeGreaterThan(1);
      expect(unclamped.minForwardStep).toBeLessThanOrEqual(0);

      // …and the clamp bounds the worst measured axis at the cap.
      const clamped = clampLensScales(map, lens);
      const renderedX =
        slope.x * (map.width / lens.width) * clamped.scaleX * chromaFactor(lens);
      expect(renderedX).toBeLessThanOrEqual(lens.maxSlope + 1e-6);
      const walked = midRowSlopeStats(map, lens, clamped.scaleX);
      expect(walked.maxSlope).toBeLessThanOrEqual(lens.maxSlope + 1e-6);
    });

    it(`renders "${name}" strictly fold-free at maxSlope 0.95`, () => {
      const lens = normalizeLensParams({ ...partial, maxSlope: 0.95 });
      const map = generateDisplacementMap(lens);
      const clamped = clampLensScales(map, lens);
      expect(clamped.scaleX).toBeLessThan(lens.scaleX);

      // Ray-walk no-fold assertion: the sampled position stays monotonic.
      const walked = midRowSlopeStats(map, lens, clamped.scaleX);
      expect(walked.maxSlope).toBeLessThanOrEqual(0.95 + 1e-6);
      expect(walked.minForwardStep).toBeGreaterThan(0);
    });
  }

  it("honors a caller-raised maxSlope (escape hatch)", () => {
    const lens = normalizeLensParams({ scaleX: 40, scaleY: 40, maxSlope: 100 });
    const map = generateDisplacementMap(lens);
    const clamped = clampLensScales(map, lens);
    expect(clamped.scaleX).toBe(lens.scaleX);
    expect(clamped.scaleY).toBe(lens.scaleY);
  });

  it("accounts for the sink's strength multiplier", () => {
    const lens = normalizeLensParams({ scaleX: 40, scaleY: 40 });
    const map = generateDisplacementMap(lens);
    const full = clampLensScales(map, lens, { strength: 1 });
    const half = clampLensScales(map, lens, { strength: 0.5 });
    expect(half.scaleX).toBeCloseTo(Math.min(lens.scaleX, full.scaleX * 2), 6);
  });
});

describe("clampScalesForMap", () => {
  it("passes scales through untouched for a flat map", () => {
    const result = clampScalesForMap({
      texelSlope: { x: 0, y: 0 },
      mapWidth: 256,
      mapHeight: 256,
      spanWidth: 180,
      spanHeight: 120,
      scaleX: 512,
      scaleY: 512,
      chroma: 8,
      maxSlope: 0.95,
    });
    expect(result).toEqual({ scaleX: 512, scaleY: 512 });
  });

  it("scales the cap with the rendered span (stretched map)", () => {
    const base = {
      texelSlope: { x: 0.1, y: 0.1 },
      mapWidth: 256,
      mapHeight: 256,
      scaleX: 512,
      scaleY: 512,
      chroma: 0,
      maxSlope: 0.95,
    };
    const wide = clampScalesForMap({ ...base, spanWidth: 400, spanHeight: 400 });
    const narrow = clampScalesForMap({ ...base, spanWidth: 200, spanHeight: 200 });
    // Half the span ⇒ texels are half as far apart ⇒ half the allowed scale.
    expect(narrow.scaleX).toBeCloseTo(wide.scaleX / 2, 6);
  });

  it("clamps negative (demagnifying) scales by magnitude, preserving sign", () => {
    const base = {
      texelSlope: { x: 0.1, y: 0.1 },
      mapWidth: 256,
      mapHeight: 256,
      spanWidth: 256,
      spanHeight: 256,
      chroma: 0,
      maxSlope: 0.95,
    };
    const positive = clampScalesForMap({ ...base, scaleX: 512, scaleY: 512 });
    const negative = clampScalesForMap({ ...base, scaleX: -512, scaleY: -512 });
    expect(negative.scaleX).toBeCloseTo(-positive.scaleX, 10);
    expect(negative.scaleY).toBeCloseTo(-positive.scaleY, 10);
    // Under-cap negatives pass through untouched.
    const gentle = clampScalesForMap({ ...base, scaleX: -2, scaleY: -2 });
    expect(gentle).toEqual({ scaleX: -2, scaleY: -2 });
  });
});

describe("clampMergedScales", () => {
  it("memoizes and caps a low-depth merged blob", () => {
    const regionWidth = 200;
    const regionHeight = 200;
    const lens = normalizeLensParams({ depth: 4, scaleX: 40, scaleY: 40 });
    const map = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      blend: 30,
      lens,
      lenses: [
        { x: 80, y: 100, width: 90, height: 90, radius: 45 },
        { x: 130, y: 100, width: 90, height: 90, radius: 45 },
      ],
    });

    const slope = computeMergedMapTexelSlope(map);
    expect(computeMergedMapTexelSlope(map)).toBe(slope);
    expect(slope.x).toBeGreaterThan(0);

    const clamped = clampMergedScales(map, lens, regionWidth, regionHeight);
    const renderedX =
      slope.x * (map.width / regionWidth) * clamped.scaleX * chromaFactor(lens);
    expect(renderedX).toBeLessThanOrEqual(lens.maxSlope + 1e-6);
  });
});
