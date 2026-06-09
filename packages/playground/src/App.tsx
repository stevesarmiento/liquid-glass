import { type ComponentProps, type PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GlassModal, GlassSlider, GlassSwitch, type GlassComponentSize } from "@liquid-glass/design-system";

import {
  DEFAULT_LENS_PARAMS,
  GLASS_TINTS,
  createGlassTint,
  createLiquidGlassController,
  createLiquidGlassEngine,
  resolveGlassTint,
  type GlassTintInput,
  type GlassTintName,
  type LensParams,
  type LiquidGlassController,
  type LiquidGlassControllerStats,
  type LiquidGlassEngineMode,
  type LiquidGlassRenderer,
  type LiquidGlassRenderMode,
} from "liquid-glass";

const CONTROL_GROUPS: Array<Array<keyof LensParams>> = [
  ["width", "height", "radius", "mapSize"],
  ["scaleX", "scaleY", "chroma", "blur"],
  ["depth", "dome", "splay", "glow", "edge"],
];

const CONTROL_LIMITS: Record<keyof LensParams, { min: number; max: number; step: number }> = {
  width: { min: 72, max: 420, step: 1 },
  height: { min: 48, max: 300, step: 1 },
  radius: { min: 0, max: 180, step: 1 },
  scaleX: { min: 0, max: 60, step: 0.5 },
  scaleY: { min: 0, max: 60, step: 0.5 },
  chroma: { min: 0, max: 2, step: 0.01 },
  depth: { min: 0, max: 80, step: 0.5 },
  dome: { min: 0, max: 220, step: 1 },
  splay: { min: 0.001, max: 1, step: 0.001 },
  glow: { min: 0, max: 2, step: 0.01 },
  edge: { min: 0, max: 2, step: 0.01 },
  blur: { min: 0, max: 12, step: 0.1 },
  mapSize: { min: 32, max: 512, step: 32 },
};

const PAINTING_URL = "/images/rinaldo-armida.jpg";
const INITIAL_LENS: LensParams = {
  ...DEFAULT_LENS_PARAMS,
  width: 330,
  height: 184,
  radius: 46,
  scaleX: 28,
  scaleY: 22,
  chroma: 0.5,
  depth: 24,
  dome: 130,
  splay: 0.72,
  glow: 0.75,
  edge: 0.78,
  blur: 1.6,
  mapSize: 256,
};
const INITIAL_RENDERER = getInitialRenderer();
const TINT_NAMES = Object.keys(GLASS_TINTS) as GlassTintName[];
const INITIAL_CUSTOM_TINT: Required<Pick<GlassTintInput, "color" | "opacity" | "borderOpacity" | "highlightOpacity" | "shadowOpacity" | "saturation">> = {
  color: "#6fd7d0",
  opacity: 0.12,
  borderOpacity: 0.48,
  highlightOpacity: 0.58,
  shadowOpacity: 0.28,
  saturation: 1.18,
};

type TintMode = "preset" | "custom";
type FloatingControlsPosition = { x: number; y: number };
type FloatingControlsDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const FLOATING_CONTROLS_WIDTH = 326;
const FLOATING_CONTROLS_MARGIN = 16;
const FLOATING_CONTROLS_BAR_HEIGHT = 44;
const SWITCH_PREVIEW_SIZES: GlassComponentSize[] = ["sm", "md", "lg", "xl"];
type SwitchPreviewStackProps = Pick<
  ComponentProps<typeof GlassSwitch>,
  "engineMode" | "glassLens" | "glassSurfaceBlur" | "glassTint" | "renderer"
