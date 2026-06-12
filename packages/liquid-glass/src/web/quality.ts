/**
 * Adaptive quality governor (v1): watches main-thread frame pacing while
 * glass work is happening and degrades rendering quality in steps when the
 * page can't hold its budget — instead of letting every device melt evenly.
 *
 * Levels:
 * - 0: full quality
 * - 1: halve auto-derived displacement map sizes (4× cheaper map gen)
 * - 2: additionally disable chromatic separation (chroma 0 — one refraction
 *      sample instead of three on every backend)
 * - 3: surface-only — components render the same tint/chrome fallback used
 *      for `prefers-reduced-transparency`, skipping refraction entirely
 *
 * Global module state by design: one main thread + one GPU = one budget
 * (per-component governors would thrash against each other). Asymmetric
 * hysteresis: degrading is fast (sustained jank is acute), upgrading is slow
 * and dwell-gated (flapping looks worse than staying a level down).
 *
 * The rAF sampler only runs while glass draws are happening (`noteGlassWork`)
 * and self-stops after an idle window — the governor never burns CPU on an
 * idle page.
 */

export type GlassQualityLevel = 0 | 1 | 2 | 3;

export interface GlassQualityGovernorOptions {
  /** Frame-time EMA above this degrades (ms). Default 24. */
  degradeAboveMs?: number;
  /** Frame-time EMA below this upgrades (ms). Default 14. */
  upgradeBelowMs?: number;
  /** Consecutive over-budget frames before degrading. Default 30. */
  degradeFrames?: number;
  /** Consecutive under-budget frames before upgrading. Default 180. */
  upgradeFrames?: number;
  /** Minimum ms between level changes. Default 2000. */
  dwellMs?: number;
}

/**
 * Pure hysteresis core (exported for tests): feed it frame deltas, read the
 * level. Time is passed in so tests are deterministic.
 */
export function createGlassQualityGovernor(options: GlassQualityGovernorOptions = {}) {
  const degradeAboveMs = options.degradeAboveMs ?? 24;
  const upgradeBelowMs = options.upgradeBelowMs ?? 14;
  const degradeFrames = options.degradeFrames ?? 30;
  const upgradeFrames = options.upgradeFrames ?? 180;
  const dwellMs = options.dwellMs ?? 2000;

  let level: GlassQualityLevel = 0;
  let ema = 16.7;
  let overFrames = 0;
  let underFrames = 0;
  let lastChangeAt = -Infinity;

  return {
    get level(): GlassQualityLevel {
      return level;
    },
    /** Feeds one frame delta. Returns true when the level changed. */
    step(deltaMs: number, nowMs: number): boolean {
      // A large gap is a scheduling pause (hidden tab, debugger), not jank.
      if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 250) {
        overFrames = 0;
        underFrames = 0;
        return false;
      }
      ema = ema * 0.9 + deltaMs * 0.1;
      if (ema > degradeAboveMs) {
        overFrames += 1;
        underFrames = 0;
      } else if (ema < upgradeBelowMs) {
        underFrames += 1;
        overFrames = 0;
      } else {
        overFrames = 0;
        underFrames = 0;
      }

      if (level < 3 && overFrames >= degradeFrames && nowMs - lastChangeAt >= dwellMs) {
        level = (level + 1) as GlassQualityLevel;
        overFrames = 0;
        lastChangeAt = nowMs;
        return true;
      }
      if (level > 0 && underFrames >= upgradeFrames && nowMs - lastChangeAt >= dwellMs) {
        level = (level - 1) as GlassQualityLevel;
        underFrames = 0;
        lastChangeAt = nowMs;
        return true;
      }
      return false;
    },
  };
}

/** Sampler stops once no glass work happened for this long. */
const IDLE_STOP_MS = 2000;

let governor = createGlassQualityGovernor();
let override: GlassQualityLevel | null = null;
let monitoring = false;
let rafId: number | null = null;
let lastFrameAt: number | null = null;
let lastWorkAt = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function sampleFrame(now: number): void {
  rafId = null;
  if (lastFrameAt !== null && governor.step(now - lastFrameAt, now)) notify();
  lastFrameAt = now;
  if (now - lastWorkAt > IDLE_STOP_MS) {
    monitoring = false;
    lastFrameAt = null;
    return;
  }
  rafId = requestAnimationFrame(sampleFrame);
}

/**
 * Marks glass work happening NOW; starts (or keeps) the frame sampler. Called
 * from the draw paths via perf-stats — application code never needs it.
 */
export function noteGlassWork(): void {
  if (typeof requestAnimationFrame !== "function" || typeof performance === "undefined") return;
  lastWorkAt = performance.now();
  if (monitoring) return;
  monitoring = true;
  lastFrameAt = null;
  if (rafId === null) rafId = requestAnimationFrame(sampleFrame);
}

/** Current effective level (test/override wins over the adaptive level). */
export function getGlassQualityLevel(): GlassQualityLevel {
  return override ?? governor.level;
}

/** Pin the level (e.g. for tests or a user setting); null returns to adaptive. */
export function setGlassQualityOverride(level: GlassQualityLevel | null): void {
  if (override === level) return;
  override = level;
  notify();
}

export function subscribeGlassQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resets governor, override, and sampler. Intended for tests. */
export function resetGlassQualityForTests(): void {
  governor = createGlassQualityGovernor();
  override = null;
  monitoring = false;
  lastFrameAt = null;
  lastWorkAt = 0;
  if (rafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
  rafId = null;
  notify();
}
