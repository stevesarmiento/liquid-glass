export function safeSetPointerCapture(element: Element, pointerId: number): void {
  if (!("setPointerCapture" in element)) return;
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
  if (!("releasePointerCapture" in element) || !("hasPointerCapture" in element)) return;
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
