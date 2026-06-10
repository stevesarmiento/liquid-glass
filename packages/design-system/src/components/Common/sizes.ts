import type { LensParams } from "liquid-glass";

export type GlassComponentSize = "sm" | "md" | "lg" | "xl";

export type GlassSliderSizePreset = {
  sliderWidth: number;
  controlHeight: number;
  trackHeight: number;
  lens: Pick<LensParams, "width" | "height" | "radius">;
};

export type GlassSwitchSizePreset = {
  switchWidth: number;
  controlHeight: number;
  trackHeight: number;
  trackInsetX: number;
  thumbInsetX: number;
  lens: LensParams;
};

export type GlassButtonSizePreset = {
  height: number;
  paddingX: number;
  fontSize: number;
  radius: number;
  lens: LensParams;
};

export const GLASS_SLIDER_SIZE_PRESETS: Record<GlassComponentSize, GlassSliderSizePreset> = {
  sm: {
    sliderWidth: 180,
    controlHeight: 34,
    trackHeight: 7,
    lens: { width: 46, height: 26, radius: 80 },
  },
  md: {
    sliderWidth: 220,
    controlHeight: 38,
    trackHeight: 8,
    lens: { width: 54, height: 30, radius: 80 },
  },
  lg: {
    sliderWidth: 244,
    controlHeight: 44,
    trackHeight: 9,
    lens: { width: 63, height: 34, radius: 80 },
  },
  xl: {
    sliderWidth: 320,
    controlHeight: 52,
    trackHeight: 11,
    lens: { width: 72, height: 40, radius: 80 },
  },
};

/**
 * Button lens width/height are nominal: GlassButton replaces them with the
 * measured face size at render time. Radius is height / 2 for a pill face.
 * The optics are tuned as a RESTING state — the button's glass is always on,
 * so each size reads as a subtle dome + edge at rest (mirroring the switch's
 * resting magnitudes, with lg/xl softened from their old press-flourish
 * values); GlassButton boosts scaleX/scaleY/glow while pressed.
 */
export const GLASS_BUTTON_SIZE_PRESETS: Record<GlassComponentSize, GlassButtonSizePreset> = {
  sm: {
    height: 30,
    paddingX: 14,
    fontSize: 12,
    radius: 15,
    lens: {
      width: 84,
      height: 30,
      radius: 15,
      scaleX: 4,
      scaleY: 1.5,
      chroma: 0.6,
      depth: 4,
      dome: 0,
      splay: 0.1,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  md: {
    height: 38,
    paddingX: 18,
    fontSize: 13,
    radius: 19,
    lens: {
      width: 104,
      height: 38,
      radius: 19,
      scaleX: 7.5,
      scaleY: 2,
      chroma: 0.6,
      depth: 7.5,
      dome: 0,
      splay: 0.1,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  lg: {
    height: 44,
    paddingX: 22,
    fontSize: 14,
    radius: 22,
    lens: {
      width: 128,
      height: 44,
      radius: 22,
      scaleX: 11,
      scaleY: 4,
      chroma: 0.6,
      depth: 8,
      dome: 44,
      splay: 0.1,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  xl: {
    height: 52,
    paddingX: 28,
    fontSize: 15,
    radius: 26,
    lens: {
      width: 152,
      height: 52,
      radius: 26,
      scaleX: 15,
      scaleY: 6,
      chroma: 0.6,
      depth: 9,
      dome: 64,
      splay: 0.1,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
};

export const GLASS_SWITCH_SIZE_PRESETS: Record<GlassComponentSize, GlassSwitchSizePreset> = {
  sm: {
    switchWidth: 54,
    controlHeight: 30,
    trackHeight: 24,
    trackInsetX: 3,
    thumbInsetX: 6,
    lens: {
      width: 28,
      height: 18,
      radius: 80,
      scaleX: 4,
      scaleY: 1.50,
      chroma: 0.60,
      depth: 4,
      dome: 0,
      splay: 0.10,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  md: {
    switchWidth: 68,
    controlHeight: 36,
    trackHeight: 30,
    trackInsetX: 3,
    thumbInsetX: 7,
    lens: {
      width: 36,
      height: 22,
      radius: 80,
      scaleX: 7.50,
      scaleY: 2,
      chroma: 0.60,
      depth: 7.50,
      dome: 0,
      splay: 0.10,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  lg: {
    switchWidth: 98,
    controlHeight: 44,
    trackHeight: 36,
    trackInsetX: 4,
    thumbInsetX: 8,
    lens: {
      width: 54,
      height: 29,
      radius: 80,
      scaleX: 21.50,
      scaleY: 7.50,
      chroma: 0.60,
      depth: 8.50,
      dome: 75,
      splay: 0.10,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
  xl: {
    switchWidth: 116,
    controlHeight: 52,
    trackHeight: 42,
    trackInsetX: 5,
    thumbInsetX: 9,
    lens: {
      width: 64,
      height: 34,
      radius: 80,
      scaleX: 27,
      scaleY: 11,
      chroma: 0.60,
      depth: 10,
      dome: 100,
      splay: 0.10,
      glow: 1,
      edge: 1,
      blur: 2,
      mapSize: 512,
    },
  },
};
