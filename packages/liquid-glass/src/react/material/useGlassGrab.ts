import { type PointerEventHandler, type RefObject, useEffect, useMemo, useRef } from "react";

import { prefersReducedMotion, safeReleasePointerCapture, safeSetPointerCapture } from "./shared";
import { createSpring, rubberband, type Spring, type SpringConfig } from "./spring";
import {
  GLASS_DEFORMATION_RELEASE_SPRING,
  GLASS_DEFORMATION_TRACK_SPRING,
} from "./useGlassDeformation";

/** Rubberband asymptote for the grab deflection, in px. */
const DEFAULT_MAX_PX = 8;
/** Rubberband falloff in px — higher means a slower approach to maxPx. */
const DEFAULT_FALLOFF_PX = 90;
/**
 * Stretch per (deflection px / element size). The default size estimate is the
 * mean of the element's width and height, so for a typical button-sized
 * element (~70px mean) the default factor yields ~6% stretch at maxPx.
 */
const DEFAULT_STRETCH_FACTOR = 0.5;
/** Cross-axis counter-scale per unit of stretch (volume conservation). */
const DEFAULT_VOLUME_CONSERVATION = 0.65;
/** Fraction of the deflection applied as translation. */
const DEFAULT_TRANSLATE_FACTOR = 0.45;
/** Hard cap on the stretch scale delta, so huge pulls never look rubbery-fake. */
const MAX_STRETCH = 0.08;
/** Spring rest threshold in px (per axis) before inline styles are cleared. */
const SETTLE_EPSILON_PX = 0.05;
/** Deflections below this magnitude render as identity. */
const MIN_DEFLECTION_PX = 1e-3;

export interface GlassGrabOptions {
  /**
   * Master switch (e.g. interactivity combined with `disabled`). Latched when
   * a grab begins; when false, the hook never deforms. Defaults to true.
   */
  enabled?: boolean;
  /** Maximum deflection in px (rubberband asymptote). Defaults to 8. */
  maxPx?: number;
  /** Rubberband falloff in px — higher means a slower approach to maxPx. Defaults to 90. */
  falloffPx?: number;
  /**
   * Stretch applied per px of deflection relative to the element size (mean
   * of width and height). Defaults to 0.5 (~6% at maxPx for button-sized
   * elements); the resulting stretch is always capped at 8%.
   */
  stretchFactor?: number;
  /**
   * Cross-axis counter-scale per unit of stretch, so the material reads as
   * conserving volume. Defaults to 0.65.
   */
  volumeConservation?: number;
  /** Fraction of the deflection applied as translation. Defaults to 0.45. */
  translateFactor?: number;
  /** Spring used while tracking the pull. Defaults to GLASS_DEFORMATION_TRACK_SPRING (600/38). */
  trackSpring?: SpringConfig;
  /** Spring used after release (the bounce). Defaults to GLASS_DEFORMATION_RELEASE_SPRING (380/16). */
  releaseSpring?: SpringConfig;
  /**
   * Called once per rAF with the spring-tracked, rubberbanded deflection
   * vector — lets consumers drive non-DOM material (e.g. lens geometry)
   * instead of, or in addition to, the DOM transform. Emits a final `(0, 0)`
   * when the deformation settles or is canceled, so consumers can reset.
   */
  onDeflection?(dx: number, dy: number): void;
  /**
   * When false, the hook never writes a DOM transform — `onDeflection` is the
   * only output. Defaults to true.
   */
  applyTransform?: boolean;
}

/**
 * Spreadable pointer handlers for the simple case: pointer capture via the
 * pressed element, press-origin tracking, spring feeding. Composable — call
 * them from your own handlers alongside other material handlers.
 */
export interface GlassGrabHandlers {
  onPointerDown: PointerEventHandler<Element>;
  onPointerMove: PointerEventHandler<Element>;
  onPointerUp: PointerEventHandler<Element>;
  onPointerCancel: PointerEventHandler<Element>;
  onLostPointerCapture: PointerEventHandler<Element>;
}

export interface GlassGrabHandle {
  /** Ready-made pointer handlers (capture, origin tracking, spring feed). */
  handlers: GlassGrabHandlers;
  /**
   * Imperative mode: begins a grab anchored at the given client coordinates.
   * Latches `enabled`/reduced-motion; while either vetoes, the grab is inert.
   */
  grab(originX: number, originY: number): void;
  /** Feeds the current pointer position; the deflection is pointer − origin, rubberbanded. */
  pull(clientX: number, clientY: number): void;
  /** Retargets (0, 0) underdamped — the bounce — then clears on settle. */
  release(): void;
  /** Immediately stops the simulation, clears inline styles, and emits a final (0, 0). */
  cancel(): void;
  /** True between grab and settle/cancel while the deformation may run. */
  readonly active: boolean;
}

