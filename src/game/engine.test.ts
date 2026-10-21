import { describe, it, expect } from "vitest";
import { accelRate, overlaps, pickLane, tiltToSteer } from "./engine";

describe("engine", () => {
  it("detects overlapping cars", () => {
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 10, y: 10, w: 40, h: 80 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 100, y: 0, w: 40, h: 80 })).toBe(false);
  });
  it("never blocks the last open lane", () => {
    expect(pickLane(4, new Set([0, 1, 2]), Math.random)).toBeNull();
    expect(pickLane(4, new Set([0, 1]), () => 0)).toBe(2);
  });
  it("tilt inside the deadzone does not steer", () => {
    expect(tiltToSteer(12, 10, 1, 3)).toBe(0);
  });
  it("tilt steers relative to calibrated neutral and clamps", () => {
    expect(tiltToSteer(40, 10, 1, 3)).toBe(1);
    expect(tiltToSteer(-50, 10, 1, 3)).toBe(-1);
    expect(tiltToSteer(23.5, 10, 1, 3)).toBeCloseTo(0.4, 2);
  });
  it("acceleration slows near top speed and nitro accelerates harder", () => {
    expect(accelRate(1200, false)).toBeLessThan(accelRate(200, false));
    expect(accelRate(500, true)).toBeGreaterThan(accelRate(500, false));
  });
});
