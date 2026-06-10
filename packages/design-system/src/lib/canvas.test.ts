import { describe, expect, it } from "vitest";

import { computeCoverSlice } from "./canvas";

describe("computeCoverSlice", () => {
  it("matches CSS cover for a wide image in a square anchor (height-limited)", () => {
    // 2000x1000 image covering a 400x400 anchor: scale = max(0.2, 0.4) = 0.4,
    // drawn 800x400, centered → x offset (400 - 800) / 2 = -200.
    const slice = computeCoverSlice({
      imageWidth: 2000,
      imageHeight: 1000,
      anchor: { left: 0, top: 0, width: 400, height: 400 },
      target: { left: 0, top: 0 }
    });

    expect(slice).toEqual({ x: -200, y: 0, width: 800, height: 400 });
  });

  it("matches CSS cover for a tall image in a wide anchor (width-limited)", () => {
    // 500x1000 image covering an 800x200 anchor: scale = max(1.6, 0.2) = 1.6,
    // drawn 800x1600, centered → y offset (200 - 1600) / 2 = -700.
    const slice = computeCoverSlice({
      imageWidth: 500,
      imageHeight: 1000,
      anchor: { left: 0, top: 0, width: 800, height: 200 },
      target: { left: 0, top: 0 }
    });

    expect(slice).toEqual({ x: 0, y: -700, width: 800, height: 1600 });
  });

  it("translates the slice by the target's offset within the anchor", () => {
    // Same as the first case, but the target (button) sits at (120, 80)
    // inside the anchor: the drawn image's top-left shifts by -offset so the
    // target's local (0, 0) lands on the exact pixel that is visually behind it.
    const slice = computeCoverSlice({
      imageWidth: 2000,
      imageHeight: 1000,
      anchor: { left: 10, top: 20, width: 400, height: 400 },
      target: { left: 130, top: 100 }
    });

    // Centered cover offset (-200) minus the target's (120, 80) offset within the anchor.
    expect(slice).toEqual({ x: -200 - 120, y: 0 - 80, width: 800, height: 400 });
  });

  it("covers the full anchor: the drawn rect always contains the anchor rect", () => {
    const anchor = { left: 50, top: 60, width: 333, height: 217 };
    const slice = computeCoverSlice({
      imageWidth: 1234,
      imageHeight: 777,
      anchor,
      target: { left: anchor.left, top: anchor.top }
    });

    // Relative to the anchor's own origin, the image must start at or before 0
    // and end at or after the anchor's extent on both axes (within float epsilon).
    const epsilon = 1e-9;
    expect(slice.x).toBeLessThanOrEqual(epsilon);
    expect(slice.y).toBeLessThanOrEqual(epsilon);
    expect(slice.x + slice.width).toBeGreaterThanOrEqual(anchor.width - epsilon);
    expect(slice.y + slice.height).toBeGreaterThanOrEqual(anchor.height - epsilon);
  });
});
