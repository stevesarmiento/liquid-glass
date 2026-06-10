import { type CSSProperties, type ReactElement, useEffect } from "react";

import { ensureLiquidGlassStyles } from "../inject-styles";

/** Default peak opacity multiplier of the press overexposure bloom. */
const DEFAULT_EXPOSURE = 0.34;
/** Default radius of the cursor-following light, in px. */
const DEFAULT_GLOW_RADIUS_PX = 110;
/** Default core alpha of the cursor-following light. */
const DEFAULT_GLOW_INTENSITY = 0.34;

export interface GlassPressEffectsProps {
  /**
   * 0..1 press progress (typically `useGlassPress().progress`). Drives the
   * opacity of both layers; at 0 the component renders nothing.
   */
  progress: number;
  /** Peak opacity of the overexposure bloom at full press. Defaults to 0.34. */
  exposure?: number;
  /** Radius of the cursor-following light, in px. Defaults to 110. */
  glowRadiusPx?: number;
  /** Core alpha of the cursor-following light (0 disables it). Defaults to 0.34. */
  glowIntensity?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Writes the pointer position as CSS vars (`--lg-glass-pointer-x/y`) on the
 * given element — imperative, zero re-renders. Call it from pointerenter /
 * pointermove on the pressable surface; GlassPressEffects' cursor light reads
 * the vars from any ancestor and falls back to a centered glow (keyboard
 * presses) when they are unset.
 */
export function updateGlassPointerLight(
  element: HTMLElement,
  event: { clientX: number; clientY: number },
): void {
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--lg-glass-pointer-x", `${event.clientX - rect.left}px`);
  element.style.setProperty("--lg-glass-pointer-y", `${event.clientY - rect.top}px`);
}

/**
 * Optional press visual layer for glass surfaces: an overexposure bloom
 * (light blowing out through the glass) plus a cursor-following light, as a
 * single absolutely-positioned child. Both layers' opacity is driven inline
 * by `progress`, so they share the press tween's easing exactly — there are
 * deliberately no CSS transitions here (they would fight the rAF easing).
 *
 * Mount it inside a `position: relative` (or absolutely-positioned) clip
 * layer with a border radius; the effects inherit the radius. Marked
 * aria-hidden and pointer-events: none.
 */
export function GlassPressEffects({
  progress,
  exposure = DEFAULT_EXPOSURE,
  glowRadiusPx = DEFAULT_GLOW_RADIUS_PX,
  glowIntensity = DEFAULT_GLOW_INTENSITY,
  className,
  style,
}: GlassPressEffectsProps): ReactElement | null {
  useEffect(() => {
    ensureLiquidGlassStyles();
  }, []);

  if (progress <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={["lg-glass-press-effects", className].filter(Boolean).join(" ")}
      style={
        {
          "--lg-glass-press-glow-radius": `${glowRadiusPx}px`,
          "--lg-glass-press-glow-intensity": glowIntensity,
          ...style,
        } as CSSProperties
      }
    >
      {glowIntensity > 0 ? (
        <span className="lg-glass-press-glow" style={{ opacity: progress }} />
      ) : null}
      <span className="lg-glass-press-bloom" style={{ opacity: progress * exposure }} />
    </span>
  );
}
