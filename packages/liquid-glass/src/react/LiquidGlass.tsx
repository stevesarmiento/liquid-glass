import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { getSharedLiquidGlassEngine } from "../engine/create-engine";
import type { LensParams, LiquidGlassEngineMode, LiquidGlassRenderMode } from "../engine/types";
import {
  createLiquidGlassController,
  type LensInstanceInput,
  type LiquidGlassController,
} from "../web/controller";
import type { GlassTintInput, GlassTintName } from "../web/tints";

export interface LiquidGlassProps {
  children: ReactNode;
  lens?: Partial<LensParams>;
  x?: number;
  y?: number;
  /**
   * Multiple lens instances sharing the optics of `lens`. Two or more entries
   * enable merged "liquid blend" (metaball) rendering, which needs a
   * pixel-readable scene — set `sourceImageUrl` as well.
   */
  lenses?: LensInstanceInput[];
  /** Smooth-union blend distance for merged lenses, in px. Default 40. */
  blend?: number;
  /** Shader-drawn glass chrome for merged mode (single-lens paths ignore it). */
  tint?: GlassTintName | GlassTintInput;
  /** Image scene the merged webgl/canvas renderers refract. */
  sourceImageUrl?: string;
  /**
   * Imperative access to the underlying controller — e.g.
   * `controllerRef.current?.setLensPosition(index, pos)` as a drag fast path
   * that skips React re-renders. Set when the controller is created, nulled
   * on unmount.
   */
  controllerRef?: Ref<LiquidGlassController | null>;
  mode?: LiquidGlassRenderMode;
  engineMode?: LiquidGlassEngineMode;
  className?: string;
  style?: CSSProperties;
}

function assignRef(
  ref: Ref<LiquidGlassController | null> | undefined,
  value: LiquidGlassController | null,
): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as RefObject<LiquidGlassController | null>).current = value;
  }
}

export function LiquidGlass({
  children,
  lens,
  x = 0.5,
  y = 0.5,
  lenses,
  blend,
  tint,
  sourceImageUrl,
  controllerRef,
  mode = "source",
  engineMode = "auto",
  className,
  style,
}: LiquidGlassProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const internalControllerRef = useRef<LiquidGlassController | null>(null);
  const lensKey = JSON.stringify(lens ?? {});
  const lensesKey = JSON.stringify(lenses ?? null);
  const tintKey = typeof tint === "string" ? tint : JSON.stringify(tint ?? null);
  const engine = useMemo(() => getSharedLiquidGlassEngine({ mode: engineMode }), [engineMode]);

  useEffect(() => {
    if (!containerRef.current || !sourceRef.current) return;

    internalControllerRef.current = createLiquidGlassController({
      container: containerRef.current,
      source: sourceRef.current,
      lens,
      position: { x, y, unit: "normalized" },
      lenses,
      blend,
      tint,
      sourceImageUrl,
      engine,
      mode,
    });

    return () => {
      internalControllerRef.current?.destroy();
      internalControllerRef.current = null;
    };
  }, [engine, engineMode]);

  // Standard ref population: set on create, null on destroy. Declared after
  // the create effect so its setup runs once the controller exists and its
  // cleanup runs after destroy on engine swaps.
  useEffect(() => {
    assignRef(controllerRef, internalControllerRef.current);
    return () => assignRef(controllerRef, null);
  }, [controllerRef, engine, engineMode]);

  useEffect(() => {
    internalControllerRef.current?.update({
      lens,
      position: { x, y, unit: "normalized" },
      lenses,
      blend,
      tint,
      sourceImageUrl,
      mode,
    });
  }, [lensKey, lensesKey, blend, tintKey, sourceImageUrl, mode, x, y]);

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
