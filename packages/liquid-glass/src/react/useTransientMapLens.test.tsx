import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeLensParams, quantizeLensSizeUp } from "../engine/defaults";
import type { ResolvedLensParams } from "../engine/types";
import { DEFAULT_RESIZE_SETTLE_MS, useTransientMapLens } from "./useTransientMapLens";

let latest: ResolvedLensParams | null = null;

function Probe({
  width,
  height,
  settleMs,
}: {
  width: number;
  height: number;
  settleMs?: number;
}): null {
  latest = useTransientMapLens(normalizeLensParams({ width, height }), settleMs);
  return null;
}

describe("useTransientMapLens", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    latest = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function render(width: number, height: number, settleMs?: number): void {
    act(() => {
      root.render(<Probe height={height} settleMs={settleMs} width={width} />);
    });
  }

  it("returns the exact lens on mount and after a single size change", () => {
    render(100, 50);
    expect(latest?.width).toBe(100);

    // First change of a burst stays exact (one-off relayouts pay nothing).
    render(110, 50);
    expect(latest?.width).toBe(110);
  });

  it("quantizes during a burst and settles back to exact", () => {
    render(100, 50);
    render(110, 50);
    // Second rapid change enters transient mode.
    render(120, 60);
    expect(latest?.width).toBe(quantizeLensSizeUp(120));
    expect(latest?.height).toBe(quantizeLensSizeUp(60));
    expect(latest?.width).toBeGreaterThanOrEqual(120);

    // Radius is never clamped tighter than the exact lens allows.
    expect(latest?.radius).toBe(normalizeLensParams({ width: 120, height: 60 }).radius);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_RESIZE_SETTLE_MS + 20);
    });
    expect(latest?.width).toBe(120);
    expect(latest?.height).toBe(60);
  });

  it("restarts the settle window on further changes", () => {
    render(100, 50);
    render(110, 50);
    render(120, 50);
    act(() => {
      vi.advanceTimersByTime(DEFAULT_RESIZE_SETTLE_MS - 20);
    });
    render(130, 50);
    expect(latest?.width).toBe(quantizeLensSizeUp(130));

    act(() => {
      vi.advanceTimersByTime(DEFAULT_RESIZE_SETTLE_MS - 20);
    });
    // Timer restarted by the 130 change: still transient.
    expect(latest?.width).toBe(quantizeLensSizeUp(130));

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(latest?.width).toBe(130);
  });

  it("treats slow changes (further apart than settleMs) as exact", () => {
    render(100, 50);
    render(110, 50);
    act(() => {
      vi.advanceTimersByTime(DEFAULT_RESIZE_SETTLE_MS + 20);
    });
    render(120, 50);
    expect(latest?.width).toBe(120);
  });

  it("is disabled entirely with settleMs 0", () => {
    render(100, 50, 0);
    render(110, 50, 0);
    render(120, 50, 0);
    render(130, 50, 0);
    expect(latest?.width).toBe(130);
  });
});
