import { describe, expect, it } from "vitest";

import { createGlassTint, resolveGlassTint, withTintBackgroundAlpha } from "./tints";

describe("glass tints", () => {
  it("creates dynamic rgba tint values from user input", () => {
    const tint = createGlassTint({
      color: "#123456",
      opacity: 0.1234,
      borderOpacity: 0.45,
      highlightOpacity: 0.67,
      highlightWidth: 1.4,
      highlightHeight: 0.5,
      highlightCore: 0.42,
      highlightSpread: 0.8,
      highlightRotation: 18,
      highlightX: 0.72,
      highlightY: 0.18,
      shadowOpacity: 0.2,
      saturation: 1.42,
    });

    expect(tint).toEqual({
      background: "rgba(18, 52, 86, 0.123)",
      border: "rgba(18, 52, 86, 0.45)",
      highlight: "rgba(255, 255, 255, 0.67)",
      highlightWidth: 1.4,
      highlightHeight: 0.5,
      highlightCore: 0.42,
      highlightSpread: 0.8,
      highlightRotation: 18,
      highlightX: 0.72,
      highlightY: 0.18,
      shadow: "rgba(0, 0, 0, 0.2)",
      saturation: 1.42,
    });
  });

  it("still resolves built-in presets", () => {
    expect(resolveGlassTint("aqua").name).toBe("aqua");
  });

  it("defaults highlight opacity to transparent", () => {
    expect(createGlassTint({ color: "#123456" }).highlight).toBe("rgba(255, 255, 255, 0)");
    expect(resolveGlassTint("clear").highlight).toBe("rgba(255, 255, 255, 0)");
    expect(resolveGlassTint("aqua").highlight).toBe("rgba(221, 255, 255, 0)");
  });

  it("raises the background alpha for reduced-transparency fallbacks", () => {
    const tint = resolveGlassTint("clear");
    const opaque = withTintBackgroundAlpha(tint, 0.85);

    expect(opaque.background).toBe("rgba(255, 255, 255, 0.85)");
    expect(opaque.border).toBe(tint.border);
    expect(tint.background).toBe("rgba(255, 255, 255, 0.045)");
  });

  it("allows custom highlight color independent from the tint body", () => {
    const tint = createGlassTint({
      color: "#123456",
      highlightColor: "#fedcba",
      highlightWidth: 1.3,
      highlightHeight: 0.6,
      highlightCore: 0.25,
      highlightSpread: 0.75,
      highlightRotation: 32,
      highlightX: 0.6,
      highlightY: 0.4,
      highlightOpacity: 0.5,
    });

    expect(tint.highlight).toBe("rgba(254, 220, 186, 0.5)");
    expect(tint.highlightWidth).toBe(1.3);
    expect(tint.highlightHeight).toBe(0.6);
    expect(tint.highlightCore).toBe(0.25);
    expect(tint.highlightSpread).toBe(0.75);
    expect(tint.highlightRotation).toBe(32);
    expect(tint.highlightX).toBe(0.6);
    expect(tint.highlightY).toBe(0.4);
  });
});
