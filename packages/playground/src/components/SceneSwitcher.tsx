import { memo } from "react";

import {
  IPHONE_SCREENS,
  ISLAND_DEMOS,
  STAGE_SCENES,
  WALLPAPERS,
  type IphoneScreen,
  type IslandDemo,
  type StageMode,
  type WallpaperId,
} from "../playgroundConfig";

interface SceneSwitcherProps {
  iphoneScreen: IphoneScreen;
  islandDemo: IslandDemo;
  onIphoneScreenSelect: (id: IphoneScreen) => void;
  onIslandDemoSelect: (id: IslandDemo) => void;
  onSceneMenuOpenChange: (open: boolean) => void;
  onStageModeChange: (mode: StageMode) => void;
  onWallpaperChange: (id: WallpaperId) => void;
  sceneMenuOpen: boolean;
  stageMode: StageMode;
  wallpaperId: WallpaperId;
}

export const SceneSwitcher = memo(function SceneSwitcher({
  iphoneScreen,
  islandDemo,
  onIphoneScreenSelect,
  onIslandDemoSelect,
  onSceneMenuOpenChange,
  onStageModeChange,
  onWallpaperChange,
  sceneMenuOpen,
  stageMode,
  wallpaperId,
}: SceneSwitcherProps) {
  const activeScene = STAGE_SCENES.find((scene) => scene.id === stageMode) ?? STAGE_SCENES[0];

  return (
    <div className="sceneSwitcher">
      {stageMode === "iphone" && (
        <div aria-label="iPhone screen" className="islandDemoPicker" role="radiogroup">
          {IPHONE_SCREENS.map(({ id, label, Icon }) => (
            <button
              aria-checked={iphoneScreen === id}
              aria-label={label}
              className={iphoneScreen === id ? "islandDemoChip active" : "islandDemoChip"}
              key={id}
              onClick={() => onIphoneScreenSelect(id)}
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
        <div aria-label="Dynamic Island demo" className="islandDemoPicker" role="radiogroup">
          {ISLAND_DEMOS.map(({ id, label, Icon }) => (
            <button
              aria-checked={islandDemo === id}
              aria-label={`${label} island demo`}
              className={islandDemo === id ? "islandDemoChip active" : "islandDemoChip"}
              key={id}
              onClick={() => onIslandDemoSelect(id)}
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
              onClick={() => onWallpaperChange(wallpaper.id)}
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
        onClick={() => onSceneMenuOpenChange(!sceneMenuOpen)}
        type="button"
      >
        <span>{activeScene.label}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {sceneMenuOpen && (
        <>
          <div className="sceneMenuBackdrop" onClick={() => onSceneMenuOpenChange(false)} />
          <div className="sceneMenu" role="menu">
            {STAGE_SCENES.map((scene) => (
              <button
                aria-checked={scene.id === stageMode}
                className={scene.id === stageMode ? "active" : ""}
                key={scene.id}
                onClick={() => {
                  onStageModeChange(scene.id);
                  onSceneMenuOpenChange(false);
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
  );
});
