import { type CSSProperties, useEffect, useRef, useState } from "react";
import { getGlassPerfSnapshot, type GlassPerfSnapshot } from "liquid-glass";

const POLL_MS = 500;

const overlayStyle: CSSProperties = {
  position: "fixed",
  bottom: 12,
  left: 12,
  zIndex: 9999,
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(10, 12, 16, 0.78)",
  color: "rgba(235, 240, 248, 0.92)",
  font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
  pointerEvents: "none",
  whiteSpace: "pre",
};

/**
 * Live glass pipeline counters (rates derived by diffing monotonic totals).
 * Healthy idle state: every per-second rate at 0. The same data is available
 * in the console via `__LIQUID_GLASS_PERF__.snapshot()`.
 */
export function PerfOverlay() {
  const [text, setText] = useState("glass perf —");
  const lastRef = useRef<{ snap: GlassPerfSnapshot; at: number } | null>(null);

  useEffect(() => {
    const tick = () => {
      const snap = getGlassPerfSnapshot();
      const at = performance.now();
      const last = lastRef.current;
      lastRef.current = { snap, at };
      if (!last) return;

      const seconds = Math.max(0.001, (at - last.at) / 1000);
      const rate = (next: number, previous: number) => Math.round((next - previous) / seconds);

      const hits = snap.maps.cacheHits - last.snap.maps.cacheHits;
      const misses = snap.maps.cacheMisses - last.snap.maps.cacheMisses;
      const lookups = hits + misses;
      const hitPercent = lookups > 0 ? Math.round((hits / lookups) * 100) : 100;

      setText(
        [
          `draws/s  svg ${rate(snap.draws.svg, last.snap.draws.svg)}  cpu ${rate(snap.draws.canvas, last.snap.draws.canvas)}  gl ${rate(snap.draws.webgl, last.snap.draws.webgl)}`,
          `maps/s   gen ${rate(snap.maps.generated, last.snap.maps.generated)}  hit ${hitPercent}%  (other ${rate(snap.maps.generatedOutsideCache, last.snap.maps.generatedOutsideCache)})`,
          `blur/s   hit ${rate(snap.blur.cacheHits, last.snap.blur.cacheHits)}  miss ${rate(snap.blur.cacheMisses, last.snap.blur.cacheMisses)}`,
          `gl ctx   ${snap.webglContexts.active} active (${snap.webglContexts.created} created)`,
        ].join("\n"),
      );
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div aria-hidden="true" style={overlayStyle}>
      {text}
    </div>
  );
}
