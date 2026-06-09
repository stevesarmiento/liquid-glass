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
