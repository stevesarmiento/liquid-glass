import { describe, expect, it } from "vitest";

import {
  getGlassFilterBleed,
  getGlassFilterPrimitiveVersion,
  getGlassFilterVersion,
} from "./filter-version";

describe("glass filter utilities", () => {
  it("computes bleed from max displacement, chroma, blur, and padding", () => {
    // ceil(20 * (1 + 0.2 * 0.5) + 2 * 3 + 4) = ceil(22 + 10) = 32
    expect(getGlassFilterBleed({ blur: 2, chroma: 0.5, scaleX: 10, scaleY: 20 })).toBe(32);
  });

  it("generates stable rounded filter version keys", () => {
    expect(
      getGlassFilterVersion({
        blur: 0.25,
        chroma: 0.5,
        depth: 3.5,
        dome: 0,
        edge: 0.75,
        glow: 0.5,
        lensHeight: 34,
        lensWidth: 63,
        mapSize: 256,
        radius: 80,
        scaleX: 38,
        scaleY: 40,
        sourceHeight: 44,
        sourceWidth: 244,
        splay: 0.49,
      }),
    ).toBe("244-44-63-34-8000-256-3800-4000-500-25-350-0-490-500-750-0");
  });

  it("folds maxSlope into the version key", () => {
    const base = {
      blur: 0.25,
      chroma: 0.5,
      depth: 3.5,
      dome: 0,
      edge: 0.75,
      glow: 0.5,
      lensHeight: 34,
      lensWidth: 63,
      mapSize: 256,
      radius: 80,
      scaleX: 38,
      scaleY: 40,
      sourceHeight: 44,
      sourceWidth: 244,
      splay: 0.49,
    };
    expect(getGlassFilterVersion({ ...base, maxSlope: 0.95 })).toBe(
      "244-44-63-34-8000-256-3800-4000-500-25-350-0-490-500-750-95",
    );
    expect(getGlassFilterVersion({ ...base, maxSlope: 0.95 })).not.toBe(
      getGlassFilterVersion({ ...base, maxSlope: 2 }),
    );
  });

  it("primitive version carries no size terms but is sensitive to optics", () => {
    const optics = {
      blur: 0.25,
      chroma: 0.5,
      depth: 3.5,
      dome: 0,
      edge: 0.75,
      glow: 0.5,
      mapSize: 256,
      radius: 80,
      scaleX: 38,
      scaleY: 40,
      splay: 0.49,
      maxSlope: 0.95,
    };
    expect(getGlassFilterPrimitiveVersion(optics)).toBe(
      "8000-256-3800-4000-500-25-350-0-490-500-750-95",
    );
    expect(getGlassFilterPrimitiveVersion(optics)).not.toBe(
      getGlassFilterPrimitiveVersion({ ...optics, scaleX: 39 }),
    );
  });
});

