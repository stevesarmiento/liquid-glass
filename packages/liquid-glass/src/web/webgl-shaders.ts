/**
 * Shader sources and pure kernel math for the WebGL2 glass renderer.
 *
 * Everything in this module is free of WebGL calls so it can be unit-tested
 * under jsdom, where no real GL context exists.
 *
 * The fragment shader mirrors the CPU canvas path (`render-utils.ts`) and the
 * reverse-engineered original's WebGL2 refraction shader
 * (docs/reverse-engineering.md, "WebGL Canvas Layer"):
 *
 * - displacement decode: `(map.rg - 0.5) * ratio`, anisotropy split out of a
 *   shared base scale exactly like `sampleGlassChannel`
 * - per-channel chroma multipliers: R `1 + 0.2 * chroma`, G `1 + 0.1 * chroma`,
 *   B base — three samples of the *blurred* scene
 * - specular from the map's B channel, matching `specularAlpha`:
 *   `min(0.52, max(0, b*255 - 128) / 127 * 0.52)` mixed toward white
 * - rounded-rect mask via the same SDF as the engine's `roundedRectSdf`, with
 *   a one-pixel antialiased edge (the CPU path uses a binary inside test)
 * - premultiplied-alpha output
 */

/** Maximum kernel taps (center + one side) the blur shader supports. */
export const MAX_BLUR_TAPS = 33;

export const GLASS_VERTEX_SHADER_SOURCE = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Separable Gaussian blur / blit pass. With `u_taps == 1` and a zero
 * `u_direction` this acts as a plain copy with the `u_uvScale`/`u_uvOffset`
 * fit transform applied (used to cover/fill the scene source into the
 * scene-sized framebuffer before blurring).
 */
export const BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;
uniform vec2 u_direction;
uniform float u_kernel[${MAX_BLUR_TAPS}];
uniform int u_taps;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec2 baseUv = v_uv * u_uvScale + u_uvOffset;
  vec4 acc = texture(u_source, baseUv) * u_kernel[0];
  for (int i = 1; i < ${MAX_BLUR_TAPS}; i += 1) {
    if (i >= u_taps) break;
    vec2 offset = u_direction * float(i);
    acc += (texture(u_source, baseUv + offset) + texture(u_source, baseUv - offset)) * u_kernel[i];
  }
  o_color = acc;
}
`;

export const GLASS_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_map;
uniform vec2 u_sceneSize;
uniform vec2 u_viewportOrigin;
uniform vec2 u_viewportSize;
uniform vec2 u_lensOrigin;
uniform vec2 u_lensSize;
uniform float u_radius;
uniform vec2 u_ratio;
uniform vec3 u_chromaScale;
in vec2 v_uv;
out vec4 o_color;

// Same SDF as the engine's roundedRectSdf (src/engine/ts-engine.ts).
float roundedRectSdf(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  // v_uv has v=0 at the bottom of the output framebuffer; CSS-space scene
  // coordinates run top-down, so flip y once here.
  vec2 cssPos = u_viewportOrigin + vec2(v_uv.x, 1.0 - v_uv.y) * u_viewportSize;
  vec2 local = cssPos - u_lensOrigin;
  vec2 halfSize = u_lensSize * 0.5;
  float sdf = roundedRectSdf(local - halfSize, halfSize, u_radius);
  float aa = max(fwidth(sdf), 1e-4);
  float mask = clamp(0.5 - sdf / aa, 0.0, 1.0);
  if (mask <= 0.0) {
    o_color = vec4(0.0);
    return;
  }
  vec2 mapUv = clamp(local / u_lensSize, 0.0, 1.0);
  vec4 mapTexel = texture(u_map, mapUv);
  vec2 displacement = (mapTexel.rg - 0.5) * u_ratio;
  vec3 color;
  color.r = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.r) / u_sceneSize, 0.0, 1.0)).r;
  color.g = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.g) / u_sceneSize, 0.0, 1.0)).g;
  color.b = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.b) / u_sceneSize, 0.0, 1.0)).b;
  // Match render-utils specularAlpha: min(0.52, max(0, b*255 - 128) / 127 * 0.52).
  float spec = clamp((mapTexel.b * 255.0 - 128.0) / 127.0, 0.0, 1.0);
  float specAlpha = min(0.52, spec * 0.52);
  color = mix(color, vec3(1.0), specAlpha);
  // Premultiplied-alpha output.
  o_color = vec4(color * mask, mask);
}
`;

export interface GaussianBlurKernel {
  /**
   * Normalized weights; `weights[0]` is the center tap and `weights[i]`
   * applies symmetrically at `±i * stride` pixels.
   */
  weights: number[];
  /** Pixel distance between adjacent taps (>1 only for very large blurs). */
  stride: number;
  /** Number of weights (center + one side); always <= MAX_BLUR_TAPS. */
  taps: number;
}

/**
 * Gaussian sigma whose variance matches a single box-blur pass of the given
 * radius (box variance = r(r+1)/3), so the GPU Gaussian carries the same
 * visual blur weight as the CPU path's `boxBlurRgba`.
 */
export function boxMatchedSigma(radiusPx: number): number {
  const r = Math.max(0, radiusPx);
  return Math.sqrt((r * (r + 1)) / 3);
}

/**
 * Build a normalized separable Gaussian kernel for a CPU-box-radius worth of
 * blur. For very large radii the taps are strided (and resolved smoothly by
 * LINEAR texture filtering) so the kernel never exceeds `maxTaps` weights.
 */
export function gaussianBlurKernel(radiusPx: number, maxTaps: number = MAX_BLUR_TAPS): GaussianBlurKernel {
  const sigma = boxMatchedSigma(radiusPx);
  if (sigma <= 0) return { weights: [1], stride: 1, taps: 1 };

  const support = Math.max(1, Math.ceil(sigma * 3));
  const stride = Math.max(1, Math.ceil(support / (maxTaps - 1)));
  const side = Math.min(maxTaps - 1, Math.max(1, Math.round(support / stride)));
  const weights: number[] = [];
  for (let i = 0; i <= side; i += 1) {
    const x = i * stride;
    weights.push(Math.exp(-(x * x) / (2 * sigma * sigma)));
  }
  let total = weights[0];
  for (let i = 1; i < weights.length; i += 1) total += 2 * weights[i];
  for (let i = 0; i < weights.length; i += 1) weights[i] /= total;

  return { weights, stride, taps: weights.length };
}
