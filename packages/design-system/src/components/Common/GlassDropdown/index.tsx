import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import {
  MERGED_ALPHA_DISTANCE_RANGE,
  createWebglGlassRenderer,
  generateMergedDisplacementMap,
  getSharedLiquidGlassEngine,
  mergedMapKey,
  normalizeLensParams,
  parseCssColor,
  resolveGlassTint,
  type DisplacementMap,
  type GlassTint,
  type LensParams,
  type MergedLensShape,
  type MergedMapInput,
  type ResolvedLensParams,
  type WebglGlassChrome,
  type WebglGlassRenderer
} from "liquid-glass";
import {
  createSpring,
  isGlassActivationKey,
  useGlassGrab,
  useGlassHoverTint,
  useGlassPress,
  type GlassPress,
  type Spring
} from "liquid-glass/react";

import {
  DropdownRoot,
  GooCanvas,
  Menu,
  MenuItem,
  MenuItemIcon,
  MenuItemLabel,
  TriggerButton,
  TriggerIcon,
  TriggerIconInner
} from "./styles";
import type { GlassDropdownItem, GlassDropdownPlacement, GlassDropdownProps } from "./types";
import { computeCoverSlice, getCanvasBackgroundColor } from "../../../lib/canvas";
import useGlassTheme from "../../../hooks/useGlassTheme";

/**
 * Region margin around the final trigger+menu bounds, in px. Equal to the
 * merged map's signed-distance band so the shader's drop shadow (whose
 * offset + blur are capped to this band, see chromeForTint) never clips at
 * the region edge, and so the goo neck has room to bulge.
 */
const REGION_MARGIN = MERGED_ALPHA_DISTANCE_RANGE;
/** Open-menu corner radius the menu lens settles into. */
const MENU_RADIUS = 18;
/** Collapsed menu-lens size as a fraction of the trigger diameter. */
const COLLAPSED_LENS_FRACTION = 0.6;
/** Open progress at which the menu items start their staggered reveal. */
const ITEM_REVEAL_PROGRESS = 0.55;
/** Spring overshoot clamp for the lens interpolation (gooey "pop"). */
const MAX_LENS_PROGRESS = 1.1;
/** Slightly underdamped so the menu pops out of the trigger like liquid. */
const OPEN_SPRING = { stiffness: 320, damping: 24 };
/** Faster and calmer so the menu is reabsorbed without wobble. */
const CLOSE_SPRING = { stiffness: 420, damping: 34 };
/** How long the menu DOM stays visible after a close starts, in ms. */
const CLOSE_HIDE_MS = 280;

/**
 * Press/hover feel constants — mirrored 1:1 from GlassButton so the trigger
 * has full interaction parity with a standalone glass button. The trigger
 * cannot mount a GlassButton (its glass face IS lens L0 of the merged goo
 * canvas — that would be double glass), so the same material APIs are wired
 * straight into the goo's draw inputs instead.
 */
/** Post-release hold before the pressed cue relaxes, in ms. */
const ACTIVE_RELEASE_MS = 320;
/** Press tween attack/release durations, in ms. */
const PRESS_TWEEN_IN_MS = 150;
const PRESS_TWEEN_OUT_MS = 260;
/** Pressed-optics boost: lens scale ×1.15 and +0.45 glow at full press. */
const PRESSED_OPTICS_SCALE = 1.15;
const PRESSED_GLOW_BOOST = 0.45;
const MAX_GLOW = 2;
/** Hover = denser, more saturated tint expressed in the glass chrome. */
const HOVER_TINT_OPACITY_BOOST = 0.06;
const HOVER_SATURATION_SCALE = 1.4;
/** Extra chrome saturation at full press, layered on the hover/rest tint. */
const PRESS_SATURATION_BOOST = 0.9;
const MAX_SATURATION = 3;
/**
 * Press illumination, expressed in the glass itself (shader chrome — NEVER a
 * DOM overlay, which would stay a rigid circle while the goo deforms):
 * a uniform brightness lift across the blob ("the light turns on") plus a
 * pointer-anchored interior light, so the glass knows where the source is.
 * Keyboard presses anchor the light at the trigger center.
 *
 * `pressHighlight` picks the intensity, not the mechanism: "natural" is the
 * material's own subtle response; "additive" is the hotter, bloom-like
 * grade (the overexposure look GlassButton's DOM layer gives) — but still
 * rendered in the glass, so both morph with the trigger.
 */
const PRESS_ILLUMINATION: Record<
  "natural" | "additive",
  { brightness: number; light: number }
> = {
  natural: { brightness: 0.1, light: 0.3 },
  additive: { brightness: 0.26, light: 0.5 }
};
const PRESS_LIGHT_RADIUS_PX = 110;
/**
 * Press squish, expressed in the merged map itself: at full press the trigger
 * lens (L0) compresses vertically ~2.5% with a +1% width gain for volume.
 * This replaces GlassButton's DOM-transform squish — the refraction itself
 * squashes, the icon (content ON the glass) stays put above it.
 */
const PRESS_SQUISH_Y = 0.025;
const PRESS_SQUISH_X = 0.01;
/**
 * Hover chrome cross-fade spring. The chrome is shader uniforms (no CSS
 * transition possible), so a near-critically-damped spring (~250ms feel,
 * critical damping for k=170 is ≈26.1) interpolates the parsed chrome floats
 * per frame instead. Reduced motion jumps.
 */
const HOVER_SPRING = { stiffness: 170, damping: 26 };
/** Press cue on the trigger icon (content on glass — the goo face is below).
 * Same 0.98 active scale GlassButton applies, but driven by the press tween
 * (works for keyboard presses too) and applied to the icon span ONLY — the
 * canvas-painted glass face must not DOM-scale; it dips in the map instead
 * (PRESS_FACE_SCALE below). */
const PRESS_ICON_SCALE = 0.98;
/**
 * GlassButton's root :active scale(0.98) compresses the ENTIRE glass face,
 * lens included. The trigger's face is canvas-painted, so the same dip is
 * expressed in the merged map: L0 shrinks uniformly along the press tween,
 * with the anisotropic squish composing on top. Without this the glass reads
 * rigid under the finger — only the icon moved.
 */
const PRESS_FACE_SCALE = 0.98;
/**
 * Grab-the-material on the OPEN menu: press-and-drag does not move the menu,
 * it elastically deforms the actual lens. The rubberbanded deflection from
 * useGlassGrab feeds the merged-map inputs per frame — the L1 menu lens
 * shifts toward the pull and grows along the pulled axes, so the goo neck
 * reacts physically — and the menu CONTENT gets a lighter parallax translate
 * (it is content ON the glass, loosely attached). Bigger body than a button,
 * so a bigger deflection asymptote.
 */
