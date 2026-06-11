import { useCallback, useRef, useState } from "react";

import { ISLAND_DEMOS, type IslandDemo } from "../playgroundConfig";

export function useIslandDemoCycle() {
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [islandDemo, setIslandDemo] = useState<IslandDemo>("messages");
  const islandCycleArmedRef = useRef(false);

  const cycleIsland = useCallback(() => {
    if (islandExpanded) {
      setIslandExpanded(false);
      islandCycleArmedRef.current = true;
      return;
    }
    if (islandCycleArmedRef.current) {
      islandCycleArmedRef.current = false;
      const index = ISLAND_DEMOS.findIndex((demo) => demo.id === islandDemo);
      setIslandDemo(ISLAND_DEMOS[(index + 1) % ISLAND_DEMOS.length].id);
    }
    setIslandExpanded(true);
  }, [islandDemo, islandExpanded]);

  const selectIslandDemo = useCallback((id: IslandDemo) => {
    islandCycleArmedRef.current = false;
    if (islandDemo === id) {
      setIslandExpanded((current) => !current);
      return;
    }
    setIslandDemo(id);
    setIslandExpanded(true);
  }, [islandDemo]);

  return {
    cycleIsland,
    islandDemo,
    islandExpanded,
    selectIslandDemo,
  };
}
