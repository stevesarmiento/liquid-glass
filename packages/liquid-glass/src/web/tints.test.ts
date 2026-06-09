import { describe, expect, it } from "vitest";

import { createGlassTint, resolveGlassTint } from "./tints";

describe("glass tints", () => {
  it("creates dynamic rgba tint values from user input", () => {
    const tint = createGlassTint({
      color: "#123456",
      opacity: 0.1234,
      borderOpacity: 0.45,
      highlightOpacity: 0.67,
      shadowOpacity: 0.2,
      saturation: 1.42,
    });

    expect(tint).toEqual({
      background: "rgba(18, 52, 86, 0.123)",
      border: "rgba(18, 52, 86, 0.45)",
      highlight: "rgba(255, 255, 255, 0.67)",
      shadow: "rgba(0, 0, 0, 0.2)",
      saturation: 1.42,
    });
  });

  it("still resolves built-in presets", () => {
    expect(resolveGlassTint("aqua").name).toBe("aqua");
  });
});
