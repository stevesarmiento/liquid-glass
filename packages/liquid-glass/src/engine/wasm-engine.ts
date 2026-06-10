import { normalizeLensParams } from "./defaults";
import { generateMergedDisplacementMap } from "./merged";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type {
  GeometryInput,
  LensGeometry,
  LensParams,
  LiquidGlassEngine,
  MergedMapInput,
} from "./types";

interface WasmModule {
  default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
  generateDisplacementMap(params: Partial<LensParams>): Uint8Array;
  generateMergedDisplacementMap(input: MergedMapInput): Uint8Array;
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
    generateMergedDisplacementMap(input) {
      // Delegate to TS while the wasm module loads, and for the empty-lenses
      // case so the canonical Error is thrown.
      if (!wasmModule || input.lenses.length === 0) {
        return generateMergedDisplacementMap(input);
      }
      const { width, height } = mergedMapDimensions(input);
      const rgba = wasmModule.generateMergedDisplacementMap(input);
      if (rgba.length !== width * height * 4) {
        return generateMergedDisplacementMap(input);
      }
      return { width, height, rgba: new Uint8ClampedArray(rgba) };
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

/**
 * Mirrors the map sizing in merged.ts/merged.rs: longest side = mapSize,
 * the other side scaled by the region aspect (min 8).
 */
function mergedMapDimensions(input: MergedMapInput): { width: number; height: number } {
  const mapSize = normalizeLensParams(input.lens).mapSize;
  const regionWidth = Math.max(1, input.regionWidth);
  const regionHeight = Math.max(1, input.regionHeight);
  if (regionWidth >= regionHeight) {
    return { width: mapSize, height: Math.max(8, Math.round((mapSize * regionHeight) / regionWidth)) };
  }
  return { width: Math.max(8, Math.round((mapSize * regionWidth) / regionHeight)), height: mapSize };
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
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (env === "production" || env === "test") return;
  if (typeof console !== "undefined") {
    console.warn(
      "[liquid-glass] Failed to load the WASM engine; falling back to the TypeScript engine.",
      error,
    );
  }
}
