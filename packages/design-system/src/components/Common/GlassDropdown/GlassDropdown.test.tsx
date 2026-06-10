import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlassDropdown from "./index";
import type { GlassDropdownItem, GlassDropdownProps } from "./types";

/**
 * jsdom has no WebGL2 (getContext("webgl2") returns null), no matchMedia, no
 * ResizeObserver, and no PointerEvent — the component guards all of them, so
 * these tests exercise the state machine + a11y contract and assert the
 * no-goo fallback path never crashes.
 */

const ITEMS: GlassDropdownItem[] = [
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Billing" },
  { id: "archive", label: "Archive", disabled: true },
  { id: "logout", label: "Log out" }
];

function getTrigger(host: HTMLElement): HTMLButtonElement {
  const trigger = host.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']");
  if (!trigger) throw new Error("trigger not found");
  return trigger;
}

function getMenu(host: HTMLElement): HTMLElement {
  const menu = host.querySelector<HTMLElement>("[role='menu']");
  if (!menu) throw new Error("menu not found");
  return menu;
}

function getItems(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("[role='menuitem']"));
}

async function flushFocusTimer(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

function keydown(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

function keyup(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key }));
  });
}

function pointer(element: HTMLElement, type: string): void {
  act(() => {
    element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });
}

function pointerAt(
  element: HTMLElement | Document,
  type: string,
  clientX: number,
  clientY: number
): void {
  act(() => {
    element.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        button: 0,
        clientX,
        clientY,
        pointerId: 1
      })
    );
  });
}

/**
 * The menu grab runs its spring loop on rAF; these tests only assert gesture
 * semantics, so a queue that is never flushed keeps everything synchronous.
 */
function stubAnimationFrames(): void {
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    id += 1;
    queue.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => {
    queue.delete(frame);
  });
}

/**
 * Forces prefers-reduced-motion so the press tween / hover spring snap
 * synchronously — the press visuals become assertable without flushing rAF
 * (jsdom rAF timing is async and flaky to await).
 */
function stubReducedMotion(): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
}

const PRESS_EFFECTS_SELECTOR = ".lg-glass-press-effects";

