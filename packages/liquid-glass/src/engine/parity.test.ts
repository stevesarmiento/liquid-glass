// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeLensParams } from "./defaults";
import { generateMergedDisplacementMap } from "./merged";
import { compareMapBytes } from "./parity";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type { LensParams, MergedMapInput } from "./types";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../wasm");
const wasmBinary = resolve(wasmDir, "liquid_glass_core_bg.wasm");
const wasmGlue = resolve(wasmDir, "liquid_glass_core.js");
const wasmAvailable = existsSync(wasmBinary) && existsSync(wasmGlue);

const CASES: Array<[string, Partial<LensParams>]> = [
  ["defaults", {}],
  ["dome + specular", { width: 180, height: 64, radius: 32, dome: 75, glow: 0.8, edge: 0.9, mapSize: 129 }],
  ["tiny lens", { width: 3, height: 3, dome: 50 }],
  [
    "rotated specular + custom glow/edge",
    {
      width: 320,
      height: 200,
      radius: 24,
      splay: 0.4,
      depth: 14,
      glow: 1,
      edge: 1,
      specularRotation: 120,
      glowSpread: 0.4,
      edgeExponent: 2,
      mapSize: 64,
    },
  ],
  ["heavy blur + chroma, odd map", { width: 240, height: 240, radius: 120, blur: 40, chroma: 1.5, mapSize: 33 }],
];

const MERGED_OPTICS: Partial<LensParams> = {
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

const MERGED_CASES: Array<[string, MergedMapInput]> = [
  [
    "single circle",
    {
      regionWidth: 200,
      regionHeight: 200,
      lenses: [circle(100, 100, 50)],
      blend: 0,
      lens: MERGED_OPTICS,
    },
  ],
  [
    "two circles far apart, blend 0",
    {
      regionWidth: 400,
      regionHeight: 160,
      lenses: [circle(80, 80, 40), circle(320, 80, 40)],
      blend: 0,
      lens: { ...MERGED_OPTICS, mapSize: 128 },
    },
  ],
  [
    "two near circles, blend 60",
    {
      regionWidth: 400,
      regionHeight: 160,
      lenses: [circle(150, 80, 40), circle(250, 80, 40)],
      blend: 60,
      lens: { ...MERGED_OPTICS, mapSize: 128 },
    },
  ],
  [
    "two heavily overlapped circles, blend 60",
    {
      regionWidth: 200,
      regionHeight: 200,
      lenses: [circle(100, 85, 50), circle(100, 115, 50)],
      blend: 60,
      lens: { ...MERGED_OPTICS, mapSize: 128 },
    },
  ],
  [
    "non-square region, dome + specular",
    {
      regionWidth: 100,
      regionHeight: 300,
      lenses: [circle(50, 90, 30), circle(50, 210, 35)],
      blend: 24,
      lens: { ...MERGED_OPTICS, dome: 60, depth: 14, specularRotation: 120, mapSize: 96 },
    },
  ],
];

describe.skipIf(!wasmAvailable)("WASM <-> TS engine parity", () => {
  it("matches the TS engine within ±1 LSB on every channel", async () => {
    const glue = await import(/* @vite-ignore */ wasmGlue);
    await glue.default({ module_or_path: readFileSync(wasmBinary) });

    const ts = createTsLiquidGlassEngine();
    for (const [label, lens] of CASES) {
      const params = normalizeLensParams(lens);
      const expected = ts.generateDisplacementMap(params).rgba;
      const actual = new Uint8Array(glue.generateDisplacementMap(params));
      const result = compareMapBytes(expected, actual);
      expect(result.equal, `${label}: maxDelta=${result.maxDelta} mismatches=${result.mismatchCount}`).toBe(true);
    }
  });

  it("matches the TS merged (metaball) generator within ±1 LSB on every channel", async () => {
    const glue = await import(/* @vite-ignore */ wasmGlue);
    await glue.default({ module_or_path: readFileSync(wasmBinary) });

    for (const [label, input] of MERGED_CASES) {
      const expected = generateMergedDisplacementMap(input).rgba;
      const actual = new Uint8Array(glue.generateMergedDisplacementMap(input));
      const result = compareMapBytes(expected, actual);
      expect(result.equal, `${label}: maxDelta=${result.maxDelta} mismatches=${result.mismatchCount}`).toBe(true);
    }
  });

  it("normalizes geometry input at the wasm boundary (NaN-safe)", async () => {
    const glue = await import(/* @vite-ignore */ wasmGlue);
    await glue.default({ module_or_path: readFileSync(wasmBinary) });

    const geometry = glue.computeLensGeometry({
      containerWidth: 800,
      containerHeight: 600,
      x: 0.5,
      y: 0.5,
      unit: "normalized",
      mode: "target",
      lens: { width: Number.NaN, height: -5 },
    }) as Record<string, number>;

    for (const [key, value] of Object.entries(geometry)) {
      expect(Number.isFinite(value), `${key} should be finite, got ${value}`).toBe(true);
    }
  });
});

if (!wasmAvailable) {
  describe("WASM <-> TS engine parity", () => {
    it.skip("skipped: wasm artifact not built (run `bun run build:wasm`)", () => {});
  });
}
