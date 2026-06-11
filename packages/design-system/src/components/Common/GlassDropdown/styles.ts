import styled, { css } from "styled-components";

/**
 * The dropdown has NO CSS glass of its own while the goo canvas is live: the
 * merged-lens WebGL pass paints the trigger circle, the menu panel, and the
 * liquid neck between them. The `$fallback` variants below are only applied
 * when the goo cannot run (no glassBackdrop, or WebGL2 unavailable/lost) —
 * then the trigger and menu get a plain translucent face and the menu
 * scale+fades from the trigger with CSS.
 */

export const DropdownRoot = styled.div`
  --lgds-dropdown-accent: #1a88f8;
  --lgds-dropdown-text: #ffffff;

  position: relative;
  display: inline-block;
  width: var(--lgds-dropdown-trigger-size);
  height: var(--lgds-dropdown-trigger-size);
`;

/** Whole-region goo overlay. Sized/positioned inline from the region rect. */
export const GooCanvas = styled.canvas`
  position: absolute;
  z-index: 1;
  display: block;
  pointer-events: none;
`;

export const TriggerButton = styled.button<{ $fallback: boolean }>`
  position: relative;
  z-index: 3;
  display: grid;
  place-items: center;
  width: var(--lgds-dropdown-trigger-size);
  height: var(--lgds-dropdown-trigger-size);
  padding: 0;
  appearance: none;
  color: var(--lgds-dropdown-text);
  /* Glass face comes entirely from the goo canvas (lens L0). */
  background: transparent;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  ${({ $fallback }) =>
    $fallback &&
    css`
      background: var(--lgds-dropdown-tint-bg);
      border: 1px solid var(--lgds-dropdown-tint-border);
      backdrop-filter: blur(10px) saturate(var(--lgds-dropdown-saturation));
      -webkit-backdrop-filter: blur(10px) saturate(var(--lgds-dropdown-saturation));
      box-shadow: 0 10px 28px var(--lgds-dropdown-tint-shadow);

      /* No goo to express hover/press in, so the fallback face gets simple
         density feedback (the goo path does this in the glass chrome). */
      &:hover {
        background: color-mix(in srgb, var(--lgds-dropdown-tint-bg), rgb(255 255 255 / 60%) 10%);
      }

      &:active {
        background: color-mix(in srgb, var(--lgds-dropdown-tint-bg), rgb(255 255 255 / 70%) 18%);
      }

      @media (prefers-reduced-motion: no-preference) {
        transition: background-color 160ms ease;
      }
    `}

  /* Same focus ring pattern as GlassButton (accent mixed toward white). */
  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--lgds-dropdown-accent) 62%, white);
    outline-offset: 3px;
  }
`;

/* Press visuals are shader chrome (innerBrightness + innerLight in the goo
   render), not DOM — a DOM clip layer would stay a rigid circle while the
   glass deforms. */

export const TriggerIcon = styled.span`
  position: relative;
  /* Above the goo canvas — the icon is content ON the glass. */
  z-index: 2;
  display: grid;
  place-items: center;
  pointer-events: none;

  @media (prefers-reduced-motion: no-preference) {
    transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  svg {
    display: block;
  }
`;

/**
 * Carrier for the trigger-grab icon parallax. Nested inside TriggerIcon
 * because the press scale owns TriggerIcon's inline transform — two writers
 * on one element would fight, so the transforms compose by nesting (the same
 * rule as GlassButton's GrabLayer/Lens). Deliberately no transition: the grab
 * spring writes the transform per frame.
 */
export const TriggerIconInner = styled.span`
  display: grid;
  place-items: center;
`;

export const Menu = styled.div<{ $fallback: boolean; $interactive: boolean; $visible: boolean }>`
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  padding: 8px;
  overflow: hidden;
  border-radius: var(--lgds-dropdown-menu-radius);
  visibility: ${({ $visible }) => ($visible ? "visible" : "hidden")};
  pointer-events: ${({ $interactive }) => ($interactive ? "auto" : "none")};

  ${({ $fallback }) =>
    $fallback &&
    css`
      background: var(--lgds-dropdown-tint-bg);
      border: 1px solid var(--lgds-dropdown-tint-border);
      backdrop-filter: blur(12px) saturate(var(--lgds-dropdown-saturation));
      -webkit-backdrop-filter: blur(12px) saturate(var(--lgds-dropdown-saturation));
      box-shadow: 0 18px 48px var(--lgds-dropdown-tint-shadow);
      transform-origin: var(--lgds-dropdown-menu-origin);

      &[data-open="false"] {
        opacity: 0;
        transform: scale(0.62) translateY(-8px);
      }

      @media (prefers-reduced-motion: no-preference) {
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.22, 1.15, 0.36, 1.06);
      }
    `}
`;

export const MenuItem = styled.button`
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  appearance: none;
  color: var(--lgds-dropdown-text);
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font:
    500 13px / 1.3 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Helvetica,
    Arial,
    sans-serif;
  text-align: left;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  /* Items are content ON the glass: they stagger in once the goo has mostly
     poured (data-open flips at ~55% open progress), via CSS only. */
  opacity: 0;
  transform: translateY(-6px);

  @media (prefers-reduced-motion: no-preference) {
    transition:
      opacity 150ms ease,
      transform 170ms cubic-bezier(0.23, 1, 0.32, 1),
      background-color 140ms ease;
  }

  [data-open="true"] & {
    opacity: 1;
    transform: none;

    @media (prefers-reduced-motion: no-preference) {
      transition-delay: calc(var(--lgds-dropdown-item-index) * 26ms);
    }
  }

  &:hover:not([aria-disabled="true"]),
  &:focus-visible {
    background: rgba(255, 255, 255, 0.16);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--lgds-dropdown-accent) 62%, white);
    outline-offset: -2px;
  }

  &[aria-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.4;
  }

  [data-open="true"] &[aria-disabled="true"] {
    opacity: 0.4;
  }
`;

export const MenuItemIcon = styled.span`
  display: grid;
  flex: 0 0 auto;
  place-items: center;

  svg {
    display: block;
  }
`;

export const MenuItemLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