export interface GlassGrabTransform {
  transform: string;
  transformOrigin: string;
}

/**
 * Pure deflection→transform mapping: translate a fraction of the deflection,
 * then stretch along the deflection direction (rotate, anisotropic scale,
 * rotate back) while constricting the cross axis. Returns null at ~zero
 * deflection (identity — clear the inline styles).
 */
export function computeGrabTransform(
  dx: number,
  dy: number,
  options: {
    sizePx: number;
    stretchFactor: number;
    volumeConservation: number;
    translateFactor: number;
  },
): GlassGrabTransform | null {
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude) || magnitude < MIN_DEFLECTION_PX) return null;

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const stretch = Math.min(
    MAX_STRETCH,
    (magnitude / Math.max(1, options.sizePx)) * options.stretchFactor,
  );
  const translateX = dx * options.translateFactor;
  const translateY = dy * options.translateFactor;

  return {
    transform:
      `translate(${translateX}px, ${translateY}px) ` +
      `rotate(${angleDeg}deg) ` +
      `scale(${1 + stretch}, ${1 - stretch * options.volumeConservation}) ` +
      `rotate(${-angleDeg}deg)`,
    transformOrigin: "center",
  };
}

interface GrabState {
  springX: Spring;
  springY: Spring;
  rafId: number | null;
  lastFrameTime: number | null;
  /** True between grab and settle/cancel when deformation may run. */
  active: boolean;
  dragging: boolean;
  originX: number;
  originY: number;
  /** Rubberbanded deflection targets from the latest pull sample. */
  targetDx: number;
  targetDy: number;
  /** Pointer the handler-mode gesture is bound to. */
  pointerId: number | null;
}

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

/**
 * Grabbable material: press-and-drag on an anchored glass element does not
 * move it — it elastically deforms it. The deflection vector (pointer −
 * origin) runs through the same rubberband curve the slider/switch use at
 * their apexes, a per-axis spring pair tracks it stiffly (600/38) during the
 * drag, and release retargets (0, 0) underdamped (380/16) so the material
 * snaps back with a bounce.
 *
 * Output is a DOM transform on `targetRef` (translate toward the pull,
 * stretch along it, constrict across it — volume conservation), and/or the
 * raw deflection via `onDeflection` for consumers that deform non-DOM
 * material (canvas lenses, merged maps). All per-frame work is imperative —
 * no React state. Honors `prefers-reduced-motion` (latched per grab; fully
 * inert), and clears inline styles on settle, cancel, and unmount. When
 * `applyTransform` is on, the target element must own no other inline
 * transform.
 */
