import { memo, type ComponentProps, type RefObject, useMemo } from "react";
import {
  GlassButton,
  GlassDropdown,
  GlassSlider,
  GlassSwitch,
  type GlassComponentSize,
  type GlassPressHighlight,
} from "@liquid-glass/design-system";
import type { LensParams, LiquidGlassEngineMode, LiquidGlassRenderer, ResolvedLensParams } from "liquid-glass";

import {
  DROPDOWN_PREVIEW_ITEMS,
  SWITCH_PREVIEW_SIZES,
  type ComponentVisibility,
  type PreviewBackground,
} from "../playgroundConfig";
import { forwardLensOptics } from "../playgroundUtils";

interface ComponentDockProps {
  backgroundUrl: string;
  blend: number;
  containerRef: RefObject<HTMLDivElement | null>;
  dropdownGap: number;
  engineMode: LiquidGlassEngineMode;
  glassTint: ComponentProps<typeof GlassSlider>["glassTint"];
  lens: ResolvedLensParams;
  onModalOpen: () => void;
  onSliderValueChange: (value: number) => void;
  pressHighlight: GlassPressHighlight;
  /** Global held-active state for component previews (sidebar Global section). */
  previewActive: boolean;
  previewBackground: PreviewBackground;
  renderer: LiquidGlassRenderer;
  sliderValue: number;
  /** Global source zoom for previews (Global section; 1 = off). */
  sourceZoom: number;
  switchLensOverrideEnabled: boolean;
  visibility: ComponentVisibility;
}

type SwitchPreviewStackProps = Pick<
  ComponentProps<typeof GlassSwitch>,
  "engineMode" | "glassLens" | "glassSurfaceBlur" | "glassTint" | "renderer"
>;

export const ComponentDock = memo(function ComponentDock({
  backgroundUrl,
  blend,
  containerRef,
  dropdownGap,
  engineMode,
  glassTint,
  lens,
  onModalOpen,
  onSliderValueChange,
  pressHighlight,
  previewActive,
  previewBackground,
  renderer,
  sliderValue,
  sourceZoom,
  switchLensOverrideEnabled,
  visibility,
}: ComponentDockProps) {
  const visiblePreviewCount =
    Number(visibility.slider) +
    Number(visibility.switch) +
    Number(visibility.button) +
    Number(visibility.dropdown) +
    Number(visibility.modal);
  // Mirrors switchLens: per-tier preset geometry AND optics until the user
  // touches a stage slider — then stage optics forward (preset geometry
  // stays per tier so sm..xl remain distinguishable).
  const sliderLens = useMemo<Partial<LensParams> | undefined>(
    () =>
      switchLensOverrideEnabled
        ? forwardLensOptics(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 })
        : undefined,
    [lens, switchLensOverrideEnabled],
  );
  const switchLens = useMemo<Partial<LensParams> | undefined>(
    () =>
      switchLensOverrideEnabled
        ? forwardLensOptics(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 })
        : undefined,
    [lens, switchLensOverrideEnabled],
  );
  const buttonLens = useMemo<Partial<LensParams>>(
    () => forwardLensOptics(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 }),
    [lens],
  );
  const dropdownLens = useMemo<Partial<LensParams>>(
    () => forwardLensOptics(lens, { depth: 16, dome: 60, blur: 3, mapSize: 256 }),
    [lens],
  );

  if (visiblePreviewCount === 0) return null;

  // Dark previews remount their components (key) so canvas-path backdrop
  // color sampling re-runs against the new panel color.
  const previewClass = previewBackground === "dark" ? "componentPreview previewDark" : "componentPreview";

  return (
    <div
      className="componentDock"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      {visibility.slider && (
        <div className={`sliderPreview ${previewClass}`} key={`slider-${previewBackground}`}>
          {SWITCH_PREVIEW_SIZES.map((size) => (
            <div className="sliderPreviewRow" key={size}>
              <span>{size}</span>
              <GlassSlider
                active={previewActive}
                defaultValue={sliderValue}
                glassSourceZoom={sourceZoom}
                engineMode={engineMode}
                glassLens={sliderLens}
                glassSurfaceBlur={0}
                glassTint={glassTint}
                max={100}
                min={0}
                renderer={renderer}
                size={size}
                sliderWidth="100%"
              />
            </div>
          ))}
        </div>
      )}
      {visibility.switch && (
        <SwitchPreviewStack
          active={previewActive}
          className={previewClass}
          key={`switch-${previewBackground}`}
          engineMode={engineMode}
          sourceZoom={sourceZoom}
          glassLens={switchLens}
          glassSurfaceBlur={0}
          glassTint={glassTint}
          renderer={renderer}
        />
      )}
      {visibility.button && (
        <div className="buttonPreview">
          {SWITCH_PREVIEW_SIZES.map((buttonSize) => (
            <GlassButton
              engineMode={engineMode}
              glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
              glassLens={buttonLens}
              glassSurfaceBlur={0}
              glassTint={glassTint}
              key={buttonSize}
              pressHighlight={pressHighlight}
              renderer={renderer}
              size={buttonSize}
            >
              Liquid
            </GlassButton>
          ))}
        </div>
      )}
      {visibility.dropdown && (
        <div className="dropdownPreview">
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
        <div className="modalPreview">
          <GlassButton
            engineMode={engineMode}
            glassBackdrop={{ image: backgroundUrl, anchor: containerRef }}
            glassSurfaceBlur={0}
            glassTint={glassTint}
            onClick={onModalOpen}
            pressHighlight={pressHighlight}
            renderer={renderer}
            size="md"
          >
            Modal
          </GlassButton>
        </div>
      )}
    </div>
  );
});

/** Held-active state and source zoom both come from the Global section. */
function SwitchPreviewStack({
  active,
  className,
  sourceZoom,
  ...props
}: SwitchPreviewStackProps & { active: boolean; className: string; sourceZoom: number }) {
  return (
    <div className={`switchPreview ${className}`} aria-label="Switch size previews">
      {SWITCH_PREVIEW_SIZES.map((size: GlassComponentSize) => (
        <div className="switchPreviewRow" key={size}>
          <span>{size}</span>
          <GlassSwitch
            active={active}
            defaultChecked
            glassSourceZoom={sourceZoom}
            size={size}
            {...props}
          />
        </div>
      ))}
    </div>
  );
}

