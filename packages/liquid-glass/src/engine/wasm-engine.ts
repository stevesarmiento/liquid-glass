import { createTsLiquidGlassEngine } from "./ts-engine";
import type { GeometryInput, LensGeometry, LensParams, LiquidGlassEngine } from "./types";

interface WasmModule {
  default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
  generateDisplacementMap(params: Partial<LensParams>): Uint8Array;
  computeLensGeometry(input: GeometryInput): unknown;
}

const GEOMETRY_KEYS: Array<keyof LensGeometry> = [
  "left",
  "top",
  "width",
  "height",
  "radius",
  "filterX",
  "filterY",
  "filterWidth",
  "filterHeight",
  "bleed",
];

let warnedLoadFailure = false;

export function createWasmLiquidGlassEngine(): LiquidGlassEngine {
  let wasmModule: WasmModule | null = null;
  const fallback = createTsLiquidGlassEngine();
  const ready = loadWasmModule().then(
    (module) => {
      wasmModule = module;
    },
    (error) => {
      warnLoadFailureOnce(error);
      throw error;
    },
  );

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
      const result = wasmModule.computeLensGeometry(input);
      // Values crossing the WASM boundary are untyped; fall back to the TS
      // engine if anything is missing or non-finite.
      if (!isValidGeometry(result)) return fallback.computeLensGeometry(input);
      return result;
    },
  };
}

function isValidGeometry(value: unknown): value is LensGeometry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return GEOMETRY_KEYS.every((key) => {
    const candidate = record[key];
    return typeof candidate === "number" && Number.isFinite(candidate);
  });
}

async function loadWasmModule(): Promise<WasmModule> {
  // "#wasm" is a Node subpath import (package.json "imports") that resolves
  // to ./wasm/liquid_glass_core.js. Node, Vite, webpack 5, and esbuild all
  // understand it, so the wasm-pack glue stays statically resolvable and the
  // `new URL("liquid_glass_core_bg.wasm", import.meta.url)` inside the glue
  // can be handled by bundlers.
  const module = (await import("#wasm")) as WasmModule;
  await module.default();
  return module;
}

function warnLoadFailureOnce(error: unknown): void {
  if (warnedLoadFailure) return;
  warnedLoadFailure = true;
  const env =
    typeof process !== "undefined" && process.env ? process.env.NODE_ENV : undefined;
  if (env === "production" || env === "test") return;
  if (typeof console !== "undefined") {
    console.warn(
      "[liquid-glass] Failed to load the WASM engine; falling back to the TypeScript engine.",
      error,
    );
  }
}
