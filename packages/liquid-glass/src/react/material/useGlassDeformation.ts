import { type RefObject, useEffect, useMemo, useRef } from "react";

import { now, prefersReducedMotion } from "./shared";
import { createSpring, rubberband, type Spring, type SpringConfig } from "./spring";

/**
 * Spring used while the material is being pulled: stiff and near-critically
 * damped so the deformation feels glued to the pointer without reading as
 * rigid.
 */
export const GLASS_DEFORMATION_TRACK_SPRING: SpringConfig = { stiffness: 600, damping: 38 };
/**
 * Spring used after release: underdamped so the material overshoots zero once
 * or twice on the way back — the bounce.
 */
export const GLASS_DEFORMATION_RELEASE_SPRING: SpringConfig = { stiffness: 380, damping: 16 };

/** Travel applied along the deformation axis per px of deformation. */
const TRANSLATE_RATIO = 0.55;
/** Stretch applied per (deformation / element size along the axis). */
const STRETCH_RATIO = 0.9;
/** Converts pointer velocity (px/ms) into rubberband input px for the lag stretch. */
const LAG_VELOCITY_GAIN_MS = 3;
/** Rubberband falloff for the velocity lag — small, so it saturates quickly. */
const LAG_FALLOFF_PX = 6;
/** Exponential decay time constant (ms) for sampled velocity once the pointer rests. */
const VELOCITY_DECAY_MS = 60;
/** EMA smoothing factor applied to instantaneous pointer velocity samples. */
const VELOCITY_SMOOTHING = 0.4;
/** Pointer samples closer together than this (ms) are folded into the previous one. */
const MIN_SAMPLE_INTERVAL_MS = 0.5;
/** Spring rest threshold in px before the inline transform is cleared. */
const SETTLE_EPSILON_PX = 0.05;

export interface GlassDeformationOptions {
  /**
   * Master switch (e.g. a `materialDeformation` prop combined with
   * `disabled`). Latched when a deformation begins; when false, the hook
   * never writes a transform. Defaults to true.
   */
  enabled?: boolean;
  /** Axis the material deforms along. Defaults to "x". */
  axis?: "x" | "y";
  /**
   * - "pull" (default): drag-overshoot stretch. The element translates with
   *   the pull, stretches along the axis away from an anchor on the side
   *   opposite the pull, and constricts on the cross axis.
   * - "press": centered compression. The element constricts along the axis
   *   around its center (no translation) and bulges on the cross axis — a
   *   press squish.
   * - "swell": centered expansion. The element grows along the axis around
   *   its center and grows on the cross axis by `volumeConservation` — a
   *   press that makes the material rise toward the finger instead of
   *   compressing (volumeConservation 1 = uniform scale-up).
   */
  mode?: "pull" | "press" | "swell";
  /**
   * Extent of the element along the deformation axis, in px; normalizes the
   * stretch factor. Defaults to the element's measured size.
   */
  sizePx?: number;
  /** Maximum apex deformation in px (rubberband asymptote). Defaults to 10. */
  maxPx?: number;
  /** Rubberband falloff in px — higher means a slower approach to maxPx. Defaults to 80. */
  falloffPx?: number;
  /**
   * Cross-axis counter-scale per unit of axis scale, so the material reads as
   * conserving volume. Defaults to 0.65.
   */
  volumeConservation?: number;
  /** Spring used while tracking the pull. Defaults to GLASS_DEFORMATION_TRACK_SPRING. */
  trackSpring?: SpringConfig;
  /** Spring used after release (the bounce). Defaults to GLASS_DEFORMATION_RELEASE_SPRING. */
  releaseSpring?: SpringConfig;
  /** Enables the subtle velocity-based stretch while dragging mid-track. */
  lagEnabled?: boolean;
  /** Cap in px for the mid-track lag stretch. Defaults to 40% of maxPx. */
  lagMaxPx?: number;
}

