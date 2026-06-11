import { type ComponentProps, type PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassDropdown, GlassModal, GlassSlider, GlassSwitch, type GlassComponentSize, type GlassDropdownItem, type GlassPressHighlight } from "@liquid-glass/design-system";

import {
  DEFAULT_LENS_PARAMS,
  GLASS_TINTS,
  createGlassTint,
  createLiquidGlassController,
  createLiquidGlassEngine,
  resolveGlassTint,
  type GlassCanvasSource,
  type GlassTintInput,
  type GlassTintName,
  type LensParams,
  type LiquidGlassController,
  type LiquidGlassControllerStats,
  type LiquidGlassEngineMode,
  type LiquidGlassRenderer,
  type LiquidGlassRenderMode,
  type ResolvedLensParams,
} from "liquid-glass";
import { GlassNode } from "liquid-glass/react";
import { IconLocationFill, IconMessageFill, IconSunMaxFill } from "symbols-react";

const CONTROL_GROUPS: Array<Array<keyof LensParams>> = [
  ["width", "height", "radius", "mapSize"],
  ["scaleX", "scaleY", "chroma", "blur"],
  ["depth", "dome", "splay", "glow", "edge", "glowSpread", "glowExponent", "edgeExponent", "specularRotation"],
];

const CONTROL_LIMITS: Record<keyof LensParams, { min: number; max: number; step: number }> = {
  width: { min: 24, max: 420, step: 1 },
  height: { min: 24, max: 300, step: 1 },
  radius: { min: 0, max: 210, step: 1 },
  // The engine accepts displacement scales up to 512 — the old cap of 60 was
  // the main thing limiting how hard the edges could bend.
  scaleX: { min: 0, max: 240, step: 0.5 },
  scaleY: { min: 0, max: 240, step: 0.5 },
  chroma: { min: 0, max: 2, step: 0.01 },
  depth: { min: 0, max: 80, step: 0.5 },
  dome: { min: 0, max: 220, step: 1 },
  splay: { min: 0.001, max: 1, step: 0.001 },
  glow: { min: 0, max: 2, step: 0.01 },
  edge: { min: 0, max: 2, step: 0.01 },
  glowSpread: { min: 0.05, max: 2, step: 0.01 },
  glowExponent: { min: 0.1, max: 8, step: 0.05 },
  edgeExponent: { min: 0.1, max: 8, step: 0.05 },
  specularRotation: { min: -360, max: 360, step: 1 },
  blur: { min: 0, max: 12, step: 0.1 },
  // Map generation is O(size²) but only runs when lens params change (drags
  // reuse the built map), so big maps are safe for crisp rims on large
  // elements. Engine cap is 2048.
  mapSize: { min: 32, max: 1024, step: 32 },
};

const PAINTING_URL = "/images/rinaldo-armida.jpg";
type WallpaperId = "painting" | "ferry" | "macaw";
const WALLPAPERS: Array<{ id: WallpaperId; label: string; url: string }> = [
  { id: "painting", label: "Painting", url: PAINTING_URL },
  { id: "ferry", label: "Ferry", url: "/images/IMG_5299.jpeg" },
  { id: "macaw", label: "Macaw", url: "/images/photo-1452570053594-1b985d6ea890.jpeg" },
];
const INITIAL_LENS: ResolvedLensParams = {
  ...DEFAULT_LENS_PARAMS,
  width: 220,
  height: 220,
  radius: 110,
  // Rim-heavy refraction: high displacement scale + a tight depth band keeps
  // the center clear while the edges bend hard. (dome is clamped by the
  // engine to half the lens size, so 130 already maxes out a 220px lens.)
  scaleX: 120,
  scaleY: 120,
  chroma: 0.5,
  depth: 14,
  dome: 130,
  splay: 0.72,
  glow: 0.75,
  edge: 0.78,
  blur: 1.6,
  mapSize: 256,
};
const INITIAL_RENDERER = getInitialRenderer();
const TINT_NAMES = Object.keys(GLASS_TINTS) as GlassTintName[];
const INITIAL_CUSTOM_TINT: Required<Pick<GlassTintInput, "color" | "opacity" | "borderOpacity" | "highlightColor" | "highlightWidth" | "highlightHeight" | "highlightCore" | "highlightSpread" | "highlightRotation" | "highlightX" | "highlightY" | "highlightOpacity" | "shadowOpacity" | "saturation">> = {
  color: "#6fd7d0",
  opacity: 0.12,
  borderOpacity: 0.48,
  highlightColor: "#ffffff",
  highlightWidth: 1.16,
  highlightHeight: 0.74,
  highlightCore: 0.36,
  highlightSpread: 0.68,
  highlightRotation: -10,
  highlightX: 0.24,
  highlightY: -0.2,
  highlightOpacity: 0,
  shadowOpacity: 0.28,
  saturation: 1.18,
};

type TintMode = "preset" | "custom";
type StageMode = "painting" | "iphone";
type IslandDemo = "messages" | "weather";
type FloatingControlsPosition = { x: number; y: number };
type IslandSize = { width: number; height: number };
type FloatingControlsDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};
type VisibilityKey = "glass" | "slider" | "switch" | "button" | "dropdown" | "modal";
type ComponentVisibility = Record<VisibilityKey, boolean>;

const FLOATING_CONTROLS_WIDTH = 326;
const FLOATING_CONTROLS_MARGIN = 16;
const FLOATING_CONTROLS_BAR_HEIGHT = 44;
const INITIAL_ISLAND_SIZE: IslandSize = { width: 122, height: 36 };
const SWITCH_PREVIEW_SIZES: GlassComponentSize[] = ["sm", "md", "lg", "xl"];
type SwitchPreviewStackProps = Pick<
  ComponentProps<typeof GlassSwitch>,
  "engineMode" | "glassLens" | "glassSurfaceBlur" | "glassTint" | "renderer"
>;

const INITIAL_LENS_POSITION = { x: 0.5, y: 0.5 };
const INITIAL_LENS_POSITIONS = [
  { x: 0.44, y: 0.5 },
  { x: 0.56, y: 0.5 },
];
const INITIAL_BLEND = 48;
/** How often controller stats may trigger a React re-render. */
const STATS_FLUSH_MS = 250;
const INITIAL_VISIBILITY: ComponentVisibility = {
  glass: true,
  slider: false,
  switch: false,
  button: false,
  dropdown: false,
  modal: false,
};
const VISIBILITY_OPTIONS: Array<{ key: VisibilityKey; label: string }> = [
  { key: "glass", label: "Draggable" },
  { key: "slider", label: "Slider" },
  { key: "switch", label: "Switch" },
  { key: "button", label: "Button" },
  { key: "dropdown", label: "Dropdown" },
  { key: "modal", label: "Modal" },
];
const STAGE_SCENES: Array<{ id: StageMode; label: string; hint: string }> = [
  { id: "painting", label: "Painting", hint: "Full-bleed canvas" },
  { id: "iphone", label: "iPhone 17", hint: "Device frame" },
];
/**
 * Dynamic Island demos, in cycle order. Clicking the island walks this list:
 * collapsed → demo 0 → demo 1 → … → collapsed. The top-right picker jumps
 * straight to any entry. Add demos here and both controls pick them up.
 */
