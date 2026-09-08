import { useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type RefObject } from "react";
import {
  resolveGlassTint,
  type GlassTintName,
  type LensParams,
  type LiquidGlassControllerStats,
  type LiquidGlassEngineMode,
  type ResolvedLensParams,
} from "liquid-glass";

import {
  CONTROL_GROUPS,
  CONTROL_LIMITS,
  LENS_STAGE_PRESETS,
  TINT_NAMES,
  VISIBILITY_OPTIONS,
  type ComponentVisibility,
  type CustomTint,
  type LensStagePresetId,
  type PreviewBackground,
  type TintMode,
  type VisibilityKey,
} from "../playgroundConfig";
import { formatLensPresetTs, formatValue, lensEquals } from "../playgroundUtils";
import {
  buildDebugReport,
  captureManualIncident,
  captureScreenCheck,
  getDebugIncidentCount,
  subscribeDebugIncidents,
} from "../debugTrap";
import type { GlassPressHighlight } from "@liquid-glass/design-system";

interface FloatingControlsProps {
  blend: number;
  controlsOpen: boolean;
  controlsPanelOpensUp: boolean;
  dropdownGap: number;
  dualLens: boolean;
  engineMode: LiquidGlassEngineMode;
  floatingControlsRef: RefObject<HTMLDivElement | null>;
  isControlsDragging: boolean;
  lens: ResolvedLensParams;
  onBlendChange: (value: number) => void;
  onControlsOpenChange: (value: boolean) => void;
  onCustomTintChange: (key: keyof CustomTint, value: string | number) => void;
  onDropdownGapChange: (value: number) => void;
  onDualLensChange: (value: boolean) => void;
  onEngineModeChange: (value: LiquidGlassEngineMode) => void;
  onLensChange: (key: keyof LensParams, value: number) => void;
  onLensPresetSelect: (id: LensStagePresetId) => void;
  onPressHighlightChange: (value: GlassPressHighlight) => void;
  onTintModeChange: (value: TintMode) => void;
  onTintNameChange: (value: GlassTintName) => void;
  adaptiveQuality: boolean;
  onAdaptiveQualityChange: (value: boolean) => void;
  onPreviewActiveChange: (value: boolean) => void;
  onSourceZoomChange: (value: number) => void;
  sourceZoom: number;
  onPreviewBackgroundChange: (value: PreviewBackground) => void;
  onVisibilityChange: (key: VisibilityKey, value: boolean) => void;
  pressHighlight: GlassPressHighlight;
  previewActive: boolean;
  previewBackground: PreviewBackground;
  stats: LiquidGlassControllerStats | null;
  tintMode: TintMode;
  tintName: GlassTintName;
  customTint: CustomTint;
  visibility: ComponentVisibility;
  onControlsDragStart: (event: PointerEvent<HTMLElement>) => void;
}

