import { describe, it, expect } from "vitest";
import { overlaps, pickLane } from "./engine";

describe("engine", () => {
  it("detects overlapping cars", () => {
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 10, y: 10, w: 40, h: 80 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 100, y: 0, w: 40, h: 80 })).toBe(false);
  });
  it("never blocks the last open lane", () => {
    expect(pickLane(4, new Set([0, 1, 2]), Math.random)).toBeNull();
    expect(pickLane(4, new Set([0, 1]), () => 0)).toBe(2);
  });
});