const ISLAND_DEMOS: Array<{ id: IslandDemo; label: string; Icon: typeof IconMessageFill }> = [
  { id: "messages", label: "Messages notification", Icon: IconMessageFill },
  { id: "weather", label: "Weather forecast", Icon: IconSunMaxFill },
];
const DROPDOWN_PREVIEW_ITEMS: GlassDropdownItem[] = [
  { id: "view", label: "View painting" },
  { id: "favorite", label: "Add to favorites" },
  { id: "share", label: "Share…" },
  { id: "download", label: "Download", disabled: true },
  { id: "remove", label: "Remove" },
];

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const glassChromeRef = useRef<HTMLDivElement | null>(null);
  const glassChromeSecondRef = useRef<HTMLDivElement | null>(null);
  const lensPositionRef = useRef(INITIAL_LENS_POSITION);
  const lensPositionsRef = useRef(INITIAL_LENS_POSITIONS.map((p) => ({ ...p })));
  const dragLensIndexRef = useRef(0);
  const statsRef = useRef<LiquidGlassControllerStats | null>(null);
  const statsFlushRef = useRef<number | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const floatingControlsRef = useRef<HTMLDivElement | null>(null);
  const dynamicIslandRef = useRef<HTMLButtonElement | null>(null);
  const controlsPositionRef = useRef<FloatingControlsPosition>(getInitialControlsPosition());
  const pendingControlsPositionRef = useRef<FloatingControlsPosition>(controlsPositionRef.current);
  const controlsDragRef = useRef<FloatingControlsDrag | null>(null);
  const controlsDragFrameRef = useRef<number | null>(null);
  const [lens, setLens] = useState<ResolvedLensParams>(INITIAL_LENS);
  const [position, setPosition] = useState(INITIAL_LENS_POSITION);
  const [positions, setPositions] = useState(INITIAL_LENS_POSITIONS.map((p) => ({ ...p })));
  const [dualLens, setDualLens] = useState(false);
  const [blend, setBlend] = useState(INITIAL_BLEND);
  const [dropdownGap, setDropdownGap] = useState(10);
  const [engineMode, setEngineMode] = useState<LiquidGlassEngineMode>("auto");
  const [tintMode, setTintMode] = useState<TintMode>("custom");
  const [tintName, setTintName] = useState<GlassTintName>("clear");
  const [customTint, setCustomTint] = useState(INITIAL_CUSTOM_TINT);
  const [sliderValue, setSliderValue] = useState(62);
  const [switchLensOverrideEnabled, setSwitchLensOverrideEnabled] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const renderMode: LiquidGlassRenderMode = "target";
  const [stats, setStats] = useState<LiquidGlassControllerStats | null>(null);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [controlsPosition, setControlsPosition] = useState<FloatingControlsPosition>(controlsPositionRef.current);
  const [isControlsDragging, setIsControlsDragging] = useState(false);
  const [visibility, setVisibility] = useState<ComponentVisibility>(INITIAL_VISIBILITY);
  const [stageMode, setStageMode] = useState<StageMode>("painting");
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [pressHighlight, setPressHighlight] = useState<GlassPressHighlight>("natural");
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [islandDemo, setIslandDemo] = useState<IslandDemo>("messages");
  // True after an island-click close: the NEXT open advances the demo cycle.
  const islandCycleArmedRef = useRef(false);
  const [islandSize, setIslandSize] = useState<IslandSize>(INITIAL_ISLAND_SIZE);
  const [islandBackdropVersion, setIslandBackdropVersion] = useState(0);
  const [wallpaperId, setWallpaperId] = useState<WallpaperId>("painting");
  // Wallpaper toggles only apply to the iPhone scene; the full-bleed
  // painting stage always shows the painting.
  const backgroundUrl =
    stageMode === "iphone"
      ? (WALLPAPERS.find((wallpaper) => wallpaper.id === wallpaperId) ?? WALLPAPERS[0]).url
      : PAINTING_URL;
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);
  const glassTint = tintMode === "preset" ? tintName : customTint;
  const tint = tintMode === "preset" ? resolveGlassTint(tintName) : createGlassTint(customTint);
  const visiblePreviewCount = Number(visibility.slider) + Number(visibility.switch) + Number(visibility.button) + Number(visibility.dropdown) + Number(visibility.modal);
  const sliderLens = useMemo(
    () => ({
      width: 63,
      height: 34,
      radius: 80,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: Math.min(lens.depth, 12),
      dome: Math.min(lens.dome, 80),
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: Math.min(lens.blur, 3),
      // Preview components are <100px — a bigger map is wasted regen cost.
      mapSize: Math.min(lens.mapSize, 384),
    }),
    [lens],
  );
  const switchLens = useMemo<Partial<LensParams>>(
    () => ({
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: Math.min(lens.depth, 12),
      dome: Math.min(lens.dome, 80),
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: Math.min(lens.blur, 3),
      // Preview components are <100px — a bigger map is wasted regen cost.
      mapSize: Math.min(lens.mapSize, 384),
    }),
    [lens],
  );
  const islandLens = useMemo<Partial<LensParams>>(
    () => ({
      width: Math.max(1, islandSize.width),
      height: Math.max(1, islandSize.height),
      radius: lens.radius,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: lens.depth,
      dome: lens.dome,
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: lens.blur,
      mapSize: lens.mapSize,
    }),
    [islandSize.height, islandSize.width, lens],
  );
  const islandDrawSource = useMemo<GlassCanvasSource>(
    () =>
      ({ ctx, metrics }) => {
        ctx.fillStyle = "#101014";
        ctx.fillRect(0, 0, metrics.sourceWidth, metrics.sourceHeight);

        const island = dynamicIslandRef.current;
        const screen = containerRef.current;
        const image = getIslandBackdropImage(backgroundUrl);
        if (!island || !screen || !isImageReady(image)) return;

        const slice = computeCoverSlice({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          anchor: screen.getBoundingClientRect(),
          target: island.getBoundingClientRect(),
        });
        ctx.drawImage(image, slice.x, slice.y, slice.width, slice.height);
      },
    [backgroundUrl, islandBackdropVersion],
  );
  const buttonLens = useMemo<Partial<LensParams>>(
    () => ({
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: Math.min(lens.depth, 12),
      dome: Math.min(lens.dome, 80),
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: Math.min(lens.blur, 3),
      // Preview components are <100px — a bigger map is wasted regen cost.
      mapSize: Math.min(lens.mapSize, 384),
    }),
    [lens],
  );
  const dropdownLens = useMemo<Partial<LensParams>>(
    () => ({
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: Math.min(lens.depth, 16),
      dome: Math.min(lens.dome, 60),
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: Math.min(lens.blur, 3),
      // Merged maps regenerate per morph frame — cap so they stay sub-ms.
      mapSize: Math.min(lens.mapSize, 256),
    }),
    [lens],
  );
  const modalLens = useMemo<Partial<Omit<LensParams, "width" | "height">>>(
    () => ({
      radius: lens.radius,
      scaleX: lens.scaleX,
      scaleY: lens.scaleY,
      chroma: lens.chroma,
      depth: lens.depth,
      dome: lens.dome,
      splay: lens.splay,
      glow: lens.glow,
      edge: lens.edge,
      glowSpread: lens.glowSpread,
      glowExponent: lens.glowExponent,
      edgeExponent: lens.edgeExponent,
      specularRotation: lens.specularRotation,
      blur: lens.blur,
      mapSize: lens.mapSize,
    }),
    [lens],
  );

  useEffect(() => {
    if (!containerRef.current || !sourceRef.current || !targetRef.current) return;
    controllerRef.current?.destroy();
    controllerRef.current = createLiquidGlassController({
      container: containerRef.current,
      source: sourceRef.current,
      target: targetRef.current,
      lens,
      position: { ...lensPositionRef.current, unit: "normalized" },
      lenses: dualLens
        ? lensPositionsRef.current.map((p) => ({ position: { ...p, unit: "normalized" as const } }))
        : undefined,
      blend,
      tint: glassTint,
      mode: renderMode,
      renderer: INITIAL_RENDERER,
      sourceImageUrl: backgroundUrl,
      engine,
      onStats: handleStats,
    });

    return () => controllerRef.current?.destroy();
    // stageMode remounts the lens surface (full-bleed stage vs. iPhone
    // screen), so the controller must rebind to the fresh elements.
  }, [engine, engineMode, stageMode]);

  useEffect(() => {
    controllerRef.current?.update({
      lens,
      position: { ...lensPositionRef.current, unit: "normalized" },
      lenses: dualLens
        ? lensPositionsRef.current.map((p) => ({ position: { ...p, unit: "normalized" as const } }))
        : undefined,
      blend,
      tint: glassTint,
      mode: renderMode,
      renderer: INITIAL_RENDERER,
      sourceImageUrl: backgroundUrl,
    });
  }, [lens, position, positions, blend, dualLens, renderMode, glassTint, backgroundUrl]);

  useEffect(() => {
    const island = dynamicIslandRef.current;
    if (!island) return;

    const updateSize = () => {
      const rect = island.getBoundingClientRect();
      setIslandSize((current) => {
        const next = {
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(island);
    return () => resizeObserver.disconnect();
  }, [stageMode]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const image = getIslandBackdropImage(backgroundUrl);
    if (isImageReady(image)) {
      setIslandBackdropVersion((version) => version + 1);
      return undefined;
    }

    const handleLoad = () => setIslandBackdropVersion((version) => version + 1);
    image.addEventListener("load", handleLoad);
    return () => image.removeEventListener("load", handleLoad);
  }, [backgroundUrl]);

  // The lens position is driven imperatively during drags (no React render
  // per pointermove — Safari can't keep up with a full re-render per frame).
  // This effect re-syncs the imperative styles whenever React state changes.
  useLayoutEffect(() => {
    lensPositionRef.current = position;
    lensPositionsRef.current = positions.map((p) => ({ ...p }));
    if (dualLens) {
      positions.forEach((p, index) => applyLensVisuals(p, index));
    } else {
      applyLensVisuals(position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, positions, dualLens, lens.width, lens.height, lens.radius, stageMode]);

  useLayoutEffect(() => {
    controlsPositionRef.current = controlsPosition;
    pendingControlsPositionRef.current = controlsPosition;
    applyControlsTransform(controlsPosition);
  }, [controlsPosition]);

  useEffect(() => {
    const handleResize = () => setControlsPosition((current) => constrainControlsPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsDragFrameRef.current !== null) {
        cancelAnimationFrame(controlsDragFrameRef.current);
      }
      if (statsFlushRef.current !== null) {
        window.clearTimeout(statsFlushRef.current);
      }
      window.removeEventListener("pointermove", handleControlsDragMove);
      window.removeEventListener("pointerup", handleControlsDragEnd);
      window.removeEventListener("pointercancel", handleControlsDragEnd);
    };
  }, []);

  /** Throttle stats → React state; the controller reports every apply (once
   *  per drag frame) and re-rendering the whole playground at that rate is a
   *  real jank source, especially in Safari. */
  function handleStats(next: LiquidGlassControllerStats) {
    statsRef.current = next;
    if (statsFlushRef.current !== null) return;
    statsFlushRef.current = window.setTimeout(() => {
      statsFlushRef.current = null;
      setStats(statsRef.current);
    }, STATS_FLUSH_MS);
  }

  /** Write the lens-tracking styles directly (used per drag frame). */
  function applyLensVisuals(next: { x: number; y: number }, index = 0) {
    // In dual mode the target layer is hidden by the webgl/canvas renderer,
    // so skip the clip-path writes; single-lens keeps the existing behavior.
    if (!dualLens) {
      const target = targetRef.current;
      if (target) {
        const clip = computeTargetClipPath(next, lens);
        target.style.clipPath = clip;
        target.style.setProperty("-webkit-clip-path", clip);
      }
    }
    const chrome = index === 0 ? glassChromeRef.current : glassChromeSecondRef.current;
    if (chrome) {
      chrome.style.left = `${next.x * 100}%`;
      chrome.style.top = `${next.y * 100}%`;
    }
  }

  /** Commit the imperative drag position back into React state (pointer up). */
  function commitLensPosition() {
    if (dualLens) {
      setPositions((current) => {
        const refs = lensPositionsRef.current;
        const same = current.every((p, i) => p.x === refs[i].x && p.y === refs[i].y);
        return same ? current : refs.map((p) => ({ ...p }));
      });
      return;
    }
    setPosition((current) =>
      current.x === lensPositionRef.current.x && current.y === lensPositionRef.current.y
        ? current
        : { ...lensPositionRef.current },
    );
  }

  function updateLens(key: keyof LensParams, value: number) {
    setSwitchLensOverrideEnabled(true);
    setLens((current) => ({
      ...current,
      [key]: key === "mapSize" ? Math.round(value) : value,
    }));
  }

  function updateCustomTint(key: keyof typeof INITIAL_CUSTOM_TINT, value: string | number) {
    setTintMode("custom");
    setCustomTint((current) => ({
      ...current,
      [key]: value,
    }));
  }

  /**
   * Main island action: every click is a plain open/close toggle — content
   * NEVER swaps while the panel is visible. Closing arms the cycle, and the
   * next open advances to the next ISLAND_DEMOS entry (the swap happens
   * while collapsed, so it is invisible). New demos join the cycle for free.
   */
  function cycleIsland() {
    if (islandExpanded) {
      setIslandExpanded(false);
      islandCycleArmedRef.current = true;
      return;
    }
    if (islandCycleArmedRef.current) {
      islandCycleArmedRef.current = false;
      const index = ISLAND_DEMOS.findIndex((demo) => demo.id === islandDemo);
      setIslandDemo(ISLAND_DEMOS[(index + 1) % ISLAND_DEMOS.length].id);
    }
    setIslandExpanded(true);
  }

  function updateVisibility(key: VisibilityKey, value: boolean) {
    setVisibility((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handlePointer(event: PointerEvent<HTMLElement>, isDown = false) {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    // Imperative drag path: feed the controller directly (it rAF-coalesces)
    // and move the tracking elements without a React render per pointermove.
    if (dualLens) {
      if (isDown) {
        // Pick the lens whose center is closest to the pointer (in px).
        dragLensIndexRef.current = nearestLensIndex(next, rect.width, rect.height);
      }
      const index = dragLensIndexRef.current;
      lensPositionsRef.current[index] = next;
      controllerRef.current?.setLensPosition(index, { ...next, unit: "normalized" });
      applyLensVisuals(next, index);
      return;
    }
    lensPositionRef.current = next;
    controllerRef.current?.setPosition({ ...next, unit: "normalized" });
    applyLensVisuals(next);
  }

  /** Index of the lens whose center is nearest to the pointer, in stage px. */
  function nearestLensIndex(point: { x: number; y: number }, width: number, height: number): number {
    let best = 0;
    let bestDistance = Infinity;
    lensPositionsRef.current.forEach((p, index) => {
      const dx = (p.x - point.x) * width;
      const dy = (p.y - point.y) * height;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function handleControlsDragStart(event: PointerEvent<HTMLElement>) {
    if (controlsDragRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    controlsDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: controlsPositionRef.current.x,
      originY: controlsPositionRef.current.y,
    };
    setIsControlsDragging(true);

    window.addEventListener("pointermove", handleControlsDragMove);
    window.addEventListener("pointerup", handleControlsDragEnd);
    window.addEventListener("pointercancel", handleControlsDragEnd);
  }

  function handleControlsDragMove(event: globalThis.PointerEvent) {
    const drag = controlsDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    pendingControlsPositionRef.current = constrainControlsPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });

    if (controlsDragFrameRef.current !== null) return;
    controlsDragFrameRef.current = requestAnimationFrame(() => {
      controlsDragFrameRef.current = null;
      applyControlsTransform(pendingControlsPositionRef.current);
    });
  }

  function handleControlsDragEnd(event: globalThis.PointerEvent) {
    const drag = controlsDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    controlsDragRef.current = null;
    controlsPositionRef.current = pendingControlsPositionRef.current;
    setIsControlsDragging(false);
    setControlsPosition(pendingControlsPositionRef.current);

    window.removeEventListener("pointermove", handleControlsDragMove);
    window.removeEventListener("pointerup", handleControlsDragEnd);
    window.removeEventListener("pointercancel", handleControlsDragEnd);
  }

  function applyControlsTransform(nextPosition: FloatingControlsPosition) {
    if (!floatingControlsRef.current) return;
    floatingControlsRef.current.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`;
  }

  const controlsPanelOpensUp = typeof window !== "undefined" && controlsPosition.y > window.innerHeight - 420;
  const activeScene = STAGE_SCENES.find((scene) => scene.id === stageMode) ?? STAGE_SCENES[0];

  // The lens surface is the glass controller's container. In painting mode it
  // fills the stage; in iPhone mode it IS the phone screen, so the painting
  // becomes the home-screen wallpaper and the lens refracts inside the device.
  const lensStage = (
      <div
        ref={containerRef}
        className={stageMode === "iphone" ? "lensSurface iphoneScreen" : "lensSurface lensSurfaceFull"}
        onPointerDown={(event) => {
          safeSetPointerCapture(event.currentTarget, event.pointerId);
          handlePointer(event, true);
        }}
        onPointerMove={(event) => {
          if (safeHasPointerCapture(event.currentTarget, event.pointerId)) handlePointer(event);
        }}
        onPointerUp={commitLensPosition}
        onPointerCancel={commitLensPosition}
      >
        <div
          ref={sourceRef}
          className="paintingLayer paintingSource"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
        <div
          ref={targetRef}
          className={`paintingLayer glassTarget ${visibility.glass ? "" : "glassTargetHidden"}`}
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
        {/* In dual-lens (merged) mode the WebGL/canvas shader draws the
            chrome (backdrop saturation, tint fill, border, angular rim
            highlight, and the drop shadow) from the merged blob SDF, so the
            CSS chrome overlays are not rendered at all. The shader chrome is
            visually close but not pixel-exact to this CSS (the highlight is
            an angular rim lobe rather than a blurred radial gradient);
            single-lens mode keeps the CSS chrome untouched. */}
        {(visibility.glass && !dualLens ? [0] : []).map((index) => {
          const chromePosition = dualLens ? positions[index] : position;
          return (
            <div
              key={index}
              ref={index === 0 ? glassChromeRef : glassChromeSecondRef}
              className="glassChrome"
              style={{
                "--glass-tint-bg": tint.background,
                "--glass-tint-border": tint.border,
                "--glass-tint-highlight": tint.highlight,
                "--glass-highlight-width": formatHighlightPosition(tint.highlightWidth),
                "--glass-highlight-height": formatHighlightPosition(tint.highlightHeight),
                "--glass-highlight-core": formatHighlightPosition(tint.highlightCore),
                "--glass-highlight-spread": formatHighlightPosition(tint.highlightSpread),
                "--glass-highlight-rotation": formatHighlightRotation(tint.highlightRotation),
                "--glass-highlight-x": formatHighlightPosition(tint.highlightX),
                "--glass-highlight-y": formatHighlightPosition(tint.highlightY),
                "--glass-tint-shadow": tint.shadow,
                "--glass-radius": `${lens.radius}px`,
                // left/top track the lens imperatively (applyLensVisuals) so
                // drags never depend on a React render.
                left: `${chromePosition.x * 100}%`,
                top: `${chromePosition.y * 100}%`,
                width: lens.width,
                height: lens.height,
                borderRadius: lens.radius,
                transform: "translate3d(-50%, -50%, 0)",
                WebkitBackdropFilter: `blur(0px) saturate(${tint.saturation})`,
                backdropFilter: `blur(0px) saturate(${tint.saturation})`,
              } as React.CSSProperties}
            />
          );
        })}
        {visiblePreviewCount > 0 && (
          <div
            className="componentDock"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
          >
            {visibility.slider && (
              <div className="sliderPreview componentPreview">
                <GlassSlider
                  engineMode={engineMode}
                  glassLens={sliderLens}
                  glassSurfaceBlur={0}
                  glassTint={glassTint}
                  max={100}
                  min={0}
                  onValueChange={setSliderValue}
                  renderer={INITIAL_RENDERER}
                  sliderWidth="100%"
                  value={sliderValue}
                />
              </div>
            )}
            {visibility.switch && (
              <SwitchPreviewStack
                engineMode={engineMode}
                glassLens={switchLensOverrideEnabled ? switchLens : undefined}
                glassSurfaceBlur={0}
                glassTint={glassTint}
                renderer={INITIAL_RENDERER}
              />
            )}
            {visibility.button && (
              <div className="buttonPreview">
                {/* No container chrome: the buttons float directly over the
                    painting. The painting layer is an inset:0 child of the
                    stage with background-size: cover, so anchoring the
                    backdrop to the stage container reproduces the same cover
                    transform — each button refracts the exact slice of the
                    painting behind it. */}
                {SWITCH_PREVIEW_SIZES.map((buttonSize) => (
                  <GlassButton
                    engineMode={engineMode}
                    glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
                    glassLens={buttonLens}
                    glassSurfaceBlur={0}
                    glassTint={glassTint}
                    key={buttonSize}
                    pressHighlight={pressHighlight}
                    renderer={INITIAL_RENDERER}
                    size={buttonSize}
                  >
                    Liquid
                  </GlassButton>
                ))}
              </div>
            )}
            {visibility.dropdown && (
              <div className="dropdownPreview">
                {/* No container chrome: like the buttons, the dropdown floats
                    directly over the painting and its merged-lens goo refracts
                    the cover slice behind the whole trigger+menu region
                    (anchored to the stage container). */}
                <GlassDropdown
                  blend={blend}
                  engineMode={engineMode}
                  gap={dropdownGap}
                  glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
                  glassLens={dropdownLens}
                  glassTint={glassTint}
                  items={DROPDOWN_PREVIEW_ITEMS}
                  label="Open dropdown menu"
                  pressHighlight={pressHighlight}
                />
              </div>
            )}
            {visibility.modal && (
              <div className="modalPreview componentPreview">
                <button className="modalPreviewButton" onClick={() => setIsModalVisible(true)} type="button">
                  Modal
                </button>
              </div>
            )}
          </div>
        )}
        {stageMode === "iphone" && (
          <>
            {/* Dynamic Island demo: click toggles between the black pill and
                the expanded glass notification panel. Pointer events stop here
                so toggling never drags the lens underneath. */}
            <button
              aria-expanded={islandExpanded}
              aria-label={islandExpanded ? "Collapse Dynamic Island" : "Expand Dynamic Island"}
              className={`dynamicIsland${islandExpanded ? " islandExpanded" : ""}${islandDemo === "weather" ? " demoWeather" : ""}`}
              onClick={cycleIsland}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              ref={dynamicIslandRef}
              style={
                {
                  "--dynamic-island-radius": `${Math.max(0, lens.radius)}px`,
                } as React.CSSProperties
              }
              type="button"
            >
              <GlassNode
                className="dynamicIslandGlass"
                disabled={!islandExpanded}
                drawSource={islandDrawSource}
                engineMode={engineMode}
                lens={islandLens}
                lensX={0}
                lensY={0}
                renderer={INITIAL_RENDERER}
                sourceHeight={islandSize.height}
                sourceWidth={islandSize.width}
                surfaceBlur={0}
                surfaceClassName="dynamicIslandGlassSurface"
                surfaceTone="clear"
                tint={glassTint}
              />
              <span className="islandContent" aria-hidden={!islandExpanded}>
                {islandDemo === "messages" ? (
                  <>
                    <span className="islandHeadline">Here, I found the door code in your messages from Mac.</span>
                    <span className="islandMessage">
                      <span className="islandAvatar">MT</span>
                      <span className="islandMessageBody">
                        <span className="islandMessageHead">
                          <b>Mac Tyler</b>
                          <small>Thursday</small>
                        </span>
                        <span className="islandMessageText">
                          There&rsquo;s a spare key on the hook by the coat rack! The front door code is #1997
                        </span>
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="islandHeadline">
                      It&rsquo;ll be fantastic weather for your upcoming tennis lesson this Sunday.
                    </span>
                    <span className="islandWeather">
                      <span className="islandWeatherTop">
                        <span className="islandWeatherCity">
                          San Francisco
                          <IconLocationFill aria-hidden="true" />
                        </span>
                        <IconSunMaxFill aria-hidden="true" className="islandWeatherSun" />
                      </span>
                      <span className="islandWeatherBottom">
                        <span className="islandWeatherTemp">63&deg;</span>
                        <span className="islandWeatherMeta">
                          <b>Sunny</b>
                          <small>H:63&deg; L:52&deg;</small>
                        </span>
                      </span>
                    </span>
                  </>
                )}
              </span>
            </button>
            <div className="homeIndicator" aria-hidden="true" />
          </>
        )}
      </div>
  );

  return (
    <main className="shell">
      <style>{styles}</style>
      <section className={`stage${stageMode === "iphone" ? " stageIphone" : ""}`}>
        {stageMode === "iphone" ? (
          <div className="iphoneFrame">
            <span className="iphoneButton actionButton" aria-hidden="true" />
            <span className="iphoneButton volumeUp" aria-hidden="true" />
            <span className="iphoneButton volumeDown" aria-hidden="true" />
            <span className="iphoneButton powerButton" aria-hidden="true" />
            <span className="iphoneButton cameraControl" aria-hidden="true" />
            <div className="iphoneBezel">{lensStage}</div>
          </div>
        ) : (
          lensStage
        )}
        {backgroundUrl === PAINTING_URL && (
          <div className="attribution">Giovanni Battista Tiepolo, Rinaldo and Armida in Her Garden</div>
        )}
      </section>

      <div className="sceneSwitcher">
        {stageMode === "iphone" && (
          <div aria-label="Dynamic Island demo" className="islandDemoPicker" role="radiogroup">
            {ISLAND_DEMOS.map(({ id, label, Icon }) => (
              <button
                aria-checked={islandDemo === id}
                aria-label={`${label} island demo`}
                className={islandDemo === id ? "islandDemoChip active" : "islandDemoChip"}
                key={id}
                onClick={() => {
                  // Direct jump: disarm the click-cycle so the next island
                  // open shows exactly the chosen demo. Re-clicking the
                  // active demo toggles the island; picking a different demo
                  // switches content and expands right away.
                  islandCycleArmedRef.current = false;
                  if (islandDemo === id) {
                    setIslandExpanded((current) => !current);
                    return;
                  }
                  setIslandDemo(id);
                  setIslandExpanded(true);
                }}
                role="radio"
                title={label}
                type="button"
              >
                <Icon />
              </button>
            ))}
          </div>
        )}
        {stageMode === "iphone" && (
          <div aria-label="iPhone wallpaper" className="wallpaperSwatches" role="radiogroup">
            {WALLPAPERS.map((wallpaper) => (
              <button
                aria-checked={wallpaperId === wallpaper.id}
                aria-label={`Use ${wallpaper.label} wallpaper`}
                className={wallpaperId === wallpaper.id ? "wallpaperSwatch active" : "wallpaperSwatch"}
                key={wallpaper.id}
                onClick={() => setWallpaperId(wallpaper.id)}
                role="radio"
                style={{ backgroundImage: `url(${wallpaper.url})` }}
                title={wallpaper.label}
                type="button"
              />
            ))}
          </div>
        )}
        <button
          aria-expanded={sceneMenuOpen}
          aria-haspopup="menu"
          className="sceneTrigger"
          onClick={() => setSceneMenuOpen((current) => !current)}
          type="button"
        >
          <span>{activeScene.label}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path d="M6 8l4 4 4-4" />
          </svg>
        </button>
        {sceneMenuOpen && (
          <>
            <div className="sceneMenuBackdrop" onClick={() => setSceneMenuOpen(false)} />
            <div className="sceneMenu" role="menu">
              {STAGE_SCENES.map((scene) => (
                <button
                  aria-checked={scene.id === stageMode}
                  className={scene.id === stageMode ? "active" : ""}
                  key={scene.id}
                  onClick={() => {
                    setStageMode(scene.id);
                    setSceneMenuOpen(false);
                  }}
                  role="menuitemradio"
                  type="button"
                >
                  <span>{scene.label}</span>
                  <small>{scene.hint}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <GlassModal
        footer={
          <button className="modalConfirmButton" onClick={() => setIsModalVisible(false)} type="button">
            Done
          </button>
        }
        glassSettings={{
          lens: modalLens,
          surfaceBlur: 0,
          tint: glassTint,
        }}
        header="Glass modal"
        isVisible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        renderer={INITIAL_RENDERER}
        engineMode={engineMode}
        width={380}
      >
        <div className="modalPreviewBody">
          <p>Use the playground controls to tune this modal glass.</p>
          <p>Tint, lens, optics, and light settings are forwarded into the modal.</p>
        </div>
      </GlassModal>

      <div
        ref={floatingControlsRef}
        className={`floatingControls ${controlsPanelOpensUp ? "panelAbove" : ""}`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
      >
        <div className={`controlBar ${isControlsDragging ? "dragging" : ""}`}>
          <button
            aria-label="Move controls"
            className="dragHandle"
            onPointerDown={handleControlsDragStart}
            title="Drag controls"
            type="button"
          >
            <span className="gripDots" aria-hidden="true" />
          </button>
          <button
            aria-expanded={controlsOpen}
            aria-label={controlsOpen ? "Collapse controls" : "Open controls"}
            className="iconButton"
            onClick={() => setControlsOpen((current) => !current)}
            title={controlsOpen ? "Collapse controls" : "Open controls"}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              {controlsOpen ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M10 4.25v2.1M10 13.65v2.1M15.75 10h-2.1M6.35 10h-2.1M13.98 6.02l-1.48 1.48M7.5 12.5l-1.48 1.48M13.98 13.98l-1.48-1.48M7.5 7.5 6.02 6.02M12.2 10a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z" />
              )}
            </svg>
          </button>
        </div>

        {controlsOpen && (
          <aside className="controlsPanel">
            <div className="accordionStack">
              <details className="accordionSection" open>
                <summary>
                  <span>Renderer</span>
                  <b>{stats ? `${stats.activeEngine} / ${stats.activeRenderer}` : "ts / svg"}</b>
                </summary>
                <div className="accordionBody">
                  <div className="segments">
                    {(["auto", "wasm", "ts"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={engineMode === mode ? "active" : ""}
                        onClick={() => setEngineMode(mode)}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </details>

              <details className="accordionSection" open>
                <summary>
                  <span>Visible</span>
                  <b>{VISIBILITY_OPTIONS.filter(({ key }) => visibility[key]).length} on</b>
                </summary>
                <div className="accordionBody">
                  <div className="visibilityGrid">
                    {VISIBILITY_OPTIONS.map(({ key, label }) => (
                      <label className="visibilityToggle" key={key}>
                        <span>{label}</span>
                        <input
                          checked={visibility[key]}
                          onChange={(event) => updateVisibility(key, event.target.checked)}
                          type="checkbox"
                        />
                      </label>
                    ))}
                  </div>
                  {/* Press highlight style for the button + dropdown previews:
                      natural = the glass itself (boosted optics/saturation),
                      additive = the overexposure bloom + cursor light. */}
                  <label>
                    <span>
                      press highlight
                      <b>{pressHighlight}</b>
                    </span>
                  </label>
                  <div className="segments tintMode">
                    {(["natural", "additive"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={pressHighlight === mode ? "active" : ""}
                        onClick={() => setPressHighlight(mode)}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </details>

              <details className="accordionSection" open>
                <summary>
                  <span>Lenses</span>
                  <b>{`${dualLens ? "dual" : "single"} / blend ${Math.round(blend)}`}</b>
                </summary>
                <div className="accordionBody">
                  <div className="segments tintMode">
                    {(["single", "dual"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={(dualLens ? "dual" : "single") === mode ? "active" : ""}
                        onClick={() => setDualLens(mode === "dual")}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {/* Blend drives every merged-lens surface: the dual draggable
                      blob AND the dropdown goo morph — always visible so goo
                      defaults can be tuned against any preview. */}
                  <label>
                    <span>
                      blend
                      <b>{Math.round(blend)}</b>
                    </span>
                    <input
                      min={0}
                      max={120}
                      step={1}
                      type="range"
                      value={blend}
                      onChange={(event) => setBlend(Number(event.target.value))}
                    />
                  </label>
                  {visibility.dropdown && (
                    <label>
                      <span>
                        dropdown gap
                        <b>{Math.round(dropdownGap)}</b>
                      </span>
                      <input
                        min={0}
                        max={60}
                        step={1}
                        type="range"
                        value={dropdownGap}
                        onChange={(event) => setDropdownGap(Number(event.target.value))}
                      />
                    </label>
                  )}
                </div>
              </details>

              <details className="accordionSection" open>
                <summary>
                  <span>Tint</span>
                  <b>{tintMode === "preset" ? tintName : customTint.color}</b>
                </summary>
                <div className="accordionBody">
                  <div className="segments tintMode">
                    {(["custom", "preset"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={tintMode === mode ? "active" : ""}
                        onClick={() => setTintMode(mode)}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <div className="customTint">
                    <label className="colorControl">
                      <span>
                        color
                        <b>{customTint.color}</b>
                      </span>
                      <input
                        aria-label="custom tint color"
                        type="color"
                        value={customTint.color}
                        onChange={(event) => updateCustomTint("color", event.target.value)}
                      />
                    </label>
                    <label className="colorControl">
                      <span>
                        highlight
                        <b>{customTint.highlightColor}</b>
                      </span>
                      <input
                        aria-label="custom highlight color"
                        type="color"
                        value={customTint.highlightColor}
                        onChange={(event) => updateCustomTint("highlightColor", event.target.value)}
                      />
                    </label>
                    {(
                      [
                        ["opacity", 0, 0.5, 0.01],
                        ["borderOpacity", 0, 1, 0.01],
                        ["highlightOpacity", 0, 1, 0.01],
                        ["highlightWidth", 0.1, 2.5, 0.01],
                        ["highlightHeight", 0.1, 2, 0.01],
                        ["highlightCore", 0, 0.9, 0.01],
                        ["highlightSpread", 0.05, 1.4, 0.01],
                        ["highlightRotation", -180, 180, 1],
                        ["highlightX", -0.5, 1.5, 0.01],
                        ["highlightY", -0.75, 1.5, 0.01],
                        ["shadowOpacity", 0, 1, 0.01],
                        ["saturation", 0, 3, 0.01],
                      ] as const
                    ).map(([key, min, max, step]) => (
                      <label key={key}>
                        <span>
                          {key}
                          <b>{formatValue(customTint[key])}</b>
                        </span>
                        <input
                          min={min}
                          max={max}
                          step={step}
                          type="range"
                          value={customTint[key]}
                          onChange={(event) => updateCustomTint(key, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="tintGrid">
                    {TINT_NAMES.map((name) => {
                      const option = resolveGlassTint(name);
                      return (
                        <button
                          key={name}
                          aria-label={`Use ${name} tint`}
                          className={tintMode === "preset" && tintName === name ? "tintSwatch active" : "tintSwatch"}
                          onClick={() => {
                            setTintMode("preset");
                            setTintName(name);
                          }}
                          style={{
                            "--swatch-bg": option.background,
                            "--swatch-border": option.border,
                          } as React.CSSProperties}
                          title={name}
                          type="button"
                        />
                      );
                    })}
                  </div>
                </div>
              </details>

              <details className="accordionSection" open>
                <summary>
                  <span>Lens</span>
                  <b>{Math.round(lens.width)} x {Math.round(lens.height)}</b>
                </summary>
                <div className="accordionBody">
                  <div className="group">
                    {CONTROL_GROUPS[0].map((key) => {
                      const limits = CONTROL_LIMITS[key];
                      return (
                        <label key={key}>
                          <span>
                            {key}
                            <b>{formatValue(lens[key])}</b>
                          </span>
                          <input
                            min={limits.min}
                            max={limits.max}
                            step={limits.step}
                            type="range"
                            value={lens[key]}
                            onChange={(event) => updateLens(key, Number(event.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>

              <details className="accordionSection">
                <summary>
                  <span>Optics</span>
                  <b>{formatValue(lens.scaleX)} / {formatValue(lens.chroma)}</b>
                </summary>
                <div className="accordionBody">
                  <div className="group">
                    {CONTROL_GROUPS[1].map((key) => {
                      const limits = CONTROL_LIMITS[key];
                      return (
                        <label key={key}>
                          <span>
                            {key}
                            <b>{formatValue(lens[key])}</b>
                          </span>
                          <input
                            min={limits.min}
                            max={limits.max}
                            step={limits.step}
                            type="range"
                            value={lens[key]}
                            onChange={(event) => updateLens(key, Number(event.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>

              <details className="accordionSection">
                <summary>
                  <span>Light</span>
                  <b>{formatValue(lens.glow)} / {formatValue(lens.edge)}</b>
                </summary>
                <div className="accordionBody">
                  <div className="group">
                    {CONTROL_GROUPS[2].map((key) => {
                      const limits = CONTROL_LIMITS[key];
                      return (
                        <label key={key}>
                          <span>
                            {key}
                            <b>{formatValue(lens[key])}</b>
                          </span>
                          <input
                            min={limits.min}
                            max={limits.max}
                            step={limits.step}
                            type="range"
                            value={lens[key]}
                            onChange={(event) => updateLens(key, Number(event.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </details>

              <details className="accordionSection">
                <summary>
                  <span>Stats</span>
                  <b>{stats?.applyCount ?? 0} passes</b>
                </summary>
                <div className="accordionBody">
                  <dl className="stats">
                    <div>
                      <dt>map</dt>
                      <dd>{stats ? `${stats.lastMapMs.toFixed(2)}ms` : "0.00ms"}</dd>
                    </div>
                    <div>
                      <dt>apply</dt>
                      <dd>{stats ? `${stats.lastApplyMs.toFixed(2)}ms` : "0.00ms"}</dd>
                    </div>
                    <div>
                      <dt>passes</dt>
                      <dd>{stats?.applyCount ?? 0}</dd>
                    </div>
                  </dl>
                </div>
              </details>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

function SwitchPreviewStack(props: SwitchPreviewStackProps) {
  return (
    <div className="switchPreview componentPreview" aria-label="Switch size previews">
      {SWITCH_PREVIEW_SIZES.map((size) => (
        <div className="switchPreviewRow" key={size}>
          <span>{size}</span>
          <GlassSwitch active defaultChecked size={size} {...props} />
        </div>
      ))}
    </div>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatHighlightPosition(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatHighlightRotation(value: number): string {
  return `${Math.round(value * 100) / 100}deg`;
}

function computeTargetClipPath(
  position: { x: number; y: number },
  lens: ResolvedLensParams,
): string {
  return `inset(calc(${position.y * 100}% - ${lens.height / 2}px) calc(${100 - position.x * 100}% - ${lens.width / 2}px) calc(${100 - position.y * 100}% - ${lens.height / 2}px) calc(${position.x * 100}% - ${lens.width / 2}px) round ${lens.radius}px)`;
}

function getInitialRenderer(): LiquidGlassRenderer {
  if (typeof window === "undefined") return "auto";
  return new URLSearchParams(window.location.search).get("renderer") === "canvas" ? "canvas" : "auto";
}

function getInitialControlsPosition(): FloatingControlsPosition {
  if (typeof window === "undefined") return { x: FLOATING_CONTROLS_MARGIN, y: FLOATING_CONTROLS_MARGIN };

  return constrainControlsPosition({
    x: window.innerWidth - FLOATING_CONTROLS_WIDTH - 20,
    // Sits below the fixed scene switcher pill in the top-right corner.
    y: 64,
  });
}

function constrainControlsPosition(position: FloatingControlsPosition): FloatingControlsPosition {
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

function safeSetPointerCapture(element: Element, pointerId: number): void {
  if (!("setPointerCapture" in element)) return;
  try {
    (element as Element & { setPointerCapture(pointerId: number): void }).setPointerCapture(pointerId);
  } catch {
    // Some embedded browsers can reject capture during synthetic or interrupted drags.
  }
}

function safeHasPointerCapture(element: Element, pointerId: number): boolean {
  if (!("hasPointerCapture" in element)) return true;
  try {
    return (element as Element & { hasPointerCapture(pointerId: number): boolean }).hasPointerCapture(pointerId);
  } catch {
    return false;
  }
}

const islandBackdropImageCache = new Map<string, HTMLImageElement>();

function getIslandBackdropImage(url: string): HTMLImageElement {
  const cached = islandBackdropImageCache.get(url);
  if (cached) return cached;

  const image = new Image();
  image.decoding = "async";
  image.src = url;
  islandBackdropImageCache.set(url, image);
  return image;
}

function isImageReady(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function computeCoverSlice(input: {
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

const styles = `
* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 320px;
  height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f5efe5;
  background: #15120e;
  overflow: hidden;
}
button, input { font: inherit; }
.shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
}
.stage {
  position: relative;
  overflow: hidden;
  height: 100vh;
  min-height: 0;
  cursor: crosshair;
  background: #15120e;
  touch-action: none;
}
.stage.stageIphone {
  display: grid;
  place-items: center;
  cursor: default;
  background: #0a0a0c;
}
.stage.stageIphone::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
  background-image: radial-gradient(circle, rgba(255,255,255,0.13) 1px, transparent 1.6px);
  background-size: 24px 24px;
  background-position: 12px 12px;
  mask-image: radial-gradient(ellipse 85% 85% at 50% 50%, #000 30%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 85% 85% at 50% 50%, #000 30%, transparent 100%);
}
.stage.stageIphone::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
  background: radial-gradient(ellipse 46% 54% at 50% 46%, rgba(120, 140, 180, 0.1), transparent 70%);
}
.lensSurfaceFull {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  touch-action: none;
}
.iphoneFrame {
  position: relative;
  z-index: 2;
  height: min(86vh, 800px);
  aspect-ratio: 392 / 800;
  padding: 4px;
  border-radius: 64px;
  background: linear-gradient(150deg, #5c5c62 0%, #2e2e33 30%, #202024 55%, #4c4c52 100%);
  box-shadow:
    0 50px 110px rgba(0, 0, 0, 0.6),
    0 16px 40px rgba(0, 0, 0, 0.45),
    inset 0 0 1.5px 1px rgba(255, 255, 255, 0.22);
}
.iphoneBezel {
  height: 100%;
  padding: 8px;
  border-radius: 60px;
  background: #050505;
}
.iphoneScreen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 52px;
  background: #000;
  cursor: crosshair;
  touch-action: none;
  isolation: isolate;
}
.iphoneButton {
  position: absolute;
  width: 3.5px;
  border-radius: 2px;
  background: linear-gradient(180deg, #4c4c52, #28282d 50%, #44444a);
  box-shadow: inset 0 0 1px rgba(255, 255, 255, 0.25);
}
.iphoneButton.actionButton { left: -3px; top: 16%; height: 30px; }
.iphoneButton.volumeUp { left: -3px; top: 23.5%; height: 56px; }
.iphoneButton.volumeDown { left: -3px; top: 32.5%; height: 56px; }
.iphoneButton.powerButton { right: -3px; top: 25.5%; height: 90px; }
.iphoneButton.cameraControl { right: -3px; top: 60%; height: 44px; }
.dynamicIsland {
  position: absolute;
  left: 50%;
  top: 12px;
  z-index: 10;
  width: 122px;
  height: 36px;
  padding: 0;
  overflow: hidden;
  border: 0;
  transform: translateX(-50%);
  border-radius: 22px;
  background: #000;
  cursor: pointer;
  font: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  /* Base values exist so the expand morph can interpolate them. */
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.85),
    inset 0 0 3px rgba(255, 255, 255, 0.05);
  transition:
    width 460ms cubic-bezier(0.34, 1.25, 0.4, 1),
    height 460ms cubic-bezier(0.34, 1.25, 0.4, 1),
    border-radius 460ms cubic-bezier(0.34, 1.25, 0.4, 1),
    background-color 360ms ease,
    box-shadow 360ms ease;
}
.dynamicIsland.islandExpanded {
  width: calc(100% - 22px);
  height: 198px;
  border-radius: var(--dynamic-island-radius, 34px);
  background: transparent;
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.dynamicIslandGlass {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 180ms ease;
}
.islandExpanded .dynamicIslandGlass {
  opacity: 1;
  transition-delay: 70ms;
}
.dynamicIslandGlass .lg-glass-node__canvas {
  border-radius: inherit;
}
.dynamicIslandGlassSurface.lg-glass-surface {
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.38),
    inset 0 1px 0 var(--lg-glass-highlight),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18);
}
.islandContent {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 13px;
  width: 100%;
  padding: 19px 18px 15px;
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px) scale(0.97);
  transition:
    opacity 140ms ease,
    transform 160ms ease;
}
.islandExpanded .islandContent {
  opacity: 1;
  transform: none;
  transition:
    opacity 240ms ease 140ms,
    transform 300ms cubic-bezier(0.23, 1, 0.32, 1) 140ms;
}
.islandHeadline {
  color: #fff;
  font-size: 16.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
  line-height: 1.32;
}
.islandMessage {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px 12px 12px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09);
}
.islandAvatar {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: linear-gradient(180deg, #a4abbd 0%, #79829a 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 620;
  letter-spacing: 0.4px;
}
.islandAvatar::after {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 17px;
  height: 17px;
  content: "";
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 42%, #fff 0%, #fff 26%, transparent 30%),
    linear-gradient(180deg, #5ddb6f, #2eb84e);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.islandMessageBody {
  display: grid;
  gap: 2px;
  min-width: 0;
  color: #fff;
}
.islandMessageHead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.islandMessageHead b {
  font-size: 14.5px;
  font-weight: 680;
}
.islandMessageHead small {
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  font-weight: 500;
}
.islandMessageText {
  color: rgba(255, 255, 255, 0.92);
  font-size: 13.5px;
  line-height: 1.36;
}
/* Weather demo: 3-line headline + the forecast card need a taller panel. */
.dynamicIsland.islandExpanded.demoWeather {
  height: 236px;
}
.islandWeather {
  display: grid;
  gap: 5px;
  padding: 13px 16px 12px;
  border-radius: 24px;
  background: linear-gradient(180deg, #4aa3f5 0%, #7fc4f9 100%);
  color: #fff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 8px 22px rgba(38, 188, 245, 0.18);
}
.islandWeatherTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.islandWeatherCity {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  font-size: 15.5px;
  font-weight: 650;
}
.islandWeatherCity svg {
  width: 13px;
  height: auto;
  fill: #fff;
}
.islandWeatherSun {
  width: 21px;
  height: auto;
  fill: #ffd60a;
  filter: drop-shadow(0 0 6px rgba(255, 214, 10, 0.55));
}
.islandWeatherBottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.islandWeatherTemp {
  font-size: 46px;
  font-weight: 380;
  letter-spacing: -0.5px;
  line-height: 0.98;
}
.islandWeatherMeta {
  display: grid;
  gap: 1px;
  text-align: right;
}
.islandWeatherMeta b {
  font-size: 14.5px;
  font-weight: 620;
}
.islandWeatherMeta small {
  font-size: 13.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.96);
}
.islandDemoPicker {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  border-radius: 18px;
  background: #1a1a1a;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  animation: panelIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
.islandDemoChip {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.islandDemoChip:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.islandDemoChip:active { transform: scale(0.9); }
.islandDemoChip.active {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.islandDemoChip svg {
  width: 13px;
  height: auto;
  fill: currentColor;
}
.homeIndicator {
  position: absolute;
  left: 50%;
  bottom: 8px;
  z-index: 9;
  width: 118px;
  height: 5px;
  pointer-events: none;
  transform: translateX(-50%);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.28);
}
.sceneSwitcher {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
}
.wallpaperSwatches {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 10px;
  border-radius: 18px;
  background: #1a1a1a;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  animation: panelIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
.wallpaperSwatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background-position: center;
  background-size: cover;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  transition:
    outline-color 140ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.wallpaperSwatch:hover { transform: scale(1.08); }
.wallpaperSwatch:active { transform: scale(0.9); }
.wallpaperSwatch.active {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.sceneTrigger {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 10px 0 14px;
  border: 0;
  border-radius: 18px;
  background: #1a1a1a;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  transition:
    background-color 150ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sceneTrigger:hover { background: #232323; }
.sceneTrigger:active { transform: scale(0.97); }
.sceneTrigger svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.6;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sceneTrigger[aria-expanded="true"] svg { transform: rotate(180deg); }
.sceneMenuBackdrop {
  position: fixed;
  inset: 0;
}
.sceneMenu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  display: grid;
  gap: 4px;
  width: 192px;
  padding: 6px;
  border-radius: 14px;
  background: #1c1c1c;
  box-shadow:
    0 1px 8px rgba(0, 0, 0, 0.25),
    0 18px 48px rgba(0, 0, 0, 0.22),
    inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  animation: panelIn 160ms cubic-bezier(0.23, 1, 0.32, 1) both;
}
.sceneMenu button {
  display: grid;
  gap: 2px;
  padding: 8px 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 580;
  text-align: left;
  transition: background-color 130ms ease;
}
.sceneMenu button small {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  font-weight: 480;
}
.sceneMenu button:hover { background: rgba(255, 255, 255, 0.07); }
.sceneMenu button.active { background: rgba(255, 255, 255, 0.11); }
.paintingLayer {
  position: absolute;
  inset: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
.paintingSource {
  z-index: 1;
}
.glassTarget {
  z-index: 3;
  transform: translateZ(0);
  will-change: filter, clip-path;
}
.glassTargetHidden {
  opacity: 0;
  visibility: hidden;
}
.glassChrome {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 8;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse var(--glass-highlight-width) var(--glass-highlight-height) at var(--glass-highlight-x) var(--glass-highlight-y), var(--glass-tint-highlight) 0%, var(--glass-tint-highlight) var(--glass-highlight-core), transparent var(--glass-highlight-spread)),
    var(--glass-tint-bg);
  border: 1px solid var(--glass-tint-border);
  box-shadow:
    0 18px 48px var(--glass-tint-shadow),
    inset 0 1px var(--glass-tint-highlight),
    inset 0 -1px rgba(0, 0, 0, 0.16);
}
.glassChrome::before {
  position: absolute;
  left: calc(var(--glass-highlight-x) - var(--glass-highlight-width) * 0.34);
  top: calc(var(--glass-highlight-y) - var(--glass-highlight-height) * 0.39);
  width: calc(var(--glass-highlight-width) * 0.68);
  height: calc(var(--glass-highlight-height) * 0.78);
  border-radius: 999px;
  pointer-events: none;
  content: "";
  background: var(--glass-tint-highlight);
  filter: blur(10px);
  opacity: 0.62;
  transform: rotate(var(--glass-highlight-rotation));
  mask-image: radial-gradient(ellipse at center, #000 0%, #000 var(--glass-highlight-core), transparent var(--glass-highlight-spread));
  -webkit-mask-image: radial-gradient(ellipse at center, #000 0%, #000 var(--glass-highlight-core), transparent var(--glass-highlight-spread));
}
.glassChrome::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  content: "";
  box-shadow:
    inset 1px 0 rgba(255,255,255,0.22),
    inset -1px 0 rgba(0,0,0,0.08);
}
.componentDock {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: max-content;
  max-width: calc(100% - 48px);
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.componentPreview {
  display: grid;
  place-items: center;
  gap: 18px;
  min-height: 132px;
  padding: 32px;
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 24px;
  box-shadow:
    0 24px 70px rgba(0,0,0,0.24),
    0 2px 8px rgba(0,0,0,0.08);
}
.sliderPreview {
  width: min(380px, calc(100vw - 48px));
  min-width: 0;
}
.switchPreview {
  width: 210px;
  justify-items: stretch;
  min-height: 132px;
  padding: 20px 18px;
  gap: 12px;
}
.switchPreviewRow {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.switchPreviewRow span {
  color: rgba(17,17,17,0.5);
  font-size: 11px;
  font-weight: 680;
  letter-spacing: 0;
  text-transform: uppercase;
}
.buttonPreview {
  /* No container chrome — just the buttons, stacked by size, floating over
     the painting. */
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
}
.dropdownPreview {
  /* No container chrome — the trigger (and its goo menu, which overlays
     absolutely) floats directly over the painting. */
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.modalPreview {
  width: 96px;
  min-height: 132px;
  padding: 18px;
}
.modalPreviewButton,
.modalConfirmButton {
  min-height: 38px;
  padding: 0 16px;
  color: #ffffff;
  background: #1a88f8;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(26, 136, 248, 0.24);
  cursor: pointer;
  font-size: 13px;
  font-weight: 720;
}
.modalPreviewButton:active,
.modalConfirmButton:active {
  transform: scale(0.97);
}
.modalPreviewBody {
  display: grid;
  gap: 12px;
  max-width: 320px;
}
.modalPreviewBody p {
  margin: 0;
}
.attribution {
  position: absolute;
  left: 18px;
  bottom: 14px;
  z-index: 5;
  pointer-events: none;
  color: rgba(255, 248, 237, 0.76);
  font-size: 12px;
  text-shadow: 0 1px 10px rgba(0,0,0,0.45);
}
.floatingControls {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 20;
  width: min(${FLOATING_CONTROLS_WIDTH}px, calc(100vw - ${FLOATING_CONTROLS_MARGIN * 2}px));
  color: #fff;
  font-family: inherit;
  pointer-events: auto;
  will-change: transform;
}
.controlBar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  height: ${FLOATING_CONTROLS_BAR_HEIGHT}px;
  margin-left: auto;
  padding: 6px;
  border-radius: 22px;
  background: #1a1a1a;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 0 0 1px rgba(255,255,255,0.06);
  user-select: none;
  transition:
    transform 140ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 180ms ease,
    box-shadow 180ms ease;
}
.controlBar.dragging {
  transform: scale(0.98);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.26),
    inset 0 0 0 1px rgba(255,255,255,0.08);
}
.dragHandle,
.iconButton {
  border: 0;
  background: transparent;
  color: inherit;
}
.dragHandle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  width: 32px;
  flex: 0 0 32px;
  height: 32px;
  padding: 0;
  border-radius: 16px;
  cursor: grab;
  transition: background-color 150ms ease;
}
.dragHandle:hover {
  background: rgba(255,255,255,0.08);
}
.dragHandle:active {
  cursor: grabbing;
}
.gripDots {
  width: 12px;
  height: 18px;
  flex: 0 0 auto;
  opacity: 0.45;
  background-image: radial-gradient(circle, currentColor 1.2px, transparent 1.4px);
  background-size: 6px 6px;
  background-position: 0 1px;
}
.iconButton {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border-radius: 50%;
  color: rgba(255,255,255,0.84);
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.iconButton:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}
.iconButton:active {
  transform: scale(0.92);
}
.iconButton svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.controlsPanel {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 100%;
  max-height: min(72vh, 628px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 14px;
  border-radius: 16px;
  background: #1c1c1c;
  box-shadow:
    0 1px 8px rgba(0, 0, 0, 0.25),
    0 18px 48px rgba(0, 0, 0, 0.22),
    inset 0 0 0 1px rgba(255,255,255,0.07);
  animation: panelIn 180ms cubic-bezier(0.23, 1, 0.32, 1) both;
  cursor: default;
}
.panelAbove .controlsPanel {
  top: auto;
  bottom: calc(100% + 8px);
}
@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}
.panelAbove .controlsPanel {
  transform-origin: bottom right;
}
.accordionStack {
  display: grid;
  gap: 8px;
}
.accordionSection {
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  background: rgba(255,255,255,0.035);
}
.accordionSection[open] {
  background: rgba(255,255,255,0.055);
}
.accordionSection summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding: 0 12px;
  color: rgba(255,255,255,0.88);
  font-size: 13px;
  font-weight: 560;
  cursor: pointer;
  list-style: none;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
.accordionSection summary::-webkit-details-marker {
  display: none;
}
.accordionSection summary:hover {
  background: rgba(255,255,255,0.045);
  color: #fff;
}
.accordionSection summary::after {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  content: "";
  opacity: 0.42;
  transform: rotate(45deg) translateY(-2px);
  transition:
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 150ms ease;
}
.accordionSection[open] summary::after {
  opacity: 0.72;
  transform: rotate(225deg) translateY(-1px);
}
.accordionSection summary b {
  margin-left: auto;
  max-width: 112px;
  overflow: hidden;
  color: rgba(255,255,255,0.46);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.accordionBody {
  display: grid;
  gap: 10px;
  padding: 0 12px 12px;
}
.stats div, .controlsPanel label span, .labelRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.segments {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
}
.segments button {
  height: 30px;
  border: 0;
  border-right: 1px solid rgba(255,255,255,0.07);
  background: transparent;
  color: rgba(255,255,255,0.68);
  cursor: pointer;
  font-size: 12px;
  font-weight: 560;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.segments button:last-child { border-right: 0; }
.segments button:hover { color: #fff; }
.segments button:active { transform: scale(0.96); }
.segments button.active { background: #fff; color: #15191b; }
.segments.tintMode { grid-template-columns: repeat(2, 1fr); }
.visibilityGrid {
  display: grid;
  gap: 6px;
}
.group {
  display: grid;
  gap: 10px;
}
.controlsPanel label {
  display: grid;
  gap: 6px;
  color: rgba(255,255,255,0.54);
  font-size: 12px;
}
.controlsPanel label.visibilityToggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  background: rgba(255,255,255,0.045);
  color: rgba(255,255,255,0.78);
  cursor: pointer;
}
.visibilityToggle input {
  width: 36px;
  height: 20px;
  margin: 0;
  accent-color: #6fd7d0;
  cursor: pointer;
}
.controlsPanel label b, .labelRow b {
  color: rgba(255,255,255,0.86);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.labelRow {
  color: rgba(255,255,255,0.52);
  font-size: 12px;
}
.controlsPanel input[type="range"] {
  width: 100%;
  height: 16px;
  accent-color: #6fd7d0;
}
.customTint {
  display: grid;
  gap: 9px;
  padding: 10px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  background: rgba(255,255,255,0.045);
}
.colorControl {
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
}
.colorControl input {
  width: 44px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.tintGrid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 7px;
}
.tintSwatch {
  aspect-ratio: 1;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  background:
    linear-gradient(180deg, var(--swatch-border), transparent 45%),
    var(--swatch-bg);
  cursor: pointer;
  box-shadow: inset 0 1px rgba(255,255,255,0.55);
  transition:
    outline-color 140ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.tintSwatch:active {
  transform: scale(0.9);
}
.tintSwatch.active {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 12px 0 0;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.stats div {
  display: grid;
  min-height: 42px;
  align-content: center;
  gap: 2px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(255,255,255,0.045);
}
.stats dt {
  color: rgba(255,255,255,0.42);
  font-size: 11px;
}
.stats dd {
  margin: 0;
  color: rgba(255,255,255,0.88);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 880px) {
  body { height: 100vh; overflow: hidden; }
  .shell { grid-template-columns: 1fr; height: 100vh; overflow: hidden; }
  .stage { height: 100vh; min-height: 100vh; }
  .componentDock {
    top: 50%;
    width: min(340px, calc(100% - 32px));
    max-width: calc(100% - 32px);
  }
  .sliderPreview,
  .switchPreview,
  .buttonPreview,
  .dropdownPreview,
  .modalPreview {
    width: 100%;
  }
  .componentPreview { padding: 22px; }
  .switchPreview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 0;
    padding: 16px;
  }
  .switchPreviewRow {
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 8px;
  }
  .attribution { display: none; }
  .iphoneFrame { height: min(76vh, 700px); border-radius: 54px; }
  .iphoneBezel { padding: 6px; border-radius: 50px; }
  .iphoneScreen { border-radius: 44px; }
}
`;
