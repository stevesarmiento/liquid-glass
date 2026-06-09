# Liquid Glass Architecture

`liquid-glass` is split around a stable engine boundary.

The Rust crate owns deterministic math:

- lens parameter normalization
- rounded-rectangle SDF calculations
- dome and splay gradient calculations
- RGBA displacement-map generation
- lens geometry and target bleed

The TypeScript package owns platform ergonomics:

- a pure TypeScript fallback engine
- an auto-upgrading WASM engine wrapper
- DOM/SVG filter orchestration
- React integration
- playground and browser-facing demos

The first renderer is DOM/SVG because it matches the current prototype and supports normal HTML content. WebGL, video, multi-lens, and native mobile renderers should consume the same `LensParams`, `DisplacementMap`, and `LensGeometry` contracts rather than duplicating math.

## Package Flow

```txt
crates/core
  Rust math and WASM exports
    |
    | wasm-pack build
    v
packages/liquid-glass/wasm
  generated JS glue and .wasm
    |
    v
packages/liquid-glass
  public npm package with TS fallback, web adapter, and React wrapper
```

Consumers install `liquid-glass`. They do not need Rust tooling. Contributors need Rust, the `wasm32-unknown-unknown` target, `wasm-pack`, and Bun.

## Deferred Work

- Multi-lens target assignment and merged maps.
- WebGL renderer for video/canvas inputs.
- Native Swift/Kotlin bindings.
- Published package release automation.
