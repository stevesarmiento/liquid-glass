# Aave Glass Reverse Engineering Notes

Capture inspected: public bundles under `artifacts/prettified/`.

## High-Level Architecture

The public implementation has three related refraction paths:

1. DOM/SVG path in `artifacts/prettified/023-504982d42d3368e6.js.pretty.js`.
   - Exported as `AaveGlass` plus `DEFAULT_LENS_PARAMS`.
   - Uses generated PNG displacement maps inside SVG `filter` definitions.
   - Applies the SVG filter either to the component children, to a separate `refractionTarget`, or to registered target elements.

2. Video/WebGL path in `artifacts/prettified/019-3963356e871bc455.js.pretty.js`.
   - Used for the video player demo.
   - Reads the playing `<video>` as a WebGL texture.
   - Applies the same displacement-map idea in a fragment shader because live video is not reliably filterable through SVG in Safari.

3. Canvas/WebGL paths in `artifacts/prettified/022-8cf2898f96461b0b.js.pretty.js` and `021-fc9f28cb893506e5.js.pretty.js`.
   - `022` renders a particle/canvas source through a single-lens WebGL2 refraction pass.
   - `021` renders a custom QR-code scene in WebGL2, with optional displacement over the generated scene.

The reusable idea across all paths is the same: generate a map where red and green encode X/Y displacement and blue carries specular/highlight data. Then choose a renderer based on the source medium.

## SVG/DOM Implementation

Main file: `artifacts/prettified/023-504982d42d3368e6.js.pretty.js`.

### Public Shape

`AaveGlass` props are visible from the main component argument list around lines 514-549:

- `children`
- `lens`
- `x`, `y`
- `lensW`, `lensH`
- `borderRadius`, `autoBorderRadius`
- `displacementMapUrl`
- `overlay`
- `showOutline`
- `onLensMapChange`
- `refractionTarget`
- `tintColor`, `tintOpacity`, `tintBlur`
- `shadowOpacity`, `restShadowOpacity`
- `edgeBias`
- `onGenerationTime`
- `regenSettle`
- `filterResolution`
- `zoom`
- `depth`, `scale`
- `regionScale`, `regionOriginX`, `regionOriginY`
- `onFilterStats`
- `lenses`
- `pauseOffscreen`, `offscreenMargin`
- `className`, `style`

Default lens parameters are defined at lines 485-510:

```js
{
  lensW: 90,
  lensH: 60,
  depth: 0,
  chromaAmount: 0,
  scaleX: 0,
  scaleY: 0,
  mapSize: 256,
  borderRadius: 0,
  blurAmount: 0,
  sdfBoundary: false,
  edgeFalloff: false,
  brightness: 0,
  specularStrength: 0,
  specularRotation: 0,
  glowStrength: 0,
  glowSpread: 1,
  glowExponent: 1.5,
  tint: 0,
  edgeStrength: 0,
  edgeWidth: 3,
  edgeExponent: 1.5,
  specularDark: false,
  domeDepth: 0,
  splayAmount: 0
}
```

Selectors are exported at lines 386-392:

```js
{
  container: "[data-aave-glass-container]",
  target: "[data-refraction-target]"
}
```

### Displacement Map Encoding

There are two map generators:

- `async function o(canvas, params)` at lines 18-139.
- `function u(mapSize)` at lines 140-379, returning a reusable synchronous generator with cached canvas/image data.

The synchronous generator exploits four-way symmetry. It loops over one quadrant and writes mirrored pixels into all four quadrants. This is the performance optimization the article references.

Map channel semantics:

- Red: X bend. Neutral is 128. Values are derived from `0.5 +/- 0.5 * gradient * edgeFalloff`.
- Green: Y bend. Same neutral and scaling scheme.
- Blue: specular/highlight mask. Neutral is 128. Positive glow/edge values push above 128.
- Alpha: 255 inside usable generated maps. For some WebGL/canvas paths, alpha can gate lens activity.

The generator uses rounded-rectangle signed-distance math:

- Outer rounded rectangle distance controls whether a pixel is part of the lens when `sdfBoundary` is enabled.
- `edgeFalloff` computes an inner rounded-rectangle SDF and smooths with `0.5 * (1 + erf(distance * invSigma))`.
- `domeDepth` swaps the simple linear gradient for an elliptical dome gradient.
- `splayAmount < 1` compresses edge gradients and then renormalizes vector length so the edge bends differently without changing overall magnitude too much.

Math helpers are bundled in `025` around lines 964-994:

