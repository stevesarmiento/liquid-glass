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
 * - `u_maskMode == 1` skips the rect SDF and instead decodes a signed
 *   distance from the displacement map's alpha channel (merged multi-lens
 *   maps encode `alpha = 0.5 - d / (2 * u_alphaDistRange)`, see
 *   MERGED_ALPHA_DISTANCE_RANGE in src/engine/merged.ts; LINEAR sampling
 *   resolves the band smoothly). Coverage is rebuilt with screen-space AA
 *   from that distance, and the same SDF drives the glass "chrome": backdrop
 *   saturation, tint fill, a per-lens interior highlight glow (replicating
 *   the CSS chrome's `radial-gradient(ellipse W H at X Y, HL 0%, HL core,
 *   transparent spread)` background layer plus its blurred `::before`
 *   hot-spot), border band, an angular-profile rim highlight
 *   (spread/core/anisotropy-driven, mirroring the CSS radial-gradient
 *   highlight), and a drop shadow composited under the blob from the same
 *   alpha band sampled at the shadow offset — so the chrome merges with the
 *   metaball blob instead of being drawn as separate DOM. In mode 0 the
 *   chrome uniforms default to no-ops (zero alphas, saturation 1, zero lens
 *   count) and the output is bit-identical to the pre-chrome shader.
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
// 0 = rounded-rect SDF mask, 1 = merged map alpha-encoded SDF mask + chrome.
uniform int u_maskMode;
// Half-range (px) of the signed-distance band encoded in the merged map's
// alpha channel: d = (0.5 - alpha) * 2 * u_alphaDistRange (d < 0 inside).
uniform float u_alphaDistRange;
// Chrome (merged mode only; zero alphas / zero strength make it a no-op).
uniform vec4 u_tintColor;        // straight (non-premultiplied) alpha
uniform vec4 u_borderColor;      // straight alpha
uniform float u_borderWidth;     // px, inward from the blob edge
uniform vec3 u_highlightColor;
uniform float u_highlightStrength;
uniform vec2 u_lightDir;         // CSS-space unit vector toward the light
uniform float u_highlightSpread; // ~0..1, larger = wider angular lobe
uniform float u_highlightCore;   // 0..1, tighter boosted core lobe
uniform vec2 u_highlightAniso;   // width/height stretch of the lobe (1,1 = round)
// Interior highlight glow (merged mode only): per-lens replica of the CSS
// chrome's background radial-gradient + blurred ::before hot-spot. Lens
// rects are (center.xy, half.xy) in region px; count 0 (or glow alpha 0)
// disables the glow entirely.
uniform int u_glassLensCount;    // 0..4 lenses contributing a glow
uniform vec4 u_glassLensRect[4]; // xy = lens center, zw = half size (region px)
uniform vec4 u_glowColor;        // straight alpha; a = 0 disables the glow
uniform vec2 u_glowAnchor;       // gradient anchor as fractions of the lens box
uniform vec2 u_glowRadii;        // gradient radii as fractions of lens w/h
uniform float u_glowRotation;    // hot-spot rotation in radians (CSS clockwise)
uniform float u_saturation;      // backdrop saturation; 1 = no-op
uniform vec4 u_shadowColor;      // straight alpha; a = 0 disables the shadow
uniform vec2 u_shadowOffset;     // CSS px offset the shadow is cast toward
uniform float u_shadowBlur;      // px fade of the shadow past the blob edge
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
  // Compute the rect SDF mask unconditionally so fwidth stays in uniform
  // control flow; u_maskMode then selects rect SDF vs map alpha coverage.
  float sdf = roundedRectSdf(local - halfSize, halfSize, u_radius);
  float aa = max(fwidth(sdf), 1e-4);
  float rectMask = clamp(0.5 - sdf / aa, 0.0, 1.0);
  vec2 mapUv = clamp(local / u_lensSize, 0.0, 1.0);
  vec4 mapTexel = texture(u_map, mapUv);
  // Merged maps encode a signed-distance band in alpha (region px units).
  float d = (0.5 - mapTexel.a) * (2.0 * u_alphaDistRange);
  // All derivatives are taken before any divergent branch so they stay in
  // uniform control flow (mode 0 simply ignores them).
  float dAa = clamp(fwidth(d), 0.5, 2.0);
  // CSS-space SDF gradient: window y runs opposite to CSS y, so flip dFdy.
  vec2 dGrad = vec2(dFdx(d), -dFdy(d));
  float blobMask = 1.0 - smoothstep(0.0, dAa, d);
  float mask = u_maskMode == 1 ? blobMask : rectMask;
  // Drop shadow (merged mode only): decode the blob distance at the point
  // the shadow is cast from and fade it over the blur radius. Beyond the
  // alpha band the decoded distance saturates at +u_alphaDistRange, so the
  // controller caps |offset| + blur to the band range. The blur edge is kept
  // strictly positive so a zero-blur (no-chrome) draw stays NaN-free.
  vec2 shadowUv = clamp((local - u_shadowOffset) / u_lensSize, 0.0, 1.0);
  float dShadow = (0.5 - texture(u_map, shadowUv).a) * (2.0 * u_alphaDistRange);
  float shadowAlpha = u_maskMode == 1
    ? u_shadowColor.a * (1.0 - smoothstep(-u_shadowBlur * 0.25, max(u_shadowBlur, 1e-3), dShadow))
    : 0.0;
  if (mask <= 0.0) {
    // Premultiplied shadow only (zero everywhere in mode 0).
    o_color = vec4(u_shadowColor.rgb * shadowAlpha, shadowAlpha);
    return;
  }
  vec2 displacement = (mapTexel.rg - 0.5) * u_ratio;
  vec3 color;
  color.r = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.r) / u_sceneSize, 0.0, 1.0)).r;
  color.g = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.g) / u_sceneSize, 0.0, 1.0)).g;
  color.b = texture(u_scene, clamp((cssPos + displacement * u_chromaScale.b) / u_sceneSize, 0.0, 1.0)).b;
  // Match render-utils specularAlpha: min(0.52, max(0, b*255 - 128) / 127 * 0.52).
  float spec = clamp((mapTexel.b * 255.0 - 128.0) / 127.0, 0.0, 1.0);
  float specAlpha = min(0.52, spec * 0.52);
  color = mix(color, vec3(1.0), specAlpha);
  if (u_maskMode == 1) {
    // Backdrop saturation (the CSS chrome's backdrop-filter: saturate(...)),
    // applied to the refracted scene before tint compositing. Rec. 709 luma.
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(lum), color, u_saturation);
    // Tint fill: src-over the refracted color inside the blob.
    color = mix(color, u_tintColor.rgb, u_tintColor.a);
    // Interior highlight glow, src-over the tint and under the border. Per
    // lens this replicates the CSS chrome (see .glassChrome in the
    // playground):
    //   background: radial-gradient(ellipse W H at X Y,
    //     HL 0%, HL core, transparent spread), TINT_BG;
    // where W/H/X/Y/core/spread are fractions of the lens box (the CSS vars
    // are value*100%), so the gradient's ray parameter at point p is
    // r = |(p - anchor) / radii| with radii = glowRadii * lensSize and the
    // stop curve is linear from core to spread. The ::before hot-spot is a
    // box of half-extents (0.34*W, 0.39*H) centered on the same anchor
    // (left = X - 0.34W, width = 0.68W), rotated by the highlight rotation,
    // filled with HL at opacity 0.62 and masked by an ellipse-at-center
    // gradient whose default farthest-corner ending shape has radii
    // sqrt(2) * the box half-extents (same core/spread stops). Its CSS
    // blur(10px) is approximated by widening the core->spread fade band by
    // the blur in ray units (not an exact Gaussian).
    float glow = 0.0;
    if (u_glowColor.a > 0.0) {
      float glowFade = max(u_highlightSpread - u_highlightCore, 1e-3);
      // Rotate by -u_glowRotation (into the hot-spot's local frame); CSS
      // rotate() is clockwise in y-down screen space.
      float cr = cos(u_glowRotation);
      float sr = sin(u_glowRotation);
      mat2 unrotate = mat2(cr, -sr, sr, cr);
      for (int i = 0; i < 4; i += 1) {
        if (i >= u_glassLensCount) break;
        vec2 lensHalf = u_glassLensRect[i].zw;
        vec2 anchor = (u_glassLensRect[i].xy - lensHalf) + u_glowAnchor * (2.0 * lensHalf);
        vec2 radii = max(u_glowRadii * (2.0 * lensHalf), vec2(1e-3));
        vec2 rel = local - anchor;
        // Primary lobe: the background radial-gradient.
        float r1 = length(rel / radii);
        float t1 = clamp((u_highlightSpread - r1) / glowFade, 0.0, 1.0);
        // Hot-spot lobe: mask radii = sqrt(2) * (0.34, 0.39) * radii.
        vec2 hotRadii = max(vec2(0.480833, 0.551543) * radii, vec2(1e-3));
        float r2 = length((unrotate * rel) / hotRadii);
        float blurFrac = 10.0 / max(min(hotRadii.x, hotRadii.y), 1.0);
        float t2 = clamp((u_highlightSpread + blurFrac - r2) / (glowFade + 2.0 * blurFrac), 0.0, 1.0);
        glow = max(glow, clamp(t1 + 0.62 * t2, 0.0, 1.0));
      }
      color = mix(color, u_glowColor.rgb, glow * u_glowColor.a);
    }
    // Border band -u_borderWidth < d < 0, antialiased on both edges (the
    // outer fade also tracks the blob mask itself).
    float band = (1.0 - smoothstep(0.0, dAa, d)) *
      smoothstep(-u_borderWidth - dAa, -u_borderWidth, d);
    // Rim highlight: outward surface normal from the SDF gradient, stretched
    // by the highlight's width/height so the lobe is anisotropic like the
    // CSS radial-gradient highlight ellipse.
    float gradLen = length(dGrad);
    vec2 n = gradLen > 1e-5 ? dGrad / gradLen : vec2(0.0);
    vec2 stretched = n / max(u_highlightAniso, vec2(0.01));
    float stretchedLen = length(stretched);
    vec2 nA = stretchedLen > 1e-5 ? stretched / stretchedLen : vec2(0.0);
    // Angular profile around the light direction: a wide lobe whose exponent
    // comes from the spread (wider spread = lower exponent), max'd with a
    // tighter, boosted core lobe so the peak reads as a bright catch-light.
    float c = clamp(dot(nA, u_lightDir), 0.0, 1.0);
    float lobe = pow(c, mix(8.0, 1.0, clamp(u_highlightSpread, 0.0, 1.0)));
    float coreLobe = pow(c, mix(64.0, 16.0, clamp(u_highlightCore, 0.0, 1.0))) *
      (1.0 + u_highlightCore);
    float rim = clamp(max(lobe, coreLobe) * u_highlightStrength, 0.0, 1.0);
    // Dark counter-lobe opposite the light (the CSS chrome's
    // "inset 0 -1px rgba(0, 0, 0, 0.16)" shade line; the CSS shows a dark
    // bottom inset, not a bright catch-light, so the counter-lobe darkens).
    float counter = clamp(dot(nA, -u_lightDir), 0.0, 1.0);
    vec3 borderRgb = mix(u_borderColor.rgb, u_highlightColor, rim);
    borderRgb = mix(borderRgb, vec3(0.0), counter * counter * 0.16);
    float borderAlpha = u_borderColor.a * band *
      mix(1.0, 0.55 + 0.45 * c, u_highlightStrength);
    color = mix(color, borderRgb, borderAlpha);
  }
  // Premultiplied-alpha output: glass over the drop shadow.
  float outAlpha = mask + shadowAlpha * (1.0 - mask);
  o_color = vec4(color * mask + u_shadowColor.rgb * shadowAlpha * (1.0 - mask), outAlpha);
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
