export function setAttr(element: Element, name: string, value: string | number): boolean {
  const next = String(value);
  if (element.getAttribute(name) === next) return false;
  element.setAttribute(name, next);
  return true;
}

export function setStyle(element: HTMLElement, name: keyof CSSStyleDeclaration, value: string): boolean {
  if (element.style[name] === value) return false;
  (element.style as unknown as Record<keyof CSSStyleDeclaration, string>)[name] = value;
  return true;
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

export function setHref(element: SVGElement, value: string): boolean {
  const current = element.getAttribute("href") || element.getAttribute("xlink:href");
  if (current === value) return false;
  element.setAttribute("href", value);
  element.setAttributeNS("http://www.w3.org/1999/xlink", "href", value);
  return true;
}
