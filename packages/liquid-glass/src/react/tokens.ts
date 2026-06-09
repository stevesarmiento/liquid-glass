export const glassTokens = {
  radius: {
    sm: "12px",
    md: "18px",
    lg: "28px",
    pill: "999px",
  },
  blur: {
    subtle: "10px",
    default: "18px",
    strong: "28px",
  },
  border: {
    light: "rgba(255, 255, 255, 0.5)",
    dark: "rgba(255, 255, 255, 0.18)",
  },
  shadow: {
    raised: "0 18px 48px rgba(0, 0, 0, 0.32)",
    inset: "inset 0 1px 0 rgba(255, 255, 255, 0.42), inset 0 -1px 0 rgba(0, 0, 0, 0.22)",
  },
} as const;

export type GlassTokens = typeof glassTokens;

