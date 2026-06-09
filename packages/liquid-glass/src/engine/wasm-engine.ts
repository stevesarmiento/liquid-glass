import { createTsLiquidGlassEngine } from "./ts-engine";
import type { GeometryInput, LensParams, LiquidGlassEngine } from "./types";

interface WasmModule {
  default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
  generateDisplacementMap(params: Partial<LensParams>): Uint8Array;
  computeLensGeometry(input: GeometryInput): unknown;
}

export function createWasmLiquidGlassEngine(): LiquidGlassEngine {
  let wasmModule: WasmModule | null = null;
  const fallback = createTsLiquidGlassEngine();
  const ready = loadWasmModule().then((module) => {
    wasmModule = module;
  });

  return {
    mode: "wasm",
    ready,
    generateDisplacementMap(params) {
      if (!wasmModule) return fallback.generateDisplacementMap(params);
      const rgba = wasmModule.generateDisplacementMap(params);
      return {
        width: params.mapSize,
        height: params.mapSize,
        rgba: new Uint8ClampedArray(rgba),
      };
    },
    computeLensGeometry(input) {
      if (!wasmModule) return fallback.computeLensGeometry(input);
      return wasmModule.computeLensGeometry(input) as ReturnType<WatchedCompute>;
    },
  };
}

type WatchedCompute = LiquidGlassEngine["computeLensGeometry"];

async function loadWasmModule(): Promise<WasmModule> {
  const errors: unknown[] = [];
  for (const modulePath of ["../wasm/liquid_glass_core.js", "../../wasm/liquid_glass_core.js"]) {
    try {
      const module = (await import(/* @vite-ignore */ modulePath)) as WasmModule;
      await module.default();
      return module;
    } catch (error) {
      errors.push(error);
    }
  }

  throw new Error(`Unable to load liquid-glass WASM module: ${errors.map(String).join("; ")}`);
}
