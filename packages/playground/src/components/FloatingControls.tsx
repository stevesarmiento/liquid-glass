import { type CSSProperties, type PointerEvent, type RefObject } from "react";
import { resolveGlassTint, type GlassTintName, type LensParams, type LiquidGlassControllerStats, type LiquidGlassEngineMode, type ResolvedLensParams } from "liquid-glass";

import {
  CONTROL_GROUPS,
  CONTROL_LIMITS,
  TINT_NAMES,
  VISIBILITY_OPTIONS,
  type ComponentVisibility,
  type CustomTint,
  type TintMode,
  type VisibilityKey,
} from "../playgroundConfig";
import { formatValue } from "../playgroundUtils";
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
  onPressHighlightChange: (value: GlassPressHighlight) => void;
  onTintModeChange: (value: TintMode) => void;
  onTintNameChange: (value: GlassTintName) => void;
  onVisibilityChange: (key: VisibilityKey, value: boolean) => void;
  pressHighlight: GlassPressHighlight;
  stats: LiquidGlassControllerStats | null;
  tintMode: TintMode;
  tintName: GlassTintName;
  customTint: CustomTint;
  visibility: ComponentVisibility;
  onControlsDragStart: (event: PointerEvent<HTMLElement>) => void;
}

export function FloatingControls({
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
  onPressHighlightChange,
  onTintModeChange,
  onTintNameChange,
  onVisibilityChange,
  pressHighlight,
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
            <RendererSection engineMode={engineMode} onEngineModeChange={onEngineModeChange} stats={stats} />
            <VisibilitySection
              onPressHighlightChange={onPressHighlightChange}
              onVisibilityChange={onVisibilityChange}
              pressHighlight={pressHighlight}
              visibility={visibility}
            />
            <LensesSection
              blend={blend}
              dropdownGap={dropdownGap}
              dualLens={dualLens}
              onBlendChange={onBlendChange}
              onDropdownGapChange={onDropdownGapChange}
              onDualLensChange={onDualLensChange}
              showDropdownGap={visibility.dropdown}
            />
            <TintSection
              customTint={customTint}
              onCustomTintChange={onCustomTintChange}
              onTintModeChange={onTintModeChange}
              onTintNameChange={onTintNameChange}
              tintMode={tintMode}
              tintName={tintName}
            />
            <LensSection groupIndex={0} lens={lens} onLensChange={onLensChange} open title="Lens" />
            <LensSection groupIndex={1} lens={lens} onLensChange={onLensChange} title="Optics" />
            <LensSection groupIndex={2} lens={lens} onLensChange={onLensChange} title="Light" />
            <StatsSection stats={stats} />
          </div>
        </aside>
      )}
    </div>
  );
}

function RendererSection({
  engineMode,
  onEngineModeChange,
  stats,
}: Pick<FloatingControlsProps, "engineMode" | "onEngineModeChange" | "stats">) {
  return (
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
              onClick={() => onEngineModeChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

function VisibilitySection({
  onPressHighlightChange,
  onVisibilityChange,
  pressHighlight,
  visibility,
}: Pick<FloatingControlsProps, "onPressHighlightChange" | "onVisibilityChange" | "pressHighlight" | "visibility">) {
  return (
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
                onChange={(event) => onVisibilityChange(key, event.target.checked)}
                type="checkbox"
              />
            </label>
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
      </div>
    </details>
  );
}

function LensesSection({
  blend,
  dropdownGap,
  dualLens,
  onBlendChange,
  onDropdownGapChange,
  onDualLensChange,
  showDropdownGap,
}: Pick<FloatingControlsProps, "blend" | "dropdownGap" | "dualLens" | "onBlendChange" | "onDropdownGapChange" | "onDualLensChange"> & {
  showDropdownGap: boolean;
}) {
  return (
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
              onClick={() => onDualLensChange(mode === "dual")}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
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
        {showDropdownGap && (
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
        )}
      </div>
    </details>
  );
}

function TintSection({
  customTint,
  onCustomTintChange,
  onTintModeChange,
  onTintNameChange,
  tintMode,
  tintName,
}: Pick<FloatingControlsProps, "customTint" | "onCustomTintChange" | "onTintModeChange" | "onTintNameChange" | "tintMode" | "tintName">) {
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
                style={{
                  "--swatch-bg": option.background,
                  "--swatch-border": option.border,
                } as CSSProperties}
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
  open,
  title,
}: Pick<FloatingControlsProps, "lens" | "onLensChange"> & {
  groupIndex: 0 | 1 | 2;
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
        <div className="group">
          {CONTROL_GROUPS[groupIndex].map((key) => {
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
                  onChange={(event) => onLensChange(key, Number(event.target.value))}
                />
              </label>
            );
          })}
        </div>
      </div>
    </details>
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
