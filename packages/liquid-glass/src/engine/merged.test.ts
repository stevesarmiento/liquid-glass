import { describe, expect, it } from "vitest";

import { createLiquidGlassEngine, getSharedLiquidGlassEngine } from "./create-engine";
import { normalizeLensParams } from "./defaults";
import {
  MERGED_ALPHA_DISTANCE_RANGE,
  generateMergedDisplacementMap,
  mergedMapKey,
  smoothMin,
} from "./merged";
import { generateDisplacementMap } from "./ts-engine";
import type { DisplacementMap, MergedMapInput } from "./types";

const OPTICS = {
  depth: 10,
  dome: 0,
  splay: 1,
  glow: 0.45,
  edge: 0.45,
  blur: 0,
  mapSize: 64,
};

function circle(x: number, y: number, r: number) {
  return { x, y, width: 2 * r, height: 2 * r, radius: r };
}

/** Reads the RGBA bytes of the map texel containing region point (x, y). */
function sampleAt(
  map: DisplacementMap,
  regionWidth: number,
  regionHeight: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const px = Math.min(map.width - 1, Math.floor((x / regionWidth) * map.width));
  const py = Math.min(map.height - 1, Math.floor((y / regionHeight) * map.height));
  const index = (py * map.width + px) * 4;
  return [
    map.rgba[index] ?? 0,
    map.rgba[index + 1] ?? 0,
    map.rgba[index + 2] ?? 0,
    map.rgba[index + 3] ?? 0,
  ];
}

/** Region-space center of the map texel containing region point (x, y). */
function texelCenter(
  map: DisplacementMap,
  regionWidth: number,
  regionHeight: number,
  x: number,
  y: number,
): [number, number] {
  const px = Math.min(map.width - 1, Math.floor((x / regionWidth) * map.width));
  const py = Math.min(map.height - 1, Math.floor((y / regionHeight) * map.height));
  return [((px + 0.5) * regionWidth) / map.width, ((py + 0.5) * regionHeight) / map.height];
}

/** Decodes a merged-map alpha byte back to signed distance in region px. */
function decodeAlpha(alphaByte: number): number {
  return (0.5 - alphaByte / 255) * (2 * MERGED_ALPHA_DISTANCE_RANGE);
}

describe("smoothMin", () => {
  it("is a hard min when k <= 0", () => {
    expect(smoothMin(3, -2, 0)).toBe(-2);
    expect(smoothMin(-5, 1, -1)).toBe(-5);
  });

  it("dips below both inputs when they are close", () => {
    expect(smoothMin(1, 1, 8)).toBeLessThan(1);
  });
});

