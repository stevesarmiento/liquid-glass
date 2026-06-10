import { normalizeLensParams } from "./defaults";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type { LensParams, LiquidGlassEngine } from "./types";

export interface ParityResult {
  /** Byte-for-byte identical. */
  exact: boolean;
  /**
   * Within the parity tolerance (default ±1 LSB per channel). The Rust engine
   * computes in f32 while the TS engine uses f64 doubles, and transcendental
   * functions (tanh, pow) are implementation-defined in JS — values landing on
   * a rounding tie can differ by one least-significant bit. A 1/255 delta in a
   * displacement channel is sub-0.1px at typical scales and visually
   * imperceptible, so ±1 is the contractual bound.
   */
  equal: boolean;
  mismatchCount: number;
  firstMismatchIndex: number | null;
  maxDelta: number;
}

export const PARITY_TOLERANCE = 1;

export async function compareEngineOutput(
  engine: LiquidGlassEngine,
  lens: Partial<LensParams> = {},
  tolerance: number = PARITY_TOLERANCE,
): Promise<ParityResult> {
  await engine.ready;
  const params = normalizeLensParams(lens);
  const ts = createTsLiquidGlassEngine().generateDisplacementMap(params).rgba;
  const other = engine.generateDisplacementMap(params).rgba;
  return compareMapBytes(ts, other, tolerance);
}

export function compareMapBytes(
  expected: Uint8Array | Uint8ClampedArray,
  actual: Uint8Array | Uint8ClampedArray,
  tolerance: number = PARITY_TOLERANCE,
): ParityResult {
  let mismatchCount = 0;
  let firstMismatchIndex: number | null = null;
  let maxDelta = 0;

  if (expected.length !== actual.length) {
    return {
      exact: false,
      equal: false,
      mismatchCount: Math.max(expected.length, actual.length),
      firstMismatchIndex: 0,
      maxDelta: Number.POSITIVE_INFINITY,
    };
  }

  for (let i = 0; i < expected.length; i += 1) {
    const delta = Math.abs(expected[i] - actual[i]);
    if (delta > 0) {
      mismatchCount += 1;
      firstMismatchIndex ??= i;
      if (delta > maxDelta) {
        maxDelta = delta;
      }
    }
  }

  return {
    exact: mismatchCount === 0,
    equal: maxDelta <= tolerance,
    mismatchCount,
    firstMismatchIndex,
    maxDelta,
  };
}
