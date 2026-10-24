import { describe, expect, it } from "vitest";
import { MAX_SPEED, accelRate, pickupBoost } from "./engine";
import {
  EMPTY_UPGRADE_LEVELS,
  MAX_UPGRADE_LEVEL,
  UPGRADE_CATEGORIES,
  UPGRADE_DEFINITIONS,
  getVehiclePerformance,
  nextUpgradeCost,
  normalizeUpgradeLevels,
  upgradeBenefit,
} from "./vehicleUpgrades";

describe("vehicle upgrade tuning", () => {
  it("exposes five increasing purchase tiers and no cost beyond max level", () => {
    for (const category of UPGRADE_CATEGORIES) {
      const costs = UPGRADE_DEFINITIONS[category].costs;
      expect(costs).toHaveLength(MAX_UPGRADE_LEVEL);
      expect(costs.every((cost, index) => index === 0 || cost > costs[index - 1]!)).toBe(true);
      costs.forEach((cost, index) => {
        expect(nextUpgradeCost(category, index)).toBe(cost);
      });
      expect(nextUpgradeCost(category, MAX_UPGRADE_LEVEL)).toBeNull();
    }
  });

  it("converts upgrade levels into the actual vehicle speed, acceleration, handling and nitro stats", () => {
    const tuned = getVehiclePerformance(
      {
        maxSpeedMultiplier: 1.1,
        accelerationMultiplier: 1.2,
        handlingMultiplier: 0.9,
      },
      { engine: 2, topSpeed: 3, nitro: 4, handling: 5 },
    );

    expect(tuned.maxSpeed).toBeCloseTo(MAX_SPEED * 1.1 * 1.09);
    expect(tuned.accelerationMultiplier).toBeCloseTo(1.2 * 1.12);
    expect(tuned.handlingMultiplier).toBeCloseTo(0.9 * 1.2);
    expect(tuned.nitroCapacity).toBeCloseTo(1.48);

    const base = getVehiclePerformance(
      {
        maxSpeedMultiplier: 1.1,
        accelerationMultiplier: 1.2,
        handlingMultiplier: 0.9,
      },
      EMPTY_UPGRADE_LEVELS,
    );
    expect(tuned.maxSpeed).toBeGreaterThan(base.maxSpeed);
    expect(
      accelRate(600, false, tuned.maxSpeed) * tuned.accelerationMultiplier,
    ).toBeGreaterThan(
      accelRate(600, false, base.maxSpeed) * base.accelerationMultiplier,
    );
  });

  it("uses capacity upgrades for full nitro and pickup refills", () => {
    const capacity = getVehiclePerformance(
      {
        maxSpeedMultiplier: 1,
        accelerationMultiplier: 1,
        handlingMultiplier: 1,
      },
      { ...EMPTY_UPGRADE_LEVELS, nitro: 5 },
    ).nitroCapacity;

    expect(capacity).toBeCloseTo(1.6);
    expect(pickupBoost(1.2, 0.34 * capacity, capacity)).toBeCloseTo(1.6);
  });

  it("defaults missing and invalid saved levels to base tuning", () => {
    expect(normalizeUpgradeLevels(null)).toEqual(EMPTY_UPGRADE_LEVELS);
    expect(
      normalizeUpgradeLevels({
        engine: 2,
        topSpeed: 6,
        nitro: -1,
        handling: 1.5,
      }),
    ).toEqual({
      engine: 2,
      topSpeed: 0,
      nitro: 0,
      handling: 0,
    });
    expect(upgradeBenefit("handling", 1)).toBe("+4% steering response");
  });
});
