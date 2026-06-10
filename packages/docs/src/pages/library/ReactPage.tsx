import styled from "styled-components";

import CodeBlock from "../../components/CodeBlock";
import PropsTable, { type PropRow } from "../../components/PropsTable";

const PROP_ROWS: PropRow[] = [
  {
    name: "children",
    type: "ReactNode",
    description: "Scene content the lens refracts.",
  },
  {
    name: "lens",
    type: "Partial<LensParams>",
    defaultValue: "DEFAULT_LENS_PARAMS",
    description: "Shared lens optics. See the Lens params page for every field.",
  },
  {
    name: "x",
    type: "number",
    defaultValue: "0.5",
    description: "Normalized horizontal lens position (0–1).",
  },
  {
    name: "y",
    type: "number",
    defaultValue: "0.5",
    description: "Normalized vertical lens position (0–1).",
  },
  {
    name: "lenses",
    type: "LensInstanceInput[]",
    description:
      "Multiple lens instances sharing the optics of lens. Two or more entries enable merged “liquid blend” (metaball) rendering, which needs a pixel-readable scene — set sourceImageUrl as well.",
  },
  {
    name: "blend",
    type: "number",
    defaultValue: "40",
    description: "Smooth-union blend distance for merged lenses, in px.",
  },
  {
    name: "tint",
    type: "GlassTintName | GlassTintInput",
    description:
      "Shader-drawn glass chrome for merged mode: tint fill, border, rim + interior highlight glow, drop shadow, backdrop saturation. Single-lens paths ignore it.",
  },
  {
    name: "sourceImageUrl",
    type: "string",
    description: "Image scene the merged webgl/canvas renderers refract.",
  },
  {
    name: "controllerRef",
    type: "React.Ref<LiquidGlassController | null>",
    description:
      "Imperative access to the underlying controller — e.g. controllerRef.current?.setLensPosition(index, pos) as a drag fast path that skips React re-renders. Set when the controller is created, nulled on unmount.",
  },
  {
    name: "mode",
    type: '"source" | "target"',
    defaultValue: '"source"',
    description: "Render mode forwarded to the controller.",
  },
  {
    name: "engineMode",
    type: '"auto" | "wasm" | "ts"',
    defaultValue: '"auto"',
    description: "Which displacement-map engine to use. auto prefers WASM with a TS fallback.",
  },
  {
    name: "className",
    type: "string",
    description: "Class applied to the wrapper element.",
  },
  {
    name: "style",
    type: "CSSProperties",
    description: "Inline styles applied to the wrapper element.",
  },
];

const Stack = styled.div`
  display: grid;
  gap: 30px;
`;

const EXAMPLE = `import { useRef } from "react";
import { LiquidGlass } from "liquid-glass/react";
import type { LiquidGlassController } from "liquid-glass";

export function Example() {
  const controllerRef = useRef<LiquidGlassController | null>(null);

  return (
    <LiquidGlass
      lens={{ width: 120, height: 120, radius: 60 }}
      lenses={[
        { position: { x: 0.35, y: 0.5 } },
        { position: { x: 0.65, y: 0.5 } },
      ]}
      blend={40}
      tint="aqua"
      sourceImageUrl="/scene.jpg"
      controllerRef={controllerRef}
    >
      <img alt="" src="/scene.jpg" />
    </LiquidGlass>
  );
}`;

export default function ReactPage() {
  return (
    <Stack>
      <div>
        <h1>React</h1>
        <p>
          liquid-glass/react exports the scene-level &lt;LiquidGlass&gt; wrapper plus the
          component-local primitives. &lt;LiquidGlass&gt; mounts a controller over its children and
          forwards every controller capability — including multi-lens liquid blend and the
          imperative drag fast path via controllerRef.
        </p>
      </div>

      <div>
        <h2>Usage</h2>
        <CodeBlock>{EXAMPLE}</CodeBlock>
      </div>

      <div>
        <h2>Props</h2>
        <PropsTable rows={PROP_ROWS} />
      </div>

      <div>
        <h2>GlassNode and GlassSurface</h2>
        <p>
          For design-system primitives — slider thumbs, switch knobs, buttons — use GlassNode: a
          component-local lens that refracts a duplicated source (sourceChildren or a drawSource
          canvas callback) through the canvas/WebGL renderers, with the same lens/tint/renderer
          options. GlassSurface is the frosted backdrop companion (backdrop blur + tint) used
          underneath glass content. Both honor respectReducedTransparency, and the duplicated
          refraction source inside GlassNode is aria-hidden so screen readers announce your content
          once. The styles they need are injected automatically on first mount; import
          "liquid-glass/styles.css" instead if you need an explicit stylesheet for strict CSP.
        </p>
      </div>
    </Stack>
  );
}
