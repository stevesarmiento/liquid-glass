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
    const style = document.createElement("style");
    style.setAttribute("data-lgds-global", id);
    style.textContent = cssText;
    document.head.appendChild(style);
  }, [id, cssText]);
}
