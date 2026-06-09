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
  blur: number;
  mapSize: number;
}

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
  computeLensGeometry(input: GeometryInput): LensGeometry;
}

export interface LiquidGlassEngineOptions {
  mode?: LiquidGlassEngineMode;
}
