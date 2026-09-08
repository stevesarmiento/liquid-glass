import { describe, expect, it } from "vitest";

import { DEFAULT_LENS_PARAMS, type ResolvedLensParams } from "liquid-glass";

import { INITIAL_LENS } from "./playgroundConfig";
import { forwardLensOptics, formatLensPresetTs, lensEquals } from "./playgroundUtils";

describe("forwardLensOptics", () => {
  it("forwards every engine optic except geometry", () => {
    // The load-bearing regression guard: a param added to the engine fails
    // this test until the playground forwards it (the old hand-rolled
    // forwarders each silently dropped maxSlope).
    const expected = Object.keys(DEFAULT_LENS_PARAMS)
      .filter((key) => !["width", "height", "radius"].includes(key))
      .sort();
    expect(Object.keys(forwardLensOptics(INITIAL_LENS)).sort()).toEqual(expected);
  });

  it("passes uncapped fields through, including maxSlope", () => {
    const forwarded = forwardLensOptics(INITIAL_LENS);
    expect(forwarded.maxSlope).toBe(16);
    expect(forwarded.scaleX).toBe(INITIAL_LENS.scaleX);
    expect(forwarded.splay).toBe(INITIAL_LENS.splay);
  });

  it("applies caps as a min", () => {
    const forwarded = forwardLensOptics(INITIAL_LENS, { depth: 12, dome: 80, blur: 3, mapSize: 384 });
    expect(forwarded.depth).toBe(Math.min(INITIAL_LENS.depth, 12));
    expect(forwarded.dome).toBe(80);
    expect(forwarded.blur).toBe(Math.min(INITIAL_LENS.blur, 3));
    expect(forwarded.mapSize).toBe(384);
    // Caps never raise a value below them.
    expect(forwardLensOptics({ ...INITIAL_LENS, depth: 5 }, { depth: 12 }).depth).toBe(5);
  });
});

describe("formatLensPresetTs", () => {
  it("emits only fields differing from the baseline, in display order", () => {
    const lens: ResolvedLensParams = { ...DEFAULT_LENS_PARAMS, width: 220, maxSlope: 16 };
    expect(formatLensPresetTs(lens)).toBe(
      [
        "// liquid-glass preset — fields differing from the package defaults",
        "const preset: Partial<LensParams> = {",
        "  width: 220,",
        "  maxSlope: 16,",
        "};",
        "",
      ].join("\n"),
    );
  });

  it("emits an empty body when the lens equals the baseline", () => {
    expect(formatLensPresetTs({ ...DEFAULT_LENS_PARAMS })).toContain("= {\n};");
  });

  it("round-trips: applying the emitted fields to the baseline reproduces the lens", () => {
    const lens = { ...INITIAL_LENS };
    const emitted = formatLensPresetTs(lens);
    const parsed: Partial<Record<string, number>> = {};
    for (const match of emitted.matchAll(/^ {2}(\w+): (-?[\d.]+),$/gm)) {
      parsed[match[1]] = Number(match[2]);
    }
    expect({ ...DEFAULT_LENS_PARAMS, ...parsed }).toEqual(lens);
  });

  it("supports a custom name and baseline", () => {
    const out = formatLensPresetTs(
      { ...INITIAL_LENS, blur: 9 },
      { baseline: INITIAL_LENS, name: "modalLens" },
    );
    expect(out).toContain("const modalLens: Partial<LensParams> = {");
    expect(out).toContain("  blur: 9,");
    expect(out).not.toContain("scaleX");
  });
});

describe("lensEquals", () => {
  it("is true only when every lens field matches", () => {
    expect(lensEquals({ ...INITIAL_LENS }, INITIAL_LENS)).toBe(true);
    expect(lensEquals({ ...INITIAL_LENS, blur: 9 }, INITIAL_LENS)).toBe(false);
  });
});
