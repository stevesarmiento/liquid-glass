import type { DisplacementMap, LensParams } from "../engine/types";

export const CANVAS_STRENGTH = 0.62;

export interface GlassSampleInput {
  source: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  map: DisplacementMap;
  lens: LensParams;
  lensWidth: number;
  lensHeight: number;
  lensX: number;
  lensY: number;
  localX: number;
  localY: number;
  pixelRatio?: number;
  strength?: number;
}

export function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function roundedRectInside(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): boolean {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const cx = Math.max(r, Math.min(width - r, x));
  const cy = Math.max(r, Math.min(height - r, y));
  const dx = x - cx;
  const dy = y - cy;

  return dx * dx + dy * dy <= r * r;
}

export function sampleImageChannel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const sx = Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;
  const top = data[i00] * (1 - tx) + data[i10] * tx;
  const bottom = data[i01] * (1 - tx) + data[i11] * tx;

  return top * (1 - ty) + bottom * ty;
}

export function sampleGlassChannel(input: GlassSampleInput, channel: 0 | 1 | 2): number {
  const pixelRatio = input.pixelRatio ?? 1;
  const rawBaseScale = Math.max(input.lens.scaleX, input.lens.scaleY);
  const baseScale = rawBaseScale * (input.strength ?? CANVAS_STRENGTH);
  const ratioX = rawBaseScale > 0 ? input.lens.scaleX / rawBaseScale : 0;
  const ratioY = rawBaseScale > 0 ? input.lens.scaleY / rawBaseScale : 0;
  const chromaScale =
    channel === 0
      ? baseScale * (1 + 0.2 * input.lens.chroma)
      : channel === 1
        ? baseScale * (1 + 0.1 * input.lens.chroma)
        : baseScale;
  const mapX = Math.max(
    0,
    Math.min(input.map.width - 1, Math.floor((input.localX / input.lensWidth) * input.map.width)),
  );
  const mapY = Math.max(
    0,
    Math.min(input.map.height - 1, Math.floor((input.localY / input.lensHeight) * input.map.height)),
  );
  const mapIndex = (mapY * input.map.width + mapX) * 4;
  const mapDx = (input.map.rgba[mapIndex] / 255 - 0.5) * ratioX;
  const mapDy = (input.map.rgba[mapIndex + 1] / 255 - 0.5) * ratioY;

  return sampleImageChannel(
    input.source,
    input.sourceWidth,
    input.sourceHeight,
    (input.lensX + input.localX + mapDx * chromaScale) * pixelRatio,
    (input.lensY + input.localY + mapDy * chromaScale) * pixelRatio,
    channel,
  );
}

export function specularAlpha(map: DisplacementMap, localX: number, localY: number, lensWidth: number, lensHeight: number): number {
  const mapX = Math.max(0, Math.min(map.width - 1, Math.floor((localX / lensWidth) * map.width)));
  const mapY = Math.max(0, Math.min(map.height - 1, Math.floor((localY / lensHeight) * map.height)));
  const mapIndex = (mapY * map.width + mapX) * 4;
  const spec = Math.max(0, map.rgba[mapIndex + 2] - 128) / 127;

  return Math.min(0.52, spec * 0.52);
}

