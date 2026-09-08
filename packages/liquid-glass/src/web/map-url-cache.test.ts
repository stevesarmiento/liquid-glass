import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDisplacementMapCache } from "../engine/map-cache";
import { createTsLiquidGlassEngine } from "../engine/ts-engine";
import {
  clearMapUrlCache,
  configureMapUrlCache,
  getCachedDisplacementMapPngUrl,
  getMapUrlCacheStats,
} from "./map-url-cache";

describe("map URL cache", () => {
  const engine = createTsLiquidGlassEngine();

  beforeEach(() => {
    clearMapUrlCache();
    clearDisplacementMapCache();
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      `data:image/png;base64,${"x".repeat(100)}`,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ImageData",
      class ImageDataMock {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number,
        ) {}
      },
    );
  });

  afterEach(() => {
    clearMapUrlCache();
    clearDisplacementMapCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const lensOfWidth = (width: number) => ({ width, height: 20, radius: 4, mapSize: 16 });

  it("serves repeat lookups from the cache", () => {
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    const stats = getMapUrlCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.evicted).toBe(0);
  });

  it("evicts least-recently-used entries over the byte budget", () => {
    // Each mocked URL is 122 chars; budget fits two entries, not three.
    configureMapUrlCache({ maxBytes: 260 });
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(31));
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(32));
    expect(getMapUrlCacheStats().evicted).toBe(1);

    // width 30 was evicted; widths 31/32 still hit.
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(31));
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(32));
    expect(getMapUrlCacheStats().hits).toBe(2);
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    expect(getMapUrlCacheStats().misses).toBe(4);
  });

  it("keeps a single entry that exceeds the whole budget", () => {
    configureMapUrlCache({ maxBytes: 10 });
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    getCachedDisplacementMapPngUrl(engine, lensOfWidth(30));
    const stats = getMapUrlCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.evicted).toBe(0);
  });
});
