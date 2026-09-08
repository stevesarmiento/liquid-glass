import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeLensParams, quantizeLensSizeUp } from "../engine/defaults";
import type { ResolvedLensParams } from "../engine/types";
import { countMapSettleRebuild, countMapTransientHold } from "../web/perf-stats";

/** Quiet time after the last size change before regenerating at exact size. */
export const DEFAULT_RESIZE_SETTLE_MS = 120;

interface TransientState {
  width: number;
  height: number;
  lastChangeAt: number;
  transient: boolean;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Returns the lens to use for DISPLACEMENT-MAP lookups (never for geometry):
 * during a rapid resize burst — width/height changes closer together than
 * `settleMs` — the returned lens has its size snapped UP to a coarse
 * geometric grid (`quantizeLensSizeUp`), so a continuous morph touches a
 * handful of map cache keys instead of one per frame, and a repeat morph
 * between the same endpoints touches zero. All render paths sample the map
 * in normalized lens space, so the quantized map stretches over the exact
 * box for free. After `settleMs` of size stability the exact lens is
 * returned again (one final map generation).
 *
 * The first size change of a burst stays exact (one-off relayouts pay
 * nothing), press/deformation animations never enter transient mode (they
 * animate scaleX/scaleY and quantized glow, not the lens box), and
 * `settleMs <= 0` disables the behavior entirely.
 */
export function useTransientMapLens(
  lens: ResolvedLensParams,
  settleMs: number = DEFAULT_RESIZE_SETTLE_MS,
): ResolvedLensParams {
  const [, setSettledTick] = useState(0);
  const stateRef = useRef<TransientState | null>(null);
  stateRef.current ??= {
    width: lens.width,
    height: lens.height,
    lastChangeAt: -Infinity,
    transient: false,
  };
  const state = stateRef.current;

  // Render-phase burst detection; comparison-guarded so StrictMode's double
  // render (same lens) never re-enters this branch.
  if (settleMs > 0 && (lens.width !== state.width || lens.height !== state.height)) {
    const at = now();
    state.transient = at - state.lastChangeAt < settleMs;
    state.lastChangeAt = at;
    state.width = lens.width;
    state.height = lens.height;
  }
  const transient = settleMs > 0 && state.transient;
  const quantizedWidth = transient ? quantizeLensSizeUp(lens.width) : lens.width;
  const quantizedHeight = transient ? quantizeLensSizeUp(lens.height) : lens.height;

  const mapLens = useMemo(
    () =>
      quantizedWidth === lens.width && quantizedHeight === lens.height
        ? lens
        : normalizeLensParams({ ...lens, width: quantizedWidth, height: quantizedHeight }),
    [lens, quantizedWidth, quantizedHeight],
  );

  // Settle timer: after `settleMs` without a size change, drop back to the
  // exact lens (the re-render regenerates one exact-size map).
  useEffect(() => {
    if (settleMs <= 0 || !stateRef.current?.transient) return;
    const id = setTimeout(() => {
      const current = stateRef.current;
      if (!current?.transient) return;
      current.transient = false;
      countMapSettleRebuild();
      setSettledTick((tick) => tick + 1);
    }, settleMs);
    return () => clearTimeout(id);
  }, [lens.width, lens.height, settleMs]);

  useEffect(() => {
    if (mapLens !== lens) countMapTransientHold();
  }, [mapLens, lens]);

  return mapLens;
}
