import { describe, expect, it } from "vitest";
import { exhaustPipes, flameIntensity } from "./exhaust";

describe("exhaust flames", () => {
  it("shows no flame when crawling, more flame when fast, full flame with nitro", () => {
    expect(flameIntensity(0.1, false)).toBe(0);
    expect(flameIntensity(0.5, false)).toBeGreaterThan(0.3);
    expect(flameIntensity(0.9, false)).toBe(1);
    expect(flameIntensity(0.1, true)).toBe(1);
  });

  it("puts two exhaust tips on a car and one on a bike, at the back", () => {
    const car = exhaustPipes("car", 60, 110);
    expect(car).toHaveLength(2);
    expect(car[0]!.x).toBeLessThan(0);
    expect(car[1]!.x).toBeGreaterThan(0);
    expect(car[0]!.y).toBeGreaterThan(0);
    const bike = exhaustPipes("bike", 30, 110);
    expect(bike).toHaveLength(1);
    expect(bike[0]!.y).toBeGreaterThan(0);
  });
});
