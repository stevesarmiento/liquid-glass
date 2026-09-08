import type { LensParams } from "liquid-glass";

/**
 * Outward sampling reach of a demagnifying lens, in px: a NEGATIVE scale
 * samples past the lens edge by up to |scale| / 2, boosted by chroma\'s
 * R-channel factor (1 + 0.2c). Component-local glass renders a clone of the
 * component\'s own content as its source world — without padding, outward
 * samples run off the clone\'s edge and the demagnified rim shows the edge
 * of the source instead of backdrop. Returns 0 for non-negative scales, so
 * magnifying looks pay nothing.
 *
 * `extraMargin` covers lens overhang past the source box (e.g. the switch\'s
 * active thumb renders at 1.85\u00d7 the preset lens and pokes past the control).
 */
export function glassSourcePad(
  lens: Partial<Pick<LensParams, "scaleX" | "scaleY" | "chroma" | "blur">>,
  extraMargin = 0,
  /**
   * Extra sampling reach from a source zoom-out (GlassNode sourceZoom < 1):
   * pass (1 / zoom - 1) * max(lensWidth, lensHeight) / 2. A zoomed-out rim
   * shows source content from beyond the lens box, so the source world must
   * extend at least that far.
   */
  zoomReach = 0,
): number {
  const chromaFactor = 1 + 0.2 * Math.max(0, lens.chroma ?? 0);
  const reach = (scale: number | undefined) =>
    scale !== undefined && scale < 0 ? (Math.abs(scale) / 2) * chromaFactor : 0;
  const maxReach = Math.max(reach(lens.scaleX), reach(lens.scaleY)) + Math.max(0, zoomReach);
  const margin = Math.max(0, extraMargin);
  // Pad when the lens samples outward (negative scale / zoom-out) OR simply
  // OVERHANGS the source box (extraMargin — e.g. the switch's active thumb is
  // taller than its control): an overhanging strip samples beyond the source
  // regardless of scale sign and renders as a washed-out band otherwise.
  if (maxReach <= 0 && margin <= 0) return 0;
  // 3 sigma of the pre-displacement Gaussian blur + safety, mirroring the
  // engine's bleed formulas (targetBleed / getGlassFilterBleed): without it,
  // rim pixels sample EXACTLY at the source edge and the blur smears that
  // edge into a visible fringed line just inside the demagnified rim.
  const blurMargin = 3 * Math.max(0, lens.blur ?? 0) + 4;
  return Math.ceil(maxReach + blurMargin + margin);
}
