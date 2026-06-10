import { clamp, DEFAULT_LENS_PARAMS, normalizeLensParams } from "./defaults";
import { generateMergedDisplacementMap } from "./merged";
import type {
  DisplacementMap,
  GeometryInput,
  LensGeometry,
  LensParams,
  LiquidGlassEngine,
} from "./types";

export function createTsLiquidGlassEngine(): LiquidGlassEngine {
  return {
    mode: "ts",
    ready: Promise.resolve(),
    generateDisplacementMap,
    generateMergedDisplacementMap,
    computeLensGeometry,
  };
}

export function generateDisplacementMap(paramsInput: LensParams): DisplacementMap {
  const params = normalizeLensParams(paramsInput);
  const size = params.mapSize;
  const halfW = params.width / 2;
  const halfH = params.height / 2;
  const radius = Math.min(params.radius, halfW, halfH);
  const depth = Math.max(0, params.depth);
  const innerHalfW = Math.max(0, halfW - depth);
  const innerHalfH = Math.max(0, halfH - depth);
  const innerRadius = Math.max(0, Math.min(radius, innerHalfW, innerHalfH));
  const invSigma = depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6;
  const dome = params.dome > 0 ? computeDomeConstants(params.dome, halfW, halfH) : null;
  const splay = Math.max(0.001, params.splay);
  const splayActive = splay < 0.999;
  const edgeRange = 3;
  const glowThreshold = (1 - params.glowSpread) * Math.SQRT2;
  const glowRange = params.glowSpread * Math.SQRT2;
  const specRotation = (params.specularRotation * Math.PI) / 180;
  const specX = Math.cos(specRotation);
  const specY = Math.sin(specRotation);
  const minHalf = Math.max(1, Math.min(halfW, halfH));
  const rgba = new Uint8ClampedArray(size * size * 4);
  const halfSize = Math.ceil(size / 2);

  // Blue/specular is NOT invariant under single-axis mirroring, so it is
  // evaluated per mirrored pixel from that pixel's own normalized coords.
  const specByte = (nx: number, ny: number, falloff: number, edgeMask: number): number => {
    const highlightAxis = Math.abs(nx * specX + ny * specY);
    let spec = 0;
    if (params.glow > 0) {
      const t = clamp((highlightAxis - glowThreshold) / glowRange, 0, 1);
      spec += params.glow * Math.pow(t, params.glowExponent) * falloff;
    }
    if (params.edge > 0) {
      spec += params.edge * edgeMask * Math.pow(highlightAxis, params.edgeExponent);
    }
    return Math.round(128 + 127 * Math.min(1, spec));
  };

  for (let py = 0; py < halfSize; py += 1) {
    const y = ((py + 0.5) / size) * (2 * halfH) - halfH;
    const gyBase = dome
      ? Math.sign(y) * domeGradient(Math.abs(y), dome.ry, dome.scaleY)
      : clamp(y / halfH, -1, 1);
    const edgeY = splayActive
      ? Math.max(0, 1 - (halfH - Math.abs(y)) / minHalf) * (1 - splay)
      : 0;
    const baseNy = clamp(y / halfH, -1, 1);

    for (let px = 0; px < halfSize; px += 1) {
      const x = ((px + 0.5) / size) * (2 * halfW) - halfW;
      const outer = roundedRectSdf(x, y, halfW, halfH, radius);

      if (outer >= 0) {
        writeSymmetricPixels(rgba, size, px, py, 128, 128, 128, 128, 128, 128, true);
        continue;
      }

      let gx = dome
        ? Math.sign(x) * domeGradient(Math.abs(x), dome.rx, dome.scaleX)
        : clamp(x / halfW, -1, 1);
      let gy = gyBase;

      if (splayActive) {
        const edgeX = Math.max(0, 1 - (halfW - Math.abs(x)) / minHalf) * (1 - splay);
        const originalLength = Math.hypot(gx, gy);
        gx *= 1 - edgeY;
        gy *= 1 - edgeX;
        const nextLength = Math.hypot(gx, gy);
        if (nextLength > 0.001) {
          gx *= originalLength / nextLength;
          gy *= originalLength / nextLength;
        }
      }

      const inner = roundedRectSdf(x, y, innerHalfW, innerHalfH, innerRadius);
      const falloff = 0.5 * (1 + erfApprox(inner * invSigma));
      const r = Math.round((0.5 - 0.5 * gx * falloff) * 255);
      const g = Math.round((0.5 - 0.5 * gy * falloff) * 255);
      const baseNx = clamp(x / halfW, -1, 1);
      const edgeMask = outer < 0 ? Math.max(0, 1 + outer / edgeRange) : 0;

      writeSymmetricPixels(
        rgba,
        size,
        px,
        py,
        clamp(Math.round(r), 0, 255),
        clamp(Math.round(g), 0, 255),
        specByte(baseNx, baseNy, falloff, edgeMask),
        specByte(-baseNx, baseNy, falloff, edgeMask),
        specByte(baseNx, -baseNy, falloff, edgeMask),
        specByte(-baseNx, -baseNy, falloff, edgeMask),
        false,
      );
    }
  }

  return { width: size, height: size, rgba };
}

