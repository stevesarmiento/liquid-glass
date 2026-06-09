# Liquid Glass Adapter Contracts

Future adapters should keep the Rust crate as the source of truth for engine math.

```ts
interface NativeLiquidGlassEngine {
  generateDisplacementMap(params: LensParams): Uint8Array;
  computeLensGeometry(input: GeometryInput): LensGeometry;
}
```

## iOS

- Compile `liquid-glass-core` natively.
- Prefer UniFFI or a narrow C ABI for Swift bindings.
- Render through a SwiftUI overlay backed by CoreImage or Metal.
- Do not use WASM on iOS.

## Android

- Compile `liquid-glass-core` natively.
- Prefer UniFFI or JNI for Kotlin bindings.
- Render through Compose plus RenderEffect, Skia, or OpenGL depending on target support.
- Do not use WASM on Android.

## React Native

- Share TypeScript types from `liquid-glass`.
- Use native views that call the native Rust library through platform bindings.
- Do not force the DOM/SVG web renderer into React Native.

## WebGL

The WebGL adapter should accept the same `DisplacementMap` bytes and upload them as a texture. Shader code should treat red and green as X/Y displacement channels and blue as optional specular/highlight data.