export function FloatingControls({
  adaptiveQuality,
  blend,
  controlsOpen,
  controlsPanelOpensUp,
  customTint,
  dropdownGap,
  dualLens,
  engineMode,
  floatingControlsRef,
  isControlsDragging,
  lens,
  onBlendChange,
  onControlsDragStart,
  onControlsOpenChange,
  onCustomTintChange,
  onDropdownGapChange,
  onDualLensChange,
  onEngineModeChange,
  onLensChange,
  onAdaptiveQualityChange,
  onLensPresetSelect,
  onPressHighlightChange,
  onPreviewActiveChange,
  onPreviewBackgroundChange,
  onSourceZoomChange,
  sourceZoom,
  onTintModeChange,
  onTintNameChange,
  onVisibilityChange,
  pressHighlight,
  previewActive,
  previewBackground,
  stats,
  tintMode,
  tintName,
  visibility,
}: FloatingControlsProps) {
  return (
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
          onPointerDown={onControlsDragStart}
          title="Drag controls"
          type="button"
        >
          <span className="gripDots" aria-hidden="true" />
        </button>
        <button
          aria-expanded={controlsOpen}
          aria-label={controlsOpen ? "Collapse controls" : "Open controls"}
          className="iconButton"
          onClick={() => onControlsOpenChange(!controlsOpen)}
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
            <GlobalSection
              adaptiveQuality={adaptiveQuality}
              onAdaptiveQualityChange={onAdaptiveQualityChange}
              onSourceZoomChange={onSourceZoomChange}
              sourceZoom={sourceZoom}
              engineMode={engineMode}
              onEngineModeChange={onEngineModeChange}
              onPressHighlightChange={onPressHighlightChange}
              onPreviewActiveChange={onPreviewActiveChange}
              onPreviewBackgroundChange={onPreviewBackgroundChange}
              pressHighlight={pressHighlight}
              previewActive={previewActive}
              previewBackground={previewBackground}
              stats={stats}
            />
            <VisibilitySection
              blend={blend}
              dropdownGap={dropdownGap}
              dualLens={dualLens}
              onBlendChange={onBlendChange}
              onDropdownGapChange={onDropdownGapChange}
              onDualLensChange={onDualLensChange}
              onVisibilityChange={onVisibilityChange}
              visibility={visibility}
            />
            <TintSection
              customTint={customTint}
              onCustomTintChange={onCustomTintChange}
              onTintModeChange={onTintModeChange}
              onTintNameChange={onTintNameChange}
              tintMode={tintMode}
              tintName={tintName}
            />
            <LensSection
              groupIndex={0}
              lens={lens}
              onLensChange={onLensChange}
              onPresetSelect={onLensPresetSelect}
              open
              title="Lens"
            />
            <LensSection groupIndex={1} lens={lens} onLensChange={onLensChange} title="Optics" />
            <LensSection groupIndex={2} lens={lens} onLensChange={onLensChange} title="Light" />
            <StatsSection stats={stats} />
          </div>
        </aside>
      )}
    </div>
  );
}

