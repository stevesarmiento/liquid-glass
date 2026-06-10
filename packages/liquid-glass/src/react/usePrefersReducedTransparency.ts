import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-transparency: reduce)";

function readMatches(): boolean {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

export function usePrefersReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(readMatches);

  useEffect(() => {
    if (typeof matchMedia !== "function") return undefined;
    let query: MediaQueryList;
    try {
      query = matchMedia(QUERY);
    } catch {
      return undefined;
    }
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    setReduced(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