- `erf(x)` is approximated as `tanh(1.7724538509 * x)`.
- `computeDomeConstants(depth, halfW, halfH)` derives ellipse radii and scale factors.
- `domeGradient(x, radius, scale)` computes the normalized dome slope.

### SVG Filter Graph

The core filter builder is `tX` around lines 2098-2289.

Filter setup:

- Uses `filterUnits` and `primitiveUnits` as `userSpaceOnUse` on iOS/Safari-style paths or `objectBoundingBox` otherwise.
- Starts with `feFlood` neutral gray and `feImage` for the displacement PNG.
- Composites `rawMap` over neutral `mapBg` into `map`.
- Optionally applies `feColorMatrix` as `scaledMap` to emulate separate `scaleX`/`scaleY`.
- Optionally blurs `SourceGraphic` before displacement.

Chroma path:

- If `chromaAmount > 0`, it emits three `feDisplacementMap` passes:
  - R channel: scale `baseScale * (1 + 0.2 * chromaAmount)`.
  - G channel: scale `baseScale * (1 + 0.1 * chromaAmount)`.
  - B channel: scale `baseScale`.
- It isolates each channel with `feColorMatrix`, then recombines channels with arithmetic `feComposite`.

No-chroma path:

- Emits one `feDisplacementMap` into `lensResult`.

Specular path:

- If `glowStrength` or `edgeStrength` is active, it creates `specMask` from the map and composites it into `lensResult`.
- `specularDark` switches the composition mode and matrix, so the highlight treatment changes for light/dark backgrounds.

Masking:

- A black `feFlood` named `lensMask` is positioned to the lens bounds.
- `SourceGraphic` is punched with `operator="out"`.
- `lensResult` is overlaid back onto the holed source.

### Runtime Filter Assignment

The main update callback is `tF`, starting around line 1365.

Single lens:

- Reads motion values for `x`, `y`, `lensW`, `lensH`, `scaleX`, `scaleY`, tint/shadow values, `regionScale`, and origins.
- Computes the lens rectangle in container pixels.
- Computes padding/bleed as `ceil(max(scaleX, scaleY) * max(width, height) * 0.5)`.
- Updates all `[data-lens]` SVG primitives with `x`, `y`, `width`, `height`.
- Changes the filter ID on every update, e.g. `${id}-v${version}`.
- Applies `style.filter = url(#...)` to the content wrapper, `refractionTarget`, or registered target.

Registered targets:

- `AaveGlass.General.Provider` tracks active lens and target geometries.
- `AaveGlass.General.RefractionTarget` renders a `div` with `data-refraction-target` and registers geometry through `ResizeObserver` and `IntersectionObserver`.
- Targets may receive padding/margins equal to the current bleed so displacement can sample past the visual bounds.

Multiple lenses:

- The `lenses` prop enables a separate path using `tb.current = Array.from({ length: 8 }, A)` and four sub-slots per filter.
- It computes all lens geometries, overlaps them against registered targets, sorts by overlap area, keeps up to eight targets, then keeps up to four lenses per target.
- Each sub-slot gets its own `feImage` map, mask image, color matrix scale, and alpha mask.
- `mlMergedMap` merges up to four maps.
- One `feDisplacementMap` uses `mlMergedMap`, then composites the result through `mlUnionMask`.

This is a clever compromise: many moving lenses can exist, but each target gets bounded work: max eight targets and max four lenses per target.

### Safari / Platform Handling

Observed workarounds:

- Filter IDs are versioned on update. This forces Safari to invalidate cached SVG filter output.
- iOS/Safari detection changes filter coordinate mode and filter dimensions.
- `filterResolution` can render content at a scaled resolution, then scale back visually.
- `pauseOffscreen` uses `IntersectionObserver` to avoid work outside the viewport.
- Backdrop blur is handled by a positioned/masked overlay with `backdrop-filter`, separate from the SVG displacement filter.

The SSR payload also states the same architecture in article form: DOM uses `feDisplacementMap`; video/canvas can reuse the generated map in WebGL when SVG filters cannot access the pixels.

## WebGL Video Player

Main file: `artifacts/prettified/019-3963356e871bc455.js.pretty.js`.

This chunk contains a WebGL1 renderer for the video player demo.

### Shader Inputs

Fragment shader starts around lines 67-243. Important uniforms:

