export interface GlassFilterBleedInput {
  blur: number;
  chroma: number;
  scaleX: number;
  scaleY: number;
}

export interface GlassFilterVersionInput extends GlassFilterBleedInput {
  sourceWidth: number;
  sourceHeight: number;
  lensWidth: number;
  lensHeight: number;
  radius: number;
  mapSize: number;
  depth: number;
  dome: number;
  splay: number;
  glow: number;
  edge: number;
  /** No-fold cap (engine/map-slope.ts); optional for back-compat. */
  maxSlope?: number;
}

// Keep in sync with `targetBleed` in src/engine/ts-engine.ts.
export function getGlassFilterBleed({ blur, chroma, scaleX, scaleY }: GlassFilterBleedInput): number {
  return Math.ceil(Math.max(Math.abs(scaleX), Math.abs(scaleY)) * (1 + 0.2 * chroma) + blur * 3 + 4);
}

export function getGlassFilterVersion(input: GlassFilterVersionInput): string {
  return [
    Math.round(input.sourceWidth),
    Math.round(input.sourceHeight),
    Math.round(input.lensWidth),
    Math.round(input.lensHeight),
    Math.round(input.radius * 100),
    Math.round(input.mapSize),
    Math.round(input.scaleX * 100),
    Math.round(input.scaleY * 100),
    Math.round(input.chroma * 1000),
    Math.round(input.blur * 100),
    Math.round(input.depth * 100),
    Math.round(input.dome * 100),
    Math.round(input.splay * 1000),
    Math.round(input.glow * 1000),
    Math.round(input.edge * 1000),
    Math.round((input.maxSlope ?? 0) * 100),
  ].join("-");
}

/** `getGlassFilterVersion` minus the four size terms. */
export type GlassFilterPrimitiveVersionInput = Omit<
  GlassFilterVersionInput,
  "sourceWidth" | "sourceHeight" | "lensWidth" | "lensHeight"
>;

/**
 * Filter version covering only PRIMITIVE-affecting optics — no source/lens
 * size terms. Size changes rewrite the <filter> region attributes, which
 * invalidate the filter on their own in WebKit (see the empirical note in
 * controller.ts), so the React path only cycles the filter id when this
 * primitive version changes while the region stays put. That keeps a
 * continuous resize from remounting the <filter> subtree every tick.
 */
export function getGlassFilterPrimitiveVersion(input: GlassFilterPrimitiveVersionInput): string {
  return [
    Math.round(input.radius * 100),
    Math.round(input.mapSize),
    Math.round(input.scaleX * 100),
    Math.round(input.scaleY * 100),
    Math.round(input.chroma * 1000),
    Math.round(input.blur * 100),
    Math.round(input.depth * 100),
    Math.round(input.dome * 100),
    Math.round(input.splay * 1000),
    Math.round(input.glow * 1000),
    Math.round(input.edge * 1000),
    Math.round((input.maxSlope ?? 0) * 100),
  ].join("-");
}

