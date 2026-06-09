import styled, { createGlobalStyle, css, keyframes } from "styled-components";

export type ModalAnimationState = "open" | "closed";

const modalRootIn = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

const modalRootOut = keyframes`
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
`;

const modalSurfaceIn = keyframes`
  from {
    transform: translate3d(0, 5px, 0.1px) scale(0.92);
    opacity: 0.5;
  }

  to {
    transform: translate3d(0, 0, 0.1px) scale(var(--lgds-modal-scale, 1));
    opacity: 1;
  }
`;

const modalSurfaceOut = keyframes`
  from {
    transform: translate3d(0, 0, 0.1px) scale(var(--lgds-modal-scale, 1));
    opacity: 1;
  }

  to {
    transform: translate3d(0, 10px, 0.1px) scale(0.96);
    opacity: 0;
  }
`;

const modalContentIn = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

export const ModalRoot = styled.div<{ $animationState: ModalAnimationState }>`
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 16px;
  backface-visibility: hidden;
  animation: ${({ $animationState }) => ($animationState === "open" ? modalRootIn : modalRootOut)} 200ms ease-out both;
`;

export const Backdrop = styled.button.attrs({ type: "button" })<{ $dismissible?: boolean }>`
  position: absolute;
  inset: 0;
  padding: 0;
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.18), transparent 34%),
    rgba(15, 23, 42, 0.28);
  border: 0;
  cursor: ${({ $dismissible }) => ($dismissible ? "pointer" : "default")};
`;

export const SurfaceWrap = styled.div<{
  $width: string;
  $maxWidth: string;
}>`
  position: relative;
  z-index: 1;
  width: ${({ $width }) => $width};
  max-width: min(${({ $maxWidth }) => $maxWidth}, calc(100vw - 32px));
  max-height: min(88vh, calc(100vh - 32px));
`;

export const Surface = styled.div<{ $animationState: ModalAnimationState; $hasHeader: boolean }>`
  position: relative;
  display: grid;
  max-height: inherit;
  overflow: hidden;
  color: #111827;
  background: transparent;
  border: 0;
  border-radius: var(--lgds-modal-radius, 18px);
  box-shadow: none;
  isolation: isolate;
  will-change: transform;
  backface-visibility: hidden;
  perspective: 600;
  transform: translate3d(0, 0, 0.1px) scale(var(--lgds-modal-scale, 1));
  opacity: 1;
  transition: transform 80ms ease-out;
  animation: ${({ $animationState }) =>
      $animationState === "open" ? modalSurfaceIn : modalSurfaceOut}
    220ms ${({ $animationState }) =>
      $animationState === "open" ? "cubic-bezier(0.175, 0.885, 0.32, 0.98)" : "ease"}
    both;

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: none;
  }

  ${({ $hasHeader }) =>
    !$hasHeader &&
    css`
      ${CloseButton} {
        top: 14px;
        right: 14px;
      }
    `}
`;

export const ContentContainer = styled.div<{ $animationState: ModalAnimationState }>`
  position: relative;
  z-index: 1;
  max-height: inherit;
  overflow: auto;
  animation: ${({ $animationState }) =>
      $animationState === "open"
        ? css`
            ${modalContentIn} 150ms 20ms both
          `
        : "none"};
`;

export const GlassLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: var(--lgds-modal-radius, 18px);
`;

export const DocumentGlassSourceHost = styled.span`
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  background: #ffffff;
  color: initial;
  pointer-events: none;

  > * {
    pointer-events: none !important;
  }
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 64px;
  padding: 20px 22px;
  border-bottom: 0;
  background: transparent;
  position: relative;
`;

export const Title = styled.h2`
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: 0;
`;

export const Body = styled.div<{ $hasHeader: boolean }>`
  min-height: 0;
  overflow: auto;
  padding: ${({ $hasHeader }) => ($hasHeader ? "22px" : "32px 22px 22px")};
  background: transparent;
  position: relative;
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px 18px;
  border-top: 0;
  background: transparent;
  position: relative;
`;

export const CloseButton = styled.button.attrs({ type: "button" })`
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0;
  color: rgba(17, 24, 39, 0.58);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);

  &:hover {
    color: #111827;
    background: rgba(255, 255, 255, 0.12);
  }

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
`;

export const glassNodeClassName = "lgds-modal__glass-node";
export const glassContentClassName = "lgds-modal__glass-content";
export const glassSurfaceClassName = "lgds-modal__glass-surface";

export const ModalGlassCss = createGlobalStyle`
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
    background: linear-gradient(180deg, var(--lg-glass-highlight), transparent 38%), var(--lg-glass-bg);
    border-color: var(--lg-glass-border);
    box-shadow:
      inset 0 1px 0 var(--lg-glass-highlight),
      inset 0 -1px 0 rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
    -webkit-backdrop-filter: blur(var(--lg-glass-surface-blur)) saturate(var(--lg-glass-saturation));
  }

  .${glassSurfaceClassName} .lg-glass-surface__content {
    display: none;
  }
`;
