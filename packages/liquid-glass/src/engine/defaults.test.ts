import { describe, expect, it } from "vitest";

import { DEFAULT_LENS_PARAMS, normalizeLensParams, quantizeLensSizeUp } from "./defaults";
import type { ResolvedLensParams } from "./types";

describe("normalizeLensParams", () => {
  it("returns the defaults exactly for empty input", () => {
    expect(normalizeLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    expect(normalizeLensParams({})).toEqual(DEFAULT_LENS_PARAMS);
  });

  // Static [min, max] per field; radius/depth are additionally capped at
  // min(width, height) / 2, exercised separately below.
  const STATIC_RANGES: Array<[keyof ResolvedLensParams, number, number]> = [
    ["width", 1, 4096],
    ["height", 1, 4096],
    ["scaleX", 0, 512],
    ["scaleY", 0, 512],
    ["chroma", 0, 8],
    ["dome", 0, 4096],
    ["splay", 0.001, 1],
    ["glow", 0, 4],
    ["edge", 0, 4],
    ["glowSpread", 0.05, 2],
    ["glowExponent", 0.1, 8],
    ["edgeExponent", 0.1, 8],
    ["specularRotation", -360, 360],
    ["maxSlope", 0.05, 100],
    ["blur", 0, 128],
    ["mapSize", 8, 2048],
  ];

  it.each(STATIC_RANGES)("clamps %s to [%d, %d]", (key, min, max) => {
    // A big lens so the half-min-side cap never interferes.
    const base = { width: 4096, height: 4096 };
    expect(normalizeLensParams({ ...base, [key]: -1e9 })[key]).toBe(min);
    expect(normalizeLensParams({ ...base, [key]: 1e9 })[key]).toBe(max);
    const inRange = (min + max) / 2;
    expect(normalizeLensParams({ ...base, [key]: inRange })[key]).toBeCloseTo(
      key === "mapSize" ? Math.round(inRange) : inRange,
      10,
    );
  });

  it("caps radius and depth at min(width, height) / 2", () => {
    const out = normalizeLensParams({ width: 200, height: 80, radius: 500, depth: 500 });
    expect(out.radius).toBe(40);
    expect(out.depth).toBe(40);
    const under = normalizeLensParams({ width: 200, height: 80, radius: 12, depth: 9 });
    expect(under.radius).toBe(12);
    expect(under.depth).toBe(9);
  });

  it("rounds mapSize before clamping", () => {
    expect(normalizeLensParams({ mapSize: 191.6 }).mapSize).toBe(192);
    expect(normalizeLensParams({ mapSize: 5.4 }).mapSize).toBe(8);
  });

  it("falls back to the default for non-finite input", () => {
    for (const key of Object.keys(DEFAULT_LENS_PARAMS) as Array<keyof ResolvedLensParams>) {
      expect(normalizeLensParams({ [key]: Number.NaN })[key]).toBe(DEFAULT_LENS_PARAMS[key]);
      expect(normalizeLensParams({ [key]: Number.POSITIVE_INFINITY })[key]).toBe(
        key === "width" || key === "height"
          ? 4096
          : normalizeLensParams({ [key]: Number.POSITIVE_INFINITY })[key],
      );
    }
  });
});

describe("quantizeLensSizeUp", () => {
  it("never returns less than the input", () => {
    for (let v = 1; v <= 600; v += 7) {
      expect(quantizeLensSizeUp(v)).toBeGreaterThanOrEqual(v);
    }
  });

  it("is idempotent on grid points", () => {
    for (let v = 1; v <= 600; v += 3) {
      const q = quantizeLensSizeUp(v);
      expect(quantizeLensSizeUp(q)).toBe(q);
    }
  });

  it("is monotonic", () => {
    let previous = 0;
    for (let v = 1; v <= 600; v += 1) {
      const q = quantizeLensSizeUp(v);
      expect(q).toBeGreaterThanOrEqual(previous);
      previous = q;
    }
  });

  it("keeps an island-morph sweep to a handful of buckets", () => {
    const buckets = new Set<number>();
    for (let v = 168; v <= 460; v += 1) buckets.add(quantizeLensSizeUp(v));
    expect(buckets.size).toBeLessThanOrEqual(7);
  });

  it("respects a custom grid density", () => {
    // 1 step per octave = plain ceil to powers of two.
    expect(quantizeLensSizeUp(100, 1)).toBe(128);
    expect(quantizeLensSizeUp(128, 1)).toBe(128);
  });
});
