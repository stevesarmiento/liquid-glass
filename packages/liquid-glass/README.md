# liquid-glass

Universal liquid glass engine and web adapter.

The package exposes:

- deterministic lens math and displacement map generation
- TypeScript fallback engine
- optional Rust/WASM engine
- DOM/SVG controller
- React wrapper via `liquid-glass/react`

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

## Contributor Setup

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.13.1 --locked
bun install
bun run build:wasm
```
