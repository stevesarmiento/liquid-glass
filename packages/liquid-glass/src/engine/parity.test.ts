// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeLensParams } from "./defaults";
import { compareMapBytes } from "./parity";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type { LensParams } from "./types";

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
