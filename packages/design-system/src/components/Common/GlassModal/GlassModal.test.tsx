import { describe, expect, it } from "vitest";

import { DEFAULT_MODAL_GLASS_SETTINGS } from "./index";

describe("DEFAULT_MODAL_GLASS_SETTINGS", () => {
  it("authors maxSlope explicitly instead of inheriting the engine default", () => {
    expect("maxSlope" in DEFAULT_MODAL_GLASS_SETTINGS.lens).toBe(true);
    expect(DEFAULT_MODAL_GLASS_SETTINGS.lens.maxSlope).toBe(1.4);
  });

  it("leaves mapSize to autoMapSize", () => {
    expect("mapSize" in DEFAULT_MODAL_GLASS_SETTINGS.lens).toBe(false);
  });

  it("pins the tuned preset optics (verified unclamped at default modal sizes)", () => {
    expect(DEFAULT_MODAL_GLASS_SETTINGS.lens).toMatchObject({
      radius: 22,
      scaleX: 40,
      scaleY: 40,
      chroma: 1.2,
      depth: 20,
      dome: 100,
      splay: 0.72,
      glow: 1.15,
      edge: 0.9,
      blur: 12,
    });
  });
});
