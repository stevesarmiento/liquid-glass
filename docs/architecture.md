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
- scene-level DOM/SVG, canvas, and WebGL2 filter orchestration
- component-local SVG, canvas, and WebGL2 node rendering
- React primitives and hooks
- playground and browser-facing demos

The first scene renderer is DOM/SVG because it matches the original prototype and supports normal HTML content. Image-backed scenes get two more tiers: a WebGL2 renderer (`createWebglGlassRenderer`) that consumes the same displacement map as a texture — GPU separable-Gaussian blur, per-channel chroma displacement, B-channel specular, SDF rounded-rect mask — and a CPU canvas renderer with identical pixel math as the universal fallback. In `auto`, wherever the canvas path used to be chosen (Safari + target mode + image scene, or `GlassNode` `drawSource`), WebGL is tried first and the CPU canvas is used when context creation fails or the context is lost. WebGL cannot refract live DOM; that remains SVG-only.

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
- `createWebglGlassRenderer` is the GPU adapter for image/canvas scenes. The controller and `GlassNode` prefer it automatically where the canvas path applies; it is also usable standalone for video/canvas pipelines.
- `renderLocalGlassCanvas` is the component-local canvas adapter. Use it when a component can draw its own local source scene (`renderLocalGlassWebgl` is its GPU twin).
- `GlassNode` is the React primitive over SVG/canvas local rendering.
- `GlassSurface` is the decorative surface layer used by component nodes.

The playground has both paths:

- Scene Lens: the original painting demo.
- Component Lab: a reference-style slider thumb using `GlassNode`.

## Deferred Work

- Multi-lens target assignment and merged maps.
- Video (`HTMLVideoElement`) sources for the WebGL renderer.
- Production Button/Switch/Slider components in a consuming design system.
- Native Swift/Kotlin bindings.
- Published package release automation.
