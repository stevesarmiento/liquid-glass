/**
 * Shared Safari detection for the controller and React hooks.
 *
 * Many non-Safari browsers ship "Safari" in their user agent (Chrome,
 * Chromium-based shells, and every iOS browser: CriOS, FxiOS, EdgiOS,
 * OPiOS, ...). We first reject those known impostor tokens, then prefer
 * the feature-ish `window.safari` host object (present in desktop
 * Safari), and finally fall back to the WebKit + Safari UA pair.
 */
const NON_SAFARI_TOKENS =
  /(chrome|chromium|crios|fxios|edgios|edga|edg\/|opr\/|opios|samsungbrowser|ucbrowser|android)/i;

export function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (NON_SAFARI_TOKENS.test(ua)) return false;
  if (typeof window !== "undefined" && "safari" in window) return true;
  return /applewebkit/i.test(ua) && /safari/i.test(ua);
}
