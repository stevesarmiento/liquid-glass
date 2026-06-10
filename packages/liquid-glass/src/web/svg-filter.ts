import { createSvgElement, setAttr } from "./dom";

export interface SvgFilterElements {
  svg: SVGSVGElement;
  filter: SVGFilterElement;
  mapImage: SVGFEImageElement;
  mapMatrix: SVGFEColorMatrixElement;
  sourceBlur: SVGFEGaussianBlurElement;
  displacementR: SVGFEDisplacementMapElement;
  displacementG: SVGFEDisplacementMapElement;
  displacementB: SVGFEDisplacementMapElement;
  specMatrix: SVGFEColorMatrixElement;
  specFlood: SVGFEFloodElement;
}

export function createSvgFilter(id: string): SvgFilterElements {
  const svg = createSvgElement("svg");
  const defs = createSvgElement("defs");
  const filter = createSvgElement("filter");
  const flood = createSvgElement("feFlood");
  const mapImage = createSvgElement("feImage");
  const composite = createSvgElement("feComposite");
  const mapMatrix = createSvgElement("feColorMatrix");
  const sourceBlur = createSvgElement("feGaussianBlur");
  const displacementR = createSvgElement("feDisplacementMap");
  const displacementG = createSvgElement("feDisplacementMap");
  const displacementB = createSvgElement("feDisplacementMap");
  const isolateR = createSvgElement("feColorMatrix");
  const isolateG = createSvgElement("feColorMatrix");
  const isolateB = createSvgElement("feColorMatrix");
  const mergeRG = createSvgElement("feComposite");
  const mergeRGB = createSvgElement("feComposite");
  const specMatrix = createSvgElement("feColorMatrix");
  const specFlood = createSvgElement("feFlood");
  const specComposite = createSvgElement("feComposite");
  const specOver = createSvgElement("feComposite");

  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  svg.style.pointerEvents = "none";

  setAttr(filter, "id", id);
  setAttr(filter, "filterUnits", "userSpaceOnUse");
  setAttr(filter, "primitiveUnits", "userSpaceOnUse");
  setAttr(filter, "color-interpolation-filters", "sRGB");

  setAttr(flood, "flood-color", "rgb(128, 128, 128)");
  setAttr(flood, "flood-opacity", "1");
  setAttr(flood, "result", "mapBg");

  setAttr(mapImage, "result", "rawMap");
  setAttr(mapImage, "preserveAspectRatio", "none");

  setAttr(composite, "in", "rawMap");
  setAttr(composite, "in2", "mapBg");
  setAttr(composite, "operator", "over");
  setAttr(composite, "result", "map");

  setAttr(mapMatrix, "in", "map");
  setAttr(mapMatrix, "type", "matrix");
  setAttr(mapMatrix, "result", "scaledMap");

  setAttr(sourceBlur, "in", "SourceGraphic");
  setAttr(sourceBlur, "stdDeviation", "0");
  setAttr(sourceBlur, "result", "blurredSource");

  for (const [node, result] of [
    [displacementR, "dispR"],
    [displacementG, "dispG"],
    [displacementB, "dispB"],
  ] as const) {
    setAttr(node, "in", "blurredSource");
    setAttr(node, "in2", "scaledMap");
    setAttr(node, "xChannelSelector", "R");
    setAttr(node, "yChannelSelector", "G");
    setAttr(node, "scale", "0");
    setAttr(node, "result", result);
  }

  setAttr(isolateR, "in", "dispR");
  setAttr(isolateR, "type", "matrix");
  setAttr(isolateR, "values", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0");
  setAttr(isolateR, "result", "redChannel");

  setAttr(isolateG, "in", "dispG");
  setAttr(isolateG, "type", "matrix");
  setAttr(isolateG, "values", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0");
  setAttr(isolateG, "result", "greenChannel");

  setAttr(isolateB, "in", "dispB");
  setAttr(isolateB, "type", "matrix");
  setAttr(isolateB, "values", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0");
  setAttr(isolateB, "result", "blueChannel");

  // Recombine the isolated chroma channels additively (k2=1, k3=1), matching
  // the reverse-engineered original. feBlend "screen" is not additive and
  // produced washed-out fringes.
  setAttr(mergeRG, "in", "redChannel");
  setAttr(mergeRG, "in2", "greenChannel");
  setAttr(mergeRG, "operator", "arithmetic");
  setAttr(mergeRG, "k1", "0");
  setAttr(mergeRG, "k2", "1");
  setAttr(mergeRG, "k3", "1");
  setAttr(mergeRG, "k4", "0");
  setAttr(mergeRG, "result", "redGreen");

  setAttr(mergeRGB, "in", "redGreen");
  setAttr(mergeRGB, "in2", "blueChannel");
  setAttr(mergeRGB, "operator", "arithmetic");
  setAttr(mergeRGB, "k1", "0");
  setAttr(mergeRGB, "k2", "1");
  setAttr(mergeRGB, "k3", "1");
  setAttr(mergeRGB, "k4", "0");
  setAttr(mergeRGB, "result", "lensResult");

  setAttr(specMatrix, "in", "scaledMap");
  setAttr(specMatrix, "type", "matrix");
  setAttr(specMatrix, "result", "specMask");

  setAttr(specFlood, "flood-color", "rgb(255, 255, 255)");
  setAttr(specFlood, "flood-opacity", "0");
  setAttr(specFlood, "result", "specColor");

  setAttr(specComposite, "in", "specColor");
  setAttr(specComposite, "in2", "specMask");
  setAttr(specComposite, "operator", "in");
  setAttr(specComposite, "result", "specHighlight");

  setAttr(specOver, "in", "specHighlight");
  setAttr(specOver, "in2", "lensResult");
  setAttr(specOver, "operator", "over");
  setAttr(specOver, "result", "glassResult");

  filter.append(
    flood,
    mapImage,
    composite,
    mapMatrix,
    sourceBlur,
    displacementR,
    displacementG,
    displacementB,
    isolateR,
    isolateG,
    isolateB,
    mergeRG,
    mergeRGB,
    specMatrix,
    specFlood,
    specComposite,
    specOver,
  );
  defs.append(filter);
  svg.append(defs);

  return {
    svg,
    filter,
    mapImage,
    mapMatrix,
    sourceBlur,
    displacementR,
    displacementG,
    displacementB,
    specMatrix,
    specFlood,
  };
}
