import { type RefObject, useEffect, useState } from "react";

import { createRenderGate, type RenderGate, type RenderGateOptions } from "../web/render-gate";

/**
 * React adapter for the render gate: true while the element is (near-)visible
 * and the tab is shown. Use it to gate expensive draw effects — include the
 * returned boolean in the effect's deps so re-entering the viewport re-runs
 * the draw with the latest props (dirty-on-re-entry).
 */
export function useRenderGate(
  ref: RefObject<Element | null>,
  options: RenderGateOptions & { enabled?: boolean } = {},
): boolean {
  const { enabled = true, rootMargin } = options;
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setActive(true);
      return undefined;
    }
    const element = ref.current;
    if (!element) return undefined;
    const gate: RenderGate = createRenderGate(element, { rootMargin });
    setActive(gate.active);
    const unsubscribe = gate.subscribe(setActive);
    return () => {
      unsubscribe();
      gate.destroy();
    };
  }, [enabled, ref, rootMargin]);

  return active;
}
