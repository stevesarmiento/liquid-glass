import { displacementMapCacheKey, getCachedDisplacementMap } from "../engine/map-cache";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
import { displacementMapToPngDataUrl } from "./png";

/**
 * Cached PNG data-URL encoding of displacement maps for the SVG filter path.
 * `displacementMapToPngDataUrl` is itself O(mapSize²) plus a PNG encode, so
 * the SVG path benefits from the same cross-instance sharing as the raw map
 * cache. Lives in `web/` (not `engine/`) because PNG encoding needs the DOM.
 */

const MAX_URL_ENTRIES = 32;

let urlCache = new Map<string, string>();

const stats = { hits: 0, misses: 0 };

export function getCachedDisplacementMapPngUrl(
  engine: LiquidGlassEngine,
  lens: Partial<LensParams>,
): string {
  const key = displacementMapCacheKey(engine, lens);
  const cached = urlCache.get(key);
  if (cached !== undefined) {
    stats.hits += 1;
    // Refresh LRU position.
    urlCache.delete(key);
    urlCache.set(key, cached);
    return cached;
  }

  stats.misses += 1;
  const url = displacementMapToPngDataUrl(getCachedDisplacementMap(engine, lens));
  urlCache.set(key, url);
  while (urlCache.size > MAX_URL_ENTRIES) {
    const oldestKey = urlCache.keys().next().value as string;
    urlCache.delete(oldestKey);
  }
  return url;
}

export interface MapUrlCacheStats {
  hits: number;
  misses: number;
}

export function getMapUrlCacheStats(): MapUrlCacheStats {
  return { ...stats };
}

/** Drops all cached URLs and resets stats. Intended for tests. */
export function clearMapUrlCache(): void {
  urlCache = new Map();
  stats.hits = 0;
  stats.misses = 0;
}
