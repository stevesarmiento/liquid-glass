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

const MATERIAL_ROWS: PropRow[] = [
  {
    name: "useGlassPress",
    type: "(options?: GlassPressOptions) => GlassPress",
    description:
      "The glass press state machine: pressed state with a post-release hold (holdMs, default 320ms), a rAF press tween (progress 0..1, ease-out cubic, reduced-motion aware), spreadable handlers with pointer-capture safety and Space/Enter parity, imperative press/holdRelease/releaseIfIdle/cancel for custom gestures, and boostLens for progress-scaled optics (scale ×1.15, +0.45 glow by default).",
  },
  {
    name: "useGlassDeformation",
    type: "(ref, options?: GlassDeformationOptions) => GlassDeformationHandle",
    description:
      "Imperative material-deformation driver: a damped spring per rAF writes transform/transform-origin directly on the target — zero React state per frame. setPull(px, velocity?) tracks with a stiff spring (600/38) through a rubberband curve; release() bounces back underdamped (380/16); cancel() clears immediately. mode \"pull\" stretches away from an edge anchor with cross-axis volume conservation; mode \"press\" compresses around the center (a press squish). Honors prefers-reduced-motion and cleans up on unmount.",
  },
  {
    name: "useGlassHoverTint",
    type: "(tint, options?) => { restingTint, hoverTint }",
    description:
      "Hover feedback in the material itself: resolves the tint and derives a denser (+opacityBoost background alpha), more saturated (×saturationScale) hover variant — no CSS filters. Both memoized.",
  },
  {
    name: "GlassPressEffects",
    type: "component",
    description:
      "Optional press visual layer: an overexposure bloom plus a cursor-following light as one absolutely-positioned child. Opacity rides the progress prop inline, so it shares the press tween's easing. Pair with updateGlassPointerLight(el, event) to feed the cursor position as CSS vars with zero re-renders.",
  },
  {
    name: "createSpring / rubberband",
    type: "pure utilities",
    description:
      "The physics underneath: a semi-implicit-Euler damped spring (sub-stepped, background-tab safe) and the iOS-style diminishing-returns pull curve. Also exported from the package root.",
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

const MATERIAL_EXAMPLE = `import { useRef, useState } from "react";
import {
  GlassPressEffects,
  updateGlassPointerLight,
  useGlassDeformation,
  useGlassHoverTint,
  useGlassPress,
} from "liquid-glass/react";

// A custom pressable glass chip: press tween + material squish + bloom,
// using only the liquid-glass material layer.
export function GlassChip() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const press = useGlassPress<HTMLDivElement>();
  const squish = useGlassDeformation(surfaceRef, {
    axis: "y",
    mode: "press", // centered vertical constriction, cross-axis bulge
    maxPx: 2,
    falloffPx: 12,
  });
  const { restingTint, hoverTint } = useGlassHoverTint("frost");
  const tint = hovered ? hoverTint : restingTint;

  return (
    <div
      ref={surfaceRef}
      role="button"
      tabIndex={0}
      {...press.handlers}
      onPointerDown={(event) => {
        press.handlers.onPointerDown(event);
        squish.setPull(14); // springs in stiff (600/38)...
      }}
      onPointerUp={(event) => {
        press.handlers.onPointerUp(event);
        squish.release(); // ...and bounces back underdamped (380/16)
      }}
      onPointerMove={(event) => updateGlassPointerLight(event.currentTarget, event)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 18,
        overflow: "hidden",
        background: tint.background,
        border: \`1px solid \${tint.border}\`,
        backdropFilter: \`blur(18px) saturate(\${tint.saturation})\`,
        padding: "10px 18px",
      }}
    >
      Press me
      {/* bloom + cursor light ride press.progress's rAF tween */}
      <GlassPressEffects progress={press.progress} exposure={0.34} />
    </div>
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

      <div>
        <h2>Material behaviors</h2>
        <p>
          The interaction physics of the glass material — how it presses, deforms, and lights up —
          are public, composable hooks, the same way the displacement math is the shared engine.
          Design-system components (GlassButton, GlassSwitch, GlassSlider) are built from these;
          any custom surface can compose the same feel.
        </p>
        <PropsTable rows={MATERIAL_ROWS} />
      </div>

      <div>
        <h2>Composed example</h2>
        <p>
          A custom element that presses (tweened optics state), squishes (spring-driven
          deformation with a release bounce), and blooms (press visual layer) using only
          liquid-glass:
        </p>
        <CodeBlock>{MATERIAL_EXAMPLE}</CodeBlock>
      </div>
    </Stack>
  );
}
