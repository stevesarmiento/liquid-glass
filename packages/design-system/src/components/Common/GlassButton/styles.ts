import styled, { css, keyframes, type RuleSet } from "styled-components";

import type { GlassButtonVariant } from "./types";

// The button has NO CSS face of its own — the glass material (GlassNode
// refraction + tint surface) IS the button. Variants only pick the label
// color here; the surface differences live in the glass tint passed to
// GlassNode (see variant→tint mapping in index.tsx).
const variantStyles: Record<GlassButtonVariant, RuleSet<object>> = {
  glass: css`
    --lgds-button-label: var(--lgds-button-text);
  `,
  tinted: css`
    --lgds-button-label: var(--lgds-button-text);
  `,
  ghost: css`
    --lgds-button-label: var(--lgds-button-text);
  `
};

export const ButtonRoot = styled.button<{
  $fullWidth?: boolean;
  $variant: GlassButtonVariant;
}>`
  --lgds-button-accent: #1a88f8;
  --lgds-button-font-size: 13px;
  --lgds-button-height: 38px;
  --lgds-button-padding-x: 18px;
  --lgds-button-radius: 19px;
  /* Labels on glass are plain white. */
  --lgds-button-text: #ffffff;

  position: relative;
  display: inline-grid;
  place-items: center;
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};
  height: var(--lgds-button-height);
  padding: 0 var(--lgds-button-padding-x);
  appearance: none;
  color: var(--lgds-button-label);
  /* No CSS face: the glass material renders the entire surface. */
  background: transparent;
  border: none;
  border-radius: var(--lgds-button-radius);
  cursor: pointer;
  font:
    600 var(--lgds-button-font-size) / 1.2 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Helvetica,
    Arial,
    sans-serif;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  ${({ $variant }) => variantStyles[$variant]}

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--lgds-button-accent) 62%, white);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }

  &[aria-busy="true"] {
    cursor: progress;
  }

  /* Hover feedback lives in the glass material itself (denser, more saturated
     tint passed to GlassNode) — no CSS filter here. */

  @media (prefers-reduced-motion: no-preference) {
    transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);

    &:active:not(:disabled):not([aria-busy="true"]) {
      transform: scale(0.98);
    }
  }
`;

export const Label = styled.span`
  position: relative;
  /* Above the Lens overlay (z-index 2): the label is content ON the glass —
     it must never be refracted/blurred by the material underneath. */
  z-index: 3;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
`;

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

export const Spinner = styled.span`
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.85;

  @media (prefers-reduced-motion: no-preference) {
    animation: ${spin} 720ms linear infinite;
  }
`;

/**
 * Carrier for the grab deformation (useGlassGrab): press-and-drag elastically
 * stretches the glass face toward the pull. It wraps Lens on a SEPARATE
 * element because the press squish (useGlassDeformation) owns Lens's inline
 * transform — two spring-driven writers on one element would fight, so each
 * gets its own layer and the transforms compose by nesting.
 */
export const GrabLayer = styled.span`
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
`;

export const Lens = styled.span<{ $active?: boolean; $dimmed?: boolean }>`
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: calc(var(--lgds-button-radius) - 1px);
  opacity: ${({ $active, $dimmed }) => ($active ? ($dimmed ? 0.4 : 1) : 0)};

  @media (prefers-reduced-motion: no-preference) {
    transition: opacity 320ms cubic-bezier(0.22, 1.15, 0.36, 1.06);
  }
`;

// The press overexposure bloom + cursor-following light moved into the
// material layer: GlassPressEffects from liquid-glass/react (rendered inside
// Lens; pointer vars are written by updateGlassPointerLight on the root).

export const LensSourceBackground = styled.span`
  position: absolute;
  inset: 0;
  background: #ffffff;
`;

export const FaceReplica = styled.span`
  position: absolute;
  inset: 0;
  border-radius: var(--lgds-button-radius);
`;

export const glassNodeClassName = "lgds-button__glass-node";
export const glassContentClassName = "lgds-button__lens-content";
export const glassSurfaceClassName = "lgds-button__lens-glass";

export const buttonGlobalCss = `
  .${glassNodeClassName} {
    position: absolute;
    inset: 0;
  }

  .${glassContentClassName} {
    position: absolute;
    z-index: 1;
    transform-origin: top left;
  }

  .${glassSurfaceClassName}.lg-glass-surface {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
      radial-gradient(ellipse var(--lg-glass-highlight-width) var(--lg-glass-highlight-height) at var(--lg-glass-highlight-x) var(--lg-glass-highlight-y), var(--lg-glass-highlight) 0%, var(--lg-glass-highlight) var(--lg-glass-highlight-core), transparent var(--lg-glass-highlight-spread)),
      var(--lg-glass-bg);
    border-color: var(--lg-glass-border);
    box-shadow:
      0 10px 28px var(--lg-glass-shadow),
      inset 0 1px 0 var(--lg-glass-highlight),
      inset 0 -1px 0 rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
    -webkit-backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
  }

  /* Fluid state transitions: hover swaps the tint (background-color layer,
     border, saturation) on the surface — interpolate instead of snapping.
     The highlight gradient layer keeps identical stops across states, so only
     animatable properties change. */
  @media (prefers-reduced-motion: no-preference) {
    .${glassSurfaceClassName}.lg-glass-surface {
      transition:
        background-color 240ms ease,
        border-color 240ms ease,
        box-shadow 240ms ease,
        backdrop-filter 240ms ease,
        -webkit-backdrop-filter 240ms ease;
    }
  }

  .${glassSurfaceClassName} .lg-glass-surface__content {
    display: none;
  }
`;