>;

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const floatingControlsRef = useRef<HTMLDivElement | null>(null);
  const controlsPositionRef = useRef<FloatingControlsPosition>(getInitialControlsPosition());
  const pendingControlsPositionRef = useRef<FloatingControlsPosition>(controlsPositionRef.current);
  const controlsDragRef = useRef<FloatingControlsDrag | null>(null);
  const controlsDragFrameRef = useRef<number | null>(null);
  const [lens, setLens] = useState<LensParams>(INITIAL_LENS);
  const [position, setPosition] = useState({ x: 0.61, y: 0.36 });
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
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);
  const glassTint = tintMode === "preset" ? tintName : customTint;
  const tint = tintMode === "preset" ? resolveGlassTint(tintName) : createGlassTint(customTint);
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
      blur: Math.min(lens.blur, 3),
      mapSize: lens.mapSize,
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
      blur: Math.min(lens.blur, 3),
      mapSize: lens.mapSize,
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
      position: { ...position, unit: "normalized" },
      mode: renderMode,
      renderer: INITIAL_RENDERER,
      sourceImageUrl: PAINTING_URL,
      engine,
      onStats: setStats,
    });

    return () => controllerRef.current?.destroy();
  }, [engine, engineMode]);

  useEffect(() => {
    controllerRef.current?.update({
      lens,
      position: { ...position, unit: "normalized" },
      mode: renderMode,
      renderer: INITIAL_RENDERER,
      sourceImageUrl: PAINTING_URL,
    });
  }, [lens, position, renderMode]);

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
      window.removeEventListener("pointermove", handleControlsDragMove);
      window.removeEventListener("pointerup", handleControlsDragEnd);
      window.removeEventListener("pointercancel", handleControlsDragEnd);
    };
  }, []);

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

  function handlePointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
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

  const targetClipPath = `inset(calc(${position.y * 100}% - ${lens.height / 2}px) calc(${100 - position.x * 100}% - ${lens.width / 2}px) calc(${100 - position.y * 100}% - ${lens.height / 2}px) calc(${position.x * 100}% - ${lens.width / 2}px) round ${lens.radius}px)`;
  const controlsPanelOpensUp = typeof window !== "undefined" && controlsPosition.y > window.innerHeight - 420;

  return (
    <main className="shell">
      <style>{styles}</style>
      <section
        ref={containerRef}
        className="stage"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) handlePointer(event);
        }}
      >
        <div
          ref={sourceRef}
          className="paintingLayer paintingSource"
          style={{ backgroundImage: `url(${PAINTING_URL})` }}
        />
        <div
          ref={targetRef}
          className="paintingLayer glassTarget"
          style={{
            backgroundImage: `url(${PAINTING_URL})`,
            clipPath: targetClipPath,
            WebkitClipPath: targetClipPath,
          }}
        />
        <div
          className="glassChrome"
          style={{
            "--glass-tint-bg": tint.background,
            "--glass-tint-border": tint.border,
            "--glass-tint-highlight": tint.highlight,
            "--glass-tint-shadow": tint.shadow,
            left: `${position.x * 100}%`,
            top: `${position.y * 100}%`,
            width: lens.width,
            height: lens.height,
            borderRadius: lens.radius,
            transform: "translate3d(-50%, -50%, 0)",
            WebkitBackdropFilter: `blur(0px) saturate(${tint.saturation})`,
            backdropFilter: `blur(0px) saturate(${tint.saturation})`,
          } as React.CSSProperties}
        />
        <div
          className="componentDock"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
        >
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
          <SwitchPreviewStack
            engineMode={engineMode}
            glassLens={switchLensOverrideEnabled ? switchLens : undefined}
            glassSurfaceBlur={0}
            glassTint={glassTint}
            renderer={INITIAL_RENDERER}
          />
          <div className="modalPreview componentPreview">
            <button className="modalPreviewButton" onClick={() => setIsModalVisible(true)} type="button">
              Modal
            </button>
          </div>
        </div>
        <div className="attribution">Giovanni Battista Tiepolo, Rinaldo and Armida in Her Garden</div>
      </section>

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
                    {(
                      [
                        ["opacity", 0, 0.5, 0.01],
                        ["borderOpacity", 0, 1, 0.01],
                        ["highlightOpacity", 0, 1, 0.01],
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

function getInitialRenderer(): LiquidGlassRenderer {
  if (typeof window === "undefined") return "auto";
  return new URLSearchParams(window.location.search).get("renderer") === "canvas" ? "canvas" : "auto";
}

function getInitialControlsPosition(): FloatingControlsPosition {
  if (typeof window === "undefined") return { x: FLOATING_CONTROLS_MARGIN, y: FLOATING_CONTROLS_MARGIN };

  return constrainControlsPosition({
    x: window.innerWidth - FLOATING_CONTROLS_WIDTH - 20,
    y: 20,
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
.glassChrome {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 8;
  pointer-events: none;
  background:
    linear-gradient(180deg, var(--glass-tint-highlight), transparent 34%),
    var(--glass-tint-bg);
  border: 1px solid var(--glass-tint-border);
  box-shadow:
    0 18px 48px var(--glass-tint-shadow),
    inset 0 1px var(--glass-tint-highlight),
    inset 0 -1px rgba(0, 0, 0, 0.16);
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
  top: 72%;
  z-index: 6;
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(150px, 210px) 96px;
  align-items: center;
  gap: 14px;
  width: min(734px, calc(100% - 48px));
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
  min-width: 0;
}
.switchPreview {
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
.modalPreview {
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
    top: 72%;
    grid-template-columns: 1fr;
    width: min(340px, calc(100% - 32px));
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
}
`;