export interface GlassDeformationHandle {
  /**
   * Call per pointer sample (or imperatively) while the material is under
   * tension. `px` is the signed pull in px before the rubberband curve —
   * e.g. the pointer's overshoot past a clamp point (0 while inside the
   * range), or a fixed press depth. The first call after release/cancel
   * begins a new deformation: it latches `enabled`/reduced-motion and starts
   * the rAF loop with the tracking spring.
   *
   * `velocity` optionally feeds the lag stretch with an instantaneous pointer
   * velocity sample in px/ms (see `createGlassPointerVelocityTracker`); the
   * hook smooths and decays it internally.
   */
  setPull(px: number, velocity?: number): void;
  /** Call on pointerup/cancel/lostcapture: retargets 0 underdamped (the bounce). */
  release(): void;
  /** Immediately stops the simulation and clears the inline transform. */
  cancel(): void;
}

/** Converts pointer coordinate samples into instantaneous velocities (px/ms). */
export interface GlassPointerVelocityTracker {
  /**
   * Feeds one pointer coordinate. Returns the instantaneous velocity in
   * px/ms, or undefined when there is nothing to report yet (first sample, or
   * samples closer together than the folding threshold).
   */
  sample(coordinate: number): number | undefined;
  /** Forgets previous samples. Call when a new drag begins. */
  reset(): void;
}

/**
 * Companion to `GlassDeformationHandle.setPull`: tracks successive pointer
 * coordinates and yields the instantaneous velocity samples the lag stretch
 * consumes. Samples closer together than 0.5ms are folded into the previous
 * one so duplicate pointer events cannot produce velocity spikes.
 */
export function createGlassPointerVelocityTracker(): GlassPointerVelocityTracker {
  let lastCoordinate: number | null = null;
  let lastTime: number | null = null;

  return {
    sample(coordinate: number) {
      const sampleTime = now();
      if (lastCoordinate === null || lastTime === null) {
        lastCoordinate = coordinate;
        lastTime = sampleTime;
        return undefined;
      }

      const dt = sampleTime - lastTime;
      if (dt < MIN_SAMPLE_INTERVAL_MS) return undefined;

      const velocity = (coordinate - lastCoordinate) / dt;
      lastCoordinate = coordinate;
      lastTime = sampleTime;
      return velocity;
    },
    reset() {
      lastCoordinate = null;
      lastTime = null;
    },
  };
}

interface DeformationState {
  spring: Spring;
  rafId: number | null;
  lastFrameTime: number | null;
  /** True between the first setPull and settle/cancel when deformation may run. */
  active: boolean;
  dragging: boolean;
  /** Signed pull px from the latest sample. */
  pullPx: number;
  /** Smoothed pointer velocity in px/ms. */
  velocity: number;
}

/**
 * Imperative material-deformation driver for glass elements (thumbs, knobs,
 * whole controls). Runs a damped spring per rAF and writes
 * `transform`/`transform-origin` directly on the target element — no React
 * state per frame. In "pull" mode the transform stretches the element away
 * from an anchor on the side opposite the pull while constricting it on the
 * cross axis, so the glass reads as liquid under tension; in "press" mode it
 * compresses the element around its center instead.
 *
 * Honors `prefers-reduced-motion` (latched per deformation), and clears the
 * inline transform on settle, cancel, and unmount. The target element must
 * own no other inline transform.
 */
