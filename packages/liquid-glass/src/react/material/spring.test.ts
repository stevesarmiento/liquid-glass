import { describe, expect, it } from "vitest";

import { createSpring, rubberband } from "./spring";

/** Runs the spring at a fixed frame delta and returns the trace of positions. */
function simulate(spring: ReturnType<typeof createSpring>, frames: number, dtMs = 16): number[] {
  const trace: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    trace.push(spring.step(dtMs));
  }
  return trace;
}

describe("createSpring", () => {
  it("converges to its target and settles", () => {
    const spring = createSpring({ stiffness: 600, damping: 38 });
    spring.target = 10;

    simulate(spring, 250); // 4s at 60fps

    expect(spring.position).toBeCloseTo(10, 3);
    expect(spring.isSettled(0.01)).toBe(true);
  });

  it("overshoots at least once before settling when underdamped (the bounce)", () => {
    const spring = createSpring({ stiffness: 380, damping: 16 });
    spring.position = 8; // deformed state at release
    spring.target = 0;

    const trace = simulate(spring, 250);

    // The bounce: position must cross through the target and swing past it.
    const minPosition = Math.min(...trace);
    expect(minPosition).toBeLessThan(-0.5);
    // ...and still come to rest at the target afterwards.
    expect(spring.position).toBeCloseTo(0, 3);
    expect(spring.isSettled(0.01)).toBe(true);
  });

  it("does not overshoot noticeably with the stiff drag-tracking config", () => {
    const spring = createSpring({ stiffness: 600, damping: 38 });
    spring.target = 10;

    const trace = simulate(spring, 250);

    // Near-critically damped: any overshoot stays a small fraction of the travel.
    expect(Math.max(...trace)).toBeLessThan(10 * 1.12);
  });

  it("splits large deltas into sub-steps deterministically", () => {
    const a = createSpring({ stiffness: 600, damping: 38 });
    const b = createSpring({ stiffness: 600, damping: 38 });
    a.target = 10;
    b.target = 10;

    // 64ms is split into two 32ms sub-steps, identical to two 32ms calls.
    a.step(64);
    b.step(32);
    b.step(32);

    expect(a.position).toBeCloseTo(b.position, 12);
    expect(a.velocity).toBeCloseTo(b.velocity, 12);
  });

  it("clamps absurd deltas and stays finite", () => {
    const spring = createSpring({ stiffness: 600, damping: 38 });
    spring.target = 10;

    const afterHugeStep = spring.step(1_000_000);

    expect(Number.isFinite(afterHugeStep)).toBe(true);
    expect(Number.isFinite(spring.velocity)).toBe(true);
    // A single (clamped) step cannot teleport straight onto the target settled.
    expect(spring.isSettled(0.0001)).toBe(false);
  });

  it("ignores zero, negative, and non-finite deltas", () => {
    const spring = createSpring({ stiffness: 600, damping: 38 });
    spring.position = 3;
    spring.target = 10;

    expect(spring.step(0)).toBe(3);
    expect(spring.step(-50)).toBe(3);
    expect(spring.step(Number.NaN)).toBe(3);
    expect(spring.velocity).toBe(0);
  });

  it("retains position and velocity across setConfig", () => {
    const spring = createSpring({ stiffness: 600, damping: 38 });
    spring.target = 10;
    simulate(spring, 5);

    const position = spring.position;
    const velocity = spring.velocity;
    spring.setConfig({ stiffness: 380, damping: 16 });

    expect(spring.position).toBe(position);
    expect(spring.velocity).toBe(velocity);
  });
});

describe("rubberband", () => {
  it("returns 0 at zero or negative overshoot", () => {
    expect(rubberband(0, 10, 80)).toBe(0);
    expect(rubberband(-25, 10, 80)).toBe(0);
  });

  it("is monotonically increasing", () => {
    const samples = [1, 10, 40, 120, 300, 1000, 10_000];
    const values = samples.map((overshoot) => rubberband(overshoot, 10, 80));

    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1] ?? Number.POSITIVE_INFINITY);
    }
  });

  it("is bounded by maxPx and approaches it asymptotically", () => {
    expect(rubberband(40, 10, 80)).toBeLessThan(10);
    expect(rubberband(1_000_000, 10, 80)).toBeLessThan(10);
    expect(rubberband(1_000_000, 10, 80)).toBeGreaterThan(9.99);
  });

  it("matches the documented falloff curve", () => {
    expect(rubberband(40, 10, 80)).toBeCloseTo(10 * (40 / 120), 10);
    expect(rubberband(120, 10, 80)).toBeCloseTo(10 * (120 / 200), 10);
    expect(rubberband(300, 10, 80)).toBeCloseTo(10 * (300 / 380), 10);
  });
});
