# liquid-glass

Universal liquid glass engine and web adapter.

The package exposes:

- deterministic lens math and displacement map generation
- TypeScript fallback engine
- optional Rust/WASM engine
- scene-level DOM/SVG, canvas, and WebGL2 controller
- component-local canvas and WebGL2 renderers
- React primitives via `liquid-glass/react`

## Install

```sh
bun add liquid-glass
```

## Engine

```ts
import { createLiquidGlassEngine, getSharedLiquidGlassEngine, normalizeLensParams } from "liquid-glass";

// Shared, cached per mode — preferred so N components reuse one engine.
const engine = getSharedLiquidGlassEngine({ mode: "auto" });

// Or construct a private instance explicitly.
const ownEngine = createLiquidGlassEngine({ mode: "ts" });

const lens = normalizeLensParams({ width: 180, height: 120 });
const map = engine.generateDisplacementMap(lens);
```

### WASM loading

The WASM engine is loaded through the package's `#wasm` subpath import
(`package.json` `"imports"`), which resolves to the wasm-pack glue at
`wasm/liquid_glass_core.js`. Node, Vite, webpack 5, and esbuild all resolve
subpath imports, and the glue locates `liquid_glass_core_bg.wasm` with
`new URL(..., import.meta.url)`, which those bundlers turn into an emitted
asset automatically.

If loading fails (e.g. plain Node, where `fetch` cannot read `file:` URLs),
the engine warns once in development, `engine.ready` rejects with the error
(`createLiquidGlassEngine({ mode: "auto" })` swallows it), and everything
transparently falls back to the TypeScript engine.

## Styles

The React primitives inject their stylesheet at runtime: on first mount they
append a single `<style data-liquid-glass>` tag (SSR-safe, idempotent). No
setup needed.

If you prefer an explicit stylesheet (e.g. strict CSP without
`style-src 'unsafe-inline'`), import the emitted CSS instead — the injected
tag is deduped either way:

```ts
import "liquid-glass/styles.css";
```

You can also call `ensureLiquidGlassStyles()` from `liquid-glass/react`
yourself to inject eagerly (e.g. before first paint).

## React

```tsx
import { LiquidGlass } from "liquid-glass/react";

export function Example() {
  return (
    <LiquidGlass lens={{ width: 180, height: 120 }} x={0.5} y={0.5}>
      <div>content</div>
    </LiquidGlass>
  );
}
```

