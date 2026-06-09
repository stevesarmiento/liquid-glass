import styled, { createGlobalStyle, css } from "styled-components";

export const SwitchContainer = styled.span<{
  $disabled?: boolean;
  $switchWidth: string;
}>`
  --lgds-switch-color-opacity: 0;
  --lgds-switch-fill-bg: #1a88f8;
  --lgds-switch-hit-area: 36px;
  --lgds-switch-lens-height: 22px;
  --lgds-switch-lens-left: 7px;
  --lgds-switch-lens-radius: 80px;
  --lgds-switch-lens-top: 7px;
  --lgds-switch-lens-width: 36px;
  --lgds-switch-thumb-inset-x: 7px;
  --lgds-switch-track-bg: rgba(148, 163, 184, 0.34);
  --lgds-switch-track-height: 30px;
  --lgds-switch-track-inset-x: 3px;
  --lgds-switch-width: ${({ $switchWidth }) => $switchWidth};
  --lgds-switch-text: #2b2f43;
  --lgds-switch-muted: rgba(43, 47, 67, 0.58);

  display: inline-grid;
  grid-template-columns: var(--lgds-switch-width) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--lgds-switch-text);
  font:
    600 13px/1.35 -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Helvetica,
    Arial,
    sans-serif;

  ${({ $disabled }) =>
    $disabled &&
    css`
      cursor: not-allowed;
      opacity: 0.52;
    `}
`;

export const Control = styled.button<{ $disabled?: boolean }>`
  position: relative;
  display: block;
  width: var(--lgds-switch-width);
  height: var(--lgds-switch-hit-area);
  padding: 0;
  overflow: visible;
  appearance: none;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  touch-action: none;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--lgds-switch-fill-bg) 62%, white);
    outline-offset: 4px;
    border-radius: 999px;
  }
`;

export const Rail = styled.span`
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
`;

export const Visual = styled.span`
  position: absolute;
  inset: 0;
  overflow: visible;
`;

export const Track = styled.span`
  position: absolute;
  top: 50%;
  right: var(--lgds-switch-track-inset-x);
  left: var(--lgds-switch-track-inset-x);
  height: var(--lgds-switch-track-height);
  overflow: hidden;
  background: var(--lgds-switch-track-bg);
  border-radius: 999px;
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.1),
    inset 0 0 0 1px rgba(15, 23, 42, 0.05);
  transform: translateY(-50%);
`;

export const Fill = styled.span`
  position: absolute;
  inset: 0;
  display: block;
  background: var(--lgds-switch-fill-bg);
  border-radius: inherit;
  opacity: var(--lgds-switch-color-opacity);
  transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1);
`;

export const Lens = styled.span<{ $active?: boolean }>`
  --lgds-switch-lens-active-duration: 320ms;
  --lgds-switch-lens-ease: cubic-bezier(0.22, 1.15, 0.36, 1.06);
  --lgds-switch-lens-rest-duration: 520ms;

  position: absolute;
  top: var(--lgds-switch-lens-top);
  left: var(--lgds-switch-lens-left);
  z-index: 2;
  width: var(--lgds-switch-lens-width);
  height: var(--lgds-switch-lens-height);
  overflow: visible;
  pointer-events: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--lgds-switch-lens-radius);
  box-shadow: none;
  transition:
    background-color var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    border-color var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    box-shadow var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    width var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    height var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    top var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease),
    left var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease);

  &::before,
  &::after {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    border-radius: inherit;
    content: "";
    opacity: 0;
    transition: opacity var(--lgds-switch-lens-rest-duration) var(--lgds-switch-lens-ease);
  }

  &::before {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0) 18%),
      linear-gradient(0deg, rgba(203, 213, 225, 0.38), rgba(255, 255, 255, 0) 22%);
    box-shadow:
      inset 0 1px 0 rgba(148, 163, 184, 0.22),
      inset 0 -1px 0 rgba(59, 130, 246, 0.18);
  }

  &::after {
    box-shadow:
      inset 1px 0 0 rgba(59, 130, 246, 0.44),
      inset -1px 0 0 rgba(100, 116, 139, 0.14),
      inset 0 0 0 1px rgba(148, 163, 184, 0.18);
  }

  ${({ $active }) =>
    $active &&
    css`
      overflow: hidden;
      transition-duration: var(--lgds-switch-lens-active-duration);

      &::before,
      &::after {
        opacity: 1;
        transition-duration: var(--lgds-switch-lens-active-duration);
      }
    `}
`;

export const Thumb = styled.span`
  position: absolute;
  inset: 0;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: inherit;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 3px 10px rgba(15, 23, 42, 0.075);
`;

export const Input = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  white-space: nowrap;
`;

export const LabelText = styled.span`
  min-width: 0;
  color: var(--lgds-switch-text);
  overflow-wrap: anywhere;
`;

export const LensSourceBackground = styled.span`
  position: absolute;
  inset: 0;
  background: #ffffff;
`;

export const glassNodeClassName = "lgds-switch__glass-node";
export const glassContentClassName = "lgds-switch__lens-content";
export const glassSurfaceClassName = "lgds-switch__lens-glass";

export const SwitchCss = createGlobalStyle`
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
    background: linear-gradient(180deg, var(--lg-glass-highlight), transparent 34%), var(--lg-glass-bg);
    border-color: var(--lg-glass-border);
    box-shadow:
      0 10px 28px var(--lg-glass-shadow),
      inset 0 1px 0 var(--lg-glass-highlight),
      inset 0 -1px 0 rgba(0, 0, 0, 0.16);
    backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
    -webkit-backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
  }

  .${glassSurfaceClassName} .lg-glass-surface__content {
    display: none;
  }
`;
