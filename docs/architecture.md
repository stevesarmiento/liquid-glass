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
- scene-level DOM/SVG and canvas filter orchestration
- component-local SVG and canvas node rendering
- React primitives and hooks
- playground and browser-facing demos

The first scene renderer is DOM/SVG because it matches the original prototype and supports normal HTML content. Safari/image parity uses a canvas renderer that samples an image-backed source scene with the same displacement map.

Component primitives use a smaller "glass node" model. A slider thumb, switch knob, button surface, or similar control owns its semantic behavior and local source drawing, while `liquid-glass` provides reusable map generation, SVG filtering, canvas sampling, and React surface primitives. This keeps design-system controls from depending on the full page/image controller.

WebGL, video, multi-lens, and native mobile renderers should consume the same `LensParams`, `DisplacementMap`, and `LensGeometry` contracts rather than duplicating math.

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
  public npm package with engine, scene controller, local canvas renderer,
  React GlassSurface, and React GlassNode
```

Consumers install `liquid-glass`. They do not need Rust tooling. Contributors need Rust, the `wasm32-unknown-unknown` target, `wasm-pack`, and Bun.

## Public Rendering Layers

- `createLiquidGlassEngine` is the math boundary. It chooses TS or WASM and returns deterministic displacement maps.
- `createLiquidGlassController` is the scene-level browser adapter. Use it for a floating lens over DOM/image content.
- `renderLocalGlassCanvas` is the component-local canvas adapter. Use it when a component can draw its own local source scene.
- `GlassNode` is the React primitive over SVG/canvas local rendering.
- `GlassSurface` is the decorative surface layer used by component nodes.

The playground has both paths:

- Scene Lens: the original painting demo.
- Component Lab: a reference-style slider thumb using `GlassNode`.

## Deferred Work

- Multi-lens target assignment and merged maps.
- WebGL renderer for video/canvas inputs.
- Production Button/Switch/Slider components in a consuming design system.
- Native Swift/Kotlin bindings.
- Published package release automation.
