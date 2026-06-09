import { describe, expect, it } from "vitest";

import { normalizeLensParams } from "./defaults";
import {
  colorMatrixForScale,
  computeLensGeometry,
  generateDisplacementMap,
  targetBleed,
} from "./ts-engine";

describe("TypeScript engine", () => {
  it("generates deterministic displacement maps", () => {
    const params = normalizeLensParams({ mapSize: 32 });
    const first = generateDisplacementMap(params);
    const second = generateDisplacementMap(params);

    expect(first.rgba).toEqual(second.rgba);
    expect(first.rgba).toHaveLength(32 * 32 * 4);
  });

  it("keeps outside pixels neutral", () => {
    const map = generateDisplacementMap(
      normalizeLensParams({
        width: 100,
        height: 100,
        radius: 20,
        mapSize: 32,
      }),
    );

    expect(Array.from(map.rgba.slice(0, 4))).toEqual([128, 128, 128, 255]);
  });

  it("matches the prototype target bleed formula", () => {
    expect(
      targetBleed(
        normalizeLensParams({
          scaleX: 20,
          scaleY: 10,
          chroma: 0.5,
          blur: 2.1,
        }),
      ),
    ).toBe(29);
  });

  it("builds the expected color matrix", () => {
    expect(colorMatrixForScale(10, 20)).toEqual([
      0.5, 0, 0, 0, 0.25, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });

  it("computes normalized and pixel geometry", () => {
    const lens = normalizeLensParams({ width: 100, height: 50, radius: 40 });
    const normalized = computeLensGeometry({
      containerWidth: 400,
      containerHeight: 200,
      x: 0.5,
      y: 0.5,
      unit: "normalized",
      mode: "source",
      lens,
    });
    const px = computeLensGeometry({
      containerWidth: 400,
      containerHeight: 200,
      x: 200,
      y: 100,
      unit: "px",
      mode: "source",
      lens,
    });

    expect(normalized).toEqual(px);
    expect(normalized.left).toBe(150);
    expect(normalized.top).toBe(75);
  });
});
