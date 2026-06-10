export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
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
