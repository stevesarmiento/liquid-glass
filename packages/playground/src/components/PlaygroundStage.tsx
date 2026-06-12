import { memo, type CSSProperties, type PointerEvent, type RefObject } from "react";
import type { GlassTint, GlassTintInput, GlassTintName, LiquidGlassEngineMode, LiquidGlassRenderer, ResolvedLensParams } from "liquid-glass";
import type { GlassPressHighlight } from "@liquid-glass/design-system";

import { ComponentDock } from "./ComponentDock";
import { DynamicIslandDemo } from "./DynamicIslandDemo";
import { LockScreenKeypad } from "./LockScreenKeypad";
import { PAINTING_URL, type ComponentVisibility, type IphoneScreen, type IslandDemo, type StageMode } from "../playgroundConfig";
import { formatHighlightPosition, formatHighlightRotation, safeHasPointerCapture, safeSetPointerCapture } from "../playgroundUtils";

interface PlaygroundStageProps {
  backgroundUrl: string;
  blend: number;
  containerRef: RefObject<HTMLDivElement | null>;
  dropdownGap: number;
  dualLens: boolean;
  engineMode: LiquidGlassEngineMode;
  glassChromeRef: RefObject<HTMLDivElement | null>;
  glassChromeSecondRef: RefObject<HTMLDivElement | null>;
  glassTint: GlassTintName | GlassTintInput;
  iphoneScreen: IphoneScreen;
  islandDemo: IslandDemo;
  islandExpanded: boolean;
  lens: ResolvedLensParams;
  onIslandCycle: () => void;
  onLensPointer: (event: PointerEvent<HTMLElement>, isDown?: boolean) => void;
  onLensPositionCommit: () => void;
  onModalOpen: () => void;
  onSliderValueChange: (value: number) => void;
  position: { x: number; y: number };
  positions: Array<{ x: number; y: number }>;
  pressHighlight: GlassPressHighlight;
  renderer: LiquidGlassRenderer;
  sliderValue: number;
  sourceRef: RefObject<HTMLDivElement | null>;
  stageMode: StageMode;
  switchLensOverrideEnabled: boolean;
  targetRef: RefObject<HTMLDivElement | null>;
  tint: GlassTint;
  visibility: ComponentVisibility;
}

export const PlaygroundStage = memo(function PlaygroundStage({
  backgroundUrl,
  blend,
  containerRef,
  dropdownGap,
  dualLens,
  engineMode,
  glassChromeRef,
  glassChromeSecondRef,
  glassTint,
  iphoneScreen,
  islandDemo,
  islandExpanded,
  lens,
  onIslandCycle,
  onLensPointer,
  onLensPositionCommit,
  onModalOpen,
  onSliderValueChange,
  position,
  positions,
  pressHighlight,
  renderer,
  sliderValue,
  sourceRef,
  stageMode,
  switchLensOverrideEnabled,
  targetRef,
  tint,
  visibility,
}: PlaygroundStageProps) {
  const lensStage = (
    <div
      ref={containerRef}
      className={stageMode === "iphone" ? "lensSurface iphoneScreen" : "lensSurface lensSurfaceFull"}
      onPointerDown={(event) => {
        safeSetPointerCapture(event.currentTarget, event.pointerId);
        onLensPointer(event, true);
      }}
      onPointerMove={(event) => {
        if (safeHasPointerCapture(event.currentTarget, event.pointerId)) onLensPointer(event);
      }}
      onPointerUp={onLensPositionCommit}
      onPointerCancel={onLensPositionCommit}
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
      {(visibility.glass && !dualLens ? [0] : []).map((index) => {
        const chromePosition = dualLens ? positions[index] : position;
        return (
          <div
            key={index}
            ref={index === 0 ? glassChromeRef : glassChromeSecondRef}
            className="glassChrome"
            style={
              {
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
                left: `${chromePosition.x * 100}%`,
                top: `${chromePosition.y * 100}%`,
                width: lens.width,
                height: lens.height,
                borderRadius: lens.radius,
                transform: "translate3d(-50%, -50%, 0)",
                WebkitBackdropFilter: `blur(0px) saturate(${tint.saturation})`,
                backdropFilter: `blur(0px) saturate(${tint.saturation})`,
              } as CSSProperties
            }
          />
        );
      })}
      <ComponentDock
        backgroundUrl={backgroundUrl}
        blend={blend}
        containerRef={containerRef}
        dropdownGap={dropdownGap}
        engineMode={engineMode}
        glassTint={glassTint}
        lens={lens}
        onModalOpen={onModalOpen}
        onSliderValueChange={onSliderValueChange}
        pressHighlight={pressHighlight}
        renderer={renderer}
        sliderValue={sliderValue}
        switchLensOverrideEnabled={switchLensOverrideEnabled}
        visibility={visibility}
      />
      {stageMode === "iphone" && (
        <>
          <DynamicIslandDemo
            backgroundUrl={backgroundUrl}
            containerRef={containerRef}
            engineMode={engineMode}
            glassTint={glassTint}
            islandDemo={islandDemo}
            islandExpanded={islandExpanded}
            lens={lens}
            onCycle={onIslandCycle}
            renderer={renderer}
          />
          {iphoneScreen === "passcode" && (
            <LockScreenKeypad
              backgroundUrl={backgroundUrl}
              containerRef={containerRef}
              engineMode={engineMode}
              glassTint={glassTint}
              lens={lens}
              pressHighlight={pressHighlight}
              renderer={renderer}
            />
          )}
          <div className="homeIndicator" aria-hidden="true" />
        </>
      )}
    </div>
  );

  return (
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
  );
});
