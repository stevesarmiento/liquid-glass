export type LiquidGlassEngineMode = "auto" | "wasm" | "ts";
export type ActiveLiquidGlassEngineMode = "wasm" | "ts";
export type LensPositionUnit = "normalized" | "px";
export type LiquidGlassRenderMode = "source" | "target";

export interface LensParams {
  width: number;
  height: number;
  radius: number;
  scaleX: number;
  scaleY: number;
  chroma: number;
  depth: number;
  dome: number;
  splay: number;
  glow: number;
  edge: number;
  /** Width of the diagonal glow band, in normalized units. Default 0.62. */
  glowSpread?: number;
  /** Exponent applied to the glow ramp. Default 1.5. */
  glowExponent?: number;
  /** Exponent applied to the edge highlight ramp. Default 1.2. */
  edgeExponent?: number;
  /** Rotation of the specular highlight axis, in degrees. Default 45. */
  specularRotation?: number;
  /**
   * Upper bound on the rendered displacement field's spatial gradient, in
   * px of displacement per px of screen. Above 1 the sampled backdrop folds
   * over itself (mirroring artifacts near edges); renderers soft-limit the
   * effective scale so the measured map slope stays below this cap.
   *
   * The default is 1.4, not 1: the reference (Aave) defaults preset itself
   * peaks at ~1.29 on the short axis — a ~2px mirrored band inside the edge
   * ring that is part of the shipped look — so the default cap sits just
   * above it and only reins in grossly folding configurations (small lenses,
   * low depth, high scale reach 2–18 unclamped). Set ≤ 0.95 for strictly
   * fold-free optics; ~100 effectively disables the guard.
   */
  maxSlope?: number;
  blur: number;
  mapSize: number;
}

/** Lens params with every optional field resolved to a concrete value. */
export type ResolvedLensParams = Required<LensParams>;

export interface MergedLensShape {
  /** Lens center, in region px coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export interface MergedMapInput {
  regionWidth: number;
  regionHeight: number;
  /** 1–4 lens shapes, in region coordinates. */
  lenses: MergedLensShape[];
  /** Smooth-union blend distance k in px (0 = hard union). */
  blend: number;
  /** Shared optical params; width/height/radius/splay are ignored. */
  lens: Partial<LensParams>;
}

/**
 * Generated displacement map. Maps returned by the global map cache
 * (`getCachedDisplacementMap`) are SHARED across consumers and must be
 * treated as immutable — mutating `rgba` in place would corrupt every other
 * consumer and silently skip GPU texture re-uploads (renderers cache uploads
 * by map identity).
 */
export interface DisplacementMap {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface LensPosition {
  x: number;
  y: number;
  unit?: LensPositionUnit;
}

export interface GeometryInput {
  containerWidth: number;
  containerHeight: number;
  x: number;
  y: number;
  unit?: LensPositionUnit;
  mode?: LiquidGlassRenderMode;
  lens: LensParams;
}

export interface LensGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  filterX: number;
  filterY: number;
  filterWidth: number;
  filterHeight: number;
  bleed: number;
}

export interface LiquidGlassEngine {
  readonly mode: ActiveLiquidGlassEngineMode;
  readonly ready: Promise<void>;
  generateDisplacementMap(params: LensParams): DisplacementMap;
  /**
   * Generates a multi-lens "liquid blend" (metaball) displacement map. The
   * map may be non-square (longest side = mapSize, other side scaled by the
   * region aspect ratio). Alpha carries antialiased blob coverage. `splay`
   * is ignored in merged mode.
   */
  generateMergedDisplacementMap?(input: MergedMapInput): DisplacementMap;
  computeLensGeometry(input: GeometryInput): LensGeometry;
}

export interface LiquidGlassEngineOptions {
  mode?: LiquidGlassEngineMode;
}
