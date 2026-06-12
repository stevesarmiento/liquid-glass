import {
  type DependencyList,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";

// useLayoutEffect warns during SSR; sampling needs the DOM anyway.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface CanvasSourceStyles<T> {
  /**
   * Stable getter for the latest sample. Samples synchronously on first call
   * if the layout effect has not run yet, so the very first draw never paints
   * with missing/placeholder values.
   */
  get(): T | null;
  /**
   * Serialized identity of the sample. Fold this into a GlassNode
   * `sourceVersion` so style changes (theme swaps, CSS var overrides) still
   * trigger a repaint even though sampling left the draw path.
   */
  key: string;
}

/**
 * Hoists `getComputedStyle`-style sampling OUT of canvas draw callbacks.
 *
 * Glass draw sources historically sampled computed styles (and walked
 * ancestors for the backdrop color) inside `drawSource`, which runs per draw —
 * per drag frame for a switch. Computed-style reads can force style/layout
 * flushes, making the hottest path pay layout costs every frame.
 *
 * This hook samples once per `deps` change in a layout effect (before
 * GlassNode's passive draw effect runs), re-samples on window resize, and
 * hands draw callbacks a cheap ref read instead.
 */
export function useCanvasSourceStyles<T>(
  ref: RefObject<HTMLElement | null>,
  sample: (element: HTMLElement) => T,
  deps: DependencyList
): CanvasSourceStyles<T> {
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const valueRef = useRef<T | null>(null);
  const [key, setKey] = useState("");

  const resample = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const value = sampleRef.current(element);
    valueRef.current = value;
    const nextKey = JSON.stringify(value) ?? "";
    setKey((previous) => (previous === nextKey ? previous : nextKey));
  }, [ref]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's sample inputs
  useIsomorphicLayoutEffect(resample, [resample, ...deps]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", resample);
    return () => window.removeEventListener("resize", resample);
  }, [resample]);

  const get = useCallback((): T | null => {
    if (valueRef.current === null && ref.current) {
      valueRef.current = sampleRef.current(ref.current);
    }
    return valueRef.current;
  }, [ref]);

  return { get, key };
}

export default useCanvasSourceStyles;