describe("generateMergedDisplacementMap", () => {
  it("is deterministic (two calls byte-identical)", () => {
    const input: MergedMapInput = {
      regionWidth: 300,
      regionHeight: 200,
      lenses: [circle(90, 100, 40), circle(210, 100, 50)],
      blend: 24,
      lens: OPTICS,
    };
    const a = generateMergedDisplacementMap(input);
    const b = generateMergedDisplacementMap(input);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it("writes neutral RGB + alpha 0 far outside and alpha 255 deep inside", () => {
    const region = { regionWidth: 200, regionHeight: 200 };
    const map = generateMergedDisplacementMap({
      ...region,
      lenses: [circle(100, 100, 50)],
      blend: 0,
      lens: OPTICS,
    });

    // (6, 6) is ~84px outside the circle, beyond +MERGED_ALPHA_DISTANCE_RANGE.
    const outside = sampleAt(map, 200, 200, 6, 6);
    expect(outside[0]).toBe(128);
    expect(outside[1]).toBe(128);
    expect(outside[2]).toBe(128);
    expect(outside[3]).toBe(0);

    // The center is 50px deep, beyond -MERGED_ALPHA_DISTANCE_RANGE.
    const inside = sampleAt(map, 200, 200, 100, 100);
    expect(inside[3]).toBe(255);

    // Inside but shallower than the band: alpha already < 255.
    const shallow = sampleAt(map, 200, 200, 100 + 50 - 10, 100);
    expect(shallow[3]).toBeGreaterThan(127);
    expect(shallow[3]).toBeLessThan(255);

    // Outside but inside the band: alpha still > 0.
    const near = sampleAt(map, 200, 200, 100 + 50 + 10, 100);
    expect(near[3]).toBeGreaterThan(0);
    expect(near[3]).toBeLessThan(128);
    expect(near[0]).toBe(128);
    expect(near[1]).toBe(128);
    expect(near[2]).toBe(128);
  });

  it("encodes a monotonic signed-distance band across the edge along a ray", () => {
    const regionWidth = 200;
    const regionHeight = 200;
    const map = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(100, 100, 50)],
      blend: 0,
      lens: { ...OPTICS, mapSize: 128 },
    });

    // Walk the horizontal mid-row outward from the circle center: alpha must
    // be non-increasing the whole way (255 plateau inside, band, 0 plateau).
    const py = Math.min(map.height - 1, Math.floor((100 / regionHeight) * map.height));
    const startPx = Math.floor((100 / regionWidth) * map.width);
    let previous = map.rgba[(py * map.width + startPx) * 4 + 3] ?? 0;
    let bandSamples = 0;
    for (let px = startPx + 1; px < map.width; px += 1) {
      const alpha = map.rgba[(py * map.width + px) * 4 + 3] ?? 0;
      expect(alpha).toBeLessThanOrEqual(previous);
      if (alpha > 0 && alpha < 255) bandSamples += 1;
      previous = alpha;
    }
    expect(bandSamples).toBeGreaterThan(3);
    expect(previous).toBe(0);
  });

  it("round-trips distance through the alpha encoding near the edge", () => {
    const regionWidth = 200;
    const regionHeight = 200;
    const radius = 50;
    const map = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(100, 100, radius)],
      blend: 0,
      lens: { ...OPTICS, mapSize: 128 },
    });

    // Probe ~10px outside the circle edge along the +x axis. Compare the
    // decoded distance against the analytic SDF at the sampled texel center.
    const probeX = 100 + radius + 10;
    const probeY = 100;
    const [sx, sy] = texelCenter(map, regionWidth, regionHeight, probeX, probeY);
    const analytic = Math.sqrt((sx - 100) * (sx - 100) + (sy - 100) * (sy - 100)) - radius;
    expect(analytic).toBeGreaterThan(8);
    expect(analytic).toBeLessThan(12);

    const alpha = sampleAt(map, regionWidth, regionHeight, probeX, probeY)[3];
    expect(Math.abs(decodeAlpha(alpha) - analytic)).toBeLessThanOrEqual(1);
  });

  it("produces intermediate alpha on the edge band", () => {
    const map = generateMergedDisplacementMap({
      regionWidth: 200,
      regionHeight: 200,
      lenses: [circle(100.3, 100.7, 50)],
      blend: 0,
      lens: OPTICS,
    });
    let intermediate = 0;
    for (let i = 3; i < map.rgba.length; i += 4) {
      const alpha = map.rgba[i] ?? 0;
      if (alpha > 0 && alpha < 255) intermediate += 1;
    }
    expect(intermediate).toBeGreaterThan(0);
  });

  it("scales the short side of the map by the region aspect", () => {
    const wide = generateMergedDisplacementMap({
      regionWidth: 400,
      regionHeight: 200,
      lenses: [circle(100, 100, 40)],
      blend: 0,
      lens: OPTICS,
    });
    expect(wide.width).toBe(64);
    expect(wide.height).toBe(32);
    expect(wide.rgba.length).toBe(64 * 32 * 4);

    const tall = generateMergedDisplacementMap({
      regionWidth: 100,
      regionHeight: 300,
      lenses: [circle(50, 100, 30)],
      blend: 0,
      lens: OPTICS,
    });
    expect(tall.width).toBe(Math.max(8, Math.round((64 * 100) / 300)));
    expect(tall.height).toBe(64);
  });

  it("keeps two far-apart circles disjoint at blend 0", () => {
    const regionWidth = 400;
    const regionHeight = 160;
    const map = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(80, 80, 40), circle(320, 80, 40)],
      blend: 0,
      lens: { ...OPTICS, mapSize: 128 },
    });

    // The 40px radius only just reaches the ±40px alpha band, so the sampled
    // texel center (~1px off the true center) can land one alpha step shy of
    // full saturation.
    expect(sampleAt(map, regionWidth, regionHeight, 80, 80)[3]).toBeGreaterThanOrEqual(254);
    expect(sampleAt(map, regionWidth, regionHeight, 320, 80)[3]).toBeGreaterThanOrEqual(254);
    expect(sampleAt(map, regionWidth, regionHeight, 200, 80)[3]).toBe(0);
  });

  it("forms a liquid bridge when the gap is smaller than the blend", () => {
    const regionWidth = 400;
    const regionHeight = 160;
    // Centers 150 and 250, radius 40: edge gap = 20px. The polynomial
    // smooth-min dips the midpoint SDF by k/4, so blend 60 pulls the
    // midpoint (d = gap/2 = 10 per circle) inside: 10 - 60/4 = -5.
    const lenses = [circle(150, 80, 40), circle(250, 80, 40)];

    const hard = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses,
      blend: 0,
      lens: { ...OPTICS, mapSize: 128 },
    });
    // d = +10 at the midpoint: outside (alpha < 128) but within the band.
    expect(sampleAt(hard, regionWidth, regionHeight, 200, 80)[3]).toBeLessThan(128);

    const blended = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses,
      blend: 60,
      lens: { ...OPTICS, mapSize: 128 },
    });
    expect(sampleAt(blended, regionWidth, regionHeight, 200, 80)[3]).toBeGreaterThan(127);
  });

  it("keeps the bridge while approaching but does not bloat when overlapped", () => {
    // (a) Approaching: radius 50, edge gap 20 (gap >= 0 -> full blend). The
    // smooth-min dips the midpoint by ~k/4, bridging the gap.
    const approachWidth = 300;
    const approachHeight = 200;
    const approaching = generateMergedDisplacementMap({
      regionWidth: approachWidth,
      regionHeight: approachHeight,
      lenses: [circle(90, 100, 50), circle(210, 100, 50)],
      blend: 60,
      lens: { ...OPTICS, mapSize: 128 },
    });
    expect(sampleAt(approaching, approachWidth, approachHeight, 150, 100)[3]).toBeGreaterThan(127);

    // (b) Heavily overlapped: centers 30px apart (gap = -70 <= -erMin = -50,
    // attenuation 0 -> plain union). Probe just above the top of the upper
    // circle: the plain union leaves it outside, while the unattenuated
    // smooth-min would have bloated past it.
    const regionWidth = 200;
    const regionHeight = 200;
    const c0 = { x: 100, y: 85, r: 50 };
    const c1 = { x: 100, y: 115, r: 50 };
    const overlapped = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(c0.x, c0.y, c0.r), circle(c1.x, c1.y, c1.r)],
      blend: 60,
      lens: { ...OPTICS, mapSize: 128 },
    });

    const probeY = c0.y - c0.r - 1.5; // just outside the union's top extent
    const [sx, sy] = texelCenter(overlapped, regionWidth, regionHeight, c0.x, probeY);
    const d0 = Math.sqrt((sx - c0.x) * (sx - c0.x) + (sy - c0.y) * (sy - c0.y)) - c0.r;
    const d1 = Math.sqrt((sx - c1.x) * (sx - c1.x) + (sy - c1.y) * (sy - c1.y)) - c1.r;
    // Sanity: outside both circles, but the raw (unattenuated) smooth-min
    // would pull the point inside -- the bloat this change removes.
    expect(Math.min(d0, d1)).toBeGreaterThan(0);
    expect(smoothMin(d0, d1, 60)).toBeLessThan(0);

    const alpha = sampleAt(overlapped, regionWidth, regionHeight, c0.x, probeY)[3];
    expect(alpha).toBeLessThan(127);
    expect(decodeAlpha(alpha)).toBeGreaterThan(0);
  });

  it("treats fully concentric circles as a single circle (attenuation 0)", () => {
    const regionWidth = 200;
    const regionHeight = 200;
    const lens = { ...OPTICS, mapSize: 128 };
    const concentric = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(100, 100, 50), circle(100, 100, 50)],
      blend: 60,
      lens,
    });
    const single = generateMergedDisplacementMap({
      regionWidth,
      regionHeight,
      lenses: [circle(100, 100, 50)],
      blend: 60,
      lens,
    });
    expect(concentric.width).toBe(single.width);
    expect(concentric.height).toBe(single.height);
    expect(Array.from(concentric.rgba)).toEqual(Array.from(single.rgba));
  });

  it("matches the single-lens displacement sign convention for a lone circle", () => {
    const size = 120;
    // Larger depth keeps interior displacements well away from the neutral
    // 128 rounding boundary so sign comparisons are robust.
    const signOptics = { ...OPTICS, depth: 30, glow: 0, edge: 0 };
    const single = generateDisplacementMap(
      normalizeLensParams({ width: size, height: size, radius: size / 2, ...signOptics }),
    );
    const merged = generateMergedDisplacementMap({
      regionWidth: size,
      regionHeight: size,
      lenses: [circle(size / 2, size / 2, size / 2)],
      blend: 0,
      lens: signOptics,
    });
    expect(merged.width).toBe(single.width);
    expect(merged.height).toBe(single.height);

    const samples: Array<[number, number]> = [
      [size * 0.25, size * 0.5],
      [size * 0.75, size * 0.5],
      [size * 0.5, size * 0.25],
      [size * 0.5, size * 0.75],
      [size * 0.35, size * 0.35],
      [size * 0.65, size * 0.65],
    ];
    for (const [x, y] of samples) {
      const s = sampleAt(single, size, size, x, y);
      const m = sampleAt(merged, size, size, x, y);
      // Exact bytes differ (different magnitude model) but signs must agree.
      expect(Math.sign(m[0] - 128)).toBe(Math.sign(s[0] - 128));
      expect(Math.sign(m[1] - 128)).toBe(Math.sign(s[1] - 128));
    }

    // Rough monotonicity along the horizontal mid-row: the single-lens
    // convention encodes left-of-center as R > 128 and right as R < 128.
    const left = sampleAt(merged, size, size, size * 0.25, size * 0.5);
    const right = sampleAt(merged, size, size, size * 0.75, size * 0.5);
    expect(sampleAt(single, size, size, size * 0.25, size * 0.5)[0]).toBeGreaterThan(128);
    expect(left[0]).toBeGreaterThan(128);
    expect(right[0]).toBeLessThan(128);
  });
});

