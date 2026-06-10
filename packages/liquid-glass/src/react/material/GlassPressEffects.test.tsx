import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlassPressEffects, updateGlassPointerLight } from "./GlassPressEffects";

describe("GlassPressEffects", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("renders nothing at zero progress but still injects the stylesheet", () => {
    act(() => root.render(<GlassPressEffects progress={0} />));

    expect(host.querySelector(".lg-glass-press-effects")).toBeNull();
    const styles = document.head.querySelector("style[data-liquid-glass]");
    expect(styles?.textContent).toContain(".lg-glass-press-effects");
    expect(styles?.textContent).toContain(".lg-glass-press-bloom");
    expect(styles?.textContent).toContain(".lg-glass-press-glow");
  });

  it("drives both layers' opacity from progress", () => {
    act(() => root.render(<GlassPressEffects exposure={0.34} progress={0.5} />));

    const effects = host.querySelector(".lg-glass-press-effects") as HTMLElement;
    expect(effects).not.toBeNull();
    expect(effects.getAttribute("aria-hidden")).toBe("true");

    const glow = effects.querySelector(".lg-glass-press-glow") as HTMLElement;
    const bloom = effects.querySelector(".lg-glass-press-bloom") as HTMLElement;
    expect(glow.style.opacity).toBe("0.5");
    expect(bloom.style.opacity).toBe(`${0.5 * 0.34}`);
  });

  it("exposes the glow geometry as CSS vars and can disable the glow", () => {
    act(() => root.render(<GlassPressEffects glowIntensity={0.5} glowRadiusPx={80} progress={1} />));

    const effects = host.querySelector(".lg-glass-press-effects") as HTMLElement;
    expect(effects.style.getPropertyValue("--lg-glass-press-glow-radius")).toBe("80px");
    expect(effects.style.getPropertyValue("--lg-glass-press-glow-intensity")).toBe("0.5");

    act(() => root.render(<GlassPressEffects glowIntensity={0} progress={1} />));
    expect(host.querySelector(".lg-glass-press-glow")).toBeNull();
    expect(host.querySelector(".lg-glass-press-bloom")).not.toBeNull();
  });
});

describe("updateGlassPointerLight", () => {
  it("writes the pointer position relative to the element as CSS vars", () => {
    const element = document.createElement("button");
    element.getBoundingClientRect = () =>
      ({ left: 100, top: 40, width: 200, height: 50, right: 300, bottom: 90, x: 100, y: 40 }) as DOMRect;

    updateGlassPointerLight(element, { clientX: 150, clientY: 65 });

    expect(element.style.getPropertyValue("--lg-glass-pointer-x")).toBe("50px");
    expect(element.style.getPropertyValue("--lg-glass-pointer-y")).toBe("25px");
  });
});
