export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export interface CoverSliceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CoverSlice {
  /** Top-left of the cover-scaled image, relative to the target rect. */
  x: number;
  y: number;
  /** Drawn (cover-scaled) image dimensions. */
  width: number;
  height: number;
}

/**
 * CSS `background-size: cover; background-position: center` math: scale the
 * image uniformly so it fully covers the anchor rect
 * (`scale = max(anchorW / imageW, anchorH / imageH)`), center the scaled image
 * inside the anchor, then express the image's top-left relative to the target
 * rect so `ctx.drawImage(image, x, y, width, height)` paints exactly the slice
 * the target visually sits over.
 */
export function computeCoverSlice(input: {
  imageWidth: number;
  imageHeight: number;
  anchor: CoverSliceRect;
  target: Pick<CoverSliceRect, "left" | "top">;
}): CoverSlice {
  const { imageWidth, imageHeight, anchor, target } = input;
  const scale = Math.max(anchor.width / imageWidth, anchor.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: anchor.left + (anchor.width - width) / 2 - target.left,
    y: anchor.top + (anchor.height - height) / 2 - target.top,
    width,
    height,
  };
}

export function isTransparentCssColor(color: string): boolean {
  return (
    color === "transparent" ||
    color === "rgba(0, 0, 0, 0)" ||
    color === "rgb(0 0 0 / 0)" ||
    color.endsWith("/ 0)")
  );
}

export function getCanvasBackgroundColor(element: HTMLElement | null): string {
  let current: HTMLElement | null = element;

  while (current) {
    const backgroundColor = getComputedStyle(current).backgroundColor.trim();
    if (backgroundColor && !isTransparentCssColor(backgroundColor)) return backgroundColor;
    current = current.parentElement;
  }

  return "#ffffff";
}