`LiquidGlass` also passes the multi-lens "liquid blend" controller options
through: `lenses` (two or more entries merge into one metaball blob — this
needs a pixel-readable scene, so set `sourceImageUrl`), `blend` (smooth-union
distance in px, default 40), `tint` (shader-drawn chrome for merged mode), and
`controllerRef` for imperative access to the underlying controller — use
`setLensPosition` as a drag fast path that skips React re-renders. See
[Multiple lenses (liquid blend)](#multiple-lenses-liquid-blend) for the full
semantics.

```tsx
import { useRef } from "react";
import { LiquidGlass, type LiquidGlassController } from "liquid-glass/react";

export function MergedExample() {
  const controllerRef = useRef<LiquidGlassController | null>(null);

  // rAF-batched fast path: drag the second circle without re-rendering React.
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    controllerRef.current?.setLensPosition(1, {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  };

  return (
    <div onPointerMove={onPointerMove}>
      <LiquidGlass
        sourceImageUrl="/scene.jpg" // merged rendering refracts this image
        lens={{ width: 120, height: 120, radius: 60 }} // shared optics + defaults
        blend={40}
        tint="aqua"
        lenses={[
          { position: { x: 0.35, y: 0.5 } },
          { position: { x: 0.65, y: 0.5 }, width: 80, height: 80, radius: 40 },
        ]}
        controllerRef={controllerRef}
      >
        <img src="/scene.jpg" alt="" style={{ display: "block", width: "100%" }} />
      </LiquidGlass>
    </div>
  );
}
```

`LiquidGlass` is the scene-level wrapper. For design-system primitives such as slider thumbs, switch knobs, and buttons, use `GlassNode` and `GlassSurface`:

```tsx
import { GlassNode } from "liquid-glass/react";

<GlassNode
  lens={{ width: 63, height: 34, radius: 80 }}
  sourceWidth={244}
  sourceHeight={44}
  lensX={90}
  lensY={5}
  sourceChildren={<span className="local-control-source" />}
  drawSource={({ ctx }) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 244, 44);
  }}
/>;
```

For non-React component adapters, use `renderLocalGlassCanvas` from the root package.

### Material behaviors

The glass material's interaction physics are public hooks in
`liquid-glass/react`, so custom surfaces compose the same feel as the
design-system components:

- `useGlassPress(options?)` — the press state machine: pressed + post-release
  hold (default 320ms), a rAF press tween (`progress` 0..1, ease-out cubic,
  reduced-motion aware), spreadable `handlers` (pointer-capture safety,
  Space/Enter parity), imperative `press`/`holdRelease`/`releaseIfIdle`/
  `cancel`, and `boostLens(lens, boost?)` for progress-scaled optics.
- `useGlassDeformation(ref, options?)` — imperative spring-driven deformation:
  `setPull(px, velocity?)` tracks stiff (600/38) through a rubberband curve,
  `release()` bounces back underdamped (380/16), `cancel()` clears. The
  default "pull" mode stretches from an edge anchor with cross-axis volume
  conservation; "press" mode compresses around the center (a press squish).
  Writes `transform` directly per rAF — no React state per frame.
- `useGlassHoverTint(tint, options?)` — hover as material: a denser, more
  saturated tint variant instead of a CSS filter.
- `<GlassPressEffects progress={...} />` — overexposure bloom + cursor light
  riding the press tween; feed the cursor with
  `updateGlassPointerLight(el, event)`.
- `createSpring` / `rubberband` — the pure physics underneath (also exported
  from the package root).

```tsx
import { useRef } from "react";
import { GlassPressEffects, useGlassDeformation, useGlassPress } from "liquid-glass/react";

function PressableGlass() {
  const ref = useRef<HTMLDivElement>(null);
  const press = useGlassPress<HTMLDivElement>();
  const squish = useGlassDeformation(ref, { axis: "y", mode: "press", maxPx: 2, falloffPx: 12 });

  return (
    <div
      ref={ref}
      {...press.handlers}
      onPointerDown={(e) => {
        press.handlers.onPointerDown(e);
        squish.setPull(14);
      }}
      onPointerUp={(e) => {
        press.handlers.onPointerUp(e);
        squish.release(); // springs back with the material bounce
      }}
      style={{ position: "relative", overflow: "hidden", borderRadius: 18 }}
    >
      Press me
      <GlassPressEffects progress={press.progress} />
    </div>
  );
}
```

## Controller

`createLiquidGlassController` drives a scene-level lens over arbitrary DOM. It
observes its container (and target, in target mode) with `ResizeObserver` and
coalesces all updates — `setPosition`, `update`, resizes — into a single apply
per animation frame.

```ts
import { createLiquidGlassController } from "liquid-glass";

const controller = createLiquidGlassController({
  container,
  source,
  lens: { width: 180, height: 120 },
  // safariRefresh: cycle the SVG filter id whenever filter internals change so
  // Safari does not render stale output during drags. Defaults to isSafari().
  safariRefresh: undefined,
  // respectReducedTransparency (default true): when the user prefers reduced
  // transparency, the displacement filter is skipped entirely.
  respectReducedTransparency: true,
});

controller.setPosition({ x: 0.5, y: 0.5 }); // batched, applied next frame
controller.destroy(); // cancels pending frames, disconnects observers
```

### Multiple lenses (liquid blend)

Passing two or more entries in `lenses` (up to 4) renders them as one merged
"liquid blend" blob: per-lens rounded-rect SDFs are joined with a smooth union
(`blend`, in px) and a single merged displacement map covers the lenses'
bounding region. The map's alpha channel encodes a signed-distance band
around the blob edge (`alpha = 0.5 - d / (2 * MERGED_ALPHA_DISTANCE_RANGE)`,
exported from the root), which the renderers decode back into a crisp
antialiased mask — and which the WebGL shader also uses to draw the glass
**chrome** (backdrop saturation, tint fill, a per-lens interior highlight
glow, border band, an angular-profile rim highlight, and a drop shadow
composited under the blob) directly from the merged SDF, so the chrome merges
with the metaball instead of being separate DOM circles.

```ts
const controller = createLiquidGlassController({
  container,
  source,
  target,
  mode: "target",
  sourceImageUrl: "/scene.jpg", // required for merged rendering
  lens: { width: 120, height: 120, radius: 40 }, // shared optics + defaults
  blend: 40, // smooth-union distance in px (default 40)
  tint: "aqua", // chrome drawn by the shader from the merged SDF
  lenses: [
    { position: { x: 0.35, y: 0.5 } },
    { position: { x: 0.65, y: 0.5 }, width: 80, height: 80, radius: 28 },
  ],
});

// Fast per-lens drag path, rAF-batched like setPosition.
controller.setLensPosition(1, { x: 0.7, y: 0.55 });
```

Constraints and behavior:

- Merged mode needs a pixel-readable scene, so it always renders through the
  WebGL/canvas overlay: with `renderer: "auto"` (or `"webgl"`) it prefers
  WebGL on **all** browsers (not just Safari) and falls back to the CPU canvas
  when WebGL2 is unavailable. With `renderer: "svg"` or without
  `sourceImageUrl`, merged rendering is impossible — the controller warns once
  (dev only) and renders only the first lens through the regular single-lens
  path.
- Perf: the merged map is cached by a key that quantizes lens offsets
  _relative to the first lens_ to 1px, so a static blob — or the whole group
  translating together — reuses the cached map. Dragging one lens relative to
  the others regenerates the map each (rAF-batched) frame; keep `lens.mapSize`
  moderate if that matters.
- A single `lenses` entry behaves exactly like `position` plus the optional
  per-lens `width`/`height`/`radius` overrides; `setLensPosition(0, ...)` also
  works in plain single-lens mode as an alias of `setPosition`.
- `tint` accepts a preset name, a `GlassTintInput`, or a resolved `GlassTint`
  (same as the React components). The controller derives the chrome from it:
  fill from `background`, a 1.5px border from `border`, rim highlight color
  and strength from `highlight` (its alpha, floored at a subtle 0.18 so
  presets with transparent highlights still catch light at the top), the lobe
  shape from `highlightSpread`/`highlightCore`/`highlightWidth`/
  `highlightHeight`, the light direction from the highlight position rotated
  by `highlightRotation` (defaulting to top light), backdrop saturation from
  `saturation` (the CSS chrome's `backdrop-filter: saturate(...)`,
  reproduced in-shader), and a drop shadow from `shadow`. The `highlight`
  also drives a per-lens **interior glow** — the reference CSS chrome's
  `radial-gradient(ellipse W H at X Y, HL 0%, HL core, transparent spread)`
  background layer plus its blurred `::before` hot-spot — anchored at
  (`highlightX`, `highlightY`) and sized (`highlightWidth`,
  `highlightHeight`) as fractions of each lens box, with the same
  core/spread stops and the hot-spot rotated by `highlightRotation`; its
  alpha is `highlightOpacity` directly (no 0.18 floor — preset tints with
  transparent highlights get no interior wash). The glow is composited over
  the tint fill, under the border, and masked by the blob. The shadow's
  geometry mirrors the reference CSS chrome's `box-shadow: 0 18px 48px`,
  scaled uniformly so offset + blur fit inside the map's
  ±`MERGED_ALPHA_DISTANCE_RANGE` (40px) alpha band — beyond it the decoded
  distance saturates and the shadow would clip. Parsed colors are cached per
  tint, and `parseCssColor` (rgb/rgba/#hex → 0..1 RGBA floats) is exported.
  Known divergences: the CPU canvas fallback draws the same saturation +
  fill + interior glow (both lobes) + border + drop shadow but shades the
  border flat (no rim highlight); the shader rim highlight is an angular
  lobe — visually close to, but not pixel-exact with, the CSS chrome's
  border catch-light; and the interior glow's hot-spot approximates the CSS
  `blur(10px)` by widening the core→spread fade band rather than a true
  Gaussian (its mask uses the farthest-corner ellipse radii,
  √2 × the `::before` half-extents).
  Single-lens paths ignore `tint` entirely (style your own overlay as
  before).

## Renderers

The controller and `GlassNode` accept a `renderer` option: `"svg"`,
`"canvas"`, `"webgl"`, or `"auto"` (default).

| Renderer | Scene source                   | Notes                                                                                                                                                                                            |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `svg`    | live DOM                       | `feDisplacementMap` filter; the only renderer that can refract arbitrary HTML.                                                                                                                   |
| `webgl`  | image / canvas / `ImageBitmap` | WebGL2 fragment shader; GPU two-pass Gaussian blur, displacement, chroma split, and specular in one draw. Fastest path.                                                                          |
| `canvas` | image / canvas                 | CPU per-pixel sampling (`renderLocalGlassCanvas` / the controller's canvas overlay). Slow but dependency-free; the universal fallback.                                                           |
| `auto`   | —                              | SVG for DOM scenes. Where the CPU canvas used to be chosen (Safari + `mode: "target"` + `sourceImageUrl`, or `GlassNode` `drawSource`), WebGL is tried first and the CPU canvas is the fallback. |

WebGL capabilities and limitations:

- Requires a WebGL2 context. When `getContext("webgl2")` fails (old browsers,
  jsdom, blocklisted GPUs), creation returns `null` and callers fall back to
  the CPU canvas automatically; an explicit `renderer: "webgl"` downgrades the
  same way.
- Needs a pixel-readable scene source (image, canvas, or `ImageBitmap`). It
  cannot refract live DOM — that remains SVG-only.
- On `webglcontextlost` the controller/`GlassNode` fall back to the CPU canvas
  and switch back when the context is restored. `destroy()` releases all
  textures, framebuffers, programs, and buffers and loses the context.
- Pixel math matches the CPU path exactly (displacement decode, per-channel
  chroma offsets `1 + 0.2c` / `1 + 0.1c` / base, `specularAlpha` math, rounded
  rect radii). Two deliberate improvements: the scene blur is a true
  variance-matched Gaussian instead of the CPU's box blur (slightly smoother
  tails), and the displacement map and mask edge are sampled with linear
  filtering/antialiasing instead of nearest/binary.

For direct use, `createWebglGlassRenderer(canvas, options)` returns a
renderer (or `null`) with `render`, `clear`, `isContextLost`, and `destroy`;
`renderLocalGlassWebgl` is the component-local twin of
`renderLocalGlassCanvas`.

## Accessibility

- `prefers-reduced-motion`: the interactive surface hover transform/transition
  only activates under `(prefers-reduced-motion: no-preference)`.
- `prefers-reduced-transparency`: the controller and `GlassNode` (via the
  `respectReducedTransparency` option/prop, default `true`) skip refraction
  and render an opaque-ish tinted surface (background alpha raised to 0.85);
  `GlassSurface` drops its backdrop blur via the stylesheet.
- The duplicated refraction source inside `GlassNode` is `aria-hidden`, so
  screen readers only announce your real content once.

## Browser detection

`isSafari()` (exported from the root) is shared by the controller and the
`useIsSafari()` React hook. It rejects Chromium/Firefox shells that embed
"Safari" in their user agent (including iOS `CriOS`/`FxiOS`).

## Contributor Setup

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
bun install
bun run build:wasm
```
