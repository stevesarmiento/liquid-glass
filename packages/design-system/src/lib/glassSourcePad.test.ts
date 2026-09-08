import { describe, expect, it } from "vitest";

import { glassSourcePad } from "./glassSourcePad";

describe("glassSourcePad", () => {
  it("is zero for magnifying (non-negative) scales — existing looks pay nothing", () => {
    expect(glassSourcePad({ scaleX: 38, scaleY: 38, chroma: 1.3 })).toBe(0);
    expect(glassSourcePad({ scaleX: 0, scaleY: 0 })).toBe(0);
    expect(glassSourcePad({})).toBe(0);
  });

  it("covers half the negative scale magnitude, chroma-boosted, plus the blur margin", () => {
    // |-180| / 2 * (1 + 0.2 * 0.75) = 103.5, + (3 * 0 + 4) -> 108
    expect(glassSourcePad({ scaleX: -180, scaleY: -180, chroma: 0.75 })).toBe(108);
    // Only one negative axis still pads: 19 + 4 = 23.
    expect(glassSourcePad({ scaleX: 38, scaleY: -38, chroma: 0 })).toBe(23);
    // Blur widens the margin by 3 sigma: 19 + (3 * 2 + 4) = 29.
    expect(glassSourcePad({ scaleX: -38, chroma: 0, blur: 2 })).toBe(29);
  });

  it("pads for lens overhang even with magnifying (positive) scales", () => {
    // The switch's active thumb is taller than its control: without padding
    // the overhanging strip samples beyond the source and renders as a
    // washed-out band at the top/bottom of the thumb.
    expect(glassSourcePad({ scaleX: -38, chroma: 0 }, 10)).toBe(33);
    // overhang 10 + blur margin (3 * 2 + 4) = 20.
    expect(glassSourcePad({ scaleX: 38, chroma: 0, blur: 2 }, 10)).toBe(20);
    // No overhang, no outward sampling: still free.
    expect(glassSourcePad({ scaleX: 38, chroma: 0, blur: 12 })).toBe(0);
  });
});
