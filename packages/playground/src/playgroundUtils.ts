import { DEFAULT_LENS_PARAMS, type LensParams, type ResolvedLensParams } from "liquid-glass";

import {
  CONTROL_GROUPS,
  FLOATING_CONTROLS_BAR_HEIGHT,
  FLOATING_CONTROLS_MARGIN,
  FLOATING_CONTROLS_WIDTH,
  type FloatingControlsPosition,
} from "./playgroundConfig";

/** Deep equality over the lens param fields (used to highlight the active stage preset). */
export function lensEquals(a: ResolvedLensParams, b: ResolvedLensParams): boolean {
  return (Object.keys(DEFAULT_LENS_PARAMS) as Array<keyof ResolvedLensParams>).every(
    (key) => a[key] === b[key],
  );
}

/**
 * Serializes the stage lens as a paste-ready TS `Partial<LensParams>`,
 * emitting only fields that differ from `baseline` (default: the package
 * defaults), in the control panel's display order.
 */
export function formatLensPresetTs(
  lens: ResolvedLensParams,
  options: { baseline?: ResolvedLensParams; name?: string } = {},
): string {
  const baseline = options.baseline ?? DEFAULT_LENS_PARAMS;
  const name = options.name ?? "preset";
  const fields = CONTROL_GROUPS.flat()
    .filter((key) => lens[key] !== baseline[key])
    .map((key) => `  ${key}: ${lens[key]},`);
  return [
    "// liquid-glass preset — fields differing from the package defaults",
    `const ${name}: Partial<LensParams> = {`,
    ...fields,
    "};",
    "",
  ].join("\n");
}

/** Optics forwarded by `forwardLensOptics` — everything except geometry. */
export type ForwardedLensOptics = Partial<Omit<LensParams, "width" | "height" | "radius">>;

export type LensOpticsCaps = Partial<Pick<ResolvedLensParams, "depth" | "dome" | "blur" | "mapSize">>;

/**
 * Forwards every optic of the stage lens except geometry (width/height/
 * radius), applying optional per-surface perf caps. Geometry stays owned by
 * each preview surface. Iterates DEFAULT_LENS_PARAMS keys so a param added to
 * the engine is forwarded automatically — the old per-surface hand-rolled
 * copies each silently dropped `maxSlope`, splitting the physics between the
 * stage and its previews.
 */
export function forwardLensOptics(
  lens: ResolvedLensParams,
  caps: LensOpticsCaps = {},
): ForwardedLensOptics {
  const optics: ForwardedLensOptics = {};
  for (const key of Object.keys(DEFAULT_LENS_PARAMS) as Array<keyof ResolvedLensParams>) {
    if (key === "width" || key === "height" || key === "radius") continue;
    const cap = caps[key as keyof LensOpticsCaps];
    optics[key] = cap === undefined ? lens[key] : Math.min(lens[key], cap);
  }
  return optics;
}

export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatHighlightPosition(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function formatHighlightRotation(value: number): string {
  return `${Math.round(value * 100) / 100}deg`;
}

export function computeTargetClipPath(
  position: { x: number; y: number },
  lens: ResolvedLensParams,
): string {
  return `inset(calc(${position.y * 100}% - ${lens.height / 2}px) calc(${100 - position.x * 100}% - ${lens.width / 2}px) calc(${100 - position.y * 100}% - ${lens.height / 2}px) calc(${position.x * 100}% - ${lens.width / 2}px) round ${lens.radius}px)`;
}

export function getInitialControlsPosition(): FloatingControlsPosition {
  if (typeof window === "undefined") return { x: FLOATING_CONTROLS_MARGIN, y: FLOATING_CONTROLS_MARGIN };

  return constrainControlsPosition({
    x: window.innerWidth - FLOATING_CONTROLS_WIDTH - 20,
    y: 64,
  });
}

export function constrainControlsPosition(position: FloatingControlsPosition): FloatingControlsPosition {
  if (typeof window === "undefined") return position;

  const maxX = Math.max(
    FLOATING_CONTROLS_MARGIN,
    window.innerWidth - Math.min(FLOATING_CONTROLS_WIDTH, window.innerWidth - FLOATING_CONTROLS_MARGIN * 2) - FLOATING_CONTROLS_MARGIN,
  );
  const maxY = Math.max(
    FLOATING_CONTROLS_MARGIN,
    window.innerHeight - FLOATING_CONTROLS_BAR_HEIGHT - FLOATING_CONTROLS_MARGIN,
  );

  return {
    x: Math.min(maxX, Math.max(FLOATING_CONTROLS_MARGIN, position.x)),
    y: Math.min(maxY, Math.max(FLOATING_CONTROLS_MARGIN, position.y)),
  };
}

export function safeSetPointerCapture(element: Element, pointerId: number): void {
  if (!("setPointerCapture" in element)) return;
  try {
    (element as Element & { setPointerCapture(pointerId: number): void }).setPointerCapture(pointerId);
  } catch {
    // Some embedded browsers can reject capture during synthetic or interrupted drags.
  }
}

export function safeHasPointerCapture(element: Element, pointerId: number): boolean {
  if (!("hasPointerCapture" in element)) return true;
  try {
    return (element as Element & { hasPointerCapture(pointerId: number): boolean }).hasPointerCapture(pointerId);
  } catch {
    return false;
  }
}

export function computeCoverSlice(input: {
  imageWidth: number;
  imageHeight: number;
  anchor: DOMRect;
  target: DOMRect;
}): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(input.anchor.width / input.imageWidth, input.anchor.height / input.imageHeight);
  const width = input.imageWidth * scale;
  const height = input.imageHeight * scale;

  return {
    x: input.anchor.left + (input.anchor.width - width) / 2 - input.target.left,
    y: input.anchor.top + (input.anchor.height - height) / 2 - input.target.top,
    width,
    height,
  };
}
