import { describe, expect, it } from "vitest";

import { DEFAULT_LENS_PARAMS, normalizeLensParams } from "./defaults";
import { DEFAULT_LENS_PROFILE, deriveLensParams, type LensSizeProfile } from "./derive";

const PROFILE: LensSizeProfile = {
  anchorMinSide: 22,
  radius: 0.5,
  scaleX: { ratio: 0.34, curve: 2 },
  scaleY: 0.09,
  depth: 0.34,
  dome: 0,
  blur: { ratio: 0.09, curve: -1 },
  chroma: 0.6,
  splay: 0.1,
  glow: 1,
  edge: 1,
};

describe("deriveLensParams", () => {
  it("reproduces ratio * anchor exactly at the anchor size, regardless of curve", () => {
    const out = deriveLensParams(36, 22, PROFILE);
    expect(out.scaleX).toBeCloseTo(0.34 * 22, 10);
    expect(out.scaleY).toBeCloseTo(0.09 * 22, 10);
    expect(out.depth).toBeCloseTo(0.34 * 22, 10);
    expect(out.blur).toBeCloseTo(0.09 * 22, 10);
  });

  it("curve 0 is strictly proportional", () => {
    const at22 = deriveLensParams(36, 22, PROFILE);
    const at44 = deriveLensParams(72, 44, PROFILE);
    expect(at44.scaleY).toBeCloseTo(at22.scaleY * 2, 10);
    expect(at44.depth).toBeCloseTo(at22.depth * 2, 10);
    expect(at44.radius).toBeCloseTo(at22.radius * 2, 10);
  });

  it("curve -1 is constant px across sizes", () => {
    const at22 = deriveLensParams(36, 22, PROFILE);
    const at44 = deriveLensParams(72, 44, PROFILE);
    const at11 = deriveLensParams(18, 11, PROFILE);
    expect(at44.blur).toBeCloseTo(at22.blur, 10);
    expect(at11.blur).toBeCloseTo(at22.blur, 10);
  });

  it("curve > 0 grows faster than proportional, and stays monotonic", () => {
    const at22 = deriveLensParams(36, 22, PROFILE);
    const at44 = deriveLensParams(72, 44, PROFILE);
    expect(at44.scaleX).toBeCloseTo(at22.scaleX * 2 ** 3, 10); // ratio*2 * curve 2 → ×8
    let previous = 0;
    for (let side = 10; side <= 400; side += 10) {
      const value = deriveLensParams(side * 2, side, PROFILE).scaleX;
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("uses min(width, height) as the driving side", () => {
    expect(deriveLensParams(200, 22, PROFILE).depth).toBeCloseTo(
      deriveLensParams(36, 22, PROFILE).depth,
      10,
    );
  });

  it("carries dimensionless optics verbatim and fills the rest from defaults", () => {
    const out = deriveLensParams(36, 22, PROFILE);
    expect(out.chroma).toBe(0.6);
    expect(out.splay).toBe(0.1);
    expect(out.glowSpread).toBe(DEFAULT_LENS_PARAMS.glowSpread);
    expect(out.maxSlope).toBe(DEFAULT_LENS_PARAMS.maxSlope);
    expect(out.mapSize).toBeUndefined();
  });

  it("DEFAULT_LENS_PROFILE reproduces DEFAULT_LENS_PARAMS at the reference size", () => {
    const derived = deriveLensParams(180, 120, DEFAULT_LENS_PROFILE);
    const { mapSize: _mapSize, ...defaultsWithoutMapSize } = DEFAULT_LENS_PARAMS;
    const { mapSize: _derivedMapSize, ...derivedRest } = derived;
    for (const [key, expected] of Object.entries(defaultsWithoutMapSize)) {
      expect(derivedRest[key as keyof typeof derivedRest], key).toBeCloseTo(expected, 10);
    }
  });

  it("survives normalizeLensParams unclamped across component sizes", () => {
    for (let minSide = 18; minSide <= 400; minSide += 2) {
      const derived = deriveLensParams(minSide * 1.5, minSide, DEFAULT_LENS_PROFILE);
      const normalized = normalizeLensParams(derived);
      for (const key of Object.keys(derived) as Array<keyof typeof derived>) {
        if (key === "mapSize") continue;
        expect(normalized[key], `${key} at minSide ${minSide}`).toBeCloseTo(
          derived[key] as number,
          8,
        );
      }
    }
  });
});
