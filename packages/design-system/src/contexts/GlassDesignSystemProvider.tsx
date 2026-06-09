import type { ReactNode } from "react";
import { ThemeProvider } from "styled-components";

import defaultTheme, { type GlassDesignSystemTheme } from "../constants/defaultTheme";
import { GlobalStyle } from "../constants/globalStyles";

export interface GlassDesignSystemProviderProps {
  children: ReactNode;
  theme?: Partial<GlassDesignSystemTheme>;
}

export function GlassDesignSystemProvider({ children, theme }: GlassDesignSystemProviderProps) {
  return (
    <ThemeProvider theme={{ ...defaultTheme, ...theme }}>
      <GlobalStyle />
      {children}
    </ThemeProvider>
  );
}

export default GlassDesignSystemProvider;

