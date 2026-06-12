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

## Performance Architecture

Glass cost scales with animated pixels, not element count. The invariants:

- **One WebGL2 context per page.** `getSharedGlassCompositor()`
  (`web/glass-compositor.ts`) owns the page's only GL context on a detached
  canvas; every GlassNode/GlassDropdown registers a blit target and receives
  its pixels via `drawImage` into its own visible 2D canvas (DOM stacking,
  scroll sync, and `border-radius` clipping stay native). Context loss keeps
  the last blitted pixels and auto-recovers on restore; repeated losses fan
  out to the CPU canvas path. `createWebglGlassRenderer` remains available
  standalone (the scene controller uses it).
- **Displacement maps are globally cached.** `getCachedDisplacementMap`
  (`engine/map-cache.ts`, byte-budget LRU keyed by `mapKey` + engine mode)
  serves shared, immutable maps to all consumers; the SVG path adds a PNG
  data-URL cache (`web/map-url-cache.ts`). Map textures are pooled by map
  identity in the compositor. Component `mapSize` defaults to
  `autoMapSize(lens, dpr)` — small controls get small maps.
- **Repaints are keyed by content, not closure identity.** GlassNode's
  `sourceVersion` prop decouples redraws from React render identity; it also
  feeds the local `sceneKey` so the GPU blur and even the source draw callback
  are skipped for unchanged content. Press tweens quantize the glow term
  (`boostLens({ glowSteps })`) so a press touches a bounded set of cached maps
  while scale stays continuous via uniforms.
- **Idle is free.** Renderers draw on demand only; the controller skips
  no-op applies via draw keys; `web/render-gate.ts` (shared
  IntersectionObserver + visibilitychange) suspends offscreen/hidden glass and
  repaints on re-entry.
- **Degradation is principled.** `web/quality.ts` watches frame pacing while
  glass work happens (idle = sampler off) and steps quality down/up with
  hysteresis: smaller maps → no chroma separation → surface-only tint (the
  same fallback as `prefers-reduced-transparency`). Opt out per node with
  `adaptiveQuality={false}`.
- **Counters are always on.** `web/perf-stats.ts` exposes draws/sec by
  backend, map/blur cache hit rates, and live GL context counts
  (`__LIQUID_GLASS_PERF__.snapshot()` in the console; the playground renders
  a PerfOverlay).

## Deferred Work

- Multi-lens target assignment and merged maps.
- Video (`HTMLVideoElement`) sources for the WebGL renderer.
- Production Button/Switch/Slider components in a consuming design system.
- Native Swift/Kotlin bindings.
- Published package release automation.
