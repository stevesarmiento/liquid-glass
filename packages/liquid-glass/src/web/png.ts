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
