export {
  DEFAULT_LENS_PARAMS,
  LENS_PARAM_LIMITS,
  QUANT_STEPS_PER_OCTAVE,
  autoMapSize,
  normalizeLensParams,
  quantizeLensSizeUp,
  type LensParamLimit,
} from "./engine/defaults";
export {
  DEFAULT_LENS_PROFILE,
  deriveLensParams,
  type DerivedLensParams,
  type LensSizeProfile,
  type RatioTerm,
} from "./engine/derive";
export { createLiquidGlassEngine, getSharedLiquidGlassEngine } from "./engine/create-engine";
export {
  clearDisplacementMapCache,
  configureDisplacementMapCache,
  displacementMapCacheKey,
  getCachedDisplacementMap,
  getDisplacementMapCacheStats,
  type DisplacementMapCacheOptions,
  type DisplacementMapCacheStats,
} from "./engine/map-cache";
export {
  clearMapUrlCache,
  configureMapUrlCache,
  getCachedDisplacementMapPngUrl,
  getMapUrlCacheStats,
  type MapUrlCacheOptions,
  type MapUrlCacheStats,
} from "./web/map-url-cache";
export {
  countMapGeneratedOutsideCache,
  getGlassPerfSnapshot,
  resetGlassPerfCounters,
  type GlassDrawBackend,
  type GlassPerfSnapshot,
} from "./web/perf-stats";
export {
  createRenderGate,
  type RenderGate,
  type RenderGateOptions,
} from "./web/render-gate";
export {
  createGlassQualityGovernor,
  getGlassQualityLevel,
  resetGlassQualityForTests,
  setGlassQualityOverride,
  subscribeGlassQuality,
  type GlassQualityGovernorOptions,
  type GlassQualityLevel,
} from "./web/quality";
export {
  colorMatrixForScale,
  colorMatrixStringForScale,
  computeLensGeometry,
  createTsLiquidGlassEngine,
  generateDisplacementMap,
  mapKey,
  roundedRectSdf,
  targetBleed,
} from "./engine/ts-engine";
export {
  MERGED_ALPHA_DISTANCE_RANGE,
  generateMergedDisplacementMap,
  mergedMapKey,
} from "./engine/merged";
export {
  clampLensScales,
  clampMergedScales,
  clampScalesForMap,
  computeLensMapTexelSlope,
  computeMergedMapTexelSlope,
  type ClampLensScalesOptions,
  type ClampScalesInput,
  type ClampedScales,
  type MapTexelSlope,
} from "./engine/map-slope";
export { PARITY_TOLERANCE, compareEngineOutput, compareMapBytes } from "./engine/parity";
export type { ParityResult } from "./engine/parity";
// Pure material-physics utilities (no DOM, no React) shared with the
// material-behavior hooks in liquid-glass/react.
export { createSpring, rubberband, type Spring, type SpringConfig } from "./react/material/spring";
export {
  getGlassFilterBleed,
  getGlassFilterPrimitiveVersion,
  getGlassFilterVersion,
} from "./web/filter-version";
export { isSafari } from "./web/is-safari";
export { renderLocalGlassCanvas } from "./web/local-canvas";
export {
  GLASS_TINTS,
  createGlassTint,
  parseCssColor,
  resolveGlassTint,
  withTintBackgroundAlpha,
} from "./web/tints";
export type {
  ActiveLiquidGlassEngineMode,
  DisplacementMap,
  GeometryInput,
  LensGeometry,
  LensParams,
  LensPosition,
  LensPositionUnit,
  LiquidGlassEngine,
  LiquidGlassEngineMode,
  LiquidGlassEngineOptions,
  LiquidGlassRenderMode,
  MergedLensShape,
  MergedMapInput,
  ResolvedLensParams,
} from "./engine/types";
export type {
  GlassCanvasSource,
  GlassCanvasSourceInput,
  GlassNodeMetrics,
  GlassRendererMode,
  LocalGlassCanvasRenderInput,
  LocalGlassCanvasRenderResult,
} from "./web/local-canvas";
export type { GlassTint, GlassTintInput, GlassTintName, GlassTintPreset, ParsedCssColor } from "./web/tints";
export {
  DEFAULT_MERGED_BLEND,
  createLiquidGlassController,
  type LensInstanceInput,
  type LiquidGlassController,
  type LiquidGlassControllerOptions,
  type LiquidGlassControllerStats,
  type LiquidGlassRenderer,
} from "./web/controller";
export {
  createWebglGlassRenderer,
  type WebglGlassChrome,
  type WebglGlassDrawInput,
  type WebglGlassLensRect,
  type WebglGlassRenderer,
  type WebglGlassRendererOptions,
  type WebglGlassSceneSource,
  type WebglGlassViewport,
} from "./web/webgl-renderer";
export {
  buildLocalGlassDrawInput,
  renderLocalGlassWebgl,
  type LocalGlassDrawBuild,
  type LocalGlassDrawSpec,
  type LocalGlassWebglRenderInput,
} from "./web/webgl-local";
export {
  createGlassCompositor,
  getSharedGlassCompositor,
  resetSharedGlassCompositorForTests,
  type CreateGlassCompositorOptions,
  type GlassCompositor,
  type GlassCompositorInstance,
  type GlassCompositorTarget,
} from "./web/glass-compositor";
export {
  boxMatchedSigma,
  gaussianBlurKernel,
  type GaussianBlurKernel,
} from "./web/webgl-shaders";
