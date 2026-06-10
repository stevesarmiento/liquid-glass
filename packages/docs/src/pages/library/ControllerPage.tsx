import styled from "styled-components";

import CodeBlock from "../../components/CodeBlock";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const OPTION_ROWS: PropRow[] = [
  {
    name: "container",
    type: "HTMLElement",
    description:
      "Host element (required). The controller prepends its SVG filter and appends the canvas/WebGL overlays here; the container is observed with ResizeObserver.",
  },
  {
    name: "source",
    type: "HTMLElement",
    description:
      'Element the SVG filter refracts in "source" mode. In "target" and merged modes it stays visible as the scene behind the overlays.',
  },
  {
    name: "target",
    type: "HTMLElement",
    description:
      'Element refracted in "target" mode (also observed for resizes). Hidden behind the overlay canvas when the webgl/canvas renderers are active.',
  },
  {
    name: "lens",
    type: "Partial<LensParams>",
    defaultValue: "DEFAULT_LENS_PARAMS",
    description: "Shared lens optics. See the Lens params page for every field, default, and clamp.",
  },
  {
    name: "position",
    type: "LensPosition",
    defaultValue: '{ x: 0.5, y: 0.5, unit: "normalized" }',
    description: 'Single-lens position. unit is "normalized" (0–1 of the container) or "px".',
  },
  {
    name: "lenses",
    type: "LensInstanceInput[]",
    description:
      "Multiple lens instances sharing the optics of lens (each entry: position plus optional width/height/radius overrides; up to 4, extras ignored). Two or more entries enable merged “liquid blend” rendering — see the Liquid blend page. A single entry behaves exactly like position.",
  },
  {
    name: "blend",
    type: "number",
    defaultValue: "40",
    description: "Smooth-union blend distance for merged lenses, in px (0 = hard union).",
  },
  {
    name: "tint",
    type: "GlassTintName | GlassTintInput | GlassTint",
    description:
      "Glass chrome for merged rendering, drawn by the shader from the merged blob SDF: backdrop saturation, tint fill, interior highlight glow, border band, angular rim highlight, and a drop shadow. Single-lens paths ignore it.",
  },
  {
    name: "renderer",
    type: '"auto" | "svg" | "canvas" | "webgl"',
    defaultValue: '"auto"',
    description: "Which renderer draws the refraction. See the renderer matrix below.",
  },
  {
    name: "sourceImageUrl",
    type: "string",
    description:
      "Image scene for the webgl/canvas renderers (they refract pixels, not live DOM). Required for merged rendering.",
  },
  {
    name: "mode",
    type: '"source" | "target"',
    defaultValue: '"source"',
    description:
      'Whether the lens geometry is computed against the source element ("source") or positioned as an overlay within the container ("target").',
  },
  {
    name: "engine",
    type: "LiquidGlassEngine",
    defaultValue: 'getSharedLiquidGlassEngine({ mode: "auto" })',
    description: "Displacement-map engine. The shared engine prefers WASM and falls back to TypeScript.",
  },
  {
    name: "safariRefresh",
    type: "boolean",
    defaultValue: "isSafari()",
    description:
      "Cycle the SVG filter id whenever filter internals change so Safari does not render stale output during drags.",
  },
  {
    name: "respectReducedTransparency",
    type: "boolean",
    defaultValue: "true",
    description:
      "Honor prefers-reduced-transparency: reduce by skipping the displacement filter entirely.",
  },
  {
    name: "onStats",
    type: "(stats: LiquidGlassControllerStats) => void",
    description:
      "Called after each apply with { activeEngine, activeRenderer, applyCount, domWrites, lastMapMs, lastApplyMs }.",
  },
];

