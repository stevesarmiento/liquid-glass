import type { ResolvedLensParams } from "liquid-glass";

import {
  FLOATING_CONTROLS_BAR_HEIGHT,
  FLOATING_CONTROLS_MARGIN,
  FLOATING_CONTROLS_WIDTH,
  type FloatingControlsPosition,
} from "./playgroundConfig";

export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatHighlightPosition(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatHighlightRotation(value: number): string {
  return `${Math.round(value * 100) / 100}deg`;
}

export function computeTargetClipPath(
  position: { x: number; y: number },
  lens: ResolvedLensParams,
): string {
  return `inset(calc(${position.y * 100}% - ${lens.height / 2}px) calc(${100 - position.x * 100}% - ${lens.width / 2}px) calc(${100 - position.y * 100}% - ${lens.height / 2}px) calc(${position.x * 100}% - ${lens.width / 2}px) round ${lens.radius}px)`;
}

export function getInitialControlsPosition(): FloatingControlsPosition {
  if (typeof window === "undefined") return { x: FLOATING_CONTROLS_MARGIN, y: FLOATING_CONTROLS_MARGIN };

  return constrainControlsPosition({
    x: window.innerWidth - FLOATING_CONTROLS_WIDTH - 20,
    y: 64,
  });
}

export function constrainControlsPosition(position: FloatingControlsPosition): FloatingControlsPosition {
  if (typeof window === "undefined") return position;

  const maxX = Math.max(
    FLOATING_CONTROLS_MARGIN,
    window.innerWidth - Math.min(FLOATING_CONTROLS_WIDTH, window.innerWidth - FLOATING_CONTROLS_MARGIN * 2) - FLOATING_CONTROLS_MARGIN,
  );
  const maxY = Math.max(
    FLOATING_CONTROLS_MARGIN,
    window.innerHeight - FLOATING_CONTROLS_BAR_HEIGHT - FLOATING_CONTROLS_MARGIN,
  );

  return {
    x: Math.min(maxX, Math.max(FLOATING_CONTROLS_MARGIN, position.x)),
    y: Math.min(maxY, Math.max(FLOATING_CONTROLS_MARGIN, position.y)),
  };
}

export function safeSetPointerCapture(element: Element, pointerId: number): void {
  if (!("setPointerCapture" in element)) return;
  try {
    (element as Element & { setPointerCapture(pointerId: number): void }).setPointerCapture(pointerId);
  } catch {
    // Some embedded browsers can reject capture during synthetic or interrupted drags.
  }
}

export function safeHasPointerCapture(element: Element, pointerId: number): boolean {
  if (!("hasPointerCapture" in element)) return true;
  try {
    return (element as Element & { hasPointerCapture(pointerId: number): boolean }).hasPointerCapture(pointerId);
  } catch {
    return false;
  }
}

export function computeCoverSlice(input: {
  imageWidth: number;
  imageHeight: number;
  anchor: DOMRect;
  target: DOMRect;
}): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(input.anchor.width / input.imageWidth, input.anchor.height / input.imageHeight);
  const width = input.imageWidth * scale;
  const height = input.imageHeight * scale;

  return {
    x: input.anchor.left + (input.anchor.width - width) / 2 - input.target.left,
    y: input.anchor.top + (input.anchor.height - height) / 2 - input.target.top,
    width,
    height,
  };
}