export function computeLensGeometry(input: GeometryInput): LensGeometry {
  const containerWidth = Math.max(1, input.containerWidth);
  const containerHeight = Math.max(1, input.containerHeight);
  const lens = normalizeLensParams(input.lens);
  const centerX = input.unit === "px" ? input.x : input.x * containerWidth;
  const centerY = input.unit === "px" ? input.y : input.y * containerHeight;
  const left = centerX - lens.width / 2;
  const top = centerY - lens.height / 2;
  const isTarget = input.mode === "target";
  const bleed = isTarget ? targetBleed(lens) : 0;
  const filterX = isTarget ? Math.max(0, left - bleed) : 0;
  const filterY = isTarget ? Math.max(0, top - bleed) : 0;
  const filterRight = isTarget ? Math.min(containerWidth, left + lens.width + bleed) : containerWidth;
  const filterBottom = isTarget
    ? Math.min(containerHeight, top + lens.height + bleed)
    : containerHeight;

  return {
    left,
    top,
    width: lens.width,
    height: lens.height,
    radius: Math.max(0, Math.min(lens.radius, lens.width / 2, lens.height / 2)),
    filterX,
    filterY,
    filterWidth: Math.max(0, filterRight - filterX),
    filterHeight: Math.max(0, filterBottom - filterY),
    bleed,
  };
}

export function colorMatrixForScale(scaleX: number, scaleY: number): number[] {
  const base = Math.max(scaleX, scaleY);
  const rx = base > 0 ? scaleX / base : 0;
  const ry = base > 0 ? scaleY / base : 0;

  return [
    rx,
    0,
    0,
    0,
    0.5 * (1 - rx),
    0,
    ry,
    0,
    0,
    0.5 * (1 - ry),
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}

export function colorMatrixStringForScale(scaleX: number, scaleY: number): string {
  return colorMatrixForScale(scaleX, scaleY).join(" ");
}

export function targetBleed(params: LensParams): number {
  // 3 sigma of Gaussian blur so the filter region fully covers the blur tail.
  return Math.ceil(
    Math.max(params.scaleX, params.scaleY) * (1 + 0.2 * params.chroma) + params.blur * 3 + 4,
  );
}

export function mapKey(params: LensParams): string {
  return [
    params.width,
    params.height,
    params.radius,
    params.depth,
    params.dome,
    params.splay,
    params.glow,
    params.edge,
    params.glowSpread ?? DEFAULT_LENS_PARAMS.glowSpread,
    params.glowExponent ?? DEFAULT_LENS_PARAMS.glowExponent,
    params.edgeExponent ?? DEFAULT_LENS_PARAMS.edgeExponent,
    params.specularRotation ?? DEFAULT_LENS_PARAMS.specularRotation,
    params.mapSize,
  ].join("|");
}

export function erfApprox(x: number): number {
  return Math.tanh(1.7724538509 * x);
}

function integrateDome(radius: number, half: number): number {
  let sum = 0;
  for (let i = 0; i <= 200; i += 1) {
    const x = (i / 200) * half;
    const slope = x / Math.sqrt(radius * radius - x * x);
    sum += (i === 0 || i === 200 ? 0.5 : 1) * slope;
  }
  return sum / 200;
}

export function computeDomeConstants(depth: number, halfW: number, halfH: number) {
  const safeDepth = clamp(depth, 0.01, Math.max(Math.min(halfW, halfH) - 1, 0.01));
  const rx = (halfW * halfW + safeDepth * safeDepth) / (2 * safeDepth);
  const ry = (halfH * halfH + safeDepth * safeDepth) / (2 * safeDepth);
  const ix = integrateDome(rx, halfW);
  const iy = integrateDome(ry, halfH);

  return {
    rx,
    ry,
    scaleX: ix > 0 ? 0.5 / ix : 1,
    scaleY: iy > 0 ? 0.5 / iy : 1,
  };
}

export function domeGradient(value: number, radius: number, scale: number): number {
  const x = Math.min(value, 0.999 * radius);
  return (x / Math.sqrt(radius * radius - x * x)) * scale;
}

export function roundedRectSdf(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  radius: number,
): number {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function writePixel(
  rgba: Uint8ClampedArray,
  size: number,
  px: number,
  py: number,
  r: number,
  g: number,
  b: number,
): void {
  const index = (py * size + px) * 4;
  rgba[index] = r;
  rgba[index + 1] = g;
  rgba[index + 2] = b;
  rgba[index + 3] = 255;
}

function writeSymmetricPixels(
  rgba: Uint8ClampedArray,
  size: number,
  px: number,
  py: number,
  r: number,
  g: number,
  b00: number,
  b10: number,
  b01: number,
  b11: number,
  neutral: boolean,
): void {
  const pxR = size - 1 - px;
  const pyB = size - 1 - py;
  writePixel(rgba, size, px, py, r, g, b00);
  if (pxR !== px) writePixel(rgba, size, pxR, py, neutral ? r : 255 - r, g, b10);
  if (pyB !== py) writePixel(rgba, size, px, pyB, r, neutral ? g : 255 - g, b01);
  if (pxR !== px && pyB !== py) {
    writePixel(rgba, size, pxR, pyB, neutral ? r : 255 - r, neutral ? g : 255 - g, b11);
  }
}
