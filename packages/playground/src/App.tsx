import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_LENS_PARAMS,
  createLiquidGlassController,
  createLiquidGlassEngine,
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

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);
  const [lens, setLens] = useState<LensParams>(INITIAL_LENS);
  const [position, setPosition] = useState({ x: 0.61, y: 0.36 });
  const [engineMode, setEngineMode] = useState<LiquidGlassEngineMode>("auto");
  const renderMode: LiquidGlassRenderMode = "target";
  const [stats, setStats] = useState<LiquidGlassControllerStats | null>(null);
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);

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

  function updateLens(key: keyof LensParams, value: number) {
    setLens((current) => ({
      ...current,
      [key]: key === "mapSize" ? Math.round(value) : value,
    }));
  }

  function handlePointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  }

  const targetClipPath = `inset(calc(${position.y * 100}% - ${lens.height / 2}px) calc(${100 - position.x * 100}% - ${lens.width / 2}px) calc(${100 - position.y * 100}% - ${lens.height / 2}px) calc(${position.x * 100}% - ${lens.width / 2}px) round ${lens.radius}px)`;

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
            left: `${position.x * 100}%`,
            top: `${position.y * 100}%`,
            width: lens.width,
            height: lens.height,
            borderRadius: lens.radius,
            transform: "translate3d(-50%, -50%, 0)",
            WebkitBackdropFilter: `blur(${lens.blur}px)`,
            backdropFilter: `blur(${lens.blur}px)`,
          }}
        />
        <div className="attribution">Giovanni Battista Tiepolo, Rinaldo and Armida in Her Garden</div>
      </section>

      <aside className="controls">
        <div className="topline">
          <strong>Liquid Glass</strong>
          <span>{stats ? `${stats.activeEngine} / ${stats.activeRenderer}` : "ts / svg"}</span>
        </div>

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

        {CONTROL_GROUPS.map((group) => (
          <div className="group" key={group.join("-")}>
            {group.map((key) => {
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
        ))}

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
      </aside>
    </main>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getInitialRenderer(): LiquidGlassRenderer {
  if (typeof window === "undefined") return "auto";
  return new URLSearchParams(window.location.search).get("renderer") === "canvas" ? "canvas" : "auto";
}

const styles = `
* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f5efe5;
  background: #15120e;
}
button, input { font: inherit; }
.shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 0;
  min-height: 100vh;
}
.stage {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
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
  z-index: 4;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow:
    0 18px 48px rgba(0,0,0,0.28),
    inset 0 1px rgba(255,255,255,0.58);
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
.controls {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  background: #f3f0e8;
  color: #15191b;
  border-left: 1px solid rgba(0,0,0,0.12);
  overflow: auto;
}
.topline, .stats div, label span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.topline strong { font-size: 18px; }
.topline span {
  padding: 4px 8px;
  border: 1px solid rgba(0,0,0,0.14);
  font-size: 12px;
}
.segments {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid rgba(0,0,0,0.16);
}
.segments button {
  height: 34px;
  border: 0;
  border-right: 1px solid rgba(0,0,0,0.12);
  background: transparent;
  color: #15191b;
  cursor: pointer;
}
.segments button:last-child { border-right: 0; }
.segments button.active { background: #15191b; color: #f3f0e8; }
.group {
  display: grid;
  gap: 14px;
  padding: 16px 0;
  border-top: 1px solid rgba(0,0,0,0.12);
}
label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
label b {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
input[type="range"] {
  width: 100%;
  accent-color: #1e6f68;
}
.stats {
  display: grid;
  gap: 8px;
  margin: auto 0 0;
  padding-top: 16px;
  border-top: 1px solid rgba(0,0,0,0.12);
}
.stats div { min-height: 26px; }
.stats dt {
  color: rgba(21,25,27,0.62);
}
.stats dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 880px) {
  .shell { grid-template-columns: 1fr; }
  .stage { min-height: 60vh; }
  .controls { border-left: 0; border-top: 1px solid rgba(0,0,0,0.12); }
  .attribution { display: none; }
}
`;