const MENU_GRAB_MAX_PX = 12;
/** Pointer travel in px before a menu press becomes a grab (taps stay pure clicks). */
const MENU_GRAB_ENGAGE_PX = 3;
/** Fraction of the deflection applied to the menu lens center. */
const MENU_GRAB_CENTER_FACTOR = 0.6;
/** Lens growth per px of |deflection| along each axis (stretch toward the pull). */
const MENU_GRAB_SIZE_FACTOR = 0.5;
/** Content parallax: the items ride lighter than the glass itself. */
const MENU_GRAB_CONTENT_FACTOR = 0.3;
/**
 * Grab-the-material on the TRIGGER — the piece of GlassButton parity that was
 * missing: press-and-drag does not move the trigger, it elastically stretches
 * the glass toward the pull and bounces back on release. Like the press
 * squish, it is expressed in the merged map itself (lens L0 shifts toward the
 * pull and grows along the pulled axes, so the goo neck reacts too) — the
 * canvas-painted face must not DOM-transform. Same deflection asymptote as
 * GlassButton's grab (8px); the icon (content ON the glass) rides a lighter
 * parallax, mirroring the menu items.
 */
const TRIGGER_GRAB_MAX_PX = 8;
/** Fraction of the deflection applied to the trigger lens center. */
const TRIGGER_GRAB_CENTER_FACTOR = 0.6;
/** Lens growth per px of |deflection| along each axis (stretch toward the pull). */
const TRIGGER_GRAB_SIZE_FACTOR = 0.5;
/** Icon parallax: the icon rides lighter than the glass itself. */
const TRIGGER_GRAB_CONTENT_FACTOR = 0.3;

/**
 * Resting optics for the merged map. Tuned for the dropdown's scale: a
 * shallow dome and gentle displacement so menu text behind the goo stays
 * readable while the rim still reads as glass. mapSize 192 keeps per-frame
 * regeneration sub-millisecond during the morph.
 */
const DEFAULT_DROPDOWN_OPTICS: Partial<LensParams> = {
  depth: 14,
  dome: 40,
  scaleX: 14,
  scaleY: 12,
  chroma: 0.5,
  glow: 0.5,
  edge: 0.6,
  blur: 1.2,
  mapSize: 192
};

/**
 * Local copy of the controller's chromeForTint mapping (controller.ts):
 * fill from `background`, 1.5px border band from `border`, rim highlight from
 * `highlight` (alpha = strength, floored so presets keep a subtle top rim),
 * interior glow from the highlight gradient fields, saturation, and the CSS
 * reference shadow (0 18px 48px) scaled uniformly so |offset| + blur fits the
 * map's ±MERGED_ALPHA_DISTANCE_RANGE alpha band exactly.
 */
const MIN_RIM_STRENGTH = 0.18;
const CSS_SHADOW_OFFSET_Y = 18;
const CSS_SHADOW_BLUR = 48;
const MERGED_SHADOW_SCALE = MERGED_ALPHA_DISTANCE_RANGE / (CSS_SHADOW_OFFSET_Y + CSS_SHADOW_BLUR);

function chromeForTint(tint: GlassTint): WebglGlassChrome {
  const highlight = parseCssColor(tint.highlight);
  const shadow = parseCssColor(tint.shadow);
  return {
    tint: parseCssColor(tint.background) ?? [0, 0, 0, 0],
    border: parseCssColor(tint.border) ?? [0, 0, 0, 0],
    // Match the CSS chrome's `border: 1px solid` (GlassButton, single-lens
    // draggable). The shader AA softens both edges of the band, so anything
    // wider reads visibly fatter than the CSS border.
    borderWidth: 1,
    highlight: highlight ? [highlight[0], highlight[1], highlight[2]] : [1, 1, 1],
    highlightStrength: Math.max(highlight ? highlight[3] : 0, MIN_RIM_STRENGTH),
    lightDir: rotateDir(lightDirFromHighlight(tint.highlightX, tint.highlightY), tint.highlightRotation),
    highlightSpread: tint.highlightSpread,
    highlightCore: tint.highlightCore,
    highlightAniso: [tint.highlightWidth, tint.highlightHeight],
    glowColor: highlight ?? [1, 1, 1, 0],
    glowAnchor: [tint.highlightX, tint.highlightY],
    glowRadii: [tint.highlightWidth, tint.highlightHeight],
    glowRotation: (tint.highlightRotation * Math.PI) / 180,
    saturation: tint.saturation,
    shadowColor: shadow ?? [0, 0, 0, 0],
    shadowOffset: [0, CSS_SHADOW_OFFSET_Y * MERGED_SHADOW_SCALE],
    shadowBlur: CSS_SHADOW_BLUR * MERGED_SHADOW_SCALE
  };
}

function lightDirFromHighlight(highlightX: number, highlightY: number): [number, number] {
  const dx = highlightX - 0.5;
  const dy = highlightY - 0.5;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.05) return [0, -1];
  return [dx / length, dy / length];
}

function rotateDir(dir: [number, number], degrees: number): [number, number] {
  if (!Number.isFinite(degrees) || degrees === 0) return dir;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dir[0] * cos - dir[1] * sin, dir[0] * sin + dir[1] * cos];
}

/**
 * Lerps the hover-affected chrome uniforms between the resting and hover
 * chromes at hover progress `t`. useGlassHoverTint only densifies the tint
 * fill and scales the backdrop saturation, so those are the only fields that
 * differ — they are interpolated as PARSED floats (tint RGBA + saturation);
 * everything else comes from `rest`. Chrome rides the render pass only: it is
 * deliberately NOT part of the merged-map cache key, so a hover tween redraws
 * with the cached map and never regenerates it.
 */
function blendChrome(
  rest: WebglGlassChrome,
  hover: WebglGlassChrome,
  t: number
): WebglGlassChrome {
  if (t <= 0) return rest;
  if (t >= 1) return hover;
  return {
    ...rest,
    tint: [
      lerp(rest.tint[0], hover.tint[0], t),
      lerp(rest.tint[1], hover.tint[1], t),
      lerp(rest.tint[2], hover.tint[2], t),
      lerp(rest.tint[3], hover.tint[3], t)
    ],
    saturation: lerp(rest.saturation ?? 1, hover.saturation ?? 1, t)
  };
}

/** Backdrop images are cached per URL so N dropdowns share one decode. */
const backdropImageCache = new Map<string, HTMLImageElement>();

