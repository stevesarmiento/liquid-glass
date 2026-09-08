import type { RefObject } from "react";

import { isTransparentCssColor } from "./canvas";

/** A same-origin image painted into a component\'s glass refraction source. */
export interface GlassBackdrop {
  /** Same-origin image URL painted into the refraction source. */
  image: string;
  /**
   * Element the image visually covers (CSS `background-size: cover`
   * semantics). Defaults to the control\'s offsetParent.
   */
  anchor?: RefObject<HTMLElement | null>;
}

/** Backdrop images are cached per URL so N components share one decode. */
const backdropImageCache = new Map<string, HTMLImageElement>();

export const getBackdropImage = (url: string): HTMLImageElement => {
  let image = backdropImageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    backdropImageCache.set(url, image);
  }
  return image;
};

export const peekBackdropImage = (url: string): HTMLImageElement | undefined =>
  backdropImageCache.get(url);

export const isBackdropImageReady = (
  image: HTMLImageElement | undefined,
): image is HTMLImageElement => Boolean(image && image.complete && image.naturalWidth > 0);

/** A backdrop discovered from an ancestor's CSS background-image. */
export interface AutoGlassBackdrop {
  image: string;
  anchorElement: HTMLElement;
}

/** Declared or discovered backdrop, normalized for the draw path. */
export type EffectiveGlassBackdrop = {
  image: string;
  anchor?: RefObject<HTMLElement | null>;
  anchorElement?: HTMLElement;
};

const BACKGROUND_URL_PATTERN = /url\((['"]?)(.*?)\1\)/;

/**
 * Walks up the DOM looking for an ancestor with a CSS background-image URL —
 * the dynamic counterpart of getCanvasBackgroundColor, so glass on an
 * image-backed page section refracts that image with no declaration. The
 * walk stops at the first opaque background color (content beyond it is
 * occluded). Fundamental limit: only ANCESTORS are discoverable — a backdrop
 * painted by a positioned sibling layer (visual stacking, not DOM ancestry)
 * must still be declared via the glassBackdrop prop.
 */
export function findAncestorBackdropImage(element: HTMLElement | null): AutoGlassBackdrop | null {
  let node = element?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const match = BACKGROUND_URL_PATTERN.exec(style.backgroundImage);
    if (match?.[2]) return { image: match[2], anchorElement: node };
    if (!isTransparentCssColor(style.backgroundColor)) return null;
    node = node.parentElement;
  }
  return null;
}
