import styled, { createGlobalStyle, css } from "styled-components";

export const SliderContainer = styled.label<{
  $disabled?: boolean;
  $active?: boolean;
  $sliderWidth: string;
}>`
  --lgds-slider-percent: 0%;
  --lgds-slider-hit-area: 44px;
  --lgds-slider-lens-height: 34px;
  --lgds-slider-lens-left: 0px;
  --lgds-slider-lens-radius: 17px;
  --lgds-slider-lens-top: 0px;
  --lgds-slider-lens-width: 63px;
  --lgds-slider-track-height: 9px;
  --lgds-slider-track-bg: rgba(148, 163, 184, 0.34);
  --lgds-slider-fill-bg: #1a88f8;
  --lgds-slider-text: #2b2f43;
  --lgds-slider-muted: rgba(43, 47, 67, 0.58);

  display: grid;
  gap: 8px;
  width: ${({ $sliderWidth }) => $sliderWidth};
  min-width: 0;
  color: var(--lgds-slider-text);
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

export const Header = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

export const LabelText = styled.span`
  overflow-wrap: anywhere;
`;

export const ValueText = styled.span`
  color: var(--lgds-slider-muted);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
`;

export const Control = styled.span<{ $disabled?: boolean }>`
  position: relative;
  display: block;
  height: var(--lgds-slider-hit-area);
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  touch-action: none;
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
  right: calc(var(--lgds-slider-lens-width) / 2);
  left: calc(var(--lgds-slider-lens-width) / 2);
  height: var(--lgds-slider-track-height);
  overflow: hidden;
  background: var(--lgds-slider-track-bg);
  border: 0;
  border-radius: 999px;
  transform: translateY(-50%);
`;

export const Fill = styled.span`
  display: block;
  width: var(--lgds-slider-percent);
  height: 100%;
  background: var(--lgds-slider-fill-bg);
  border-radius: inherit;
`;

export const Lens = styled.span<{ $active?: boolean }>`
  --lgds-slider-lens-active-duration: 320ms;
  --lgds-slider-lens-ease: cubic-bezier(0.22, 1.15, 0.36, 1.06);
  --lgds-slider-lens-rest-duration: 520ms;

  position: absolute;
  top: var(--lgds-slider-lens-top);
  left: var(--lgds-slider-lens-left);
  z-index: 2;
  width: var(--lgds-slider-lens-width);
  height: var(--lgds-slider-lens-height);
  overflow: visible;
  pointer-events: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--lgds-slider-lens-radius);
  box-shadow: none;
  transition:
    background-color var(--lgds-slider-lens-rest-duration) var(--lgds-slider-lens-ease),
    border-color var(--lgds-slider-lens-rest-duration) var(--lgds-slider-lens-ease),
    box-shadow var(--lgds-slider-lens-rest-duration) var(--lgds-slider-lens-ease),
    transform var(--lgds-slider-lens-rest-duration) var(--lgds-slider-lens-ease);

  &::before,
  &::after {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    border-radius: inherit;
    content: "";
    opacity: 0;
    transition: opacity var(--lgds-slider-lens-rest-duration) var(--lgds-slider-lens-ease);
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
      background: transparent;
      border-color: transparent;
      box-shadow: none;
      transform: scale(1.14);
      transition:
        background-color var(--lgds-slider-lens-active-duration) var(--lgds-slider-lens-ease),
        border-color var(--lgds-slider-lens-active-duration) var(--lgds-slider-lens-ease),
        box-shadow var(--lgds-slider-lens-active-duration) var(--lgds-slider-lens-ease),
        transform var(--lgds-slider-lens-active-duration) var(--lgds-slider-lens-ease);

      &::before,
      &::after {
        opacity: 1;
        transition-duration: var(--lgds-slider-lens-active-duration);
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
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
`;

export const LensSourceBackground = styled.span`
  position: absolute;
  inset: 0;
  background: #ffffff;
`;

export const glassNodeClassName = "lgds-slider__glass-node";
export const glassContentClassName = "lgds-slider__lens-content";
export const glassSurfaceClassName = "lgds-slider__lens-glass";

export const SliderCss = createGlobalStyle`
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