describe("mergedMapKey", () => {
  const base: MergedMapInput = {
    regionWidth: 300,
    regionHeight: 200,
    lenses: [circle(90, 100, 40), circle(210, 100, 50)],
    blend: 24,
    lens: OPTICS,
  };

  it("is stable under group translation", () => {
    const translated: MergedMapInput = {
      ...base,
      lenses: base.lenses.map((lens) => ({ ...lens, x: lens.x + 7, y: lens.y + 7 })),
    };
    expect(mergedMapKey(translated)).toBe(mergedMapKey(base));
  });

  it("changes when the relative offset changes by >= 1px", () => {
    const shifted: MergedMapInput = {
      ...base,
      lenses: [base.lenses[0]!, { ...base.lenses[1]!, x: base.lenses[1]!.x + 1 }],
    };
    expect(mergedMapKey(shifted)).not.toBe(mergedMapKey(base));
  });

  it("is stable under sub-pixel jitter", () => {
    const jittered: MergedMapInput = {
      ...base,
      lenses: [
        { ...base.lenses[0]!, x: base.lenses[0]!.x + 0.2, y: base.lenses[0]!.y - 0.1 },
        { ...base.lenses[1]!, x: base.lenses[1]!.x + 0.3, y: base.lenses[1]!.y - 0.2 },
      ],
    };
    expect(mergedMapKey(jittered)).toBe(mergedMapKey(base));
  });

  it("changes with blend, region size, and optical params", () => {
    expect(mergedMapKey({ ...base, blend: 25 })).not.toBe(mergedMapKey(base));
    expect(mergedMapKey({ ...base, regionWidth: 305 })).not.toBe(mergedMapKey(base));
    expect(mergedMapKey({ ...base, lens: { ...OPTICS, depth: 12 } })).not.toBe(mergedMapKey(base));
  });
});

describe("engine facade", () => {
  const input: MergedMapInput = {
    regionWidth: 200,
    regionHeight: 100,
    lenses: [circle(60, 50, 30), circle(140, 50, 30)],
    blend: 20,
    lens: OPTICS,
  };

  it("exposes generateMergedDisplacementMap on the auto facade", () => {
    const engine = createLiquidGlassEngine({ mode: "auto" });
    expect(typeof engine.generateMergedDisplacementMap).toBe("function");
    const map = engine.generateMergedDisplacementMap!(input);
    expect(map.width).toBe(64);
    expect(map.height).toBe(32);
  });

  it("exposes generateMergedDisplacementMap on the shared engine and matches the direct call", () => {
    const engine = getSharedLiquidGlassEngine();
    expect(typeof engine.generateMergedDisplacementMap).toBe("function");
    const viaEngine = engine.generateMergedDisplacementMap!(input);
    const direct = generateMergedDisplacementMap(input);
    expect(Array.from(viaEngine.rgba)).toEqual(Array.from(direct.rgba));
  });
});
