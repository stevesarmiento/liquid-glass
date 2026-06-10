import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseCssColor, resolveGlassTint } from "../../web/tints";

import { useGlassHoverTint, type GlassHoverTint, type GlassHoverTintOptions } from "./useGlassHoverTint";

function Harness({
  tint,
  options,
  onRender,
}: {
  tint: Parameters<typeof useGlassHoverTint>[0];
  options?: GlassHoverTintOptions;
  onRender: (result: GlassHoverTint) => void;
}) {
  onRender(useGlassHoverTint(tint, options));
  return null;
}

describe("useGlassHoverTint", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: GlassHoverTint;

  const mount = (tint: Parameters<typeof useGlassHoverTint>[0], options?: GlassHoverTintOptions) => {
    act(() => {
      root.render(<Harness onRender={(result) => (latest = result)} options={options} tint={tint} />);
    });
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("resolves the resting tint and derives a denser, more saturated hover tint", () => {
    mount("frost", { opacityBoost: 0.06, saturationScale: 1.4 });

    const resting = resolveGlassTint("frost");
    expect(latest.restingTint).toEqual(resting);

    const restingAlpha = parseCssColor(resting.background)?.[3] ?? 0;
    const hoverAlpha = parseCssColor(latest.hoverTint.background)?.[3] ?? 0;
    expect(hoverAlpha).toBeCloseTo(Math.min(1, restingAlpha + 0.06), 2);
    expect(latest.hoverTint.saturation).toBeCloseTo(Math.min(2.5, resting.saturation * 1.4), 10);
    // Everything else carries over from the resting tint.
    expect(latest.hoverTint.border).toBe(resting.border);
    expect(latest.hoverTint.highlight).toBe(resting.highlight);
  });

  it("clamps the boosted saturation and background alpha", () => {
    mount({ color: "#ff0000", opacity: 0.97, saturation: 2.4 }, { saturationScale: 2 });

    expect(latest.hoverTint.saturation).toBe(2.5);
    const hoverAlpha = parseCssColor(latest.hoverTint.background)?.[3] ?? 0;
    expect(hoverAlpha).toBeLessThanOrEqual(1);
  });

  it("keeps tint identities stable across re-renders with equal inputs", () => {
    mount("aqua");
    const first = latest;
    mount("aqua");
    expect(latest.restingTint).toBe(first.restingTint);
    expect(latest.hoverTint).toBe(first.hoverTint);
  });
});
