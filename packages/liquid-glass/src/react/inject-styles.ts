/**
 * Stylesheet for the React glass primitives.
 *
 * This string is the single source of truth: it is injected at runtime by
 * `ensureLiquidGlassStyles()` (called on component mount) and also emitted to
 * dist/react/index.css at build time (scripts/build-css.mjs) for consumers
 * who prefer an explicit `import "liquid-glass/styles.css"`.
 */
export const LIQUID_GLASS_STYLES = `.lg-glass-surface {
  --lg-glass-blur: 18px;
  --lg-glass-bg: rgba(23, 26, 24, 0.45);
  --lg-glass-border: rgba(255, 255, 255, 0.2);
  --lg-glass-highlight: rgba(255, 255, 255, 0.42);
  --lg-glass-highlight-width: 116%;
  --lg-glass-highlight-height: 74%;
  --lg-glass-highlight-core: 36%;
  --lg-glass-highlight-spread: 68%;
  --lg-glass-highlight-rotation: -10deg;
  --lg-glass-highlight-x: 24%;
  --lg-glass-highlight-y: -20%;
  --lg-glass-radius: 18px;
  --lg-glass-saturation: 1.18;
  --lg-glass-shadow: rgba(0, 0, 0, 0.32);
  --lg-glass-surface-blur: 0px;
  --lg-glass-text: rgba(255, 255, 255, 0.92);

  position: relative;
  isolation: isolate;
  overflow: hidden;
  color: var(--lg-glass-text);
  background:
    radial-gradient(ellipse var(--lg-glass-highlight-width) var(--lg-glass-highlight-height) at var(--lg-glass-highlight-x) var(--lg-glass-highlight-y), var(--lg-glass-highlight) 0%, var(--lg-glass-highlight) var(--lg-glass-highlight-core), transparent var(--lg-glass-highlight-spread)),
    var(--lg-glass-bg);
  border: 1px solid var(--lg-glass-border);
  backdrop-filter: blur(var(--lg-glass-blur)) saturate(var(--lg-glass-saturation));
  -webkit-backdrop-filter: blur(var(--lg-glass-blur)) saturate(var(--lg-glass-saturation));
  box-shadow:
    inset 0 1px 0 var(--lg-glass-highlight),
    inset 0 -1px 0 rgba(0, 0, 0, 0.24);
}

.lg-glass-surface--rounded {
  --lg-glass-radius: 18px;
  border-radius: var(--lg-glass-radius);
}

.lg-glass-surface--pill {
  --lg-glass-radius: 999px;
  border-radius: var(--lg-glass-radius);
}

.lg-glass-surface--light {
  --lg-glass-bg: rgba(255, 255, 255, 0.36);
  --lg-glass-border: rgba(255, 255, 255, 0.56);
  --lg-glass-text: rgba(16, 20, 20, 0.9);
}

.lg-glass-surface--clear {
  --lg-glass-bg: rgba(255, 255, 255, 0.16);
  --lg-glass-border: rgba(255, 255, 255, 0.34);
}

.lg-glass-surface--elevated {
  box-shadow:
    0 18px 48px var(--lg-glass-shadow),
    inset 0 1px 0 var(--lg-glass-highlight),
    inset 0 -1px 0 rgba(0, 0, 0, 0.24);
}

/* No hover treatment by design — press is the only state cue. The
   interactive variant keeps its transitions so tint/chrome swaps driven by
   state (press saturation, theme changes) interpolate instead of snapping. */
.lg-glass-surface--interactive {
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.lg-glass-surface__shine {
  position: absolute;
  left: calc(var(--lg-glass-highlight-x) - var(--lg-glass-highlight-width) * 0.34);
  top: calc(var(--lg-glass-highlight-y) - var(--lg-glass-highlight-height) * 0.39);
  width: calc(var(--lg-glass-highlight-width) * 0.68);
  height: calc(var(--lg-glass-highlight-height) * 0.78);
  z-index: 0;
  pointer-events: none;
  background: var(--lg-glass-highlight);
  border-radius: 999px;
  /* Fixed blur reads as fog on thumb-sized surfaces; GlassNode scales the
     var with the lens short side (10px stays the large-surface default). */
  filter: blur(var(--lg-glass-shine-blur, 10px));
  opacity: 0.62;
  transform: rotate(var(--lg-glass-highlight-rotation));
  mask-image: radial-gradient(ellipse at center, #000 0%, #000 var(--lg-glass-highlight-core), transparent var(--lg-glass-highlight-spread));
  -webkit-mask-image: radial-gradient(ellipse at center, #000 0%, #000 var(--lg-glass-highlight-core), transparent var(--lg-glass-highlight-spread));
}

.lg-glass-surface__content {
  position: relative;
  z-index: 1;
  height: 100%;
}

.lg-filter-svg {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}

.lg-glass-node {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.lg-glass-node__content,
.lg-glass-node__source,
.lg-glass-node__canvas,
.lg-glass-node__surface {
  position: absolute;
  top: 0;
  left: 0;
}

.lg-glass-node__canvas {
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}

.lg-glass-node__surface.lg-glass-surface {
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

.lg-glass-node__surface .lg-glass-surface__content {
  display: none;
}

/* Press visual layer (GlassPressEffects): overexposure bloom + cursor light.
   Opacity is driven inline by the press tween — no transitions here. */
.lg-glass-press-effects {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  border-radius: inherit;
}

.lg-glass-press-effects > span {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

/* Overexposure: a white bloom that flares in with the press tween and decays
   on release — light blowing out through the glass. */
.lg-glass-press-bloom {
  background: radial-gradient(
    120% 140% at 50% 28%,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(255, 255, 255, 0.55) 55%,
    rgba(255, 255, 255, 0.3) 100%
  );
}

/* Pointer light: a soft radial glow centered on the cursor, tracked via the
   --lg-glass-pointer-x/y vars (written imperatively by
   updateGlassPointerLight — no React renders). Keyboard presses fall back to
   a centered glow via the 50% var defaults. The mid stop keeps the original
   0.1/0.34 alpha ratio as intensity scales. */
.lg-glass-press-glow {
  background: radial-gradient(
    var(--lg-glass-press-glow-radius, 110px) circle at var(--lg-glass-pointer-x, 50%) var(--lg-glass-pointer-y, 50%),
    rgba(255, 255, 255, var(--lg-glass-press-glow-intensity, 0.34)) 0%,
    rgba(255, 255, 255, calc(var(--lg-glass-press-glow-intensity, 0.34) * 0.29412)) 46%,
    transparent 72%
  );
}

@media (prefers-reduced-transparency: reduce) {
  .lg-glass-surface,
  .lg-glass-node__surface.lg-glass-surface {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .lg-glass-surface {
    --lg-glass-bg: rgba(23, 26, 24, 0.85);
  }

  .lg-glass-surface--light {
    --lg-glass-bg: rgba(255, 255, 255, 0.88);
  }

  .lg-glass-surface--clear {
    --lg-glass-bg: rgba(245, 247, 247, 0.85);
  }
}
`;

const STYLE_ATTRIBUTE = "data-liquid-glass";

let injected = false;

/**
 * Idempotently appends one `<style data-liquid-glass>` tag to the document
 * head. SSR-safe: does nothing when `document` is unavailable. Called from
 * component mount paths, so importing the package has no side effects.
 */
export function ensureLiquidGlassStyles(): void {
  if (injected) return;
  if (typeof document === "undefined") return;
  const existing = document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`);
  if (existing) {
    // Refresh stale content: under dev hot-reload this module re-evaluates
    // with NEW css, but the tag injected by the previous module instance
    // survives in the document — without this sync, style changes would not
    // apply until a full page reload.
    if (existing.textContent !== LIQUID_GLASS_STYLES) {
      existing.textContent = LIQUID_GLASS_STYLES;
    }
    injected = true;
    return;
  }
  const style = document.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "");
  style.textContent = LIQUID_GLASS_STYLES;
  document.head.append(style);
  injected = true;
}
