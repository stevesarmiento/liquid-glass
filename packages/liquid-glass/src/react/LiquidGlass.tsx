import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { createLiquidGlassEngine } from "../engine/create-engine";
import type { LensParams, LiquidGlassEngineMode, LiquidGlassRenderMode } from "../engine/types";
import {
  createLiquidGlassController,
  type LiquidGlassController,
} from "../web/controller";

export interface LiquidGlassProps {
  children: ReactNode;
  lens?: Partial<LensParams>;
  x?: number;
  y?: number;
  mode?: LiquidGlassRenderMode;
  engineMode?: LiquidGlassEngineMode;
  className?: string;
  style?: CSSProperties;
}

export function LiquidGlass({
  children,
  lens,
  x = 0.5,
  y = 0.5,
  mode = "source",
  engineMode = "auto",
  className,
  style,
}: LiquidGlassProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const lensKey = JSON.stringify(lens ?? {});
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);

  useEffect(() => {
    if (!containerRef.current || !sourceRef.current) return;

    controllerRef.current = createLiquidGlassController({
      container: containerRef.current,
      source: sourceRef.current,
      lens,
      position: { x, y, unit: "normalized" },
      engine,
      mode,
    });

    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [engine, engineMode]);

  useEffect(() => {
    controllerRef.current?.update({
      lens,
      position: { x, y, unit: "normalized" },
      mode,
    });
  }, [lensKey, mode, x, y]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      <div ref={sourceRef} style={{ minHeight: "100%" }}>
        {children}
      </div>
    </div>
  );
}
