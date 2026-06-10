import { useMemo } from "react";

import {
  parseCssColor,
  resolveGlassTint,
  withTintBackgroundAlpha,
  type GlassTint,
  type GlassTintInput,
  type GlassTintName,
} from "../../web/tints";

/** Default background-alpha boost applied to the hover tint. */
const DEFAULT_OPACITY_BOOST = 0.08;
/** Default saturation multiplier applied to the hover tint. */
const DEFAULT_SATURATION_SCALE = 1.4;
/** Default cap for the boosted hover saturation. */
const DEFAULT_MAX_SATURATION = 2.5;
/** Background alpha assumed when the resting tint's color cannot be parsed. */
const FALLBACK_BACKGROUND_ALPHA = 0.1;

export interface GlassHoverTintOptions {
  /** Added to the resting background alpha (clamped to 1). Defaults to 0.08. */
  opacityBoost?: number;
  /** Multiplies the resting saturation. Defaults to 1.4. */
  saturationScale?: number;
  /** Cap for the boosted saturation. Defaults to 2.5. */
  maxSaturation?: number;
}

export interface GlassHoverTint {
  /** The input tint, resolved to a full GlassTint. */
  restingTint: GlassTint;
  /** A slightly denser, more saturated variant for the hover state. */
  hoverTint: GlassTint;
}

/**
 * Hover feedback expressed in the glass material itself: instead of a CSS
 * filter, hovering swaps to a tint with a denser background and boosted
 * backdrop saturation. Both tints are memoized; pick between them with your
 * own hover state and pass the result to GlassNode/GlassSurface.
 */
export function useGlassHoverTint(
  tint: GlassTintName | GlassTintInput | GlassTint,
  options: GlassHoverTintOptions = {},
): GlassHoverTint {
  const {
    opacityBoost = DEFAULT_OPACITY_BOOST,
    saturationScale = DEFAULT_SATURATION_SCALE,
    maxSaturation = DEFAULT_MAX_SATURATION,
  } = options;
  const tintKey = typeof tint === "string" ? tint : JSON.stringify(tint);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const restingTint = useMemo(() => resolveGlassTint(tint), [tintKey]);
  const hoverTint = useMemo(() => {
    const backgroundAlpha =
      parseCssColor(restingTint.background)?.[3] ?? FALLBACK_BACKGROUND_ALPHA;
    return {
      ...withTintBackgroundAlpha(restingTint, Math.min(1, backgroundAlpha + opacityBoost)),
      saturation: Math.min(maxSaturation, restingTint.saturation * saturationScale),
    };
  }, [maxSaturation, opacityBoost, restingTint, saturationScale]);

  return { restingTint, hoverTint };
}
