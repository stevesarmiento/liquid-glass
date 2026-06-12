import { beforeEach, describe, expect, it, vi } from "vitest";

import { autoMapSize } from "./defaults";
import {
  clearDisplacementMapCache,
  configureDisplacementMapCache,
  displacementMapCacheKey,
  getCachedDisplacementMap,
  getDisplacementMapCacheStats,
} from "./map-cache";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type { ActiveLiquidGlassEngineMode, LiquidGlassEngine } from "./types";

function makeCountingEngine(mode: ActiveLiquidGlassEngineMode = "ts"): {
  engine: LiquidGlassEngine;
  generateSpy: ReturnType<typeof vi.fn>;
  setMode: (next: ActiveLiquidGlassEngineMode) => void;
} {
  const inner = createTsLiquidGlassEngine();
  let activeMode = mode;
  const generateSpy = vi.fn((params) => inner.generateDisplacementMap(params));
  const engine: LiquidGlassEngine = {
    get mode() {
      return activeMode;
    },
    ready: Promise.resolve(),
    generateDisplacementMap: generateSpy as LiquidGlassEngine["generateDisplacementMap"],
    computeLensGeometry: inner.computeLensGeometry.bind(inner),
  };
  return { engine, generateSpy, setMode: (next) => (activeMode = next) };
}

describe("getCachedDisplacementMap", () => {
  beforeEach(() => {
    clearDisplacementMapCache();
  });

  it("returns the identical map instance for repeated identical lens params", () => {
    const { engine, generateSpy } = makeCountingEngine();
    const lens = { width: 64, height: 40, mapSize: 32 };

    const first = getCachedDisplacementMap(engine, lens);
    const second = getCachedDisplacementMap(engine, lens);

    expect(second).toBe(first);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    const stats = getDisplacementMapCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("misses when optical params change", () => {
    const { engine, generateSpy } = makeCountingEngine();
    getCachedDisplacementMap(engine, { width: 64, height: 40, mapSize: 32 });
    getCachedDisplacementMap(engine, { width: 64, height: 40, mapSize: 64 });
    getCachedDisplacementMap(engine, { width: 80, height: 40, mapSize: 32 });

    expect(generateSpy).toHaveBeenCalledTimes(3);
  });

  it("hits across different positional/identity-only variations of the same optics", () => {
    const { engine, generateSpy } = makeCountingEngine();
    // scaleX/scaleY/chroma/blur are excluded from mapKey — same map.
    getCachedDisplacementMap(engine, { width: 64, height: 40, mapSize: 32, scaleX: 10, blur: 2 });
    getCachedDisplacementMap(engine, { width: 64, height: 40, mapSize: 32, scaleX: 24, blur: 8 });

    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps caches independent per engine instance", () => {
    const a = makeCountingEngine();
    const b = makeCountingEngine();
    const lens = { width: 64, height: 40, mapSize: 32 };

    getCachedDisplacementMap(a.engine, lens);
    getCachedDisplacementMap(b.engine, lens);

    expect(a.generateSpy).toHaveBeenCalledTimes(1);
    expect(b.generateSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidates when the engine's live mode flips (ts -> wasm upgrade)", () => {
    const { engine, generateSpy, setMode } = makeCountingEngine("ts");
    const lens = { width: 64, height: 40, mapSize: 32 };

    getCachedDisplacementMap(engine, lens);
    setMode("wasm");
    getCachedDisplacementMap(engine, lens);

    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(displacementMapCacheKey(engine, lens).startsWith("wasm|")).toBe(true);
  });

  it("evicts least-recently-used entries when over the byte budget", () => {
    const { engine, generateSpy } = makeCountingEngine();
    // A 32×32 map is 32*32*4 = 4096 bytes. Budget for exactly two maps.
    configureDisplacementMapCache({ maxBytes: 8192 });

    const a = { width: 64, height: 40, mapSize: 32 };
    const b = { width: 70, height: 40, mapSize: 32 };
    const c = { width: 80, height: 40, mapSize: 32 };

    getCachedDisplacementMap(engine, a);
    getCachedDisplacementMap(engine, b);
    // Touch A so B becomes the LRU entry.
    getCachedDisplacementMap(engine, a);
    // Inserting C must evict B.
    getCachedDisplacementMap(engine, c);

    expect(getDisplacementMapCacheStats().evicted).toBe(1);
    generateSpy.mockClear();
    getCachedDisplacementMap(engine, a); // still cached
    getCachedDisplacementMap(engine, c); // still cached
    expect(generateSpy).toHaveBeenCalledTimes(0);
    getCachedDisplacementMap(engine, b); // evicted -> regenerates
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps a single over-budget entry rather than thrashing", () => {
    const { engine, generateSpy } = makeCountingEngine();
    configureDisplacementMapCache({ maxBytes: 16 });
    const lens = { width: 64, height: 40, mapSize: 32 };

    getCachedDisplacementMap(engine, lens);
    getCachedDisplacementMap(engine, lens);

    expect(generateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("autoMapSize", () => {
  it("rounds up to powers of two and clamps to [32, 512]", () => {
    expect(autoMapSize(36, 22, 2)).toBe(128); // 72 -> 128
    expect(autoMapSize(64, 34, 2)).toBe(128);
    expect(autoMapSize(10, 6, 1)).toBe(32); // clamp low
    expect(autoMapSize(2000, 900, 2)).toBe(512); // clamp high
    expect(autoMapSize(256, 100, 1)).toBe(256); // exact pow2 stays
  });

  it("treats sub-1 pixel ratios as 1", () => {
    expect(autoMapSize(100, 100, 0.5)).toBe(autoMapSize(100, 100, 1));
  });
});
