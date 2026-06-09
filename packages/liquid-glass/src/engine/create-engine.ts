import { normalizeLensParams } from "./defaults";
import { createTsLiquidGlassEngine } from "./ts-engine";
import { createWasmLiquidGlassEngine } from "./wasm-engine";
import type { LiquidGlassEngine, LiquidGlassEngineOptions } from "./types";

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
    computeLensGeometry(input) {
      return active.computeLensGeometry(input);
    },
  };
}
