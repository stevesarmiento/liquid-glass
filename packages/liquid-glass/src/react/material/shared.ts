/**
 * Internal helpers shared by the material-behavior hooks (press, deformation,
 * grab). Not part of the public API.
 */

/** Monotonic-ish clock that works in browsers, jsdom, and SSR. */
export const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function safeSetPointerCapture(element: Element, pointerId: number): void {
  if (typeof pointerId !== "number" || !("setPointerCapture" in element)) return;
  try {
    const pointerElement = element as Element & {
      hasPointerCapture(pointerId: number): boolean;
      setPointerCapture(pointerId: number): void;
    };
    if (!pointerElement.hasPointerCapture(pointerId)) {
      pointerElement.setPointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can throw in embedded browsers or interrupted synthetic drags.
  }
}

export function safeReleasePointerCapture(element: Element, pointerId: number): void {
  if (
    typeof pointerId !== "number" ||
    !("releasePointerCapture" in element) ||
    !("hasPointerCapture" in element)
  ) {
    return;
  }
  try {
    const pointerElement = element as Element & {
      hasPointerCapture(pointerId: number): boolean;
      releasePointerCapture(pointerId: number): void;
    };
    if (pointerElement.hasPointerCapture(pointerId)) {
      pointerElement.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore stale pointer captures after canceled or browser-interrupted drags.
  }
}
