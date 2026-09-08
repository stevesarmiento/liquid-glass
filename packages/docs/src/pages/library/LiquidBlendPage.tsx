import styled from "styled-components";

import CodeBlock from "../../components/CodeBlock";
import LiquidBlendDemo from "../../components/LiquidBlendDemo";

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const List = styled.ul`
  display: grid;
  gap: 8px;
  max-width: 680px;
  margin: 0;
  padding-left: 18px;
  color: rgba(17, 17, 17, 0.68);
  font-size: 15px;
  line-height: 1.65;
`;

const EXAMPLE = `import { createLiquidGlassController } from "liquid-glass";

const controller = createLiquidGlassController({
  container,
  source,
  target,
  mode: "target",
  sourceImageUrl: "/scene.jpg", // required for merged rendering
  lens: { width: 120, height: 120, radius: 60 }, // shared optics + defaults
  blend: 40, // smooth-union distance in px (DEFAULT_MERGED_BLEND, exported)
  tint: "aqua", // chrome drawn by the shader from the merged SDF
  lenses: [
    { position: { x: 0.35, y: 0.5 } },
    { position: { x: 0.65, y: 0.5 }, width: 80, height: 80, radius: 28 },
  ],
});

// Drag one circle without re-normalizing everything: setLensPosition is the
// rAF-batched fast path (one apply per frame, latest position wins).
let dragIndex = -1;
stage.addEventListener("pointerdown", (event) => {
  dragIndex = nearestLensIndex(event); // pick the circle under the pointer
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (dragIndex === -1) return;
  controller.setLensPosition(dragIndex, {
    x: (event.clientX - stageRect.left) / stageRect.width,
    y: (event.clientY - stageRect.top) / stageRect.height,
    unit: "normalized",
  });
});
stage.addEventListener("pointerup", () => {
  dragIndex = -1; // commit: state already lives in the controller
});`;

export default function LiquidBlendPage() {
  return (
    <Stack>
      <div>
        <h1>Liquid blend</h1>
        <p>
          Passing two or more entries in lenses (up to 4) renders them as one merged “liquid blend”
          blob — the metaball effect. Per-lens rounded-rect SDFs are joined with a smooth union
          (smooth-min, controlled by blend in px) and a single merged displacement map covers the
          lenses' bounding region. The union is overlap-aware, so stacking lenses doesn't bloat the
          refraction where they intersect. The map's alpha channel encodes a signed-distance band
          around the blob edge (±40px, exported as MERGED_ALPHA_DISTANCE_RANGE), which the renderers
          decode back into a crisp antialiased mask — and which the WebGL shader also uses to draw
          the glass chrome directly from the merged SDF: backdrop saturation, tint fill, a per-lens
          interior highlight glow, border band, an angular rim highlight, and a drop shadow
          composited under the blob. The chrome merges with the metaball instead of being separate
          DOM circles.
        </p>
      </div>

      <div>
        <h2>Demo</h2>
        <p style={{ marginBottom: 12 }}>
          Drag either circle — they merge as they approach. The slider adjusts the smooth-union
          blend distance.
        </p>
        <LiquidBlendDemo />
      </div>

      <div>
        <h2>Example</h2>
        <CodeBlock>{EXAMPLE}</CodeBlock>
      </div>

      <div>
        <h2>Constraints</h2>
        <List>
          <li>
            Merged mode needs a pixel-readable scene, so it requires sourceImageUrl and always
            renders through the WebGL/canvas overlay. With renderer "auto" (or "webgl") it prefers
            WebGL on all browsers — not just Safari — and falls back to the CPU canvas when WebGL2
            is unavailable.
          </li>
          <li>
            SVG / live-DOM scenes cannot be merged: with renderer "svg" or without sourceImageUrl,
            the controller warns once (dev only) and renders only the first lens through the
            regular single-lens path.
          </li>
          <li>
            Perf: the merged map is cached by a key that quantizes lens offsets relative to the
            first lens to 1px, so a static blob — or the whole group translating together — reuses
            the cached map. Dragging one lens relative to the others regenerates the map each
            (rAF-batched) frame; keep lens.mapSize moderate if that matters.
          </li>
          <li>
            A single lenses entry behaves exactly like position plus the optional per-lens
            width/height/radius overrides; setLensPosition(0, ...) also works in plain single-lens
            mode as an alias of setPosition.
          </li>
          <li>
            The CPU canvas fallback draws the same saturation + fill + interior glow + border +
            drop shadow but shades the border flat (no rim highlight). Single-lens paths ignore
            tint entirely.
          </li>
        </List>
      </div>

      <div>
        <h2>Tuning blend</h2>
        <p>
          blend is the smooth-union distance k, in px: 0 yields a hard union (circles touch with a
          crease), small values (10–25) give a subtle meniscus where the lenses meet, the default 40
          reads as classic liquid merging, and large values (60–120) make the lenses attract from
          far apart and pull into a single blob early. Scale it with the lens size — roughly a
          quarter to a half of the smaller lens diameter is a good starting range — and remember the
          shadow/chrome lives inside the ±40px alpha band, so extreme blends mostly affect the
          refraction shape, not the chrome thickness.
        </p>
      </div>
    </Stack>
  );
}
