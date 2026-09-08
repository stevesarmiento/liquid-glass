import { getGlassPerfSnapshot } from "liquid-glass";

/**
 * Black-glass incident trap: when rendering breaks mid-tuning (JS error,
 * unhandled rejection, WebGL context loss), capture the moment plus a ring
 * buffer of the most recent lens states so the breaking configuration is
 * reproducible. The Global section shows an incident badge with a
 * copy-report button — paste the report into an issue/chat to debug.
 */

export type DebugIncident = {
  at: string;
  kind:
    | "error"
    | "unhandledrejection"
    | "webglcontextlost"
    | "webglcontextrestored"
    | "gpu-probe-lost"
    | "manual";
  message: string;
};

type DebugState = { at: string; label: string; data: unknown };

const RING_SIZE = 30;
const ring: DebugState[] = [];
const incidents: DebugIncident[] = [];
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((fn) => fn());

export function recordDebugState(label: string, data: unknown): void {
  ring.push({ at: new Date().toISOString(), label, data });
  if (ring.length > RING_SIZE) ring.shift();
}

function recordIncident(kind: DebugIncident["kind"], message: string): void {
  incidents.push({ at: new Date().toISOString(), kind, message });
  // The report is the payload; the console line is the heads-up.
  console.error(`[glass-debug] ${kind}: ${message}`, { recentStates: [...ring] });
  notify();
}

export function subscribeDebugIncidents(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getDebugIncidentCount(): number {
  return incidents.length;
}

export function buildDebugReport(): string {
  let perf: unknown = null;
  try {
    perf = getGlassPerfSnapshot();
  } catch {
    perf = "unavailable";
  }
  return JSON.stringify(
    {
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      // qualityLevel 3 = surface-only: refraction deliberately skipped by the
      // adaptive governor (the "glass stopped working" look).
      perf,
      incidents,
      recentStates: ring,
    },
    null,
    2,
  );
}

/**
 * Manual capture: the user clicks "Report bug now" right after seeing a
 * breakage — works even when the failure raised no event at all (silent SVG
 * filter failures, GPU resets that skip event delivery). Includes a live
 * WebGL probe check so a dead GPU process is visible in the report.
 */
export function captureManualIncident(): string {
  const probe = probeGl && probeGl.isContextLost() ? "PROBE CONTEXT LOST" : "probe context alive";
  recordIncident("manual", `user-reported breakage; ${probe}`);
  return buildDebugReport();
}

type RegionSample = { label: string; rect: number[]; meanLuma: number; blackFrac: number };

/**
 * Ground-truth screen check: captures ONE frame of the current tab (Chrome
 * prompts to share the tab — one click) and samples real pixels over the
 * stage, the lens box, and a viewport grid, so a report states WHAT is
 * black instead of guessing. The stream is stopped immediately after the
 * single frame.
 */
export async function captureScreenCheck(): Promise<string> {
  const probe = probeGl && probeGl.isContextLost() ? "PROBE CONTEXT LOST" : "probe context alive";
  let screen: { error?: string; regions?: RegionSample[] } = {};
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      // Chrome-only hints: land on "this tab" with one click.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ preferCurrentTab: true, selfBrowserSurface: "include" } as any),
    });
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(video, 0, 0);
    track.stop();
    stream.getTracks().forEach((t) => t.stop());

    // Captured frame is the whole tab viewport; map DOM rects to frame px.
    const scaleX = canvas.width / window.innerWidth;
    const scaleY = canvas.height / window.innerHeight;
    const sample = (label: string, rect: DOMRect | null): RegionSample | null => {
      if (!rect || rect.width < 4 || rect.height < 4) return null;
      const x0 = Math.max(0, Math.floor(rect.left * scaleX));
      const y0 = Math.max(0, Math.floor(rect.top * scaleY));
      const w = Math.min(canvas.width - x0, Math.floor(rect.width * scaleX));
      const h = Math.min(canvas.height - y0, Math.floor(rect.height * scaleY));
      if (w < 4 || h < 4) return null;
      const data = ctx.getImageData(x0, y0, w, h).data;
      let luma = 0;
      let black = 0;
      let n = 0;
      const step = Math.max(4, Math.floor((w * h) / 4000)) * 4;
      for (let i = 0; i < data.length; i += step) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        luma += l;
        if (l < 10) black += 1;
        n += 1;
      }
      return {
        label,
        rect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
        meanLuma: Math.round(luma / n),
        blackFrac: Math.round((black / n) * 100) / 100,
      };
    };

    const stage = document.querySelector(".lensSurface")?.getBoundingClientRect() ?? null;
    const chrome = document.querySelector(".glassChrome")?.getBoundingClientRect() ?? null;
    const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    screen.regions = [
      sample("viewport", viewport),
      sample("stage", stage),
      sample("lens(glassChrome)", chrome),
    ].filter((r): r is RegionSample => r !== null);
  } catch (error) {
    screen.error = String(error).slice(0, 200);
  }

  recordIncident(
    "manual",
    `screen-check; ${probe}; ${screen.error ? `capture failed: ${screen.error}` : JSON.stringify(screen.regions)}`,
  );
  return buildDebugReport();
}

let probeGl: WebGLRenderingContext | null = null;

let installed = false;

export function installDebugTrap(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    recordIncident("error", `${event.message} @ ${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordIncident("unhandledrejection", String(event.reason).slice(0, 400));
  });
  // Capture phase reaches every canvas, including ones created later.
  window.addEventListener(
    "webglcontextlost",
    (event) => {
      const canvas = event.target as HTMLCanvasElement | null;
      recordIncident(
        "webglcontextlost",
        `canvas ${canvas?.width}x${canvas?.height} class="${canvas?.className ?? ""}"`,
      );
    },
    true,
  );
  window.addEventListener(
    "webglcontextrestored",
    () => recordIncident("webglcontextrestored", "context restored"),
    true,
  );

  // GPU watchdog: a 1x1 probe context polled every 2s catches GPU process
  // resets even when no webglcontextlost event reaches the page. The same
  // poll watches the engine's context-loss counter: the shared glass
  // compositor's GL canvas is DETACHED, so its webglcontextlost event never
  // propagates to window listeners — six incident reports showed "no events"
  // because we were listening in the wrong place.
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  probeGl = probeCanvas.getContext("webgl");
  let probeTripped = false;
  let lastEngineLossCount = 0;
  window.setInterval(() => {
    if (!probeTripped && probeGl && probeGl.isContextLost()) {
      probeTripped = true;
      recordIncident("gpu-probe-lost", "GPU probe context lost (likely GPU process reset)");
    }
    const lost = getGlassPerfSnapshot().webglContexts.lost;
    if (lost > lastEngineLossCount) {
      recordIncident(
        "webglcontextlost",
        `glass GL context lost (engine counter ${lastEngineLossCount} -> ${lost}; shared compositor or controller renderer)`,
      );
      lastEngineLossCount = lost;
    }
  }, 2000);
}