export function useGlassDeformation<T extends HTMLElement>(
  targetRef: RefObject<T | null>,
  options: GlassDeformationOptions = {},
): GlassDeformationHandle {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stateRef = useRef<DeformationState | null>(null);
  if (stateRef.current === null) {
    stateRef.current = {
      spring: createSpring(GLASS_DEFORMATION_TRACK_SPRING),
      rafId: null,
      lastFrameTime: null,
      active: false,
      dragging: false,
      pullPx: 0,
      velocity: 0,
    };
  }

  const handle = useMemo<GlassDeformationHandle>(() => {
    const state = stateRef.current as DeformationState;

    const clearTransform = () => {
      const element = targetRef.current;
      if (!element) return;
      element.style.transform = "";
      element.style.transformOrigin = "";
    };

    const applyTransform = (deformationPx: number) => {
      const element = targetRef.current;
      if (!element) return;

      const { axis = "x", mode = "pull", volumeConservation = 0.65, sizePx } = optionsRef.current;
      const vertical = axis === "y";
      const size = Math.max(1, sizePx ?? (vertical ? element.offsetHeight : element.offsetWidth));
      const stretch = (Math.abs(deformationPx) / size) * STRETCH_RATIO;

      if (mode === "press" || mode === "swell") {
        // Centered press deformation: "press" constricts the axis while the
        // cross axis bulges; "swell" grows both (the material rises toward
        // the finger instead of compressing).
        const scaleAlong = mode === "swell" ? 1 + stretch : Math.max(0.01, 1 - stretch);
        const scaleAcross = 1 + stretch * volumeConservation;
        element.style.transformOrigin = "center";
        element.style.transform = vertical
          ? `scaleX(${scaleAcross}) scaleY(${scaleAlong})`
          : `scaleX(${scaleAlong}) scaleY(${scaleAcross})`;
        return;
      }

      const scaleAlong = 1 + stretch;
      const scaleAcross = 1 - stretch * volumeConservation;
      // Anchor on the side opposite the pull so the material stretches away
      // from its anchor. Near zero the transform is ~identity, so the origin
      // flip during a bounce zero-crossing is invisible.
      if (vertical) {
        element.style.transformOrigin = deformationPx >= 0 ? "center top" : "center bottom";
        element.style.transform = `translateY(${deformationPx * TRANSLATE_RATIO}px) scaleX(${scaleAcross}) scaleY(${scaleAlong})`;
      } else {
        element.style.transformOrigin = deformationPx >= 0 ? "left center" : "right center";
        element.style.transform = `translateX(${deformationPx * TRANSLATE_RATIO}px) scaleX(${scaleAlong}) scaleY(${scaleAcross})`;
      }
    };

    const computeTarget = (): number => {
      const { maxPx = 10, falloffPx = 80, lagEnabled = false, lagMaxPx } = optionsRef.current;

      if (state.pullPx !== 0) {
        return Math.sign(state.pullPx) * rubberband(Math.abs(state.pullPx), maxPx, falloffPx);
      }
      if (!lagEnabled) return 0;

      const lagCap = lagMaxPx ?? maxPx * 0.4;
      const stretchInput = Math.abs(state.velocity) * LAG_VELOCITY_GAIN_MS;
      return Math.sign(state.velocity) * rubberband(stretchInput, lagCap, LAG_FALLOFF_PX);
    };

    const tick = (frameTime: number) => {
      state.rafId = null;
      const dt = state.lastFrameTime === null ? 16 : frameTime - state.lastFrameTime;
      state.lastFrameTime = frameTime;

      if (state.dragging) {
        // Pointer-move events stop when the pointer rests, so decay the
        // velocity estimate here to let the lag stretch spring back to zero.
        state.velocity *= Math.exp(-Math.max(0, dt) / VELOCITY_DECAY_MS);
        state.spring.target = computeTarget();
      }

      state.spring.step(dt);
      applyTransform(state.spring.position);

      if (!state.dragging && state.spring.isSettled(SETTLE_EPSILON_PX)) {
        state.spring.position = 0;
        state.spring.velocity = 0;
        state.active = false;
        clearTransform();
        return;
      }

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

    return {
      setPull(px: number, velocity?: number) {
        if (!state.dragging) {
          // First pull of a new deformation: latch enabled/reduced-motion and
          // start tracking with the stiff spring.
          state.active = optionsRef.current.enabled !== false && !prefersReducedMotion();
          if (!state.active) return;

          state.dragging = true;
          state.pullPx = 0;
          state.velocity = 0;
          state.spring.setConfig(optionsRef.current.trackSpring ?? GLASS_DEFORMATION_TRACK_SPRING);
          state.spring.target = 0;
          startLoop();
        }
        if (!state.active) return;

        if (velocity !== undefined && Number.isFinite(velocity)) {
          state.velocity = state.velocity * (1 - VELOCITY_SMOOTHING) + velocity * VELOCITY_SMOOTHING;
        }
        state.pullPx = px;
      },
      release() {
        if (!state.active) return;

        state.dragging = false;
        state.pullPx = 0;
        state.velocity = 0;
        state.spring.setConfig(optionsRef.current.releaseSpring ?? GLASS_DEFORMATION_RELEASE_SPRING);
        state.spring.target = 0;
        startLoop();
      },
      cancel() {
        state.dragging = false;
        state.active = false;
        state.pullPx = 0;
        state.velocity = 0;
        state.spring.position = 0;
        state.spring.velocity = 0;
        state.spring.target = 0;
        stopLoop();
        clearTransform();
      },
    };
  }, [targetRef]);

  useEffect(() => () => handle.cancel(), [handle]);

  return handle;
}
