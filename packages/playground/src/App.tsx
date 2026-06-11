import { useCallback, useMemo, useState } from "react";
import { type GlassPressHighlight } from "@liquid-glass/design-system";

import {
  createGlassTint,
  createLiquidGlassEngine,
  resolveGlassTint,
  type GlassTintName,
  type LensParams,
  type LiquidGlassEngineMode,
  type LiquidGlassRenderMode,
  type ResolvedLensParams,
} from "liquid-glass";
import { FloatingControls } from "./components/FloatingControls";
import { GlassPreviewModal } from "./components/GlassPreviewModal";
import { PlaygroundStage } from "./components/PlaygroundStage";
import { SceneSwitcher } from "./components/SceneSwitcher";
import { useFloatingControls } from "./hooks/useFloatingControls";
import { useGlassStageController } from "./hooks/useGlassStageController";
import { useIslandDemoCycle } from "./hooks/useIslandDemoCycle";
import {
  INITIAL_BLEND,
  INITIAL_CUSTOM_TINT,
  INITIAL_LENS,
  INITIAL_RENDERER,
  INITIAL_VISIBILITY,
  PAINTING_URL,
  WALLPAPERS,
  type ComponentVisibility,
  type StageMode,
  type TintMode,
  type VisibilityKey,
  type WallpaperId,
} from "./playgroundConfig";

export default function App() {
  const [lens, setLens] = useState<ResolvedLensParams>(INITIAL_LENS);
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
  const [visibility, setVisibility] = useState<ComponentVisibility>(INITIAL_VISIBILITY);
  const [stageMode, setStageMode] = useState<StageMode>("painting");
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [pressHighlight, setPressHighlight] = useState<GlassPressHighlight>("natural");
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
  const {
    controlsOpen,
    controlsPanelOpensUp,
    floatingControlsRef,
    handleControlsDragStart,
    isControlsDragging,
    setControlsOpen,
  } = useFloatingControls();
  const { cycleIsland, islandDemo, islandExpanded, selectIslandDemo } = useIslandDemoCycle();
  const openModal = useCallback(() => setIsModalVisible(true), []);
  const closeModal = useCallback(() => setIsModalVisible(false), []);

  const {
    commitLensPosition,
    containerRef,
    glassChromeRef,
    glassChromeSecondRef,
    handlePointer,
    position,
    positions,
    sourceRef,
    stats,
    targetRef,
  } = useGlassStageController({
    backgroundUrl,
    blend,
    dualLens,
    engine,
    engineMode,
    glassTint,
    lens,
    mode: renderMode,
    renderer: INITIAL_RENDERER,
    stageMode,
  });

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

  function updateVisibility(key: VisibilityKey, value: boolean) {
    setVisibility((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <main className="shell">
      <PlaygroundStage
        backgroundUrl={backgroundUrl}
        blend={blend}
        containerRef={containerRef}
        dropdownGap={dropdownGap}
        dualLens={dualLens}
        engineMode={engineMode}
        glassChromeRef={glassChromeRef}
        glassChromeSecondRef={glassChromeSecondRef}
        glassTint={glassTint}
        islandDemo={islandDemo}
        islandExpanded={islandExpanded}
        lens={lens}
        onIslandCycle={cycleIsland}
        onLensPointer={handlePointer}
        onLensPositionCommit={commitLensPosition}
        onModalOpen={openModal}
        onSliderValueChange={setSliderValue}
        position={position}
        positions={positions}
        pressHighlight={pressHighlight}
        renderer={INITIAL_RENDERER}
        sliderValue={sliderValue}
        sourceRef={sourceRef}
        stageMode={stageMode}
        switchLensOverrideEnabled={switchLensOverrideEnabled}
        targetRef={targetRef}
        tint={tint}
        visibility={visibility}
      />

      <SceneSwitcher
        islandDemo={islandDemo}
        onIslandDemoSelect={selectIslandDemo}
        onSceneMenuOpenChange={setSceneMenuOpen}
        onStageModeChange={setStageMode}
        onWallpaperChange={setWallpaperId}
        sceneMenuOpen={sceneMenuOpen}
        stageMode={stageMode}
        wallpaperId={wallpaperId}
      />

      <GlassPreviewModal
        engineMode={engineMode}
        glassTint={glassTint}
        isVisible={isModalVisible}
        lens={lens}
        onClose={closeModal}
        renderer={INITIAL_RENDERER}
      />

      <FloatingControls
        blend={blend}
        controlsOpen={controlsOpen}
        controlsPanelOpensUp={controlsPanelOpensUp}
        customTint={customTint}
        dropdownGap={dropdownGap}
        dualLens={dualLens}
        engineMode={engineMode}
        floatingControlsRef={floatingControlsRef}
        isControlsDragging={isControlsDragging}
        lens={lens}
        onBlendChange={setBlend}
        onControlsDragStart={handleControlsDragStart}
        onControlsOpenChange={setControlsOpen}
        onCustomTintChange={updateCustomTint}
        onDropdownGapChange={setDropdownGap}
        onDualLensChange={setDualLens}
        onEngineModeChange={setEngineMode}
        onLensChange={updateLens}
        onPressHighlightChange={setPressHighlight}
        onTintModeChange={setTintMode}
        onTintNameChange={setTintName}
        onVisibilityChange={updateVisibility}
        pressHighlight={pressHighlight}
        stats={stats}
        tintMode={tintMode}
        tintName={tintName}
        visibility={visibility}
      />
    </main>
  );
}