const METHOD_ROWS: PropRow[] = [
  {
    name: "update(next)",
    type: "(next: Partial<LiquidGlassControllerOptions>) => void",
    description:
      "Merge new options into the controller state. Re-normalizes lens params and re-applies on the next animation frame.",
  },
  {
    name: "setPosition(position)",
    type: "(position: LensPosition) => void",
    description:
      "Fast path for pointer-driven drags: skips full option re-normalization and only swaps the position. Batched — applied once per animation frame.",
  },
  {
    name: "setLensPosition(index, position)",
    type: "(index: number, position: LensPosition) => void",
    description:
      "Fast path for dragging one lens of a multi-lens setup, rAF-batched like setPosition. Index 0 also works in single-lens mode as an alias of setPosition.",
  },
  {
    name: "stats",
    type: "LiquidGlassControllerStats",
    description: "Readonly snapshot of the latest stats (same shape as the onStats payload).",
  },
  {
    name: "destroy()",
    type: "() => void",
    description:
      "Cancels pending frames, disconnects observers, removes the injected SVG/canvas/WebGL elements, releases GPU resources, and clears the styles it set.",
  },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const MatrixWrap = styled.div`
  overflow-x: auto;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
`;

const Matrix = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 10px 14px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(17, 17, 17, 0.08);
  }

  th {
    color: rgba(17, 17, 17, 0.54);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: #fafafa;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  td:first-child {
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  td {
    color: rgba(17, 17, 17, 0.68);
    line-height: 1.5;
  }
`;

export default function ControllerPage() {
  return (
    <Stack>
      <div>
        <h1>createLiquidGlassController</h1>
        <p>
          The scene-level controller drives one or more lenses over arbitrary DOM. It observes its
          container (and target, in target mode) with ResizeObserver and coalesces all updates —
          setPosition, setLensPosition, update, resizes — into a single apply per animation frame.
        </p>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{`import { createLiquidGlassController } from "liquid-glass";

const controller = createLiquidGlassController({
  container,
  source,
  lens: { width: 180, height: 120 },
});

controller.setPosition({ x: 0.5, y: 0.5 }); // batched, applied next frame
controller.destroy(); // cancels pending frames, disconnects observers`}</CodeBlock>
      </div>

      <div>
        <h2>Options</h2>
        <PropsTable rows={OPTION_ROWS} />
      </div>

      <div>
        <h2>Methods</h2>
        <PropsTable rows={METHOD_ROWS} />
      </div>

      <div>
        <h2>Renderers</h2>
        <p style={{ marginBottom: 12 }}>
          The renderer option selects how the refraction is drawn. SVG filters live DOM; webgl and
          canvas refract an image scene (sourceImageUrl).
        </p>
        <MatrixWrap>
          <Matrix>
            <thead>
              <tr>
                <th scope="col">Renderer</th>
                <th scope="col">Refracts</th>
                <th scope="col">Browser support</th>
                <th scope="col">Merged (liquid blend)</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>svg</td>
                <td>Live DOM</td>
                <td>All modern browsers</td>
                <td>No — falls back to the first lens (dev warning)</td>
                <td>
                  feDisplacementMap filter; the only renderer that can refract arbitrary HTML.
                  safariRefresh works around Safari's stale filter output during drags.
                </td>
              </tr>
              <tr>
                <td>webgl</td>
                <td>Image / canvas / ImageBitmap</td>
                <td>Anywhere WebGL2 is available; downgrades to canvas otherwise (and on context loss)</td>
                <td>Yes — preferred; draws the full shader chrome</td>
                <td>
                  GPU two-pass Gaussian blur, displacement, chroma split, and specular in one draw.
                  Fastest path.
                </td>
              </tr>
              <tr>
                <td>canvas</td>
                <td>Image / canvas</td>
                <td>Universal</td>
                <td>Yes — same chrome but the border is shaded flat (no rim highlight)</td>
                <td>CPU per-pixel sampling. Slow but dependency-free; the universal fallback.</td>
              </tr>
              <tr>
                <td>auto</td>
                <td>—</td>
                <td>—</td>
                <td>Yes — picks WebGL on all browsers, CPU canvas as fallback</td>
                <td>
                  SVG for DOM scenes; WebGL (then canvas) for Safari + target mode + image scene;
                  WebGL on every browser in merged mode.
                </td>
              </tr>
            </tbody>
          </Matrix>
        </MatrixWrap>
      </div>

      <div>
        <h2>Accessibility</h2>
        <p>
          With respectReducedTransparency enabled (the default), the controller listens to
          prefers-reduced-transparency: reduce and skips the displacement filter entirely while the
          preference is active. The React primitives additionally gate their hover
          transform/transition behind prefers-reduced-motion: no-preference.
        </p>
      </div>
    </Stack>
  );
}
