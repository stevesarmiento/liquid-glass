import { useEffect, type CSSProperties, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

import { ensureLiquidGlassStyles } from "./inject-styles";
import { glassTokens } from "./tokens";

export type GlassTone = "dark" | "light" | "clear";
export type GlassShape = "rounded" | "pill";

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  tone?: GlassTone;
  shape?: GlassShape;
  elevated?: boolean;
  interactive?: boolean;
  blur?: keyof typeof glassTokens.blur;
}

export function GlassSurface({
  children,
  className,
  tone = "dark",
  shape = "rounded",
  elevated = true,
  interactive = false,
  blur = "default",
  style,
  ...props
}: GlassSurfaceProps): ReactElement {
  useEffect(() => {
    ensureLiquidGlassStyles();
  }, []);

  const classes = [
    "lg-glass-surface",
    `lg-glass-surface--${tone}`,
    `lg-glass-surface--${shape}`,
    elevated ? "lg-glass-surface--elevated" : "",
    interactive ? "lg-glass-surface--interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ "--lg-glass-blur": glassTokens.blur[blur], ...style } as CSSProperties}
      {...props}
    >
      <span aria-hidden="true" className="lg-glass-surface__shine" />
      <div className="lg-glass-surface__content">{children}</div>
    </div>
  );
}

