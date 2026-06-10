import { normalizeLensParams } from "./defaults";
import { createTsLiquidGlassEngine } from "./ts-engine";
import { createWasmLiquidGlassEngine } from "./wasm-engine";
import type { LiquidGlassEngine, LiquidGlassEngineMode, LiquidGlassEngineOptions } from "./types";

const sharedEngines = new Map<LiquidGlassEngineMode, LiquidGlassEngine>();

/**
 * Returns a module-level shared engine for the requested mode, creating it on
 * first use. Components should prefer this over `createLiquidGlassEngine` so
 * N instances do not each construct (and load WASM for) their own engine.
 */
export function getSharedLiquidGlassEngine(options: LiquidGlassEngineOptions = {}): LiquidGlassEngine {
  const mode = options.mode ?? "auto";
  let engine = sharedEngines.get(mode);
  if (!engine) {
    engine = createLiquidGlassEngine({ mode });
    sharedEngines.set(mode, engine);
  }
  return engine;
}

export function createLiquidGlassEngine(options: LiquidGlassEngineOptions = {}): LiquidGlassEngine {
  const requestedMode = options.mode ?? "auto";
  if (requestedMode === "ts") return createTsLiquidGlassEngine();
  if (requestedMode === "wasm") return createWasmLiquidGlassEngine();

  const tsEngine = createTsLiquidGlassEngine();
  let active: LiquidGlassEngine = tsEngine;
  const wasmEngine = createWasmLiquidGlassEngine();
  const ready = wasmEngine.ready.then(
    () => {
      active = wasmEngine;
    },
    () => undefined,
  );

  return {
    get mode() {
      return active.mode;
    },
    ready,
    generateDisplacementMap(params) {
      return active.generateDisplacementMap(normalizeLensParams(params));
    },
    generateMergedDisplacementMap(input) {
      // Both engines implement merged generation today (the WASM engine
      // delegates to TS until the Rust port lands); fall back to the TS
      // engine if a future active engine omits it.
      const generate = active.generateMergedDisplacementMap ?? tsEngine.generateMergedDisplacementMap;
      if (!generate) {
        throw new Error("generateMergedDisplacementMap is not available on the active engine");
      }
      return generate(input);
    },
    computeLensGeometry(input) {
      return active.computeLensGeometry(input);
    },
  };
}
