import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from "react";

import { glassTokens } from "./tokens";
import "./styles.css";

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

