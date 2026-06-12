import { afterEach, describe, expect, it } from "vitest";

import {
  createGlassQualityGovernor,
  getGlassQualityLevel,
  resetGlassQualityForTests,
  setGlassQualityOverride,
} from "./quality";

afterEach(() => {
  resetGlassQualityForTests();
});

describe("createGlassQualityGovernor", () => {
  // dwellMs deliberately longer than a 30-frame × 40ms feed (1200ms) so a
  // single feed can change the level at most once.
  const options = {
    degradeAboveMs: 24,
    upgradeBelowMs: 14,
    degradeFrames: 5,
    upgradeFrames: 10,
    dwellMs: 2000,
  };

  function feed(governor: ReturnType<typeof createGlassQualityGovernor>, deltaMs: number, frames: number, startAt: number) {
    let now = startAt;
    for (let i = 0; i < frames; i += 1) {
      now += deltaMs;
      governor.step(deltaMs, now);
    }
    return now;
  }

  it("starts at full quality and stays there under budget", () => {
    const governor = createGlassQualityGovernor(options);
    feed(governor, 16, 50, 0);
    expect(governor.level).toBe(0);
  });

  it("degrades after sustained over-budget frames, one level per dwell", () => {
    const governor = createGlassQualityGovernor(options);
    // EMA needs a few frames to cross the threshold, then degradeFrames more.
    let now = feed(governor, 40, 30, 0);
    expect(governor.level).toBe(1);
    // Continues degrading after the dwell elapses.
    now = feed(governor, 40, 30, now + options.dwellMs);
    expect(governor.level).toBe(2);
    now = feed(governor, 40, 30, now + options.dwellMs);
    expect(governor.level).toBe(3);
    // Never past 3.
    feed(governor, 40, 60, now + options.dwellMs);
    expect(governor.level).toBe(3);
  });

  it("upgrades slowly after sustained under-budget frames", () => {
    const governor = createGlassQualityGovernor(options);
    let now = feed(governor, 40, 30, 0);
    expect(governor.level).toBe(1);
    // A short fast burst is NOT enough: the EMA must decay below the upgrade
    // threshold, the dwell must expire, and upgradeFrames must accumulate.
    now = feed(governor, 8, 5, now);
    expect(governor.level).toBe(1);
    // Sustained fast frames eventually upgrade back to 0.
    feed(governor, 8, 400, now);
    expect(governor.level).toBe(0);
  });

  it("treats large gaps as scheduling pauses, not jank", () => {
    const governor = createGlassQualityGovernor(options);
    for (let i = 0; i < 60; i += 1) {
      governor.step(5000, i * 5000); // hidden-tab style gaps
    }
    expect(governor.level).toBe(0);
  });

  it("respects the dwell between changes", () => {
    const governor = createGlassQualityGovernor(options);
    const now = feed(governor, 40, 30, 0);
    expect(governor.level).toBe(1);
    // Immediately after the change, more bad frames must NOT change the level
    // again until dwellMs has passed.
    feed(governor, 40, 2, now);
    expect(governor.level).toBe(1);
  });
});

describe("setGlassQualityOverride", () => {
  it("pins the effective level and returns to adaptive on null", () => {
    expect(getGlassQualityLevel()).toBe(0);
    setGlassQualityOverride(2);
    expect(getGlassQualityLevel()).toBe(2);
    setGlassQualityOverride(null);
    expect(getGlassQualityLevel()).toBe(0);
  });
});
