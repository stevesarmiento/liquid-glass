import {
  type FocusEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { LensParams } from "../../engine/types";

import { prefersReducedMotion, safeReleasePointerCapture, safeSetPointerCapture } from "./shared";

/** How long the pressed cue is held after a release before it relaxes, in ms. */
const DEFAULT_HOLD_MS = 320;
/** Press tween attack duration, in ms. */
const DEFAULT_TWEEN_IN_MS = 150;
/** Press tween release duration, in ms. */
const DEFAULT_TWEEN_OUT_MS = 260;
/** Default pressed-optics boost: lens scale multiplier at full press. */
const DEFAULT_BOOST_SCALE = 1.15;
/** Default pressed-optics boost: additive glow at full press. */
const DEFAULT_BOOST_GLOW = 0.45;
/** Default cap for the boosted glow. */
const DEFAULT_MAX_GLOW = 2;

/** True for the keys that activate a button-like control (Space/Enter). */
export const isGlassActivationKey = (key: string): boolean =>
  key === " " || key === "Enter" || key === "Spacebar";

/**
 * Minimal lens shape `boostLens` operates on. Allows preset lenses that omit
 * derived fields (e.g. `mapSize`, which GlassNode auto-computes).
 */
export type GlassBoostableLens = Partial<LensParams> & Pick<LensParams, "scaleX" | "scaleY" | "glow">;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export interface GlassPressOptions {
  /** Hold duration after release before the pressed cue relaxes. Defaults to 320ms. */
  holdMs?: number;
  /** Press tween attack duration. Defaults to 150ms. */
  tweenInMs?: number;
  /** Press tween release duration. Defaults to 260ms. */
  tweenOutMs?: number;
  /**
   * Gates the press-side `handlers` (pointer down, key down, the pointer-up
   * hold). Release-side handlers stay live so an in-flight press always
   * resolves. The imperative methods are never gated — callers that drive
   * them own their own gating.
   */
  disabled?: boolean;
  /**
   * Externally forces the pressed state (e.g. an `active` prop holding the
   * pressed look for demos). OR-ed with the internal press state; `progress`
   * tweens the combined value.
   */
  forcePressed?: boolean;
  /**
   * When false, `progress` snaps to 0/1 with `pressed` instead of tweening —
   * no rAF, no per-frame re-renders. For consumers that only need the
   * hold/release state machine. Defaults to true.
   */
  tween?: boolean;
}

/** Progress-scaled optics boost applied by `boostLens`. */
export interface GlassLensBoost {
  /** Lens scale multiplier at full press. Defaults to 1.15. */
  scale?: number;
  /** Additive glow at full press. Defaults to 0.45. */
  glow?: number;
  /** Cap for the boosted glow. Defaults to 2. */
  maxGlow?: number;
  /**
   * Quantizes the GLOW term of the tween to this many steps. Glow is the only
   * boosted parameter baked into the displacement map (`mapKey` excludes
   * scaleX/scaleY), so each tween frame at continuous glow generates a fresh
   * O(mapSize²) map. With e.g. 8 steps a full press touches at most 9 map-
   * cache keys — shared by every control with the same optics — while the
   * dominant visible cue (scale) stays perfectly continuous via shader
   * uniforms / feColorMatrix. Endpoints (progress 0 and 1) are always exact.
   * Omit for the legacy continuous glow.
   */
  glowSteps?: number;
}

/**
 * Spreadable press handlers for button-like controls: pointer-capture safety,
 * Space/Enter parity with pointer presses, and the hold-release timer.
 * Composable — call them from your own handlers alongside user callbacks.
 */
export interface GlassPressHandlers<T extends Element = Element> {
  onPointerDown: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
  onLostPointerCapture: PointerEventHandler<T>;
  onKeyDown: KeyboardEventHandler<T>;
  onKeyUp: KeyboardEventHandler<T>;
  onBlur: FocusEventHandler<T>;
}

export interface GlassPress<T extends Element = Element> {
  /** Raw pressed state (includes the post-release hold and `forcePressed`). */
  pressed: boolean;
  /**
   * Tweened 0..1 press progress (rAF, ease-out cubic). Jumps instantly under
   * `prefers-reduced-motion`, or when `tween: false`.
   */
  progress: number;
  /** Ready-made handlers for the simple button-like case. */
  handlers: GlassPressHandlers<T>;
  /** Enters the pressed state and cancels any pending hold-release. */
  press(): void;
  /** Enters the pressed state now and auto-releases after `holdMs`. */
  holdRelease(): void;
  /**
   * Releases only when no hold-release timer is pending (lost-pointer-capture
   * semantics: a completed press keeps its hold). Returns true if it released.
   */
  releaseIfIdle(): boolean;
  /** Releases immediately and clears any pending hold-release. */
  cancel(): void;
  /**
   * Derives progress-boosted optics from resting lens params: lens scale and
   * glow rise with `progress` so a press intensifies the refraction instead
   * of swapping maps. With default boosts this matches the glass pressed cue
   * (scale ×1.15, +0.45 glow, capped at 2).
   */
  boostLens<L extends GlassBoostableLens>(lens: L, boost?: GlassLensBoost): L;
}

/**
 * Tweens 0..1 toward the pressed state with rAF so pressed cues are fluid
 * instead of a one-frame swap. Jumps instantly under reduced motion. When
 * `enabled` is false the tween is bypassed entirely (the caller derives the
 * snapped value), so no per-frame state updates occur.
 */
function usePressProgress(pressed: boolean, inMs: number, outMs: number, enabled: boolean): number {
  const [progress, setProgress] = useState(pressed ? 1 : 0);
  const progressRef = useRef(progress);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const target = pressed ? 1 : 0;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (progressRef.current === target) return undefined;
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      progressRef.current = target;
      setProgress(target);
      return undefined;
    }

    const from = progressRef.current;
    const duration = target > from ? inMs : outMs;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const value = from + (target - from) * easeOutCubic(t);
      progressRef.current = value;
      setProgress(value);
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [enabled, inMs, outMs, pressed]);

  return progress;
}

