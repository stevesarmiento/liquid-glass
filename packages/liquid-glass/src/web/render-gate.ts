/**
 * Render gating: suspend glass work for elements that are offscreen or in a
 * hidden tab, and wake them (dirty) when they come back. Matches the
 * `pauseOffscreen` behavior of the original implementation noted in
 * docs/reverse-engineering.md.
 *
 * One IntersectionObserver is shared per rootMargin, and one visibilitychange
 * listener is refcounted across all gates. Environments without
 * IntersectionObserver (older browsers, jsdom) fall back to permanently
 * intersecting — gating then only reflects tab visibility.
 */

export interface RenderGate {
  /** True when the element is (near-)visible AND the page is not hidden. */
  readonly active: boolean;
  /** Notifies on every active-state flip. Returns an unsubscribe. */
  subscribe(listener: (active: boolean) => void): () => void;
  destroy(): void;
}

export interface RenderGateOptions {
  /**
   * Margin around the viewport that still counts as visible, so re-entering
   * elements repaint just before they scroll into view. Default "96px".
   */
  rootMargin?: string;
}

const DEFAULT_ROOT_MARGIN = "96px";

interface SharedObserver {
  observer: IntersectionObserver;
  targets: Map<Element, (intersecting: boolean) => void>;
}

const sharedObservers = new Map<string, SharedObserver>();

function getSharedObserver(rootMargin: string): SharedObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  let shared = sharedObservers.get(rootMargin);
  if (!shared) {
    const targets = new Map<Element, (intersecting: boolean) => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) targets.get(entry.target)?.(entry.isIntersecting);
      },
      { rootMargin },
    );
    shared = { observer, targets };
    sharedObservers.set(rootMargin, shared);
  }
  return shared;
}

let visibilityListeners = 0;
const visibilitySubscribers = new Set<() => void>();

function onVisibilityChange(): void {
  for (const subscriber of visibilitySubscribers) subscriber();
}

function addVisibilitySubscriber(subscriber: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  visibilitySubscribers.add(subscriber);
  if (visibilityListeners === 0) {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  visibilityListeners += 1;
  return () => {
    visibilitySubscribers.delete(subscriber);
    visibilityListeners -= 1;
    if (visibilityListeners === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function createRenderGate(element: Element, options: RenderGateOptions = {}): RenderGate {
  const rootMargin = options.rootMargin ?? DEFAULT_ROOT_MARGIN;
  const shared = getSharedObserver(rootMargin);
  // Optimistic until the observer reports: a visible mount stays active with
  // no flip (and no redundant re-render); an offscreen mount pays one initial
  // draw and is then gated. (Also the fallback when IO is unavailable.)
  let intersecting = true;
  let visible = pageVisible();
  let active = intersecting && visible;
  let destroyed = false;
  const listeners = new Set<(active: boolean) => void>();

  const recompute = () => {
    const next = intersecting && visible;
    if (next === active) return;
    active = next;
    for (const listener of listeners) listener(active);
  };

  if (shared) {
    shared.targets.set(element, (next) => {
      intersecting = next;
      recompute();
    });
    shared.observer.observe(element);
  }

  const removeVisibility = addVisibilitySubscriber(() => {
    visible = pageVisible();
    recompute();
  });

  return {
    get active() {
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      removeVisibility();
      if (shared) {
        shared.targets.delete(element);
        shared.observer.unobserve(element);
        if (shared.targets.size === 0) {
          shared.observer.disconnect();
          sharedObservers.delete(rootMargin);
        }
      }
    },
  };
}
