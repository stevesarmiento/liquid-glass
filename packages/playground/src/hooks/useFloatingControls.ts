import { type PointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import { type FloatingControlsDrag, type FloatingControlsPosition } from "../playgroundConfig";
import { constrainControlsPosition, getInitialControlsPosition } from "../playgroundUtils";

export interface FloatingControlsState {
  controlsOpen: boolean;
  controlsPanelOpensUp: boolean;
  floatingControlsRef: RefObject<HTMLDivElement | null>;
  isControlsDragging: boolean;
  setControlsOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  handleControlsDragStart: (event: PointerEvent<HTMLElement>) => void;
}

export function useFloatingControls(): FloatingControlsState {
  const floatingControlsRef = useRef<HTMLDivElement | null>(null);
  const controlsPositionRef = useRef<FloatingControlsPosition>(getInitialControlsPosition());
  const pendingControlsPositionRef = useRef<FloatingControlsPosition>(controlsPositionRef.current);
  const controlsDragRef = useRef<FloatingControlsDrag | null>(null);
  const controlsDragFrameRef = useRef<number | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [controlsPosition, setControlsPosition] = useState<FloatingControlsPosition>(controlsPositionRef.current);
  const [isControlsDragging, setIsControlsDragging] = useState(false);

  useLayoutEffect(() => {
    controlsPositionRef.current = controlsPosition;
    pendingControlsPositionRef.current = controlsPosition;
    applyControlsTransform(floatingControlsRef, controlsPosition);
  }, [controlsPosition]);

  useEffect(() => {
    const handleResize = () => setControlsPosition((current) => constrainControlsPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsDragFrameRef.current !== null) {
        cancelAnimationFrame(controlsDragFrameRef.current);
      }
      window.removeEventListener("pointermove", handleControlsDragMove);
      window.removeEventListener("pointerup", handleControlsDragEnd);
      window.removeEventListener("pointercancel", handleControlsDragEnd);
    };
  }, []);

  function handleControlsDragStart(event: PointerEvent<HTMLElement>) {
    if (controlsDragRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    controlsDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: controlsPositionRef.current.x,
      originY: controlsPositionRef.current.y,
    };
    setIsControlsDragging(true);

    window.addEventListener("pointermove", handleControlsDragMove);
    window.addEventListener("pointerup", handleControlsDragEnd);
    window.addEventListener("pointercancel", handleControlsDragEnd);
  }

  function handleControlsDragMove(event: globalThis.PointerEvent) {
    const drag = controlsDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    pendingControlsPositionRef.current = constrainControlsPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });

    if (controlsDragFrameRef.current !== null) return;
    controlsDragFrameRef.current = requestAnimationFrame(() => {
      controlsDragFrameRef.current = null;
      applyControlsTransform(floatingControlsRef, pendingControlsPositionRef.current);
    });
  }

  function handleControlsDragEnd(event: globalThis.PointerEvent) {
    const drag = controlsDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    controlsDragRef.current = null;
    controlsPositionRef.current = pendingControlsPositionRef.current;
    setIsControlsDragging(false);
    setControlsPosition(pendingControlsPositionRef.current);

    window.removeEventListener("pointermove", handleControlsDragMove);
    window.removeEventListener("pointerup", handleControlsDragEnd);
    window.removeEventListener("pointercancel", handleControlsDragEnd);
  }

  return {
    controlsOpen,
    controlsPanelOpensUp: typeof window !== "undefined" && controlsPosition.y > window.innerHeight - 420,
    floatingControlsRef,
    handleControlsDragStart,
    isControlsDragging,
    setControlsOpen,
  };
}

function applyControlsTransform(
  floatingControlsRef: RefObject<HTMLDivElement | null>,
  nextPosition: FloatingControlsPosition,
) {
  if (!floatingControlsRef.current) return;
  floatingControlsRef.current.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`;
}