/**
 * The glass press state machine: pressed state with a post-release hold (the
 * material stays excited for `holdMs` after a release), a rAF press tween for
 * fluid optics, and a progress-scaled lens boost.
 *
 * Two ways to consume it:
 * - Spread-style via `handlers` for button-like controls — pointer capture,
 *   Space/Enter parity, and the hold-release timer are wired up.
 * - Imperatively via `press`/`holdRelease`/`releaseIfIdle`/`cancel` for
 *   controls with their own gesture handling (drags, custom click logic).
 */
export function useGlassPress<T extends Element = Element>(
  options: GlassPressOptions = {},
): GlassPress<T> {
  const {
    holdMs = DEFAULT_HOLD_MS,
    tweenInMs = DEFAULT_TWEEN_IN_MS,
    tweenOutMs = DEFAULT_TWEEN_OUT_MS,
    forcePressed = false,
    tween = true,
  } = options;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [isPressed, setIsPressed] = useState(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
      }
    },
    [],
  );

  const methods = useMemo(() => {
    const clearReleaseTimer = () => {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };

    const press = () => {
      clearReleaseTimer();
      setIsPressed(true);
    };

    const holdRelease = () => {
      setIsPressed(true);
      clearReleaseTimer();
      releaseTimerRef.current = setTimeout(() => {
        setIsPressed(false);
        releaseTimerRef.current = null;
      }, optionsRef.current.holdMs ?? DEFAULT_HOLD_MS);
    };

    const releaseIfIdle = () => {
      if (releaseTimerRef.current !== null) return false;
      setIsPressed(false);
      return true;
    };

    const cancel = () => {
      clearReleaseTimer();
      setIsPressed(false);
    };

    const handlers: GlassPressHandlers<T> = {
      onPointerDown(event) {
        if (optionsRef.current.disabled) return;
        press();
        safeSetPointerCapture(event.currentTarget, event.pointerId);
      },
      onPointerUp(event) {
        if (!optionsRef.current.disabled) {
          holdRelease();
        }
        safeReleasePointerCapture(event.currentTarget, event.pointerId);
      },
      onPointerCancel(event) {
        cancel();
        safeReleasePointerCapture(event.currentTarget, event.pointerId);
      },
      onLostPointerCapture() {
        releaseIfIdle();
      },
      onKeyDown(event) {
        if (optionsRef.current.disabled || event.repeat || !isGlassActivationKey(event.key)) return;
        press();
      },
      onKeyUp(event) {
        // Deliberately not gated on `disabled`: key events never reach truly
        // disabled controls, and soft-disabled states (e.g. loading) still
        // resolve an in-flight press with the hold cue.
        if (isGlassActivationKey(event.key)) holdRelease();
      },
      onBlur() {
        cancel();
      },
    };

    return { cancel, handlers, holdRelease, press, releaseIfIdle };
  }, []);

  const pressed = isPressed || forcePressed;
  const tweenedProgress = usePressProgress(pressed, tweenInMs, tweenOutMs, tween);
  const progress = tween ? tweenedProgress : pressed ? 1 : 0;

  return {
    pressed,
    progress,
    handlers: methods.handlers,
    press: methods.press,
    holdRelease: methods.holdRelease,
    releaseIfIdle: methods.releaseIfIdle,
    cancel: methods.cancel,
    boostLens<L extends GlassBoostableLens>(lens: L, boost?: GlassLensBoost): L {
      const scale = boost?.scale ?? DEFAULT_BOOST_SCALE;
      const glow = boost?.glow ?? DEFAULT_BOOST_GLOW;
      const maxGlow = boost?.maxGlow ?? DEFAULT_MAX_GLOW;
      const glowSteps = boost?.glowSteps;
      const glowProgress =
        glowSteps && glowSteps > 0 ? Math.round(progress * glowSteps) / glowSteps : progress;
      return {
        ...lens,
        scaleX: lens.scaleX * (1 + (scale - 1) * progress),
        scaleY: lens.scaleY * (1 + (scale - 1) * progress),
        glow: Math.min(maxGlow, lens.glow + glow * glowProgress),
      };
    },
  };
}
