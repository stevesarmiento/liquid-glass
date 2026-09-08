import { getDisplacementMapCacheStats } from "../engine/map-cache";
import { getMapUrlCacheStats } from "./map-url-cache";
import { getGlassQualityLevel, noteGlassWork } from "./quality";

/**
 * Lightweight global performance counters for the glass pipeline. All
 * counters are monotonic totals — consumers (e.g. the playground PerfOverlay)
 * sample snapshots and diff them over time to derive rates. Counting is a few
 * integer increments, cheap enough to leave on in production.
 *
 * Also exposed on `globalThis.__LIQUID_GLASS_PERF__` for ad-hoc inspection:
 * `__LIQUID_GLASS_PERF__.snapshot()` in the console.
 */

export type GlassDrawBackend = "svg" | "canvas" | "webgl";

const counters = {
  drawsSvg: 0,
  drawsCanvas: 0,
  drawsWebgl: 0,
  blurCacheHits: 0,
  blurCacheMisses: 0,
  mapsGeneratedOutsideCache: 0,
  mapTransientHolds: 0,
  mapSettleRebuilds: 0,
  webglContextsCreated: 0,
  webglContextsDestroyed: 0,
};

export function countGlassDraw(backend: GlassDrawBackend, count = 1): void {
  if (backend === "svg") counters.drawsSvg += count;
  else if (backend === "canvas") counters.drawsCanvas += count;
  else counters.drawsWebgl += count;
  // Every draw feeds the adaptive quality governor's frame sampler.
  noteGlassWork();
}

export function countBlurCache(hit: boolean): void {
  if (hit) counters.blurCacheHits += 1;
  else counters.blurCacheMisses += 1;
}

/** Map generations that bypass the global cache (merged maps, raw engine use). */
export function countMapGeneratedOutsideCache(): void {
  counters.mapsGeneratedOutsideCache += 1;
}

/** Renders served with a transiently quantized map lens (resize bursts). */
export function countMapTransientHold(): void {
  counters.mapTransientHolds += 1;
}

/** Settle-timer regenerations back to the exact lens size after a burst. */
export function countMapSettleRebuild(): void {
  counters.mapSettleRebuilds += 1;
}

export function glassWebglContextCreated(): void {
  counters.webglContextsCreated += 1;
}

export function glassWebglContextDestroyed(): void {
  counters.webglContextsDestroyed += 1;
}

export interface GlassPerfSnapshot {
  draws: { svg: number; canvas: number; webgl: number };
  maps: {
    /** Maps generated via the global cache (cache misses). */
    generated: number;
    cacheHits: number;
    cacheMisses: number;
    /** Generations that bypassed the cache (merged maps, raw engine calls). */
    generatedOutsideCache: number;
    urlCacheHits: number;
    urlCacheMisses: number;
    /** Renders served with a transiently quantized map lens (resize bursts). */
    transientHolds: number;
    /** Settle regenerations back to the exact lens size after a burst. */
    settleRebuilds: number;
  };
  blur: { cacheHits: number; cacheMisses: number };
  webglContexts: { created: number; destroyed: number; active: number };
  /** Current adaptive quality level (0 full … 3 surface-only). */
  qualityLevel: number;
}

export function getGlassPerfSnapshot(): GlassPerfSnapshot {
  const mapStats = getDisplacementMapCacheStats();
  const urlStats = getMapUrlCacheStats();
  return {
    draws: {
      svg: counters.drawsSvg,
      canvas: counters.drawsCanvas,
      webgl: counters.drawsWebgl,
    },
    maps: {
      generated: mapStats.generated,
      cacheHits: mapStats.hits,
      cacheMisses: mapStats.misses,
      generatedOutsideCache: counters.mapsGeneratedOutsideCache,
      urlCacheHits: urlStats.hits,
      urlCacheMisses: urlStats.misses,
      transientHolds: counters.mapTransientHolds,
      settleRebuilds: counters.mapSettleRebuilds,
    },
    blur: { cacheHits: counters.blurCacheHits, cacheMisses: counters.blurCacheMisses },
    webglContexts: {
      created: counters.webglContextsCreated,
      destroyed: counters.webglContextsDestroyed,
      active: counters.webglContextsCreated - counters.webglContextsDestroyed,
    },
    qualityLevel: getGlassQualityLevel(),
  };
}

/** Resets the draw/blur/context counters (map cache stats reset separately). */
export function resetGlassPerfCounters(): void {
  counters.drawsSvg = 0;
  counters.drawsCanvas = 0;
  counters.drawsWebgl = 0;
  counters.blurCacheHits = 0;
  counters.blurCacheMisses = 0;
  counters.mapsGeneratedOutsideCache = 0;
  counters.mapTransientHolds = 0;
  counters.mapSettleRebuilds = 0;
  // Context counters are a live gauge; resetting them would corrupt `active`.
}

declare global {
  // eslint-disable-next-line no-var
  var __LIQUID_GLASS_PERF__:
    | {
        snapshot: typeof getGlassPerfSnapshot;
        reset: typeof resetGlassPerfCounters;
      }
    | undefined;
}

if (typeof globalThis !== "undefined") {
  globalThis.__LIQUID_GLASS_PERF__ = {
    snapshot: getGlassPerfSnapshot,
    reset: resetGlassPerfCounters,
  };
}
