import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LensParams } from "../../engine/types";
import { normalizeLensParams } from "../../engine/defaults";

import { useGlassPress, isGlassActivationKey, type GlassPress, type GlassPressOptions } from "./useGlassPress";

function Harness({
  options,
  onRender,
}: {
  options?: GlassPressOptions;
  onRender: (press: GlassPress<HTMLButtonElement>) => void;
}) {
  onRender(useGlassPress<HTMLButtonElement>(options));
  return null;
}

describe("useGlassPress", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: GlassPress<HTMLButtonElement>;

  const mount = (options?: GlassPressOptions) => {
    act(() => {
      root.render(<Harness onRender={(press) => (latest = press)} options={options} />);
    });
  };

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("presses and auto-releases after holdMs on holdRelease", () => {
    mount({ tween: false });

    act(() => latest.press());
    expect(latest.pressed).toBe(true);
    expect(latest.progress).toBe(1);

    act(() => latest.holdRelease());
    expect(latest.pressed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(319);
    });
    expect(latest.pressed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(latest.pressed).toBe(false);
    expect(latest.progress).toBe(0);
  });

  it("honors a custom holdMs", () => {
    mount({ holdMs: 50, tween: false });

    act(() => latest.holdRelease());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(latest.pressed).toBe(false);
  });

  it("press() clears a pending hold-release so the press sticks", () => {
    mount({ tween: false });

    act(() => latest.holdRelease());
    act(() => latest.press());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest.pressed).toBe(true);
  });

  it("releaseIfIdle keeps a held release and reports whether it released", () => {
    mount({ tween: false });

    act(() => latest.holdRelease());
    let released: boolean | undefined;
    act(() => {
      released = latest.releaseIfIdle();
    });
    expect(released).toBe(false);
    expect(latest.pressed).toBe(true);

    act(() => {
      vi.advanceTimersByTime(320);
    });
    act(() => {
      released = latest.releaseIfIdle();
    });
    expect(released).toBe(true);
    expect(latest.pressed).toBe(false);
  });

  it("cancel releases immediately and clears the hold timer", () => {
    mount({ tween: false });

    act(() => latest.holdRelease());
    act(() => latest.cancel());
    expect(latest.pressed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest.pressed).toBe(false);
  });

  it("forcePressed holds the pressed state externally", () => {
    mount({ forcePressed: true, tween: false });
    expect(latest.pressed).toBe(true);
    expect(latest.progress).toBe(1);
  });

  it("gates press-side handlers on disabled but keeps key-up release live", () => {
    mount({ disabled: true, tween: false });

    const button = document.createElement("button");
    const pointerEvent = { currentTarget: button, pointerId: 1 } as never;
    act(() => latest.handlers.onPointerDown(pointerEvent));
    expect(latest.pressed).toBe(false);

    act(() => latest.handlers.onKeyDown({ key: " ", repeat: false } as never));
    expect(latest.pressed).toBe(false);

    // Release-side parity: an in-flight press always resolves with the hold.
    act(() => latest.handlers.onKeyUp({ key: "Enter" } as never));
    expect(latest.pressed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(latest.pressed).toBe(false);
  });

  it("presses via pointer and activation keys, ignoring key repeats", () => {
    mount({ tween: false });

    const button = document.createElement("button");
    act(() => latest.handlers.onPointerDown({ currentTarget: button, pointerId: 1 } as never));
    expect(latest.pressed).toBe(true);
    act(() => latest.handlers.onPointerUp({ currentTarget: button, pointerId: 1 } as never));
    expect(latest.pressed).toBe(true);
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(latest.pressed).toBe(false);

    act(() => latest.handlers.onKeyDown({ key: "x", repeat: false } as never));
    expect(latest.pressed).toBe(false);
    act(() => latest.handlers.onKeyDown({ key: " ", repeat: true } as never));
    expect(latest.pressed).toBe(false);
    act(() => latest.handlers.onKeyDown({ key: " ", repeat: false } as never));
    expect(latest.pressed).toBe(true);
    act(() => latest.handlers.onBlur({} as never));
    expect(latest.pressed).toBe(false);
  });

  it("boostLens scales optics and glow with progress and clamps the glow", () => {
    const lens: LensParams = normalizeLensParams({ scaleX: 40, scaleY: 20, glow: 1.9 });

    mount({ tween: false });
    const resting = latest.boostLens(lens);
    expect(resting.scaleX).toBe(40);
    expect(resting.scaleY).toBe(20);
    expect(resting.glow).toBeCloseTo(1.9, 10);

    act(() => latest.press());
    const boosted = latest.boostLens(lens);
    expect(boosted.scaleX).toBeCloseTo(40 * 1.15, 10);
    expect(boosted.scaleY).toBeCloseTo(20 * 1.15, 10);
    expect(boosted.glow).toBe(2); // 1.9 + 0.45 clamped to the default max

    const custom = latest.boostLens(lens, { scale: 1.5, glow: 0.1, maxGlow: 3 });
    expect(custom.scaleX).toBeCloseTo(40 * 1.5, 10);
    expect(custom.glow).toBeCloseTo(2, 10); // 1.9 + 0.1
  });
});

describe("isGlassActivationKey", () => {
  it("matches Space and Enter (including legacy Spacebar)", () => {
    expect(isGlassActivationKey(" ")).toBe(true);
    expect(isGlassActivationKey("Enter")).toBe(true);
    expect(isGlassActivationKey("Spacebar")).toBe(true);
    expect(isGlassActivationKey("a")).toBe(false);
    expect(isGlassActivationKey("Escape")).toBe(false);
  });
});
