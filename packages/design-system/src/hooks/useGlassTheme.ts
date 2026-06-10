import { useContext, useMemo } from "react";
import { ThemeContext } from "styled-components";

import defaultTheme, { type GlassDesignSystemTheme } from "../constants/defaultTheme";

/**
 * Reads the design-system theme from the styled-components context, falling
 * back to `defaultTheme` so components keep working when rendered outside a
 * `GlassDesignSystemProvider`.
 */
export default function useGlassTheme(): GlassDesignSystemTheme {
  const contextTheme = useContext(ThemeContext) as Partial<GlassDesignSystemTheme> | undefined;

  return useMemo(
    () => ({
      ...defaultTheme,
      ...contextTheme,
      color: { ...defaultTheme.color, ...contextTheme?.color },
      component: { ...defaultTheme.component, ...contextTheme?.component }
    }),
    [contextTheme]
  );
}
