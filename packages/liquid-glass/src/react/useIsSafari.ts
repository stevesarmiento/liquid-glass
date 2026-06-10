import { useMemo } from "react";

import { isSafari } from "../web/is-safari";

export function useIsSafari(): boolean {
  return useMemo(() => isSafari(), []);
}
