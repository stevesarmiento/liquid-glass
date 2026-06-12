import { useInsertionEffect } from "react";

const injectedStyleIds = new Set<string>();

/**
 * Injects a static global stylesheet exactly once per document, no matter how
 * many component instances mount. Safe under StrictMode double-invocation and
 * a no-op during SSR.
 */
export function useGlobalCssOnce(id: string, cssText: string): void {
  useInsertionEffect(() => {
    if (typeof document === "undefined" || injectedStyleIds.has(id)) return;

    injectedStyleIds.add(id);
    const existing = document.head.querySelector(`style[data-lgds-global="${id}"]`);
    if (existing) {
      // Refresh stale content: under dev hot-reload this module re-evaluates
      // (resetting the Set) with NEW css, but the tag injected by the
      // previous module instance survives — sync it so style changes apply
      // without a full page reload.
      if (existing.textContent !== cssText) existing.textContent = cssText;
      return;
    }
    const style = document.createElement("style");
    style.setAttribute("data-lgds-global", id);
    style.textContent = cssText;
    document.head.appendChild(style);
  }, [id, cssText]);
}
