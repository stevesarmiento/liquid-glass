import { colors } from "../lib/colors";

const defaultTheme = {
  color: colors,
  radius: {
    sm: "6px",
    md: "10px",
    pill: "999px"
  },
  font: {
    sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
  }
} as const;

export type GlassDesignSystemTheme = typeof defaultTheme;

export default defaultTheme;

