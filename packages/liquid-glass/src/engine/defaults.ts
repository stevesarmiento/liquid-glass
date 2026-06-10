import type { LensParams, ResolvedLensParams } from "./types";

export const DEFAULT_LENS_PARAMS: ResolvedLensParams = {
  width: 180,
  height: 120,
  radius: 36,
  scaleX: 18,
  scaleY: 18,
  chroma: 0.35,
  depth: 18,
  dome: 90,
  splay: 0.78,
  glow: 0.45,
  edge: 0.45,
  glowSpread: 0.62,
  glowExponent: 1.5,
  edgeExponent: 1.2,
  specularRotation: 45,
  blur: 2.4,
  mapSize: 256,
};

export function normalizeLensParams(input: Partial<LensParams> = {}): ResolvedLensParams {
  const width = clamp(finiteOr(input.width, DEFAULT_LENS_PARAMS.width), 1, 4096);
  const height = clamp(finiteOr(input.height, DEFAULT_LENS_PARAMS.height), 1, 4096);
  const maxRadius = Math.min(width, height) * 0.5;

  return {
    width,
    height,
    radius: clamp(finiteOr(input.radius, DEFAULT_LENS_PARAMS.radius), 0, maxRadius),
    scaleX: clamp(finiteOr(input.scaleX, DEFAULT_LENS_PARAMS.scaleX), 0, 512),
    scaleY: clamp(finiteOr(input.scaleY, DEFAULT_LENS_PARAMS.scaleY), 0, 512),
    chroma: clamp(finiteOr(input.chroma, DEFAULT_LENS_PARAMS.chroma), 0, 8),
    depth: clamp(finiteOr(input.depth, DEFAULT_LENS_PARAMS.depth), 0, maxRadius),
    dome: clamp(finiteOr(input.dome, DEFAULT_LENS_PARAMS.dome), 0, 4096),
    splay: clamp(finiteOr(input.splay, DEFAULT_LENS_PARAMS.splay), 0.001, 1),
    glow: clamp(finiteOr(input.glow, DEFAULT_LENS_PARAMS.glow), 0, 4),
    edge: clamp(finiteOr(input.edge, DEFAULT_LENS_PARAMS.edge), 0, 4),
    glowSpread: clamp(finiteOr(input.glowSpread, DEFAULT_LENS_PARAMS.glowSpread), 0.05, 2),
    glowExponent: clamp(finiteOr(input.glowExponent, DEFAULT_LENS_PARAMS.glowExponent), 0.1, 8),
    edgeExponent: clamp(finiteOr(input.edgeExponent, DEFAULT_LENS_PARAMS.edgeExponent), 0.1, 8),
    specularRotation: clamp(
      finiteOr(input.specularRotation, DEFAULT_LENS_PARAMS.specularRotation),
      -360,
      360,
    ),
    blur: clamp(finiteOr(input.blur, DEFAULT_LENS_PARAMS.blur), 0, 128),
    mapSize: clamp(Math.round(input.mapSize ?? DEFAULT_LENS_PARAMS.mapSize), 8, 2048),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
