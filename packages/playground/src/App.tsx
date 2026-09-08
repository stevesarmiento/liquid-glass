import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GlassPressHighlight } from "@liquid-glass/design-system";

import {
  createGlassTint,
  createLiquidGlassEngine,
  resolveGlassTint,
  setGlassQualityOverride,
  type GlassTintName,
  type LensParams,
  type LiquidGlassEngineMode,
  type LiquidGlassRenderMode,
  type ResolvedLensParams,
} from "liquid-glass";
import { FloatingControls } from "./components/FloatingControls";
import { GlassPreviewModal } from "./components/GlassPreviewModal";
import { PerfOverlay } from "./components/PerfOverlay";
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
  LENS_STAGE_PRESETS,
  PAINTING_URL,
  WALLPAPERS,
  type ComponentVisibility,
  type IphoneScreen,
  type LensStagePresetId,
  type PreviewBackground,
  type StageMode,
  type TintMode,
  type VisibilityKey,
  type WallpaperId,
} from "./playgroundConfig";
import { recordDebugState } from "./debugTrap";

export default function App() {
  const [lens, setLens] = useState<ResolvedLensParams>(INITIAL_LENS);
  const [dualLens, setDualLens] = useState(false);
  const [blend, setBlend] = useState(INITIAL_BLEND);
  const [dropdownGap, setDropdownGap] = useState(0);
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
  const [iphoneScreen, setIphoneScreen] = useState<IphoneScreen>("home");
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [pressHighlight, setPressHighlight] = useState<GlassPressHighlight>("natural");
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>("light");
  // Global preview state: components render their held-active glass stage.
  const [previewActive, setPreviewActive] = useState(true);
  // OFF by default: the tuning surface must show true full-quality output.
  // The adaptive governor otherwise degrades to surface-only under sustained
  // slider scrubbing — pills silently losing their refraction mid-tuning was
  // the "glass goes black" mystery (with a dark tint the chrome-only
  // fallback reads as a black pill).
  const [adaptiveQuality, setAdaptiveQuality] = useState(false);
  // Global source zoom for component previews (1 = off; < 1 = literal
  // minified source view, optics carry only edge character).
  const [sourceZoom, setSourceZoom] = useState(1);
  const [wallpaperId, setWallpaperId] = useState<WallpaperId>("painting");
  // Wallpaper toggles only apply to the iPhone scene; the full-bleed
  // painting stage always shows the painting.
  const backgroundUrl =
    stageMode === "iphone"
      ? (WALLPAPERS.find((wallpaper) => wallpaper.id === wallpaperId) ?? WALLPAPERS[0]).url
      : PAINTING_URL;
  const engine = useMemo(() => createLiquidGlassEngine({ mode: engineMode }), [engineMode]);
  useEffect(() => {
    setGlassQualityOverride(adaptiveQuality ? null : 0);
    recordDebugState("adaptiveQuality", adaptiveQuality);
  }, [adaptiveQuality]);
  const glassTint = tintMode === "preset" ? tintName : customTint;
  // Memoized: a fresh tint object every render would bust PlaygroundStage's
  // memo and cascade full glass repaints into every lens on the stage.
  const tint = useMemo(
    () => (tintMode === "preset" ? resolveGlassTint(tintName) : createGlassTint(customTint)),
    [customTint, tintMode, tintName],
  );
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
    setLens((current) => {
      const next = {
        ...current,
        [key]: key === "mapSize" ? Math.round(value) : value,
      };
      // Ring-buffered for the black-glass incident trap (see debugTrap.ts).
      recordDebugState(`lens:${key}`, next);
      return next;
    });
  }

  // Stage pointer drags move the filter region every frame but never went
  // through updateLens — record them (throttled) so incident reports show
  // what interaction preceded a breakage even when no slider was touched.
  const lastPointerRecordAt = useRef(0);
  const recordedLensPointer = useCallback(
    (event: Parameters<typeof handlePointer>[0], isDown?: boolean) => {
      const now = Date.now();
      if (isDown || now - lastPointerRecordAt.current > 150) {
        lastPointerRecordAt.current = now;
        recordDebugState("stage:pointer", { isDown: isDown === true });
      }
      handlePointer(event, isDown);
    },
    [handlePointer],
  );

  function applyLensPreset(id: LensStagePresetId) {
    recordDebugState("preset", id);
    const preset = LENS_STAGE_PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    setSwitchLensOverrideEnabled(true);
    setLens({ ...preset.lens });
  }

  function updateCustomTint(key: keyof typeof INITIAL_CUSTOM_TINT, value: string | number) {
    recordDebugState(`tint:${key}`, value);
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
    <main
      className="shell"
      // A tuning surface has no legitimate native drag-and-drop: pointer
      // drags belong to the lens/sliders. Without this, press-drags over
      // icons/canvases/selected text sometimes start a browser drag ghost.
      onDragStart={(event) => event.preventDefault()}
    >
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
        iphoneScreen={iphoneScreen}
        islandDemo={islandDemo}
        islandExpanded={islandExpanded}
        lens={lens}
        onIslandCycle={cycleIsland}
        onLensPointer={recordedLensPointer}
        onLensPositionCommit={commitLensPosition}
        onModalOpen={openModal}
        onSliderValueChange={setSliderValue}
        position={position}
        positions={positions}
        pressHighlight={pressHighlight}
        previewActive={previewActive}
        previewBackground={previewBackground}
        renderer={INITIAL_RENDERER}
        sliderValue={sliderValue}
        sourceZoom={sourceZoom}
        sourceRef={sourceRef}
        stageMode={stageMode}
        switchLensOverrideEnabled={switchLensOverrideEnabled}
        targetRef={targetRef}
        tint={tint}
        visibility={visibility}
      />

      <SceneSwitcher
        iphoneScreen={iphoneScreen}
        islandDemo={islandDemo}
        onIphoneScreenSelect={setIphoneScreen}
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
        onBlendChange={(value) => {
          recordDebugState("blend", value);
          setBlend(value);
        }}
        onControlsDragStart={handleControlsDragStart}
        onControlsOpenChange={setControlsOpen}
        onCustomTintChange={updateCustomTint}
        onDropdownGapChange={setDropdownGap}
        onDualLensChange={setDualLens}
        onEngineModeChange={setEngineMode}
        onLensChange={updateLens}
        onLensPresetSelect={applyLensPreset}
        onPressHighlightChange={setPressHighlight}
        onTintModeChange={setTintMode}
        onTintNameChange={setTintName}
        onAdaptiveQualityChange={setAdaptiveQuality}
        adaptiveQuality={adaptiveQuality}
        onPreviewActiveChange={setPreviewActive}
        onSourceZoomChange={(value) => {
          recordDebugState("sourceZoom", value);
          setSourceZoom(value);
        }}
        sourceZoom={sourceZoom}
        onPreviewBackgroundChange={setPreviewBackground}
        onVisibilityChange={updateVisibility}
        pressHighlight={pressHighlight}
        previewActive={previewActive}
        previewBackground={previewBackground}
        stats={stats}
        tintMode={tintMode}
        tintName={tintName}
        visibility={visibility}
      />

      <PerfOverlay />
    </main>
  );
}