- `u_video`: raw video texture.
- `u_map`: generated displacement map.
- `u_blurred`: optional blurred video texture.
- `u_baseScale[3]`, `u_ratioX[3]`, `u_ratioY[3]`: per circular control displacement scale and anisotropy.
- `u_chromaAmount`: same chromatic split idea as SVG.
- `u_specStrength`, `u_adaptStrength`, `u_specLumaLow`, `u_specLumaHigh`: highlight and adaptive brightness.
- `u_bbox`: normalized bounding box for all glass controls.
- `u_circles[3]`: up to three circular button lenses.
- `u_scale[3]`: per-circle press scale.
- `u_bar`: rounded-rect progress bar lens.
- `u_barRadius`, `u_barBaseScale`, `u_barRatioX`, `u_barRatioY`.
- `u_bboxSize`: bounding box pixel size for map lookup.

### Rendering Algorithm

Per fragment:

1. If outside `u_bbox`, sample `u_video` directly.
2. Convert screen UV into bounding-box pixel coordinates.
3. Evaluate analytical SDF masks for up to three circular controls.
4. Evaluate a rounded-rect SDF for the bar.
5. Pick the dominant lens/region by mask value.
6. Sample the displacement map in the selected lens coordinate space.
7. Apply map matrix equivalent:
   - `sr = d.r * ratioX + 0.5 * (1 - ratioX)`
   - `sg = d.g * ratioY + 0.5 * (1 - ratioY)`
8. Offset video UV by `(sr - 0.5, sg - 0.5) * baseScale`.
9. If chroma is active:
   - R uses `1 + chroma * 0.2`
   - G uses `1 + chroma * 0.1`
   - B uses base offset
10. Optionally mix raw and blurred video by the lens mask.
11. Use blue map channel for specular and luminance-adaptive brightness.

Blur uses a separate shader with fixed Gaussian-ish weights. The renderer downsamples to half size for blur (`T >> 1`, `C >> 1`) and performs horizontal then vertical passes.

The renderer setup at lines 1031-1256:

- Creates WebGL1 context with `alpha: false`, `premultipliedAlpha: false`, `antialias: false`.
- Enables `OES_standard_derivatives`.
- Creates two programs: main refraction and blur.
- Uses texture unit 0 for video, 1 for map, 2 for blurred/raw fallback.
- Handles context lost/restored.

### Video Demo Presets

Control panel at lines 1668-1808:

- Global:
  - `chromaAmount`: default 0.
  - `specularStrength`: default 1.
  - `blurAmount`: default 0.3.
  - `tint`: default 0.4.
  - `specLumaLow`: default 0.3.
  - `specLumaHigh`: default 0.7.
- Main lens:
  - size 111.
  - scale 0.07.
  - depth 0.16.
  - curvature 35.
  - edgeStrength 0.5.
  - edgeWidth 2.5.
- Side lens:
  - size 65.
  - scale 0.04.
  - depth 0.14.
  - curvature 40.
  - edgeStrength 0.49.
- Bar:
  - height 30.
  - marginX 24.
  - marginY 24.
  - scale 0.04.
  - depth 0.5.
  - edgeStrength 0.25.

## WebGL Canvas Layer

Main file: `artifacts/prettified/022-8cf2898f96461b0b.js.pretty.js`.

The class at lines 246-452 is a WebGL2 refraction renderer over a source canvas.

### Shader Inputs

Fragment shader starts around lines 145-199:

- `u_src`: source canvas texture.
- `u_disp`: displacement map.
- `u_blurred`: blurred source texture.
- `u_active`: whether displacement is enabled.
- `u_hasBlur`: whether blur texture should be mixed in.
- `u_lensOrigin`: normalized top-left of the lens.
- `u_lensSize`: normalized lens size.
- `u_scale`: X/Y displacement strength.
- `u_chroma`: chroma amount.

Per fragment:

1. Flip Y to match top-down canvas rows.
2. If inactive or outside lens, sample source.
3. Sample displacement at lens-local UV.
4. If displacement alpha is near zero, sample source.
5. Compute `disp = (d.rg - 0.5) * u_scale`.
6. Sample R/G/B separately:
   - R: `1 + chroma * 0.2`
   - G: `1 + chroma * 0.1`
   - B: base.
7. Blend toward pre-blurred texture by `u_hasBlur * d.a`.

The class uploads source via `texImage2D` or `texSubImage2D`, runs optional half-res blur, then draws a full-screen triangle strip.

The React wrapper `T` at lines 533-754:

- Can render particles normally to a 2D canvas.
- Or, when `refract` is passed, creates an offscreen/source canvas, draws particles there, then renders that canvas through the WebGL2 refraction class into a portal canvas attached to the target.
- Loads displacement maps from `a?.displacementMap`.
- Gets lens geometry from `a?.getLens()`.

`RefractionTargetDemo` at lines 1253-1385 shows normal `children` refraction versus explicit `refractionTarget` content.

## QR/WebGL Canvas Path