describe("GlassDropdown", () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function render(props: Partial<GlassDropdownProps> = {}) {
    act(() => {
      root.render(<GlassDropdown items={ITEMS} {...props} />);
    });
  }

  it("renders a wired-up menu trigger (haspopup/expanded/controls/label)", () => {
    render({ label: "Open actions" });
    const trigger = getTrigger(host);
    const menu = getMenu(host);

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("Open actions");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(getItems(host)).toHaveLength(ITEMS.length);
    expect(getItems(host)[2].getAttribute("aria-disabled")).toBe("true");
  });

  it("opens and closes on trigger clicks (uncontrolled)", () => {
    const onOpenChange = vi.fn();
    render({ onOpenChange });
    const trigger = getTrigger(host);

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(getMenu(host).getAttribute("data-open")).toBe("true");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(getMenu(host).getAttribute("data-open")).toBe("false");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("ArrowDown opens and focuses the first enabled item; ArrowUp the last", async () => {
    render();
    const trigger = getTrigger(host);

    keydown(trigger, "ArrowDown");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await flushFocusTimer();
    expect(document.activeElement).toBe(getItems(host)[0]);

    keydown(getMenu(host), "Escape");
    keydown(trigger, "ArrowUp");
    await flushFocusTimer();
    expect(document.activeElement).toBe(getItems(host)[3]);
  });

  it("cycles with ArrowDown/ArrowUp skipping disabled items, Home/End jump", async () => {
    render();
    keydown(getTrigger(host), "ArrowDown");
    await flushFocusTimer();
    const menu = getMenu(host);
    const items = getItems(host);

    keydown(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    // items[2] is disabled — skipped.
    keydown(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[3]);
    keydown(menu, "ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    keydown(menu, "ArrowUp");
    expect(document.activeElement).toBe(items[3]);
    keydown(menu, "End");
    expect(document.activeElement).toBe(items[3]);
    keydown(menu, "Home");
    expect(document.activeElement).toBe(items[0]);
  });

  it("Escape closes and restores focus to the trigger", async () => {
    render();
    const trigger = getTrigger(host);
    keydown(trigger, "ArrowDown");
    await flushFocusTimer();

    keydown(getMenu(host), "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Tab closes without trapping focus", () => {
    render();
    const trigger = getTrigger(host);
    act(() => trigger.click());

    keydown(getMenu(host), "Tab");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on outside pointerdown", () => {
    render();
    const trigger = getTrigger(host);
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores pointerdown inside the menu", () => {
    render();
    const trigger = getTrigger(host);
    act(() => trigger.click());

    act(() => {
      getItems(host)[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("selecting an item fires callbacks, closes, and restores focus", () => {
    const onSelect = vi.fn();
    const itemSelect = vi.fn();
    const items: GlassDropdownItem[] = [
      { id: "one", label: "One", onSelect: itemSelect },
      { id: "two", label: "Two" }
    ];
    render({ items, onSelect });
    const trigger = getTrigger(host);
    act(() => trigger.click());

    act(() => getItems(host)[0].click());
    expect(itemSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[0]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("does not select disabled items", () => {
    const onSelect = vi.fn();
    render({ onSelect });
    const trigger = getTrigger(host);
    act(() => trigger.click());

    act(() => getItems(host)[2].click());
    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("controlled mode follows the open prop and only emits intents", () => {
    const onOpenChange = vi.fn();
    render({ onOpenChange, open: false });
    const trigger = getTrigger(host);

    act(() => trigger.click());
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // Parent has not flipped the prop — still closed.
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    render({ onOpenChange, open: true });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(getMenu(host).getAttribute("data-open")).toBe("true");

    render({ onOpenChange, open: false });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("survives the goo path without WebGL2 (glassBackdrop + measured layout)", () => {
    // Give every element a real-ish rect so the menu measures, the region
    // layout exists, and the goo canvas mounts; getContext then returns null
    // (as jsdom does), which must downgrade to the CSS fallback quietly.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 224,
      bottom: 160,
      width: 224,
      height: 160,
      toJSON: () => ({})
    } as DOMRect);

    expect(() => {
      render({ glassBackdrop: { image: "/images/test.jpg" } });
      const trigger = getTrigger(host);
      act(() => trigger.click());
      act(() => trigger.click());
    }).not.toThrow();
    expect(getTrigger(host).getAttribute("aria-expanded")).toBe("false");
  });

  it("Enter opens + focuses the first item while press visuals engage", async () => {
    stubReducedMotion();
    render();
    const trigger = getTrigger(host);

    keydown(trigger, "Enter");
    // Menu semantics keep priority…
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // …while the press visuals engage on the same keydown (snapped to full
    // press under reduced motion, so GlassPressEffects is mounted).
    expect(host.querySelector(PRESS_EFFECTS_SELECTOR)).not.toBeNull();

    await flushFocusTimer();
    expect(document.activeElement).toBe(getItems(host)[0]);

    // Releasing the key resolves the press without disturbing the open menu.
    keyup(trigger, "Enter");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("pointer presses engage press visuals and still toggle the menu", () => {
    stubReducedMotion();
    render();
    const trigger = getTrigger(host);

    pointer(trigger, "pointerdown");
    expect(host.querySelector(PRESS_EFFECTS_SELECTOR)).not.toBeNull();

    pointer(trigger, "pointerup");
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // The post-release hold keeps the press cue excited after the click.
    expect(host.querySelector(PRESS_EFFECTS_SELECTOR)).not.toBeNull();
  });

  it("toggles hover state with pointer enter/leave", () => {
    render();
    const trigger = getTrigger(host);
    expect(trigger.getAttribute("data-hovered")).toBeNull();

    pointer(trigger, "pointerover");
    expect(trigger.getAttribute("data-hovered")).toBe("true");

    pointer(trigger, "pointerout");
    expect(trigger.getAttribute("data-hovered")).toBeNull();
  });

  it("press/hover machinery no-ops safely on the fallback path under reduced motion", () => {
    stubReducedMotion();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 224,
      bottom: 160,
      width: 224,
      height: 160,
      toJSON: () => ({})
    } as DOMRect);

    expect(() => {
      render({ glassBackdrop: { image: "/images/test.jpg" } });
      const trigger = getTrigger(host);
      pointer(trigger, "pointerover");
      pointer(trigger, "pointermove");
      pointer(trigger, "pointerdown");
      pointer(trigger, "pointerup");
      act(() => trigger.click());
      keydown(trigger, "Escape");
      pointer(trigger, "pointerout");
    }).not.toThrow();
    // Click opened the menu; Escape on the trigger closed it again.
    expect(getTrigger(host).getAttribute("aria-expanded")).toBe("false");
    expect(getTrigger(host).getAttribute("data-hovered")).toBeNull();
  });

  it("respects defaultOpen", () => {
    render({ defaultOpen: true });
    expect(getTrigger(host).getAttribute("aria-expanded")).toBe("true");
    expect(getMenu(host).getAttribute("data-open")).toBe("true");
  });

  it("a sub-3px press on an item stays a pure click and selects it", () => {
    stubAnimationFrames();
    const onSelect = vi.fn();
    render({ onSelect });
    const trigger = getTrigger(host);
    act(() => trigger.click());
    const item = getItems(host)[0];

    // Press with a tiny tremor (2px) — below the engage threshold.
    pointerAt(item, "pointerdown", 100, 100);
    pointerAt(document, "pointermove", 102, 100);
    pointerAt(document, "pointerup", 102, 100);
    act(() => item.click());

    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("a >3px drag on the menu engages the grab and the moved release does not select", () => {
    stubAnimationFrames();
    const onSelect = vi.fn();
    render({ onSelect });
    const trigger = getTrigger(host);
    act(() => trigger.click());
    const item = getItems(host)[0];

    pointerAt(item, "pointerdown", 100, 100);
    pointerAt(document, "pointermove", 120, 110);
    pointerAt(document, "pointerup", 120, 110);
    // The browser still fires a click at the release point; it must be
    // swallowed by the grab gesture.
    act(() => item.click());

    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // The suppression is one-shot: a plain follow-up click selects normally.
    pointerAt(item, "pointerdown", 100, 100);
    pointerAt(document, "pointerup", 100, 100);
    act(() => item.click());
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it("closing mid-grab drops the gesture cleanly", () => {
    stubAnimationFrames();
    render();
    const trigger = getTrigger(host);
    act(() => trigger.click());
    const menu = getMenu(host);

    pointerAt(menu, "pointerdown", 100, 100);
    pointerAt(document, "pointermove", 130, 100);
    keydown(menu, "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    // The document listeners are gone: later pointer traffic is inert.
    expect(() => {
      pointerAt(document, "pointermove", 200, 200);
      pointerAt(document, "pointerup", 200, 200);
    }).not.toThrow();
  });

  it("menu grab gestures survive the no-WebGL goo fallback path", () => {
    stubAnimationFrames();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 224,
      bottom: 160,
      width: 224,
      height: 160,
      toJSON: () => ({})
    } as DOMRect);

    expect(() => {
      render({ glassBackdrop: { image: "/images/test.jpg" } });
      const trigger = getTrigger(host);
      act(() => trigger.click());
      const menu = getMenu(host);
      pointerAt(menu, "pointerdown", 100, 100);
      pointerAt(document, "pointermove", 140, 130);
      pointerAt(document, "pointermove", 160, 150);
      pointerAt(document, "pointerup", 160, 150);
    }).not.toThrow();
    expect(getTrigger(host).getAttribute("aria-expanded")).toBe("true");
  });
});
