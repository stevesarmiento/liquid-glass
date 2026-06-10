import { colors } from "../lib/colors";

export interface GlassComponentTokens {
  /** Accent color used for switch/slider fills and focus rings. */
  accent: string;
  /** Resting track color for switch and slider. */
  track: string;
  /** Primary text color for control labels. */
  text: string;
  /** Muted text color for secondary control text (e.g. slider values). */
  textMuted: string;
  /** Text color used on the glass modal surface. */
  modalText: string;
}

const componentTokens: GlassComponentTokens = {
  accent: colors.primary,
  track: "rgba(148, 163, 184, 0.34)",
  text: colors.black,
  textMuted: "rgba(43, 47, 67, 0.58)",
  modalText: "#111827"
};

const defaultTheme = {
  color: colors,
  radius: {
    sm: "6px",
    md: "10px",
    pill: "999px"
  },
  font: {
    sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`
  },
  component: componentTokens
} as const;

export type GlassDesignSystemTheme = typeof defaultTheme;

export default defaultTheme;
