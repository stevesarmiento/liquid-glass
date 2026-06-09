# liquid-glass

Universal liquid glass engine and web adapter.

The package exposes:

- deterministic lens math and displacement map generation
- TypeScript fallback engine
- optional Rust/WASM engine
- scene-level DOM/SVG and canvas controller
- component-local canvas renderer
- React primitives via `liquid-glass/react`

## Install

```sh
bun add liquid-glass
```

## Engine

```ts
import { createLiquidGlassEngine, normalizeLensParams } from "liquid-glass";

const engine = createLiquidGlassEngine({ mode: "auto" });
const lens = normalizeLensParams({ width: 180, height: 120 });
const map = engine.generateDisplacementMap(lens);
```

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

## Contributor Setup

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
bun install
bun run build:wasm
```