export function useGlassGrab<T extends HTMLElement>(
  targetRef: RefObject<T | null>,
  options: GlassGrabOptions = {},
): GlassGrabHandle {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stateRef = useRef<GrabState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = {
      springX: createSpring(GLASS_DEFORMATION_TRACK_SPRING),
      springY: createSpring(GLASS_DEFORMATION_TRACK_SPRING),
      rafId: null,
      lastFrameTime: null,
      active: false,
      dragging: false,
      originX: 0,
      originY: 0,
      targetDx: 0,
      targetDy: 0,
      pointerId: null,
    };
  }

  const handle = useMemo<GlassGrabHandle>(() => {
    const state = stateRef.current as GrabState;

    const clearTransform = () => {
      if (optionsRef.current.applyTransform === false) return;
      const element = targetRef.current;
      if (!element) return;
      element.style.transform = "";
      element.style.transformOrigin = "";
    };

    const emit = (dx: number, dy: number) => {
      const current = optionsRef.current;
      if (current.applyTransform !== false) {
        const element = targetRef.current;
        if (element) {
          const mapped = computeGrabTransform(dx, dy, {
            sizePx: Math.max(1, (element.offsetWidth + element.offsetHeight) / 2),
            stretchFactor: current.stretchFactor ?? DEFAULT_STRETCH_FACTOR,
            volumeConservation: current.volumeConservation ?? DEFAULT_VOLUME_CONSERVATION,
            translateFactor: current.translateFactor ?? DEFAULT_TRANSLATE_FACTOR,
          });
          if (mapped) {
            element.style.transform = mapped.transform;
            element.style.transformOrigin = mapped.transformOrigin;
          } else {
            element.style.transform = "";
            element.style.transformOrigin = "";
          }
        }
      }
      current.onDeflection?.(dx, dy);
    };

    const tick = (frameTime: number) => {
      state.rafId = null;
      const dt = state.lastFrameTime === null ? 16 : frameTime - state.lastFrameTime;
      state.lastFrameTime = frameTime;

      if (state.dragging) {
        state.springX.target = state.targetDx;
        state.springY.target = state.targetDy;
      }
      state.springX.step(dt);
      state.springY.step(dt);

      if (
        !state.dragging &&
        state.springX.isSettled(SETTLE_EPSILON_PX) &&
        state.springY.isSettled(SETTLE_EPSILON_PX)
      ) {
        state.springX.position = 0;
        state.springX.velocity = 0;
        state.springY.position = 0;
        state.springY.velocity = 0;
        state.active = false;
        clearTransform();
        optionsRef.current.onDeflection?.(0, 0);
        return;
      }

      emit(state.springX.position, state.springY.position);
      state.rafId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (state.rafId !== null) return;
      state.lastFrameTime = null;
      state.rafId = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      if (state.rafId === null) return;
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    };

    const grab = (originX: number, originY: number) => {
      if (!state.dragging) {
        // First grab of a new deformation: latch enabled/reduced-motion and
        // start tracking with the stiff spring pair.
        state.active = optionsRef.current.enabled !== false && !prefersReducedMotion();
        if (!state.active) return;

        state.dragging = true;
        const track = optionsRef.current.trackSpring ?? GLASS_DEFORMATION_TRACK_SPRING;
        state.springX.setConfig(track);
        state.springY.setConfig(track);
        startLoop();
      }
      if (!state.active) return;

      state.originX = finiteOrZero(originX);
      state.originY = finiteOrZero(originY);
      state.targetDx = 0;
      state.targetDy = 0;
    };

    const pull = (clientX: number, clientY: number) => {
      if (!state.active || !state.dragging) return;

      const vx = finiteOrZero(clientX) - state.originX;
      const vy = finiteOrZero(clientY) - state.originY;
      const distance = Math.hypot(vx, vy);
      if (distance < MIN_DEFLECTION_PX) {
        state.targetDx = 0;
        state.targetDy = 0;
        return;
      }

      const { maxPx = DEFAULT_MAX_PX, falloffPx = DEFAULT_FALLOFF_PX } = optionsRef.current;
      const magnitude = rubberband(distance, maxPx, falloffPx);
      state.targetDx = (vx / distance) * magnitude;
      state.targetDy = (vy / distance) * magnitude;
    };

    const release = () => {
      if (!state.active) return;

      state.dragging = false;
      state.targetDx = 0;
      state.targetDy = 0;
      const bounce = optionsRef.current.releaseSpring ?? GLASS_DEFORMATION_RELEASE_SPRING;
      state.springX.setConfig(bounce);
      state.springY.setConfig(bounce);
      state.springX.target = 0;
      state.springY.target = 0;
      startLoop();
    };

    const cancel = () => {
      const wasActive = state.active;
      state.dragging = false;
      state.active = false;
      state.pointerId = null;
      state.targetDx = 0;
      state.targetDy = 0;
      for (const spring of [state.springX, state.springY]) {
        spring.position = 0;
        spring.velocity = 0;
        spring.target = 0;
      }
      stopLoop();
      clearTransform();
      if (wasActive) optionsRef.current.onDeflection?.(0, 0);
    };

    const handlers: GlassGrabHandlers = {
      onPointerDown(event) {
        if (event.button > 0) return;
        grab(event.clientX, event.clientY);
        if (!state.active) return;
        state.pointerId = typeof event.pointerId === "number" ? event.pointerId : null;
        safeSetPointerCapture(event.currentTarget, event.pointerId);
      },
      onPointerMove(event) {
        if (!state.dragging) return;
        if (
          state.pointerId !== null &&
          typeof event.pointerId === "number" &&
          event.pointerId !== state.pointerId
        ) {
          return;
        }
        pull(event.clientX, event.clientY);
      },
      onPointerUp(event) {
        state.pointerId = null;
        release();
        safeReleasePointerCapture(event.currentTarget, event.pointerId);
      },
      onPointerCancel(event) {
        state.pointerId = null;
        release();
        safeReleasePointerCapture(event.currentTarget, event.pointerId);
      },
      onLostPointerCapture() {
        if (!state.dragging) return;
        state.pointerId = null;
        release();
      },
    };

    return {
      handlers,
      grab,
      pull,
      release,
      cancel,
      get active() {
        return state.active;
      },
    };
  }, [targetRef]);

  useEffect(() => () => handle.cancel(), [handle]);

  return handle;
}