/** Session-wide settings: engine, preview state/surface, press highlight. */
function GlobalSection({
  adaptiveQuality,
  onAdaptiveQualityChange,
  onSourceZoomChange,
  sourceZoom,
  engineMode,
  onEngineModeChange,
  onPressHighlightChange,
  onPreviewActiveChange,
  onPreviewBackgroundChange,
  pressHighlight,
  previewActive,
  previewBackground,
  stats,
}: Pick<
  FloatingControlsProps,
  | "adaptiveQuality"
  | "onAdaptiveQualityChange"
  | "onSourceZoomChange"
  | "sourceZoom"
  | "engineMode"
  | "onEngineModeChange"
  | "onPressHighlightChange"
  | "onPreviewActiveChange"
  | "onPreviewBackgroundChange"
  | "pressHighlight"
  | "previewActive"
  | "previewBackground"
  | "stats"
>) {
  return (
    <details className="accordionSection" open>
      <summary>
        <span>Global</span>
        <b>{stats ? `${stats.activeEngine} / ${stats.activeRenderer}` : "ts / svg"}</b>
      </summary>
      <div className="accordionBody">
        <label>
          <span>
            engine
            <b>{engineMode}</b>
          </span>
        </label>
        <div className="segments">
          {(["auto", "wasm", "ts"] as const).map((mode) => (
            <button
              key={mode}
              className={engineMode === mode ? "active" : ""}
              onClick={() => onEngineModeChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <label>
          <span>
            adaptive quality
            <b>{adaptiveQuality ? "on" : "off (pinned full)"}</b>
          </span>
        </label>
        <div className="segments tintMode">
          {(["off", "on"] as const).map((mode) => (
            <button
              key={mode}
              className={(adaptiveQuality ? "on" : "off") === mode ? "active" : ""}
              onClick={() => onAdaptiveQualityChange(mode === "on")}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <label>
          <span>
            state
            <b>{previewActive ? "active" : "rest"}</b>
          </span>
        </label>
        <div className="segments tintMode">
          {(["active", "rest"] as const).map((mode) => (
            <button
              key={mode}
              className={(previewActive ? "active" : "rest") === mode ? "active" : ""}
              onClick={() => onPreviewActiveChange(mode === "active")}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <label>
          <span>
            source zoom
            <b>{sourceZoom.toFixed(2)}</b>
          </span>
          <input
            min={0.4}
            max={1}
            step={0.01}
            type="range"
            value={sourceZoom}
            onChange={(event) => onSourceZoomChange(Number(event.target.value))}
          />
        </label>
        <label>
          <span>
            preview bg
            <b>{previewBackground}</b>
          </span>
        </label>
        <div className="segments tintMode">
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              className={previewBackground === mode ? "active" : ""}
              onClick={() => onPreviewBackgroundChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
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
              onClick={() => onPressHighlightChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
        <DebugIncidents />
      </div>
    </details>
  );
}

/**
 * Black-glass incident badge: shows when a JS error / unhandled rejection /
 * WebGL context loss was trapped, with a one-click report (incidents + the
 * last 30 lens states) to paste when reporting the bug.
 */
function DebugIncidents() {
  const count = useSyncExternalStore(subscribeDebugIncidents, getDebugIncidentCount, () => 0);
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <>
      <label>
        <span>
          incidents
          <b style={count > 0 ? { color: "#ef4444" } : undefined}>
            {count > 0 ? `${count} trapped` : "none"}
          </b>
        </span>
      </label>
      <div className="segments tintMode">
        {/* Always available: captures the moment manually (with a GPU probe
            check) even when the breakage raised no event. */}
        <button
          onClick={() => {
            // Screen check first (Chrome asks to share the tab: pick "This
            // Tab"); falls back to the plain report if denied.
            void captureScreenCheck().then(copy);
          }}
          type="button"
        >
          {copied ? "Copied" : "Report bug now"}
        </button>
        <button onClick={() => copy(captureManualIncident())} type="button">
          plain
        </button>
        {count > 0 && (
          <button onClick={() => copy(buildDebugReport())} type="button">
            Copy report
          </button>
        )}
      </div>
    </>
  );
}

function VisibilitySection({
  blend,
  dropdownGap,
  dualLens,
  onBlendChange,
  onDropdownGapChange,
  onDualLensChange,
  onVisibilityChange,
  visibility,
}: Pick<
  FloatingControlsProps,
  | "blend"
  | "dropdownGap"
  | "dualLens"
  | "onBlendChange"
  | "onDropdownGapChange"
  | "onDualLensChange"
  | "onVisibilityChange"
  | "visibility"
>) {
  return (
    <details className="accordionSection" open>
      <summary>
        <span>Visible</span>
        <b>{VISIBILITY_OPTIONS.filter(({ key }) => visibility[key]).length} on</b>
      </summary>
      <div className="accordionBody">
        <div className="visibilityGrid">
          {VISIBILITY_OPTIONS.map(({ key, label }) => (
            <div key={key}>
              <label className="visibilityToggle">
                <span>{label}</span>
                <input
                  checked={visibility[key]}
                  onChange={(event) => onVisibilityChange(key, event.target.checked)}
                  type="checkbox"
                />
              </label>
              {key === "glass" && visibility.glass && (
                <div className="visibilitySubOptions">
                  <div className="segments tintMode">
                    {(["single", "dual"] as const).map((mode) => (
                      <button
                        key={mode}
                        className={(dualLens ? "dual" : "single") === mode ? "active" : ""}
                        onClick={() => onDualLensChange(mode === "dual")}
                        type="button"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {dualLens && <BlendSlider blend={blend} onBlendChange={onBlendChange} />}
                </div>
              )}
              {key === "dropdown" && visibility.dropdown && (
                <div className="visibilitySubOptions">
                  <BlendSlider blend={blend} onBlendChange={onBlendChange} />
                  <label>
                    <span>
                      menu inset
                      <b>{Math.round(dropdownGap)}</b>
                    </span>
                    <input
                      min={0}
                      max={60}
                      step={1}
                      type="range"
                      value={dropdownGap}
                      onChange={(event) => onDropdownGapChange(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

/**
 * Blend is one shared value with two consumers: the dual-lens stage merge and
 * the dropdown's trigger/menu merge — so it appears under both checkboxes.
 */
function BlendSlider({ blend, onBlendChange }: Pick<FloatingControlsProps, "blend" | "onBlendChange">) {
  return (
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
        onChange={(event) => onBlendChange(Number(event.target.value))}
      />
    </label>
  );
}

function TintSection({
  customTint,
  onCustomTintChange,
  onTintModeChange,
  onTintNameChange,
  tintMode,
  tintName,
}: Pick<
  FloatingControlsProps,
  "customTint" | "onCustomTintChange" | "onTintModeChange" | "onTintNameChange" | "tintMode" | "tintName"
>) {
  return (
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
              onClick={() => onTintModeChange(mode)}
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
              onChange={(event) => onCustomTintChange("color", event.target.value)}
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
              onChange={(event) => onCustomTintChange("highlightColor", event.target.value)}
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
                onChange={(event) => onCustomTintChange(key, Number(event.target.value))}
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
                  onTintModeChange("preset");
                  onTintNameChange(name);
                }}
                style={
                  {
                    "--swatch-bg": option.background,
                    "--swatch-border": option.border,
                  } as CSSProperties
                }
                title={name}
                type="button"
              />
            );
          })}
        </div>
      </div>
    </details>
  );
}

function LensSection({
  groupIndex,
  lens,
  onLensChange,
  onPresetSelect,
  open,
  title,
}: Pick<FloatingControlsProps, "lens" | "onLensChange"> & {
  groupIndex: 0 | 1 | 2;
  onPresetSelect?: (id: LensStagePresetId) => void;
  open?: boolean;
  title: string;
}) {
  const summary =
    groupIndex === 0
      ? `${Math.round(lens.width)} x ${Math.round(lens.height)}`
      : groupIndex === 1
        ? `${formatValue(lens.scaleX)} / ${formatValue(lens.chroma)}`
        : `${formatValue(lens.glow)} / ${formatValue(lens.edge)}`;

  return (
    <details className="accordionSection" open={open}>
      <summary>
        <span>{title}</span>
        <b>{summary}</b>
      </summary>
      <div className="accordionBody">
        {onPresetSelect && (
          <div className="segments tintMode">
            {LENS_STAGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={lensEquals(lens, preset.lens) ? "active" : ""}
                onClick={() => onPresetSelect(preset.id)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        {onPresetSelect && <CopyPresetButton lens={lens} />}
        <div className="group">
          {CONTROL_GROUPS[groupIndex].map((key) => {
            const limits = CONTROL_LIMITS[key];
            const taper = limits.taper;
            // Tapered sliders travel in normalized t and map through t^taper,
            // concentrating physical travel on the sensitive low end.
            const range = limits.max - limits.min;
            const sliderValue = taper
              ? Math.pow(Math.min(1, Math.max(0, (lens[key] - limits.min) / range)), 1 / taper)
              : lens[key];
            const handleChange = (raw: number) => {
              if (!taper) {
                onLensChange(key, raw);
                return;
              }
              const mapped = limits.min + range * Math.pow(raw, taper);
              onLensChange(key, Math.round(mapped / limits.step) * limits.step);
            };
            return (
              <label key={key}>
                <span>
                  {key}
                  <b>{formatValue(lens[key])}</b>
                </span>
                <input
                  min={taper ? 0 : limits.min}
                  max={taper ? 1 : limits.max}
                  step={taper ? 0.001 : limits.step}
                  type="range"
                  value={sliderValue}
                  onChange={(event) => handleChange(Number(event.target.value))}
                />
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function CopyPresetButton({ lens }: { lens: ResolvedLensParams }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="segments tintMode">
      <button
        onClick={() => {
          void navigator.clipboard.writeText(formatLensPresetTs(lens)).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        type="button"
      >
        {copied ? "Copied" : "Copy preset"}
      </button>
    </div>
  );
}

function StatsSection({ stats }: Pick<FloatingControlsProps, "stats">) {
  return (
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
  );
}
