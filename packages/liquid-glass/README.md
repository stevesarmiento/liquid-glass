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
