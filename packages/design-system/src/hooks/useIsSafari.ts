import { useMemo } from "react";

const SAFARI_USER_AGENT = /^((?!chrome|android).)*safari/i;

export default function useIsSafari(): boolean {
  return useMemo(
    () => typeof navigator !== "undefined" && SAFARI_USER_AGENT.test(navigator.userAgent),
    []
  );
}

