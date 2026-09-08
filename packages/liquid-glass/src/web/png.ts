import type { DisplacementMap } from "../engine/types";

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;

export function displacementMapToPngDataUrl(map: DisplacementMap): string {
  if (typeof document === "undefined") {
    throw new Error("displacementMapToPngDataUrl requires a browser document");
  }

  canvas ??= document.createElement("canvas");
  context ??= canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create a 2D canvas context");

  if (canvas.width !== map.width || canvas.height !== map.height) {
    canvas.width = map.width;
    canvas.height = map.height;
  }

  const rgba = new Uint8ClampedArray(map.rgba);
  const imageData = new ImageData(rgba as ImageDataArray, map.width, map.height);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Same PNG encode, delivered as a UNIQUE blob: URL per call. Preferred for
 * feImage hrefs over data: URLs for two reasons observed with big maps
 * (1024²) under slider-drag churn in Chrome:
 * - a data: URL is a multi-MB attribute string reparsed on every filter
 *   rebuild, and its decode is cached BY URL — if a decode fails/aborts
 *   under pressure, every later rebuild reuses the poisoned black decode
 *   (a filter id cycle cannot heal it);
 * - a fresh blob: URL guarantees a fresh decode.
 * Callers own revocation (URL.revokeObjectURL) once the URL is replaced.
 */
export function displacementMapToPngBlobUrl(map: DisplacementMap): string {
  const dataUrl = displacementMapToPngDataUrl(map);
  // jsdom (tests) has no createObjectURL; the data URL fallback keeps the
  // rendering path identical there.
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return dataUrl;
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}

/** Revokes a URL produced by displacementMapToPngBlobUrl (no-op for data: fallbacks). */
export function revokeMapBlobUrl(url: string): void {
  if (url.startsWith("blob:") && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}