const getBackdropImage = (url: string): HTMLImageElement => {
  let image = backdropImageCache.get(url);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = url;
    backdropImageCache.set(url, image);
  }
  return image;
};

const isBackdropImageReady = (image: HTMLImageElement | undefined): image is HTMLImageElement =>
  Boolean(image && image.complete && image.naturalWidth > 0);

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Final-layout geometry, all in px. Region coords are root-local. */
interface DropdownLayout {
  region: { left: number; top: number; width: number; height: number };
  /** Trigger circle center, in region px. */
  trigger: { cx: number; cy: number };
  /** Open menu rect (root-local left/top) + its center in region px. */
  menu: { left: number; top: number; width: number; height: number; cx: number; cy: number };
}

function computeLayout(
  triggerSize: number,
  menuWidth: number,
  menuHeight: number,
  gap: number,
  placement: GlassDropdownPlacement
): DropdownLayout {
  const menuLeft =
    placement === "bottom"
      ? (triggerSize - menuWidth) / 2
      : placement === "bottom-end"
        ? triggerSize - menuWidth
        : 0;
  const menuTop = triggerSize + gap;
  const left = Math.min(0, menuLeft) - REGION_MARGIN;
  const top = -REGION_MARGIN;
  const right = Math.max(triggerSize, menuLeft + menuWidth) + REGION_MARGIN;
  const bottom = menuTop + menuHeight + REGION_MARGIN;

  return {
    region: { left, top, width: right - left, height: bottom - top },
    trigger: { cx: triggerSize / 2 - left, cy: triggerSize / 2 - top },
    menu: {
      left: menuLeft,
      top: menuTop,
      width: menuWidth,
      height: menuHeight,
      cx: menuLeft + menuWidth / 2 - left,
      cy: menuTop + menuHeight / 2 - top
    }
  };
}

/**
 * The morph: L0 is the trigger circle (constant), L1 is the menu lens
 * animated by open progress p. At p=0 the menu lens sits fully inside the
 * trigger circle, where the merged generator's overlap-aware blend
 * attenuation collapses the smooth-min to a clean union — the blob IS the
 * circle. As p grows the lens pulls away and the attenuation releases the
 * full blend, so a liquid neck forms, then settles into one connected blob
 * (trigger + menu bridged across the gap) at p=1.
 *
 * `pressProgress` squishes L0 in the map itself (height −2.5%, width +1% at
 * full press, radius pinned to the squashed height so the lens stays a
 * capsule): the actual glass deforms under the finger, not a DOM transform.
 *
 * `grabDx`/`grabDy` (the rubberbanded grab deflection) deform L1 the same
 * way: its center shifts toward the pull and it grows along the pulled axes,
 * so dragging the open menu stretches the actual lens — and the goo neck —
 * instead of moving the panel.
 *
 * `triggerGrabDx`/`triggerGrabDy` apply the identical treatment to L0: a
 * press-and-drag on the trigger stretches the trigger glass itself (radius
 * pinned to the deformed shape so it stays a capsule).
 */
function lensesAt(
  p: number,
  layout: DropdownLayout,
  triggerSize: number,
  pressProgress: number,
  grabDx: number,
  grabDy: number,
  triggerGrabDx: number,
  triggerGrabDy: number
): MergedLensShape[] {
  const collapsed = triggerSize * COLLAPSED_LENS_FRACTION;
  // Uniform press dip (GlassButton's :active scale) first, then the
  // anisotropic squish on top of the dipped size.
  const pressedSize = triggerSize * (1 - (1 - PRESS_FACE_SCALE) * pressProgress);
  const squishedHeight = pressedSize * (1 - PRESS_SQUISH_Y * pressProgress);
  const triggerWidth =
    pressedSize * (1 + PRESS_SQUISH_X * pressProgress) +
    Math.abs(triggerGrabDx) * TRIGGER_GRAB_SIZE_FACTOR;
  const triggerHeight = squishedHeight + Math.abs(triggerGrabDy) * TRIGGER_GRAB_SIZE_FACTOR;
  return [
    {
      x: layout.trigger.cx + triggerGrabDx * TRIGGER_GRAB_CENTER_FACTOR,
      y: layout.trigger.cy + triggerGrabDy * TRIGGER_GRAB_CENTER_FACTOR,
      width: triggerWidth,
      height: triggerHeight,
      radius: Math.min(triggerWidth, triggerHeight) / 2
    },
    {
      x: lerp(layout.trigger.cx, layout.menu.cx, p) + grabDx * MENU_GRAB_CENTER_FACTOR,
      y: lerp(layout.trigger.cy, layout.menu.cy, p) + grabDy * MENU_GRAB_CENTER_FACTOR,
      width: Math.max(
        1,
        lerp(collapsed, layout.menu.width, p) + Math.abs(grabDx) * MENU_GRAB_SIZE_FACTOR
      ),
      height: Math.max(
        1,
        lerp(collapsed, layout.menu.height, p) + Math.abs(grabDy) * MENU_GRAB_SIZE_FACTOR
      ),
      radius: Math.max(0, lerp(triggerSize / 2, MENU_RADIUS, p))
    }
  ];
}

const DefaultTriggerIcon = () => (
  <svg aria-hidden="true" fill="currentColor" height="20" viewBox="0 0 20 20" width="20">
    <circle cx="4.25" cy="10" r="1.75" />
    <circle cx="10" cy="10" r="1.75" />
    <circle cx="15.75" cy="10" r="1.75" />
  </svg>
);

/** Per-instance imperative goo machinery — never touches React state. */
interface GooState {
  renderer: WebglGlassRenderer | null;
  scene: HTMLCanvasElement | null;
  sceneKey: string;
  sceneScale: number;
  spring: Spring;
  raf: number | null;
  lastTime: number | null;
  itemsShown: boolean;
  mapKey: string | null;
  map: DisplacementMap | null;
  /** Hover chrome cross-fade (0 = resting tint, 1 = hover tint). */
  hoverSpring: Spring;
  hoverRaf: number | null;
  hoverLastTime: number | null;
  /** Rubberbanded grab deflection (px), fed by useGlassGrab's onDeflection. */
  grabDx: number;
  grabDy: number;
  /** Trigger grab deflection (px) — deforms lens L0 the way grabDx/Dy deform L1. */
  triggerGrabDx: number;
  triggerGrabDy: number;
  /** Last pointer position in region px (null until the pointer visits). */
  pointerX: number | null;
  pointerY: number | null;
}

