import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { DEFAULT_MERGED_BLEND, createLiquidGlassController, type LiquidGlassController } from "liquid-glass";
import styled from "styled-components";

const SCENE_URL = "/images/rinaldo-armida.jpg";
// The demo starts at the controller's real default so the page's prose
// ("blend defaults to 40") matches what the slider shows.
const INITIAL_BLEND = DEFAULT_MERGED_BLEND;

const SHARED_LENS = {
  width: 120,
  height: 120,
  radius: 60,
  mapSize: 192,
};

const INITIAL_POSITIONS = [
  { x: 0.38, y: 0.5 },
  { x: 0.62, y: 0.5 },
];

const Frame = styled.div`
  display: grid;
  gap: 12px;
`;

const Stage = styled.div`
  position: relative;
  height: 340px;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`;

const SceneLayer = styled.div`
  position: absolute;
  inset: 0;
  background-image: url(${SCENE_URL});
  background-size: cover;
  background-position: center;
  pointer-events: none;
`;

const Controls = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(17, 17, 17, 0.68);
  font-size: 13px;
  font-weight: 600;

  input {
    flex: 1;
    max-width: 280px;
  }

  b {
    min-width: 44px;
    color: #111111;
    font-variant-numeric: tabular-nums;
  }
`;

/**
 * Live "liquid blend" demo. Drives createLiquidGlassController imperatively:
 * the controller owns the scene overlays, and drags feed setLensPosition
 * directly (no React render per pointermove — the controller rAF-coalesces).
 */
export default function LiquidBlendDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const positionsRef = useRef(INITIAL_POSITIONS.map((p) => ({ ...p })));
  const dragIndexRef = useRef<number | null>(null);
  const [blend, setBlend] = useState(INITIAL_BLEND);

  useEffect(() => {
    if (!containerRef.current || !sourceRef.current || !targetRef.current) return;
    const controller = createLiquidGlassController({
      container: containerRef.current,
      source: sourceRef.current,
      target: targetRef.current,
      mode: "target",
      sourceImageUrl: SCENE_URL,
      lens: SHARED_LENS,
      blend: INITIAL_BLEND,
      tint: "aqua",
      lenses: positionsRef.current.map((position) => ({
        position: { ...position, unit: "normalized" as const },
      })),
    });
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update({ blend });
  }, [blend]);

  function pointerToNormalized(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  /** Index of the lens whose center is nearest to the pointer, in stage px. */
  function nearestLensIndex(point: { x: number; y: number }, width: number, height: number) {
    let best = 0;
    let bestDistance = Infinity;
    positionsRef.current.forEach((position, index) => {
      const dx = (position.x - point.x) * width;
      const dy = (position.y - point.y) * height;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function moveLens(index: number, next: { x: number; y: number }) {
    positionsRef.current[index] = next;
    controllerRef.current?.setLensPosition(index, { ...next, unit: "normalized" });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = pointerToNormalized(event);
    dragIndexRef.current = nearestLensIndex(next, rect.width, rect.height);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort (jsdom / stale pointer ids).
    }
    moveLens(dragIndexRef.current, next);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragIndexRef.current === null) return;
    moveLens(dragIndexRef.current, pointerToNormalized(event));
  }

  function handlePointerEnd() {
    dragIndexRef.current = null;
  }

  return (
    <Frame>
      <Stage
        ref={containerRef}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <SceneLayer ref={sourceRef} />
        <SceneLayer ref={targetRef} />
      </Stage>
      <Controls>
        blend
        <input
          max={120}
          min={0}
          onChange={(event) => setBlend(Number(event.target.value))}
          step={1}
          type="range"
          value={blend}
        />
        <b>{blend}px</b>
      </Controls>
    </Frame>
  );
}
