import { describe, expect, it } from "vitest";

import {
  GLASS_TINTS,
  createGlassTint,
  parseCssColor,
  resolveGlassTint,
  withTintBackgroundAlpha,
} from "./tints";

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

describe("parseCssColor", () => {
  it("parses rgba() with spaces (the format this module produces)", () => {
    expect(parseCssColor("rgba(72, 186, 190, 0.16)")).toEqual([72 / 255, 186 / 255, 190 / 255, 0.16]);
    expect(parseCssColor("rgba(255,255,255,0.5)")).toEqual([1, 1, 1, 0.5]);
    expect(parseCssColor("  rgba( 0 , 0 , 0 , 0 )  ")).toEqual([0, 0, 0, 0]);
  });

  it("parses rgb() with an implicit opaque alpha", () => {
    expect(parseCssColor("rgb(18, 52, 86)")).toEqual([18 / 255, 52 / 255, 86 / 255, 1]);
  });

  it("parses #rgb, #rrggbb, and #rrggbbaa hex colors", () => {
    expect(parseCssColor("#fff")).toEqual([1, 1, 1, 1]);
    expect(parseCssColor("#123456")).toEqual([18 / 255, 52 / 255, 86 / 255, 1]);
    expect(parseCssColor("#12345680")).toEqual([18 / 255, 52 / 255, 86 / 255, 128 / 255]);
    expect(parseCssColor("#FFFFFF")).toEqual([1, 1, 1, 1]);
  });

  it("clamps out-of-range channels and alpha", () => {
    expect(parseCssColor("rgba(300, -4, 128, 2)")).toEqual([1, 0, 128 / 255, 1]);
  });

  it("returns null for formats it does not understand", () => {
    expect(parseCssColor("white")).toBeNull();
    expect(parseCssColor("hsl(0, 0%, 100%)")).toBeNull();
    expect(parseCssColor("#12")).toBeNull();
    expect(parseCssColor("#nothex")).toBeNull();
    expect(parseCssColor("rgba(1, 2)")).toBeNull();
    expect(parseCssColor("")).toBeNull();
  });

  it("parses every color the built-in presets and createGlassTint produce", () => {
    for (const preset of Object.values(GLASS_TINTS)) {
      expect(parseCssColor(preset.background)).not.toBeNull();
      expect(parseCssColor(preset.border)).not.toBeNull();
      expect(parseCssColor(preset.highlight)).not.toBeNull();
      expect(parseCssColor(preset.shadow)).not.toBeNull();
    }
    const custom = createGlassTint({ color: "#6fd7d0", opacity: 0.12, highlightOpacity: 0.4 });
    expect(parseCssColor(custom.background)).not.toBeNull();
    expect(parseCssColor(custom.border)).not.toBeNull();
    expect(parseCssColor(custom.highlight)).not.toBeNull();
  });
});
