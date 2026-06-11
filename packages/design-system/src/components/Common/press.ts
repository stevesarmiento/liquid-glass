/**
 * How a pressed glass surface expresses its highlight, shared by every
 * pressable component in the design system.
 *
 * - "natural" (default): the press cue comes entirely from the glass material
 *   itself — the lens optics boost (displacement scale + the map's specular
 *   glow) and the tint saturation surge. Nothing is composited on top: what
 *   brightens is the refraction, the way real glass catches light when it
 *   deforms.
 * - "additive": additionally mounts GlassPressEffects — the overexposure
 *   bloom and the cursor-following light — composited over the glass for a
 *   more theatrical press.
 */
export type GlassPressHighlight = "natural" | "additive";