Main file: `artifacts/prettified/021-fc9f28cb893506e5.js.pretty.js`.

This chunk is a custom WebGL2 QR-code renderer. It does not just post-process an existing DOM node.

Notable details:

- QR module occupancy is uploaded as an `R8` texture for O(1) dot lookup.
- The fragment shader renders QR dots, finder eyes, and a painting/color texture.
- Displacement inputs are:
  - `u_displacementMap`
  - `u_displacementActive`
  - `u_lensOrigin`
  - `u_lensSize`
  - `u_displacementScale`
  - `u_chromaAmount`
- Chroma is stronger here:
  - R: `1 + chroma * 2.0`
  - G: `1 + chroma * 1.0`
  - B: base.
- Eye displacement is attenuated separately by `u_eyeRefractionScale`, default `0.16`.

This looks demo-specific, but it confirms the article's point: once the displacement map exists, arbitrary canvas/WebGL content can consume it without SVG filters.

## Component Demo Presets

Main file: `artifacts/prettified/025-b4b78dcd4526c3da.js.pretty.js`.

### Switch

Static lens preset around lines 1148-1175:

- `lensW: 90`, `lensH: 60`, `borderRadius: 30`
- `mapSize: 256`
- `depth: 2`
- `chromaAmount: 1`
- `scaleX: 0.25`, `scaleY: 0.25`
- `sdfBoundary: true`, `edgeFalloff: true`
- `domeDepth: 6`
- `splayAmount: 0.4`
- `brightness: 0.06`
- `specularStrength: 1`
- `edgeShadow` and `edgeInsetShadow`

Live control defaults around lines 1615-1708 are similar, with:

- `filterResolution: 2`
- `tintBlur: 4`
- map size selectable from 64/128/256/512
- light/dark theme overrides for `specularDark`, brightness, glow, and edge.

### Range Slider

Static lens preset around lines 1840-1867:

- `lensW: 90`, `lensH: 60`, `borderRadius: 30`
- `depth: 2`
- `chromaAmount: 0.65`
- `scaleX: 0.06`, `scaleY: 0.06`
- `domeDepth: 5`
- `splayAmount: 0.5`
- `brightness: 0.06`
- `specularStrength: 1.5`
- `glowStrength: 0.4`
- `restEdgeShadow` in addition to active edge shadows.

Live controls around lines 2310-2385:

- default scale roughly `0.133`/`0.135`
- `chromaAmount: 0.65`
- `brightness: 0.12`
- `specularStrength: 1.5`
- map size selectable from 64/128/256/512.

### Toggle Group

Live controls around lines 2876-2968:

- `lensW: 50`, `lensH: 20`, `borderRadius: 16`
- `depth: 2.5`
- `curvature` maps to `domeDepth`
- `splay` maps to `splayAmount`
- `scaleX: 0.045`
- `scaleY: 0.025`
- `chromaAmount: 0.1`
- `edgeStrength: 0.6`
- additional "squish" controls drive lens deformation and mid-transition boosts.

## Reconstructed Minimal DOM/SVG Recipe

For a single DOM lens:

1. Render children normally inside a container with `position: relative`.
2. Generate a square PNG displacement map:
   - Neutral outside: RGBA approximately `(128,128,128,255)`.
   - Inside lens: red/green encode negative normalized gradients.
   - Blue encodes optional specular.
3. Place an absolutely positioned SVG with `<defs><filter>`.
4. Inside the filter:
   - `feFlood` neutral background.
   - `feImage href={mapUrl}` at lens bounds.
   - composite over neutral background.
   - optional color matrix to scale X/Y.
   - optional blur of `SourceGraphic`.
   - one or three `feDisplacementMap` passes.
   - optional specular composite.
   - mask to punch and overlay only the lens region.
5. On motion value changes:
   - update `feImage` and mask primitive geometry.
   - update displacement scale.
   - version the filter ID.
   - write `style.filter = url(#newId)`.
6. If filtering separate targets:
   - track target rects relative to the glass container.
   - only assign filters to targets intersecting the lens.
   - expand target padding/margins by displacement bleed.

## Open Questions / Next Pass

- Decode module import IDs for all local helpers and demos into a symbol map.
- Extract exact CSS from the style modules for layout, masks, and shadows.
- Build a small standalone reproduction of the DOM/SVG single-lens path.
- Confirm whether `filterResolution` is mainly for quality, Safari behavior, or both.
- Measure map-generation timing for 64/128/256/512 and compare to their `onGenerationTime` hooks.
- Inspect chunk `024` next. It appears to contain performance tracing and dropdown glass behavior.
