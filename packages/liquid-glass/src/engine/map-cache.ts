import { normalizeLensParams } from "./defaults";
import { mapKey } from "./ts-engine";
import type { DisplacementMap, LensParams, LiquidGlassEngine } from "./types";

/**
 * Global displacement-map cache.
 *
 * Displacement maps are pure functions of the optical lens params (see
 * `mapKey`), yet historically every GlassNode regenerated its own map per
 * draw — N identical switches paid N × O(mapSize²) map generations, and a
 * press tween paid one per frame. This module memoizes maps across ALL
 * consumers, keyed by `mapKey` and the engine's active mode.
 *
 * Cached maps are SHARED and MUST be treated as immutable (see the note on
 * `DisplacementMap`). Sharing identities also lets GPU consumers skip
 * re-uploading the map texture when the same map is drawn again.
 *
 * Storage is a WeakMap keyed by engine instance so custom/test engines never
 * collide with the shared one and drop their cache when collected. The inner
 * Map's insertion order doubles as the LRU order. The key includes the live
 * `engine.mode` so the auto engine's ts→wasm upgrade naturally invalidates
 * stale TS-generated entries (they age out via the byte budget).
 */

interface MapCacheEntry {
  map: DisplacementMap;
  bytes: number;
}

interface EngineMapCache {
  entries: Map<string, MapCacheEntry>;
  bytes: number;
}

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

let maxBytes = DEFAULT_MAX_BYTES;
let caches = new WeakMap<LiquidGlassEngine, EngineMapCache>();

const stats = {
  hits: 0,
  misses: 0,
  generated: 0,
  evicted: 0,
};

/** Cache key for a lens on a given engine (exported for the PNG URL cache). */
export function displacementMapCacheKey(engine: LiquidGlassEngine, lens: Partial<LensParams>): string {
  return `${engine.mode}|${mapKey(normalizeLensParams(lens))}`;
}

/**
 * Returns the displacement map for `lens`, generating it through `engine` on
 * first use and serving the shared, immutable cached instance afterwards.
 */
export function getCachedDisplacementMap(
  engine: LiquidGlassEngine,
  lens: Partial<LensParams>,
): DisplacementMap {
  const normalized = normalizeLensParams(lens);
  const key = `${engine.mode}|${mapKey(normalized)}`;

  let cache = caches.get(engine);
  if (!cache) {
    cache = { entries: new Map(), bytes: 0 };
    caches.set(engine, cache);
  }

  const entry = cache.entries.get(key);
  if (entry) {
    stats.hits += 1;
    // Refresh LRU position (insertion order = recency).
    cache.entries.delete(key);
    cache.entries.set(key, entry);
    return entry.map;
  }

  stats.misses += 1;
  stats.generated += 1;
  const map = engine.generateDisplacementMap(normalized);
  const bytes = map.rgba.byteLength;
  cache.entries.set(key, { map, bytes });
  cache.bytes += bytes;

  // Evict least-recently-used entries while over budget. A single entry
  // larger than the whole budget is kept (otherwise it could never cache).
  while (cache.bytes > maxBytes && cache.entries.size > 1) {
    const oldestKey = cache.entries.keys().next().value as string;
    const oldest = cache.entries.get(oldestKey);
    cache.entries.delete(oldestKey);
    cache.bytes -= oldest?.bytes ?? 0;
    stats.evicted += 1;
  }

  return map;
}

export interface DisplacementMapCacheOptions {
  /** Byte budget for cached maps per engine. Default 32 MB. */
  maxBytes?: number;
}

export function configureDisplacementMapCache(options: DisplacementMapCacheOptions): void {
  if (typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes) && options.maxBytes > 0) {
    maxBytes = options.maxBytes;
  }
}

export interface DisplacementMapCacheStats {
  hits: number;
  misses: number;
  generated: number;
  evicted: number;
}

export function getDisplacementMapCacheStats(): DisplacementMapCacheStats {
  return { ...stats };
}

/** Drops all cached maps and resets stats. Intended for tests. */
export function clearDisplacementMapCache(): void {
  caches = new WeakMap();
  maxBytes = DEFAULT_MAX_BYTES;
  stats.hits = 0;
  stats.misses = 0;
  stats.generated = 0;
  stats.evicted = 0;
}
