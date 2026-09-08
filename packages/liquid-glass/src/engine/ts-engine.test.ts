import { describe, expect, it } from "vitest";

import { clamp, normalizeLensParams } from "./defaults";
import {
  colorMatrixForScale,
  computeDomeConstants,
  computeLensGeometry,
  domeGradient,
  erfApprox,
  generateDisplacementMap,
  roundedRectSdf,
  targetBleed,
} from "./ts-engine";
import type { DisplacementMap, LensParams } from "./types";

/**
 * Brute-force reference: evaluates every pixel independently from its own
 * coordinates, with no symmetry shortcuts. Must match the fast path
 * byte-for-byte.
 */
function referenceDisplacementMap(paramsInput: Partial<LensParams>): DisplacementMap {
  const params = normalizeLensParams(paramsInput);
  const size = params.mapSize;
  const halfW = params.width / 2;
  const halfH = params.height / 2;
  const radius = Math.min(params.radius, halfW, halfH);
  const depth = Math.max(0, params.depth);
  const innerHalfW = Math.max(0, halfW - depth);
  const innerHalfH = Math.max(0, halfH - depth);
  const innerRadius = Math.max(0, Math.min(radius, innerHalfW, innerHalfH));
  const invSigma = depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6;
  const dome = params.dome > 0 ? computeDomeConstants(params.dome, halfW, halfH) : null;
  const splay = Math.max(0.001, params.splay);
  const splayActive = splay < 0.999;
  const edgeRange = 3;
  const glowThreshold = (1 - params.glowSpread) * Math.SQRT2;
  const glowRange = params.glowSpread * Math.SQRT2;
  const specRotation = (params.specularRotation * Math.PI) / 180;
  const specX = Math.cos(specRotation);
  const specY = Math.sin(specRotation);
  const minHalf = Math.max(1, Math.min(halfW, halfH));
  const rgba = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    const y = ((py + 0.5) / size) * (2 * halfH) - halfH;
    for (let px = 0; px < size; px += 1) {
      const x = ((px + 0.5) / size) * (2 * halfW) - halfW;
      const index = (py * size + px) * 4;
      const outer = roundedRectSdf(x, y, halfW, halfH, radius);

      if (outer >= 0) {
        rgba[index] = 128;
        rgba[index + 1] = 128;
        rgba[index + 2] = 128;
        rgba[index + 3] = 255;
        continue;
      }

      let gx: number;
      let gy: number;
      if (dome) {
        gx = Math.sign(x) * domeGradient(Math.abs(x), dome.rx, dome.scaleX);
        gy = Math.sign(y) * domeGradient(Math.abs(y), dome.ry, dome.scaleY);
      } else {
        gx = clamp(x / halfW, -1, 1);
        gy = clamp(y / halfH, -1, 1);
      }

      if (splayActive) {
        const edgeX = Math.max(0, 1 - (halfW - Math.abs(x)) / minHalf) * (1 - splay);
        const edgeY = Math.max(0, 1 - (halfH - Math.abs(y)) / minHalf) * (1 - splay);
        const originalLength = Math.hypot(gx, gy);
        gx *= 1 - edgeY;
        gy *= 1 - edgeX;
        const nextLength = Math.hypot(gx, gy);
        if (nextLength > 0.001) {
          gx *= originalLength / nextLength;
          gy *= originalLength / nextLength;
        }
      }

      const inner = roundedRectSdf(x, y, innerHalfW, innerHalfH, innerRadius);
      const falloff = 0.5 * (1 + erfApprox(inner * invSigma));
      const r = Math.round((0.5 - 0.5 * gx * falloff) * 255);
      const g = Math.round((0.5 - 0.5 * gy * falloff) * 255);
      const baseNx = clamp(x / halfW, -1, 1);
      const baseNy = clamp(y / halfH, -1, 1);
      const highlightAxis = Math.abs(baseNx * specX + baseNy * specY);
      let spec = 0;

      if (params.glow > 0) {
        const t = clamp((highlightAxis - glowThreshold) / glowRange, 0, 1);
        spec += params.glow * Math.pow(t, params.glowExponent) * falloff;
      }
      if (params.edge > 0) {
        const edgeMask = outer < 0 ? Math.max(0, 1 + outer / edgeRange) : 0;
        spec += params.edge * edgeMask * Math.pow(highlightAxis, params.edgeExponent);
      }

      rgba[index] = clamp(Math.round(r), 0, 255);
      rgba[index + 1] = clamp(Math.round(g), 0, 255);
      rgba[index + 2] = Math.round(128 + 127 * Math.min(1, spec));
      rgba[index + 3] = 255;
    }
  }

  return { width: size, height: size, rgba };
}

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

  it("covers three sigma of blur in the target bleed", () => {
    // 20 * 1.1 + 2.1 * 3 + 4 = 32.3 -> 33
    expect(
      targetBleed(
        normalizeLensParams({
          scaleX: 20,
          scaleY: 10,
          chroma: 0.5,
          blur: 2.1,
        }),
      ),
    ).toBe(33);
  });

  it("quantizes the SVG filter region so scale drags do not resize it per tick", () => {
    const geometryAt = (scaleX: number) =>
      computeLensGeometry({
        containerWidth: 2000,
        containerHeight: 2000,
        x: 0.5,
        y: 0.5,
        unit: "normalized",
        mode: "target",
        lens: normalizeLensParams({ width: 220, height: 220, scaleX, scaleY: 123, chroma: 0.75, blur: 1.3 }),
      });
    // The whole 84.5 -> 13.5 drag from the reported black-glass incident
    // stays inside one 64px bleed bucket: identical region every tick.
    const a = geometryAt(84.5);
    const b = geometryAt(13.5);
    expect([a.filterX, a.filterY, a.filterWidth, a.filterHeight]).toEqual([
      b.filterX,
      b.filterY,
      b.filterWidth,
      b.filterHeight,
    ]);
  });

  it("uses scale magnitude so demagnifying lenses get the same bleed", () => {
    // A negative scale samples OUTWARD past the lens edge; too little bleed
    // shrinks the SVG filter region and the outward samples render
    // transparent (backdrop shows through at the rim).
    const positive = normalizeLensParams({ scaleX: 180, scaleY: 180, chroma: 0.75, blur: 1.3 });
    const negative = normalizeLensParams({ scaleX: -180, scaleY: -180, chroma: 0.75, blur: 1.3 });
    expect(targetBleed(negative)).toBe(targetBleed(positive));
    expect(targetBleed(negative)).toBeGreaterThan(0);
  });

  it("matches the brute-force reference with glow and edge enabled", () => {
    const lens: Partial<LensParams> = { glow: 1, edge: 1, mapSize: 64 };
    const fast = generateDisplacementMap(normalizeLensParams(lens));
    const reference = referenceDisplacementMap(lens);

    expect(fast.rgba).toEqual(reference.rgba);
  });

  it("matches the brute-force reference without dome and with odd map size", () => {
    const lens: Partial<LensParams> = { dome: 0, glow: 1.2, edge: 0.8, mapSize: 33 };
    const fast = generateDisplacementMap(normalizeLensParams(lens));
    const reference = referenceDisplacementMap(lens);

    expect(fast.rgba).toEqual(reference.rgba);
  });

  it("does not mirror the specular highlight onto both diagonals", () => {
    const size = 64;
    const map = generateDisplacementMap(
      normalizeLensParams({
        width: 100,
        height: 100,
        radius: 10,
        glow: 1.5,
        edge: 1.5,
        mapSize: size,
      }),
    );

    let differs = false;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size / 2; x += 1) {
        const b = map.rgba[(y * size + x) * 4 + 2];
        const mirrored = map.rgba[(y * size + (size - 1 - x)) * 4 + 2];
        if (b !== mirrored) differs = true;
      }
    }
    expect(differs).toBe(true);
  });

  it("keeps tiny domed lenses finite", () => {
    for (const dimension of [1, 2, 3]) {
      const constants = computeDomeConstants(50, dimension / 2, dimension / 2);
      expect(Number.isFinite(constants.rx)).toBe(true);
      expect(constants.rx).toBeGreaterThan(0);
      expect(Number.isFinite(constants.scaleX)).toBe(true);
      expect(constants.scaleX).toBeGreaterThan(0);

      const map = generateDisplacementMap(
        normalizeLensParams({
          width: dimension,
          height: dimension,
          radius: dimension / 2,
          depth: dimension / 2,
          dome: 50,
          mapSize: 8,
        }),
      );
      expect(map.rgba).toHaveLength(8 * 8 * 4);
      // A NaN-poisoned map collapses pixels to 0 in a Uint8ClampedArray.
      for (let i = 0; i < map.rgba.length; i += 4) {
        expect(map.rgba[i] === 0 && map.rgba[i + 1] === 0 && map.rgba[i + 2] === 0).toBe(false);
      }
    }
  });

  it("clamps the new specular params during normalization", () => {
    const params = normalizeLensParams({
      glowSpread: 99,
      glowExponent: 0,
      edgeExponent: 100,
      specularRotation: -1000,
    });

    expect(params.glowSpread).toBe(2);
    expect(params.glowExponent).toBe(0.1);
    expect(params.edgeExponent).toBe(8);
    expect(params.specularRotation).toBe(-360);

    const defaults = normalizeLensParams({
      glowSpread: Number.NaN,
      glowExponent: Number.NaN,
      edgeExponent: Number.NaN,
      specularRotation: Number.NaN,
    });
    expect(defaults.glowSpread).toBe(0.62);
    expect(defaults.glowExponent).toBe(1.5);
    expect(defaults.edgeExponent).toBe(1.2);
    expect(defaults.specularRotation).toBe(45);
  });

  it("builds the expected color matrix", () => {
    expect(colorMatrixForScale(10, 20)).toEqual([
      0.5, 0, 0, 0, 0.25, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });

  it("encodes negative (demagnifying) scale as a sign-inverted ratio", () => {
    // Base is |scale|; the negative axis mirrors its channel around 0.5, so
    // feDisplacementMap's positive scale samples in the opposite direction.
    const matrix = colorMatrixForScale(-20, 10);
    expect(matrix[0]).toBe(-1); // rx
    expect(matrix[4]).toBe(1); // 0.5 * (1 - rx): value 0.5 still maps to 0.5
    expect(matrix[6]).toBe(0.5); // ry
    // Fully negative on both axes keeps a positive base (no dead ratios).
    const both = colorMatrixForScale(-20, -10);
    expect(both[0]).toBe(-1);
    expect(both[6]).toBe(-0.5);
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
