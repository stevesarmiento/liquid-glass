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
} from "../playgroundConfig";

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
  renderer: LiquidGlassRenderer;
  sliderValue: number;
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
  renderer,
  sliderValue,
  switchLensOverrideEnabled,
  visibility,
}: ComponentDockProps) {
  const visiblePreviewCount =
    Number(visibility.slider) +
    Number(visibility.switch) +
    Number(visibility.button) +
    Number(visibility.dropdown) +
    Number(visibility.modal);
  const sliderLens = useMemo(
    () => ({
      width: 63,
      height: 34,
      radius: 80,
      ...smallControlLens(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 }),
    }),
    [lens],
  );
  const switchLens = useMemo<Partial<LensParams>>(
    () => smallControlLens(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 }),
    [lens],
  );
  const buttonLens = useMemo<Partial<LensParams>>(
    () => smallControlLens(lens, { depth: 12, dome: 80, blur: 3, mapSize: 384 }),
    [lens],
  );
  const dropdownLens = useMemo<Partial<LensParams>>(
    () => dropdownControlLens(lens),
    [lens],
  );

  if (visiblePreviewCount === 0) return null;

  return (
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
            onValueChange={onSliderValueChange}
            renderer={renderer}
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
        <div className="modalPreview componentPreview">
          <button className="modalPreviewButton" onClick={onModalOpen} type="button">
            Modal
          </button>
        </div>
      )}
    </div>
  );
});

function SwitchPreviewStack(props: SwitchPreviewStackProps) {
  return (
    <div className="switchPreview componentPreview" aria-label="Switch size previews">
      {SWITCH_PREVIEW_SIZES.map((size: GlassComponentSize) => (
        <div className="switchPreviewRow" key={size}>
          <span>{size}</span>
          <GlassSwitch active defaultChecked size={size} {...props} />
        </div>
      ))}
    </div>
  );
}

function smallControlLens(
  lens: ResolvedLensParams,
  caps: { depth: number; dome: number; blur: number; mapSize: number },
): Partial<LensParams> {
  return {
    scaleX: lens.scaleX,
    scaleY: lens.scaleY,
    chroma: lens.chroma,
    depth: Math.min(lens.depth, caps.depth),
    dome: Math.min(lens.dome, caps.dome),
    splay: lens.splay,
    glow: lens.glow,
    edge: lens.edge,
    glowSpread: lens.glowSpread,
    glowExponent: lens.glowExponent,
    edgeExponent: lens.edgeExponent,
    specularRotation: lens.specularRotation,
    blur: Math.min(lens.blur, caps.blur),
    mapSize: Math.min(lens.mapSize, caps.mapSize),
  };
}

function dropdownControlLens(lens: ResolvedLensParams): Partial<LensParams> {
  return {
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
    mapSize: Math.min(lens.mapSize, 256),
  };
}
