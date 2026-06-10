import { MERGED_ALPHA_DISTANCE_RANGE } from "../engine/merged";
import type { DisplacementMap, LensParams } from "../engine/types";

/**
 * Default displacement strength for the canvas renderers. Kept exported as a
 * tunable option, but it defaults to 1 so the canvas path matches the SVG
 * filter path (the old 0.62 damping made the two renderers visibly diverge).
 */
export const CANVAS_STRENGTH = 1;

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

export function applyCanvasBlur(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  blur: number,
  pixelRatio = 1,
): void {
  const radius = Math.round(Math.max(0, blur) * Math.max(1, pixelRatio));
  if (radius <= 0 || width <= 0 || height <= 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  boxBlurRgba(imageData.data, width, height, radius);
  ctx.putImageData(imageData, 0, 0);
}

export function boxBlurRgba(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.floor(radius));
  if (r <= 0 || width <= 0 || height <= 0) return;

  const tmp = new Uint8ClampedArray(data.length);
  const windowSize = r * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const sums = [0, 0, 0, 0];

    for (let offset = -r; offset <= r; offset += 1) {
      const x = Math.max(0, Math.min(width - 1, offset));
      const index = (row + x) * 4;
      sums[0] += data[index];
      sums[1] += data[index + 1];
      sums[2] += data[index + 2];
      sums[3] += data[index + 3];
    }

    for (let x = 0; x < width; x += 1) {
      const index = (row + x) * 4;
      tmp[index] = Math.round(sums[0] / windowSize);
      tmp[index + 1] = Math.round(sums[1] / windowSize);
      tmp[index + 2] = Math.round(sums[2] / windowSize);
      tmp[index + 3] = Math.round(sums[3] / windowSize);

      const removeX = Math.max(0, Math.min(width - 1, x - r));
      const addX = Math.max(0, Math.min(width - 1, x + r + 1));
      const removeIndex = (row + removeX) * 4;
      const addIndex = (row + addX) * 4;
      sums[0] += data[addIndex] - data[removeIndex];
      sums[1] += data[addIndex + 1] - data[removeIndex + 1];
      sums[2] += data[addIndex + 2] - data[removeIndex + 2];
      sums[3] += data[addIndex + 3] - data[removeIndex + 3];
    }
  }

  for (let x = 0; x < width; x += 1) {
    const sums = [0, 0, 0, 0];

    for (let offset = -r; offset <= r; offset += 1) {
      const y = Math.max(0, Math.min(height - 1, offset));
      const index = (y * width + x) * 4;
      sums[0] += tmp[index];
      sums[1] += tmp[index + 1];
      sums[2] += tmp[index + 2];
      sums[3] += tmp[index + 3];
    }

    for (let y = 0; y < height; y += 1) {
      const index = (y * width + x) * 4;
      data[index] = Math.round(sums[0] / windowSize);
      data[index + 1] = Math.round(sums[1] / windowSize);
      data[index + 2] = Math.round(sums[2] / windowSize);
      data[index + 3] = Math.round(sums[3] / windowSize);

      const removeY = Math.max(0, Math.min(height - 1, y - r));
      const addY = Math.max(0, Math.min(height - 1, y + r + 1));
      const removeIndex = (removeY * width + x) * 4;
      const addIndex = (addY * width + x) * 4;
      sums[0] += tmp[addIndex] - tmp[removeIndex];
      sums[1] += tmp[addIndex + 1] - tmp[removeIndex + 1];
      sums[2] += tmp[addIndex + 2] - tmp[removeIndex + 2];
      sums[3] += tmp[addIndex + 3] - tmp[removeIndex + 3];
    }
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

/**
 * Bilinearly samples the merged map's alpha channel and decodes the signed
 * distance it encodes (`alpha = 0.5 - d / (2 * distRange)`; d < 0 inside the
 * blob, in region CSS px). CPU mirror of the WebGL shader's alpha-SDF decode.
 */
export function sampleMapDistance(
  map: DisplacementMap,
  localX: number,
  localY: number,
  lensWidth: number,
  lensHeight: number,
  distRange: number = MERGED_ALPHA_DISTANCE_RANGE,
): number {
  const mapX = (localX / lensWidth) * map.width - 0.5;
  const mapY = (localY / lensHeight) * map.height - 0.5;
  const alpha = sampleImageChannel(map.rgba, map.width, map.height, mapX, mapY, 3) / 255;

  return (0.5 - alpha) * (2 * distRange);
}

/**
 * Blob coverage (0..1) at a lens-local CSS position, rebuilt from the
 * alpha-encoded signed distance with a crisp ~1px antialiased edge — NOT the
 * raw alpha ramp, which now spans the full ±distRange band. CPU mirror of the
 * WebGL shader's `u_maskMode == 1` mask.
 */
export function sampleMapCoverage(
  map: DisplacementMap,
  localX: number,
  localY: number,
  lensWidth: number,
  lensHeight: number,
): number {
  const d = sampleMapDistance(map, localX, localY, lensWidth, lensHeight);

  return Math.min(1, Math.max(0, 0.5 - d));
}

export function specularAlpha(map: DisplacementMap, localX: number, localY: number, lensWidth: number, lensHeight: number): number {
  const mapX = Math.max(0, Math.min(map.width - 1, Math.floor((localX / lensWidth) * map.width)));
  const mapY = Math.max(0, Math.min(map.height - 1, Math.floor((localY / lensHeight) * map.height)));
  const mapIndex = (mapY * map.width + mapX) * 4;
  const spec = Math.max(0, map.rgba[mapIndex + 2] - 128) / 127;

  return Math.min(0.52, spec * 0.52);
}