/** Everything drawFrame needs, refreshed every render (latest-ref pattern). */
interface DrawInput {
  layout: DropdownLayout | null;
  optics: ResolvedLensParams;
  /** Chrome derived from the resting tint. */
  restingChrome: WebglGlassChrome;
  /** Chrome derived from the hover tint (denser fill, boosted saturation). */
  hoverChrome: WebglGlassChrome;
  blend: number;
  triggerSize: number;
  /** Tweened 0..1 press progress from useGlassPress. */
  pressProgress: number;
  /** Latest progress-closing boostLens from useGlassPress. */
  boostLens: GlassPress["boostLens"];
  backdropUrl: string | undefined;
  anchor: RefObject<HTMLElement | null> | undefined;
  engineMode: NonNullable<GlassDropdownProps["engineMode"]>;
  pressHighlight: NonNullable<GlassDropdownProps["pressHighlight"]>;
}

const GlassDropdown = ({
  blend = 36,
  className,
  defaultOpen = false,
  engineMode = "auto",
  gap = 10,
  glassBackdrop,
  glassLens,
  glassTint,
  icon,
  items,
  label = "Open menu",
  materialDeformation = true,
  menuWidth = 224,
  onOpenChange,
  onSelect,
  open,
  placement = "bottom-start",
  pressHighlight = "natural",
  triggerSize = 48
}: GlassDropdownProps) => {
  const theme = useGlassTheme();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusRef = useRef<"first" | "last" | null>(null);

  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  const [menuHeight, setMenuHeight] = useState(0);
  // True after the open transition starts; flips back after the close
  // animation so the fading items stay visible while the goo is reabsorbed.
  const [menuVisible, setMenuVisible] = useState(isOpen);
  // WebGL2 missing (or context lost): plain CSS-animated panel, no goo.
  const [gooUnavailable, setGooUnavailable] = useState(false);
  // Bumped when the renderer mounts / backdrop finishes decoding, so the
  // static-draw effect repaints without remounting anything.
  const [gooVersion, setGooVersion] = useState(0);

  const wantsGoo = Boolean(glassBackdrop);
  const gooActive = wantsGoo && !gooUnavailable;

  const resolvedTint = useMemo(() => resolveGlassTint(glassTint ?? "frost"), [glassTint]);
  // Hover comes from the glass itself (same numbers as GlassButton): a
  // slightly denser, more saturated tint. The goo chrome derives from BOTH
  // tints; drawFrame cross-fades the parsed floats with the hover spring.
  const { restingTint, hoverTint } = useGlassHoverTint(resolvedTint, {
    opacityBoost: HOVER_TINT_OPACITY_BOOST,
    saturationScale: HOVER_SATURATION_SCALE
  });
  const restingChrome = useMemo(() => chromeForTint(restingTint), [restingTint]);
  const hoverChrome = useMemo(() => chromeForTint(hoverTint), [hoverTint]);
  const optics = useMemo(
    () => normalizeLensParams({ ...DEFAULT_DROPDOWN_OPTICS, ...glassLens }),
    [glassLens]
  );
  const layout = useMemo(
    () =>
      menuHeight > 0 ? computeLayout(triggerSize, menuWidth, menuHeight, gap, placement) : null,
    [gap, menuHeight, menuWidth, placement, triggerSize]
  );

  // Press machinery from the material layer: pointer/keyboard parity,
  // pointer-capture safety, the post-release hold, and the rAF press tween.
  // The spreadable handlers compose with the trigger's menu semantics — menu
  // intent stays in onClick/onKeyDown, the press handlers only excite the
  // material — so both pointer and keyboard activation get press visuals.
  const press = useGlassPress<HTMLButtonElement>({
    holdMs: ACTIVE_RELEASE_MS,
    tweenInMs: PRESS_TWEEN_IN_MS,
    tweenOutMs: PRESS_TWEEN_OUT_MS
  });
  const pressProgress = press.progress;
  const [isHovered, setIsHovered] = useState(false);

  const gooRef = useRef<GooState | null>(null);
  if (gooRef.current === null) {
    gooRef.current = {
      renderer: null,
      scene: null,
      sceneKey: "",
      sceneScale: 1,
      spring: createSpring(isOpen ? CLOSE_SPRING : OPEN_SPRING),
      raf: null,
      lastTime: null,
      itemsShown: false,
      mapKey: null,
      map: null,
      hoverSpring: createSpring(HOVER_SPRING),
      hoverRaf: null,
      hoverLastTime: null,
      grabDx: 0,
      grabDy: 0,
      triggerGrabDx: 0,
      triggerGrabDy: 0,
      pointerX: null,
      pointerY: null
    };
    gooRef.current.spring.position = isOpen ? 1 : 0;
    gooRef.current.spring.target = isOpen ? 1 : 0;
  }

  const drawInputRef = useRef<DrawInput>(null as unknown as DrawInput);
  drawInputRef.current = {
    layout,
    optics,
    restingChrome,
    hoverChrome,
    blend,
    triggerSize,
    pressProgress,
    boostLens: press.boostLens,
    backdropUrl: glassBackdrop?.image,
    anchor: glassBackdrop?.anchor,
    engineMode,
    pressHighlight
  };

  /** Re-slices the backdrop into the scratch scene canvas (cover-aligned). */
  const refreshScene = useCallback(() => {
    const goo = gooRef.current!;
    const root = rootRef.current;
    const input = drawInputRef.current;
    if (!root || !input.layout || !input.backdropUrl) return;

    if (!goo.scene) goo.scene = document.createElement("canvas");
    const region = input.layout.region;
    const scale = clamp(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      1,
      2
    );
    goo.sceneScale = scale;
    goo.scene.width = Math.max(1, Math.round(region.width * scale));
    goo.scene.height = Math.max(1, Math.round(region.height * scale));
    const ctx = goo.scene.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const rootRect = root.getBoundingClientRect();
    const regionRect = { left: rootRect.left + region.left, top: rootRect.top + region.top };

    ctx.fillStyle = getCanvasBackgroundColor(root.parentElement);
    ctx.fillRect(0, 0, region.width, region.height);

    const image = backdropImageCache.get(input.backdropUrl);
    let imageKey = "pending";
    if (isBackdropImageReady(image)) {
      const anchorElement =
        input.anchor?.current ?? (root.offsetParent as HTMLElement | null) ?? root;
      const slice = computeCoverSlice({
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        anchor: anchorElement.getBoundingClientRect(),
        target: regionRect
      });
      ctx.drawImage(image, slice.x, slice.y, slice.width, slice.height);
      imageKey = `${image.naturalWidth}x${image.naturalHeight}`;
    }

    goo.sceneKey = [
      input.backdropUrl,
      imageKey,
      Math.round(regionRect.left),
      Math.round(regionRect.top),
      Math.round(region.width),
      Math.round(region.height),
      scale
    ].join("|");
  }, []);

  /** One merged-map + WebGL pass at the spring's current progress. */
  const drawFrame = useCallback(() => {
    const goo = gooRef.current!;
    const input = drawInputRef.current;
    if (!goo.renderer || !goo.scene || !input.layout) return;

    const p = clamp(goo.spring.position, 0, MAX_LENS_PROGRESS);
    const pressP = clamp(input.pressProgress, 0, 1);
    const layoutNow = input.layout;
    const lenses = lensesAt(
      p,
      layoutNow,
      input.triggerSize,
      pressP,
      goo.grabDx,
      goo.grabDy,
      goo.triggerGrabDx,
      goo.triggerGrabDy
    );
    // Pressing boosts the goo's SHARED optics along the press tween — the
    // whole connected blob breathes, which is correct: it is one piece of
    // glass. The boosted glow and squished L0 are map inputs, so press-tween
    // frames regenerate the merged map (the same bounded burst GlassButton
    // pays); settled frames stay fully cached.
    const lensParams: LensParams =
      pressP > 0
        ? input.boostLens(input.optics, {
            scale: PRESSED_OPTICS_SCALE,
            glow: PRESSED_GLOW_BOOST,
            maxGlow: MAX_GLOW
          })
        : input.optics;
    const mergedInput: MergedMapInput = {
      regionWidth: layoutNow.region.width,
      regionHeight: layoutNow.region.height,
      blend: input.blend,
      lens: lensParams,
      lenses
    };
    // mergedMapKey quantizes lens offsets to 1px, so the map regenerates per
    // morph frame (wasm/ts are sub-ms at mapSize 192) and is fully cached
    // while settled at p=0 / p=1.
    const key = mergedMapKey(mergedInput);
    if (key !== goo.mapKey || !goo.map) {
      const engine = getSharedLiquidGlassEngine({ mode: input.engineMode });
      goo.map = engine.generateMergedDisplacementMap
        ? engine.generateMergedDisplacementMap(mergedInput)
        : generateMergedDisplacementMap(mergedInput);
      goo.mapKey = key;
    }

    // Chrome is render-pass uniforms only (never in the map key): the hover
    // spring cross-fades the parsed tint/saturation floats, then the press
    // saturation surge rides the same tween as the optics boost and bloom.
    const hoverP = clamp(goo.hoverSpring.position, 0, 1);
    let chrome = blendChrome(input.restingChrome, input.hoverChrome, hoverP);
    if (pressP > 0) {
      chrome = {
        ...chrome,
        saturation: Math.min(
          MAX_SATURATION,
          (chrome.saturation ?? 1) * (1 + PRESS_SATURATION_BOOST * pressP)
        ),
        // Press illumination in the glass itself: the whole blob brightens
        // ("the light turns on") and a pointer-anchored interior light makes
        // the material aware of where the source is. Both ride the press
        // tween and are clipped by the blob SDF, so they morph with the
        // squished/grabbed trigger — unlike a DOM overlay. Keyboard presses
        // (no pointer yet) anchor the light at the trigger lens center.
        // pressHighlight only changes the grade: additive = the hot,
        // bloom-like values; natural = the subtler material response.
        innerBrightness: PRESS_ILLUMINATION[input.pressHighlight].brightness * pressP,
        innerLight: [1, 1, 1, PRESS_ILLUMINATION[input.pressHighlight].light * pressP],
        innerLightPos: [
          goo.pointerX ?? lenses[0].x,
          goo.pointerY ?? lenses[0].y
        ],
        innerLightRadius: PRESS_LIGHT_RADIUS_PX
      };
    }

    goo.renderer.render({
      scene: goo.scene,
      sceneKey: goo.sceneKey,
      map: goo.map,
      lens: lensParams,
      geometry: {
        left: 0,
        top: 0,
        width: layoutNow.region.width,
        height: layoutNow.region.height,
        radius: 0
      },
      sceneWidth: layoutNow.region.width,
      sceneHeight: layoutNow.region.height,
      fit: "fill",
      pixelRatio: goo.sceneScale,
      maskMode: "map",
      chrome,
      lensRects: lenses.map((lens) => ({
        x: lens.x,
        y: lens.y,
        halfW: lens.width / 2,
        halfH: lens.height / 2
      })),
      alphaDistRange: MERGED_ALPHA_DISTANCE_RANGE
    });
  }, []);

  const stopLoop = useCallback(() => {
    const goo = gooRef.current!;
    if (goo.raf !== null) {
      cancelAnimationFrame(goo.raf);
      goo.raf = null;
    }
    goo.lastTime = null;
  }, []);

  const startLoop = useCallback(() => {
    const goo = gooRef.current!;
    if (goo.raf !== null) return;
    const tick = (now: number) => {
      goo.raf = null;
      const dt = goo.lastTime === null ? 16 : now - goo.lastTime;
      goo.lastTime = now;
      goo.spring.step(dt);
      if (
        !goo.itemsShown &&
        goo.spring.target === 1 &&
        goo.spring.position >= ITEM_REVEAL_PROGRESS
      ) {
        goo.itemsShown = true;
        menuRef.current?.setAttribute("data-open", "true");
      }
      if (goo.spring.isSettled(0.001)) {
        goo.spring.position = goo.spring.target;
        goo.spring.velocity = 0;
        goo.lastTime = null;
        drawFrame();
        return;
      }
      drawFrame();
      goo.raf = requestAnimationFrame(tick);
    };
    goo.raf = requestAnimationFrame(tick);
  }, [drawFrame]);

  const stopHoverLoop = useCallback(() => {
    const goo = gooRef.current!;
    if (goo.hoverRaf !== null) {
      cancelAnimationFrame(goo.hoverRaf);
      goo.hoverRaf = null;
    }
    goo.hoverLastTime = null;
  }, []);

  // Hover chrome tween loop, independent of the open-morph loop (hovering
  // while the goo is settled must still animate; both running at once just
  // means two cheap chrome-only draws of the same cached map per frame).
  const startHoverLoop = useCallback(() => {
    const goo = gooRef.current!;
    if (goo.hoverRaf !== null) return;
    const tick = (now: number) => {
      goo.hoverRaf = null;
      const dt = goo.hoverLastTime === null ? 16 : now - goo.hoverLastTime;
      goo.hoverLastTime = now;
      goo.hoverSpring.step(dt);
      if (goo.hoverSpring.isSettled(0.001)) {
        goo.hoverSpring.position = goo.hoverSpring.target;
        goo.hoverSpring.velocity = 0;
        goo.hoverLastTime = null;
        drawFrame();
        return;
      }
      drawFrame();
      goo.hoverRaf = requestAnimationFrame(tick);
    };
    goo.hoverRaf = requestAnimationFrame(tick);
  }, [drawFrame]);

  // Grab-the-material on the open menu. The transform pipeline is off
  // (applyTransform: false): the spring-tracked deflection is a DRAW INPUT —
  // it deforms lens L1 in the merged map (center + size, see lensesAt) and
  // gives the menu content a lighter parallax translate. onDeflection runs
  // once per rAF from the hook's own loop, so calling drawFrame here IS the
  // frame request; deflection changes the lens geometry, so the map
  // regenerates per grab frame (the same bounded cost as the open morph) and
  // is fully cached again once the release bounce settles and the final
  // (0, 0) lands.
  const menuGrab = useGlassGrab(menuRef, {
    applyTransform: false,
    enabled: materialDeformation,
    maxPx: MENU_GRAB_MAX_PX,
    onDeflection: (dx, dy) => {
      const goo = gooRef.current!;
      goo.grabDx = dx;
      goo.grabDy = dy;
      if (!gooActive) return;
      const menu = menuRef.current;
      if (menu) {
        // Inline transform is safe here: the goo path never styles the menu's
        // transform (the CSS open/close transform exists only in fallback
        // mode, where this branch is not reached). Cleared by the settle /
        // cancel (0, 0).
        menu.style.transform =
          dx === 0 && dy === 0
            ? ""
            : `translate(${dx * MENU_GRAB_CONTENT_FACTOR}px, ${dy * MENU_GRAB_CONTENT_FACTOR}px)`;
      }
      drawFrame();
    }
  });

  /**
   * Tracks the pointer in region px for the in-glass press light (the
   * shader's innerLightPos). Imperative — rides gooRef, no React state.
   */
  const updateGooPointer = useCallback((event: { clientX: number; clientY: number }) => {
    const goo = gooRef.current!;
    const root = rootRef.current;
    const layoutNow = drawInputRef.current.layout;
    if (!root || !layoutNow) return;
    const rect = root.getBoundingClientRect();
    goo.pointerX = event.clientX - rect.left - layoutNow.region.left;
    goo.pointerY = event.clientY - rect.top - layoutNow.region.top;
  }, []);

  // Grab-the-material on the trigger — same GlassButton elasticity, expressed
  // in the goo. Unlike the menu, the trigger CAN use the hook's pointer-
  // capture handlers (it is a single button; capture cannot retarget a click
  // away from anything), so the gesture wiring is the simple spreadable kind,
  // composed into the trigger's pointer handlers alongside the press
  // machinery — exactly how GlassButton layers press + grab. The deflection
  // is a draw input (deforms L0 in the merged map); the icon gets a lighter
  // parallax on its own inner span, whose transform this hook never shares
  // with the press scale (that lives on TriggerIcon — they compose by
  // nesting, the same two-writer rule as GlassButton's GrabLayer/Lens).
  const triggerIconParallaxRef = useRef<HTMLSpanElement>(null);
  const triggerGrab = useGlassGrab(triggerRef, {
    applyTransform: false,
    enabled: materialDeformation && gooActive,
    maxPx: TRIGGER_GRAB_MAX_PX,
    onDeflection: (dx, dy) => {
      const goo = gooRef.current!;
      goo.triggerGrabDx = dx;
      goo.triggerGrabDy = dy;
      const parallax = triggerIconParallaxRef.current;
      if (parallax) {
        parallax.style.transform =
          dx === 0 && dy === 0
            ? ""
            : `translate(${dx * TRIGGER_GRAB_CONTENT_FACTOR}px, ${dy * TRIGGER_GRAB_CONTENT_FACTOR}px)`;
      }
      if (gooActive) drawFrame();
    }
  });

  /**
   * Menu grab gesture. Tracked at the document level instead of with pointer
   * capture: capturing on the menu would retarget the release away from the
   * item under the pointer and break plain item clicks. A press only becomes
   * a grab after >MENU_GRAB_ENGAGE_PX of travel, so taps stay pure clicks;
   * once engaged, the release must not select whatever item it lands on —
   * the click that follows pointerup is suppressed.
   */
  const menuGrabGestureRef = useRef<{
    pointerId: number | null;
    originX: number;
    originY: number;
    engaged: boolean;
  } | null>(null);
  const suppressItemClickRef = useRef(false);
  const detachMenuGrabListenersRef = useRef<(() => void) | null>(null);

  const endMenuGrabGesture = useCallback(
    (releaseDeformation: boolean) => {
      detachMenuGrabListenersRef.current?.();
      detachMenuGrabListenersRef.current = null;
      menuGrabGestureRef.current = null;
      // release() bounces back through the underdamped spring; cancel() snaps
      // (close/unmount — the morph owns the lens again). Both no-op when the
      // deformation never engaged.
      if (releaseDeformation) menuGrab.release();
      else menuGrab.cancel();
    },
    [menuGrab]
  );

  const handleMenuPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOpen || event.button > 0 || menuGrabGestureRef.current !== null) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;

    const gesture = {
      pointerId: typeof event.pointerId === "number" ? event.pointerId : null,
      originX: event.clientX,
      originY: event.clientY,
      engaged: false
    };
    menuGrabGestureRef.current = gesture;

    const samePointer = (e: PointerEvent) =>
      gesture.pointerId === null ||
      typeof e.pointerId !== "number" ||
      e.pointerId === gesture.pointerId;
    const handleMove = (e: PointerEvent) => {
      if (!samePointer(e) || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
      if (!gesture.engaged) {
        const travel = Math.hypot(e.clientX - gesture.originX, e.clientY - gesture.originY);
        if (travel <= MENU_GRAB_ENGAGE_PX) return;
        gesture.engaged = true;
        // A drag is not a tap, regardless of whether the deformation itself
        // runs (reduced motion latches it inert).
        suppressItemClickRef.current = true;
        menuGrab.grab(gesture.originX, gesture.originY);
      }
      menuGrab.pull(e.clientX, e.clientY);
    };
    const handleEnd = (e: PointerEvent) => {
      if (!samePointer(e)) return;
      endMenuGrabGesture(true);
      // The suppression flag is consumed by the click that immediately
      // follows pointerup; clear it on the next task in case the release
      // landed off any item and no click fires.
      window.setTimeout(() => {
        suppressItemClickRef.current = false;
      }, 0);
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleEnd);
    document.addEventListener("pointercancel", handleEnd);
    detachMenuGrabListenersRef.current = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleEnd);
      document.removeEventListener("pointercancel", handleEnd);
    };
  };

  // Closing (or unmounting) mid-grab drops the gesture and snaps the
  // deformation: the close morph owns the lens from here. The cancel emits a
  // final (0, 0), which also clears the content parallax transform.
  useEffect(() => {
    if (!isOpen) endMenuGrabGesture(false);
  }, [endMenuGrabGesture, isOpen]);

  useEffect(() => () => endMenuGrabGesture(false), [endMenuGrabGesture]);

  // Renderer lifecycle. WebGL2 unavailable (e.g. jsdom, old browsers) or a
  // lost context downgrades to the CSS fallback; a restore re-upgrades. The
  // canvas only mounts once the menu is measured (`hasLayout`), so that flip
  // is a dependency.
  const hasLayout = layout !== null;
  useEffect(() => {
    if (!wantsGoo || !hasLayout) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = createWebglGlassRenderer(canvas, {
      onContextLost: () => setGooUnavailable(true),
      onContextRestored: () => {
        setGooUnavailable(false);
        setGooVersion((version) => version + 1);
      }
    });
    if (!renderer) {
      setGooUnavailable(true);
      return undefined;
    }
    gooRef.current!.renderer = renderer;
    setGooVersion((version) => version + 1);

    return () => {
      stopLoop();
      stopHoverLoop();
      gooRef.current!.renderer = null;
      renderer.destroy();
    };
  }, [hasLayout, stopHoverLoop, stopLoop, wantsGoo]);

  // Backdrop decode → repaint (same module-level cache pattern as GlassButton).
  const backdropUrl = glassBackdrop?.image;
  useEffect(() => {
    if (!backdropUrl || typeof window === "undefined") return undefined;
    const image = getBackdropImage(backdropUrl);
    if (image.complete && image.naturalWidth > 0) return undefined;
    const handleLoad = () => setGooVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);
    return () => image.removeEventListener("load", handleLoad);
  }, [backdropUrl]);

  // Menu measurement: the menu DOM always exists (hidden while closed) so the
  // final layout — and with it the CONSTANT region size — is known up front.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    const measure = () => setMenuHeight(menu.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(menu);
    return () => observer.disconnect();
  }, []);

  // Static repaint whenever the inputs of the settled frame change (mount,
  // tint/optics/layout/backdrop props, renderer (re)init, backdrop decode).
  useEffect(() => {
    if (!gooActive || !layout) return;
    refreshScene();
    drawFrame();
  }, [
    backdropUrl,
    blend,
    drawFrame,
    gooActive,
    gooVersion,
    layout,
    optics,
    refreshScene,
    restingChrome
  ]);

  // Press-driven repaints: the tweened progress rides drawInputRef like
  // blend/layout do; this effect only requests frames. The press boost is a
  // map input (regen burst bounded by the tween — see drawFrame); the scene
  // slice is untouched, so no refreshScene here.
  useEffect(() => {
    if (!gooActive || !layout) return;
    drawFrame();
  }, [drawFrame, gooActive, layout, pressProgress]);

  // Hover retarget: tween the chrome cross-fade spring (chrome uniforms only
  // — never a map regen). Reduced motion, or no goo to animate, jumps.
  useEffect(() => {
    const goo = gooRef.current!;
    const target = isHovered ? 1 : 0;
    if (goo.hoverSpring.target === target && goo.hoverSpring.position === target) return;
    goo.hoverSpring.target = target;
    if (!gooActive || prefersReducedMotion()) {
      stopHoverLoop();
      goo.hoverSpring.position = target;
      goo.hoverSpring.velocity = 0;
      if (gooActive) drawFrame();
      return;
    }
    startHoverLoop();
  }, [drawFrame, gooActive, isHovered, startHoverLoop, stopHoverLoop]);

  // Re-slice on viewport resize (anchor/region rects move under cover math).
  useEffect(() => {
    if (!gooActive || typeof window === "undefined") return undefined;
    const handleResize = () => {
      refreshScene();
      drawFrame();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawFrame, gooActive, refreshScene]);

  // Open/close transition: retarget the spring and run the rAF morph. All
  // per-frame work is imperative — this effect is the only React render the
  // animation costs.
  const previousOpenRef = useRef(isOpen);
  useEffect(() => {
    const goo = gooRef.current!;
    const changed = previousOpenRef.current !== isOpen;
    previousOpenRef.current = isOpen;

    goo.spring.setConfig(isOpen ? OPEN_SPRING : CLOSE_SPRING);
    goo.spring.target = isOpen ? 1 : 0;

    const reduceMotion = prefersReducedMotion();
    if (isOpen) {
      setMenuVisible(true);
      if (gooActive) refreshScene();
      // Reveal items immediately when there is no morph to wait for (CSS
      // fallback, reduced motion, or mounting already open); otherwise the
      // rAF loop flips data-open once the goo crosses the reveal progress.
      if (reduceMotion || !gooActive || goo.spring.position >= ITEM_REVEAL_PROGRESS) {
        goo.itemsShown = true;
        menuRef.current?.setAttribute("data-open", "true");
      }
    } else {
      goo.itemsShown = false;
      menuRef.current?.setAttribute("data-open", "false");
    }

    if (!gooActive || reduceMotion) {
      stopLoop();
      goo.spring.position = goo.spring.target;
      goo.spring.velocity = 0;
      if (gooActive) drawFrame();
    } else {
      startLoop();
    }

    if (!isOpen && changed) {
      if (reduceMotion) {
        setMenuVisible(false);
        return undefined;
      }
      const timer = window.setTimeout(() => setMenuVisible(false), CLOSE_HIDE_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [drawFrame, gooActive, isOpen, refreshScene, startLoop, stopLoop]);

  useEffect(
    () => () => {
      stopLoop();
      stopHoverLoop();
    },
    [stopHoverLoop, stopLoop]
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, [setOpen]);

  // Focus the first/last item once an open requested by keyboard lands.
  useEffect(() => {
    if (!isOpen || pendingFocusRef.current === null) return undefined;
    const intent = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const timer = window.setTimeout(() => {
      const enabled = itemRefs.current.filter(
        (element): element is HTMLButtonElement =>
          element !== null && element.getAttribute("aria-disabled") !== "true"
      );
      const target = intent === "first" ? enabled[0] : enabled[enabled.length - 1];
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Click-outside closes (no focus steal).
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, setOpen]);

  const handleTriggerClick = () => {
    if (isOpen) {
      setOpen(false);
      return;
    }
    setOpen(true);
  };

  const enabledIndexes = useMemo(
    () => items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0),
    [items]
  );

  const focusItemAt = (index: number) => {
    itemRefs.current[index]?.focus({ preventScroll: true });
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    press.handlers.onKeyDown(event);
    if (event.key === "ArrowDown" || (!isOpen && isGlassActivationKey(event.key))) {
      event.preventDefault();
      if (isOpen) {
        focusItemAt(enabledIndexes[0] ?? -1);
        return;
      }
      pendingFocusRef.current = "first";
      setOpen(true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (isOpen) {
        focusItemAt(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        return;
      }
      pendingFocusRef.current = "last";
      setOpen(true);
    } else if (event.key === "Escape" && isOpen) {
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "Tab") {
      // Let the browser move focus; the menu just closes behind it.
      setOpen(false);
      return;
    }
    if (enabledIndexes.length === 0) return;

    const activeIndex = itemRefs.current.findIndex((element) => element === document.activeElement);
    const activePosition = enabledIndexes.indexOf(activeIndex);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = enabledIndexes[(activePosition + 1) % enabledIndexes.length];
      focusItemAt(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const previous =
        activePosition === -1
          ? enabledIndexes[enabledIndexes.length - 1]
          : enabledIndexes[(activePosition - 1 + enabledIndexes.length) % enabledIndexes.length];
      focusItemAt(previous);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItemAt(enabledIndexes[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItemAt(enabledIndexes[enabledIndexes.length - 1]);
    }
  };

  const handleItemClick = (item: GlassDropdownItem) => (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressItemClickRef.current) {
      // This click is the tail of a menu grab (>3px drag), not a tap.
      suppressItemClickRef.current = false;
      event.preventDefault();
      return;
    }
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    item.onSelect?.();
    onSelect?.(item);
    closeAndRestoreFocus();
  };

  const region = layout?.region;
  const menuLayoutStyle: CSSProperties = layout
    ? { left: layout.menu.left, top: layout.menu.top, width: layout.menu.width }
    : { left: 0, top: triggerSize + gap, width: menuWidth };

  return (
    <DropdownRoot
      className={className}
      ref={rootRef}
      style={
        {
          "--lgds-dropdown-accent": theme.component.accent,
          "--lgds-dropdown-text": theme.component.buttonText,
          "--lgds-dropdown-trigger-size": `${triggerSize}px`,
          "--lgds-dropdown-menu-radius": `${MENU_RADIUS}px`,
          "--lgds-dropdown-menu-origin": `${triggerSize / 2 - (layout?.menu.left ?? 0)}px ${-gap}px`,
          "--lgds-dropdown-tint-bg": resolvedTint.background,
          "--lgds-dropdown-tint-border": resolvedTint.border,
          "--lgds-dropdown-tint-shadow": resolvedTint.shadow,
          "--lgds-dropdown-saturation": resolvedTint.saturation
        } as CSSProperties
      }
    >
      {wantsGoo && !gooUnavailable && region && (
        <GooCanvas
          aria-hidden="true"
          ref={canvasRef}
          style={{
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height
          }}
        />
      )}
      <TriggerButton
        $fallback={!gooActive}
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        data-hovered={isHovered ? "true" : undefined}
        onBlur={press.handlers.onBlur}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        onKeyUp={press.handlers.onKeyUp}
        onLostPointerCapture={(event) => {
          press.handlers.onLostPointerCapture(event);
          triggerGrab.handlers.onLostPointerCapture(event);
        }}
        onPointerCancel={(event) => {
          press.handlers.onPointerCancel(event);
          triggerGrab.handlers.onPointerCancel(event);
        }}
        onPointerDown={(event) => {
          press.handlers.onPointerDown(event);
          // The grab anchors at the press origin; the trigger never moves, so
          // engaging it costs nothing until the pointer actually drags.
          triggerGrab.handlers.onPointerDown(event);
        }}
        onPointerEnter={(event) => {
          setIsHovered(true);
          // The in-glass press light tracks the pointer via gooRef — no CSS
          // vars; the illumination is shader chrome, not a DOM layer.
          updateGooPointer(event);
        }}
        onPointerLeave={() => setIsHovered(false)}
        onPointerMove={(event) => {
          updateGooPointer(event);
          triggerGrab.handlers.onPointerMove(event);
          // While pressed, the in-glass light must track the pointer even
          // when no other loop is drawing (e.g. the post-release hold, or a
          // still press with the grab spring settled). Chrome-only redraw —
          // the merged map stays cached unless geometry changed.
          if (gooActive && drawInputRef.current.pressProgress > 0) drawFrame();
        }}
        onPointerUp={(event) => {
          press.handlers.onPointerUp(event);
          triggerGrab.handlers.onPointerUp(event);
        }}
        ref={triggerRef}
        type="button"
      >
        {/* No DOM press layer: a DOM overlay stays a rigid circle while the
            goo squishes/stretches, so BOTH press-highlight modes render in
            the shader chrome (innerBrightness + pointer-anchored innerLight,
            see drawFrame) and morph with the glass. */}
        <TriggerIcon
          aria-hidden="true"
          style={{ transform: `scale(${1 - (1 - PRESS_ICON_SCALE) * pressProgress})` }}
        >
          {/* Grab parallax rides its own nested span: the press scale owns
              TriggerIcon's inline transform, and the spring writes here per
              frame (no CSS transition — it would lag the spring). */}
          <TriggerIconInner ref={triggerIconParallaxRef}>
            {icon ?? <DefaultTriggerIcon />}
          </TriggerIconInner>
        </TriggerIcon>
      </TriggerButton>
      {/* data-open is constant in JSX so React never rewrites it: the
          open/close effect and the rAF loop own the attribute imperatively
          (item stagger is pure CSS keyed off it — no per-frame JS). */}
      <Menu
        $fallback={!gooActive}
        $interactive={isOpen}
        $visible={menuVisible}
        aria-label={label}
        data-open="false"
        id={menuId}
        onKeyDown={handleMenuKeyDown}
        onPointerDown={handleMenuPointerDown}
        ref={menuRef}
        role="menu"
        style={menuLayoutStyle}
      >
        {items.map((item, index) => (
          <MenuItem
            aria-disabled={item.disabled ? "true" : undefined}
            key={item.id}
            onClick={handleItemClick(item)}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            role="menuitem"
            style={{ "--lgds-dropdown-item-index": index } as CSSProperties}
            tabIndex={-1}
            type="button"
          >
            {item.icon && <MenuItemIcon aria-hidden="true">{item.icon}</MenuItemIcon>}
            <MenuItemLabel>{item.label}</MenuItemLabel>
          </MenuItem>
        ))}
      </Menu>
    </DropdownRoot>
  );
};

GlassDropdown.displayName = "GlassDropdown";

export default GlassDropdown;
