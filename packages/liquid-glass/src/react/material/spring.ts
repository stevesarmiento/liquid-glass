/**
 * Minimal damped-spring simulation used for material deformation physics
 * (apex rubberband stretch + release bounce). Pure and unit-testable: no DOM,
 * no timers — callers feed frame deltas into `step`.
 */

export interface SpringConfig {
  /** Restoring force coefficient, in 1/s² (react-spring-style magnitudes). */
  stiffness: number;
  /** Velocity damping coefficient, in 1/s. */
  damping: number;
  /** Simulated mass. Defaults to 1. */
  mass?: number;
}

export interface Spring {
  /** Current position, in the caller's units (px here). */
  position: number;
  /** Current velocity, in units per second. */
  velocity: number;
  /** Position the spring is pulled toward. */
  target: number;
  /** Swaps the spring constants without disturbing position/velocity. */
  setConfig(config: SpringConfig): void;
  /**
   * Advances the simulation by `dtMs` milliseconds using semi-implicit Euler
   * integration. Deltas are clamped to a sane total and split into sub-steps
   * of at most 32ms so a background-tab frame can't explode the integrator.
   * Returns the new position.
   */
  step(dtMs: number): number;
  /**
   * True when the spring has effectively come to rest at its target: the
   * position is within `epsilon` px of the target and the per-frame travel
   * (velocity × one 60fps frame) is also below `epsilon`.
   */
  isSettled(epsilon?: number): boolean;
}

/** Largest integration sub-step, in ms. */
const MAX_SUBSTEP_MS = 32;
/** Largest total delta consumed by a single `step` call, in ms. */
const MAX_FRAME_MS = 128;
/** Seconds in one 60fps frame; used to convert velocity for the settle test. */
const SETTLE_FRAME_S = 1 / 60;

export function createSpring(initialConfig: SpringConfig): Spring {
  let stiffness = initialConfig.stiffness;
  let damping = initialConfig.damping;
  let mass = initialConfig.mass ?? 1;
  let position = 0;
  let velocity = 0;
  let target = 0;

  return {
    get position() {
      return position;
    },
    set position(next: number) {
      position = next;
    },
    get velocity() {
      return velocity;
    },
    set velocity(next: number) {
      velocity = next;
    },
    get target() {
      return target;
    },
    set target(next: number) {
      target = next;
    },
    setConfig(config: SpringConfig) {
      stiffness = config.stiffness;
      damping = config.damping;
      mass = config.mass ?? 1;
    },
    step(dtMs: number) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) return position;

      const totalMs = Math.min(dtMs, MAX_FRAME_MS);
      const substeps = Math.ceil(totalMs / MAX_SUBSTEP_MS);
      const h = totalMs / substeps / 1000;

      for (let i = 0; i < substeps; i += 1) {
        const acceleration = (-stiffness * (position - target) - damping * velocity) / mass;
        velocity += acceleration * h;
        position += velocity * h;
      }

      return position;
    },
    isSettled(epsilon = 0.01) {
      return (
        Math.abs(position - target) <= epsilon && Math.abs(velocity) * SETTLE_FRAME_S <= epsilon
      );
    }
  };
}

/**
 * Diminishing-returns pull used when dragging past a clamp point, mirroring
 * iOS scroll-edge resistance: `maxPx * overshoot / (overshoot + falloffPx)`.
 * Returns 0 at zero overshoot and asymptotically approaches `maxPx`, never
 * reaching it. Monotonically increasing in `overshootPx`.
 */
export function rubberband(overshootPx: number, maxPx: number, falloffPx: number): number {
  if (overshootPx <= 0) return 0;
  return (maxPx * overshootPx) / (overshootPx + falloffPx);
}
