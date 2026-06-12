import { useSyncExternalStore } from "react";

import {
  getGlassQualityLevel,
  subscribeGlassQuality,
  type GlassQualityLevel,
} from "../web/quality";

const getServerSnapshot = (): GlassQualityLevel => 0;

/**
 * Current adaptive glass quality level (0 = full … 3 = surface-only). Pass
 * `enabled: false` (e.g. a component's `adaptiveQuality={false}`) to pin 0.
 */
export function useGlassQualityLevel(enabled = true): GlassQualityLevel {
  const level = useSyncExternalStore(subscribeGlassQuality, getGlassQualityLevel, getServerSnapshot);
  return enabled ? level : 0;
}
