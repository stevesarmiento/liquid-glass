import { normalizeLensParams } from "./defaults";
import { createTsLiquidGlassEngine } from "./ts-engine";
import type { LensParams, LiquidGlassEngine } from "./types";

export interface ParityResult {
  equal: boolean;
  mismatchCount: number;
  firstMismatchIndex: number | null;
}

export async function compareEngineOutput(
  engine: LiquidGlassEngine,
  lens: Partial<LensParams> = {},
): Promise<ParityResult> {
  await engine.ready;
  const params = normalizeLensParams(lens);
  const ts = createTsLiquidGlassEngine().generateDisplacementMap(params).rgba;
  const other = engine.generateDisplacementMap(params).rgba;
  let mismatchCount = 0;
  let firstMismatchIndex: number | null = null;

  for (let i = 0; i < ts.length; i += 1) {
    if (ts[i] !== other[i]) {
      mismatchCount += 1;
      firstMismatchIndex ??= i;
    }
  }

  return {
    equal: mismatchCount === 0,
    mismatchCount,
    firstMismatchIndex,
  };
}
