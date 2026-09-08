import { displacementMapCacheKey, getCachedDisplacementMap } from "../engine/map-cache";
import type { LensParams, LiquidGlassEngine } from "../engine/types";
import { displacementMapToPngDataUrl } from "./png";

/**
 * Cached PNG data-URL encoding of displacement maps for the SVG filter path.
 * `displacementMapToPngDataUrl` is itself O(mapSize²) plus a PNG encode, so
 * the SVG path benefits from the same cross-instance sharing as the raw map
 * cache. Lives in `web/` (not `engine/`) because PNG encoding needs the DOM.
 *
 * Byte-budgeted LRU mirroring `engine/map-cache.ts` (the old fixed 32-entry
 * cap could be fully evicted by a single resize burst). Budgeted by
 * `url.length`; a single entry larger than the whole budget is kept.
 */

const DEFAULT_MAX_BYTES = 24 * 1024 * 1024;

interface UrlCacheEntry {
  url: string;
  bytes: number;
}

let maxBytes = DEFAULT_MAX_BYTES;
let totalBytes = 0;
let urlCache = new Map<string, UrlCacheEntry>();

const stats = { hits: 0, misses: 0, evicted: 0 };

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
    return cached.url;
  }

  stats.misses += 1;
  const url = displacementMapToPngDataUrl(getCachedDisplacementMap(engine, lens));
  const bytes = url.length;
  urlCache.set(key, { url, bytes });
  totalBytes += bytes;
  while (totalBytes > maxBytes && urlCache.size > 1) {
    const oldestKey = urlCache.keys().next().value as string;
    const oldest = urlCache.get(oldestKey);
    urlCache.delete(oldestKey);
    totalBytes -= oldest?.bytes ?? 0;
    stats.evicted += 1;
  }
  return url;
}

export interface MapUrlCacheOptions {
  /** Byte budget for cached PNG data URLs. Default 24 MB. */
  maxBytes?: number;
}

export function configureMapUrlCache(options: MapUrlCacheOptions): void {
  if (typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes) && options.maxBytes > 0) {
    maxBytes = options.maxBytes;
  }
}

export interface MapUrlCacheStats {
  hits: number;
  misses: number;
  evicted: number;
}

export function getMapUrlCacheStats(): MapUrlCacheStats {
  return { ...stats };
}

/** Drops all cached URLs and resets stats + budget. Intended for tests. */
export function clearMapUrlCache(): void {
  urlCache = new Map();
  totalBytes = 0;
  maxBytes = DEFAULT_MAX_BYTES;
  stats.hits = 0;
  stats.misses = 0;
  stats.evicted = 0;
}
