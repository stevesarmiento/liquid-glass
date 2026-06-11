import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createLiquidGlassController,
  type GlassTintInput,
  type GlassTintName,
  type LensParams,
  type LiquidGlassController,
  type LiquidGlassControllerStats,
  type LiquidGlassEngine,
  type LiquidGlassEngineMode,
  type LiquidGlassRenderMode,
  type LiquidGlassRenderer,
  type ResolvedLensParams,
} from "liquid-glass";

import { INITIAL_LENS_POSITION, INITIAL_LENS_POSITIONS, STATS_FLUSH_MS, type StageMode } from "../playgroundConfig";
import { computeTargetClipPath } from "../playgroundUtils";

interface UseGlassStageControllerInput {
  backgroundUrl: string;
  blend: number;
  dualLens: boolean;
  engine: LiquidGlassEngine;
  engineMode: LiquidGlassEngineMode;
  glassTint: GlassTintName | GlassTintInput;
  lens: ResolvedLensParams;
  mode: LiquidGlassRenderMode;
  renderer: LiquidGlassRenderer;
  stageMode: StageMode;
}

export function useGlassStageController({
  backgroundUrl,
  blend,
  dualLens,
  engine,
  engineMode,
  glassTint,
  lens,
  mode,
  renderer,
  stageMode,
}: UseGlassStageControllerInput) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const glassChromeRef = useRef<HTMLDivElement | null>(null);
  const glassChromeSecondRef = useRef<HTMLDivElement | null>(null);
  const lensPositionRef = useRef(INITIAL_LENS_POSITION);
  const lensPositionsRef = useRef(INITIAL_LENS_POSITIONS.map((p) => ({ ...p })));
  const dragLensIndexRef = useRef(0);
  const statsRef = useRef<LiquidGlassControllerStats | null>(null);
  const statsFlushRef = useRef<number | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const [position, setPosition] = useState(INITIAL_LENS_POSITION);
  const [positions, setPositions] = useState(INITIAL_LENS_POSITIONS.map((p) => ({ ...p })));
  const [stats, setStats] = useState<LiquidGlassControllerStats | null>(null);

  useEffect(() => {
    if (!containerRef.current || !sourceRef.current || !targetRef.current) return;
    controllerRef.current?.destroy();
    controllerRef.current = createLiquidGlassController({
      container: containerRef.current,
      source: sourceRef.current,
      target: targetRef.current,
      lens,
      position: { ...lensPositionRef.current, unit: "normalized" },
      lenses: dualLens
        ? lensPositionsRef.current.map((p) => ({ position: { ...p, unit: "normalized" as const } }))
        : undefined,
      blend,
      tint: glassTint,
      mode,
      renderer,
      sourceImageUrl: backgroundUrl,
      engine,
      onStats: handleStats,
    });

    return () => controllerRef.current?.destroy();
    // stageMode remounts the lens surface (full-bleed stage vs. iPhone
    // screen), so the controller must rebind to the fresh elements.
  }, [engine, engineMode, stageMode]);

  useEffect(() => {
    controllerRef.current?.update({
      lens,
      position: { ...lensPositionRef.current, unit: "normalized" },
      lenses: dualLens
        ? lensPositionsRef.current.map((p) => ({ position: { ...p, unit: "normalized" as const } }))
        : undefined,
      blend,
      tint: glassTint,
      mode,
      renderer,
      sourceImageUrl: backgroundUrl,
    });
  }, [lens, position, positions, blend, dualLens, mode, glassTint, backgroundUrl, renderer]);

  // The lens position is driven imperatively during drags (no React render
  // per pointermove); this re-syncs the visual chrome when React state changes.
  useLayoutEffect(() => {
    lensPositionRef.current = position;
    lensPositionsRef.current = positions.map((p) => ({ ...p }));
    if (dualLens) {
      positions.forEach((p, index) => applyLensVisuals(p, index));
    } else {
      applyLensVisuals(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, positions, dualLens, lens.width, lens.height, lens.radius, stageMode]);

  useEffect(() => {
    return () => {
      if (statsFlushRef.current !== null) {
        window.clearTimeout(statsFlushRef.current);
      }
    };
  }, []);

  function handleStats(next: LiquidGlassControllerStats) {
    statsRef.current = next;
    if (statsFlushRef.current !== null) return;
    statsFlushRef.current = window.setTimeout(() => {
      statsFlushRef.current = null;
      setStats(statsRef.current);
    }, STATS_FLUSH_MS);
  }

  function applyLensVisuals(next: { x: number; y: number }, index = 0) {
    if (!dualLens) {
      const target = targetRef.current;
      if (target) {
        const clip = computeTargetClipPath(next, lens);
        target.style.clipPath = clip;
        target.style.setProperty("-webkit-clip-path", clip);
      }
    }
    const chrome = index === 0 ? glassChromeRef.current : glassChromeSecondRef.current;
    if (chrome) {
      chrome.style.left = `${next.x * 100}%`;
      chrome.style.top = `${next.y * 100}%`;
    }
  }

  function commitLensPosition() {
    if (dualLens) {
      setPositions((current) => {
        const refs = lensPositionsRef.current;
        const same = current.every((p, i) => p.x === refs[i].x && p.y === refs[i].y);
        return same ? current : refs.map((p) => ({ ...p }));
      });
      return;
    }
    setPosition((current) =>
      current.x === lensPositionRef.current.x && current.y === lensPositionRef.current.y
        ? current
        : { ...lensPositionRef.current },
    );
  }

  function handlePointer(event: PointerEvent<HTMLElement>, isDown = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };

    if (dualLens) {
      if (isDown) {
        dragLensIndexRef.current = nearestLensIndex(next, rect.width, rect.height);
      }
      const index = dragLensIndexRef.current;
      lensPositionsRef.current[index] = next;
      controllerRef.current?.setLensPosition(index, { ...next, unit: "normalized" });
      applyLensVisuals(next, index);
      return;
    }
    lensPositionRef.current = next;
    controllerRef.current?.setPosition({ ...next, unit: "normalized" });
    applyLensVisuals(next);
  }

  function nearestLensIndex(point: { x: number; y: number }, width: number, height: number): number {
    let best = 0;
    let bestDistance = Infinity;
    lensPositionsRef.current.forEach((p, index) => {
      const dx = (p.x - point.x) * width;
      const dy = (p.y - point.y) * height;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  return {
    commitLensPosition,
    containerRef,
    glassChromeRef,
    glassChromeSecondRef,
    handlePointer,
    position,
    positions,
    sourceRef,
    stats,
    targetRef,
  };
}
