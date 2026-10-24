import { MAX_SPEED } from "./engine";

export const MAX_UPGRADE_LEVEL = 5;

export const UPGRADE_CATEGORIES = [
  "engine",
  "topSpeed",
  "nitro",
  "handling",
] as const;

export type UpgradeCategory = (typeof UPGRADE_CATEGORIES)[number];
export type VehicleUpgradeLevels = Record<UpgradeCategory, number>;
export type VehicleUpgradeEffects = {
  accelerationMultiplier: number;
  topSpeedMultiplier: number;
  nitroCapacity: number;
  handlingMultiplier: number;
};
export type VehicleBasePerformance = {
  maxSpeedMultiplier: number;
  accelerationMultiplier: number;
  handlingMultiplier: number;
};
export type VehiclePerformance = {
  maxSpeed: number;
  accelerationMultiplier: number;
  handlingMultiplier: number;
  nitroCapacity: number;
};

export const UPGRADE_DEFINITIONS: Record<
  UpgradeCategory,
  { title: string; benefit: string; costs: readonly number[]; perLevel: number }
> = {
  engine: {
    title: "Engine",
    benefit: "acceleration",
    costs: [300, 600, 1000, 1500, 2200],
    perLevel: 0.06,
  },
  topSpeed: {
    title: "Top Speed",
    benefit: "top speed",
    costs: [400, 750, 1200, 1800, 2600],
    perLevel: 0.03,
  },
  nitro: {
    title: "Nitro",
    benefit: "nitro capacity",
    costs: [250, 500, 850, 1300, 1900],
    perLevel: 0.12,
  },
  handling: {
    title: "Handling",
    benefit: "steering response",
    costs: [300, 600, 1000, 1500, 2200],
    perLevel: 0.04,
  },
};

export const EMPTY_UPGRADE_LEVELS: VehicleUpgradeLevels = {
  engine: 0,
  topSpeed: 0,
  nitro: 0,
  handling: 0,
};

export function normalizeUpgradeLevels(value: unknown): VehicleUpgradeLevels {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_UPGRADE_LEVELS };
  }

  const saved = value as Record<string, unknown>;
  const validLevel = (category: UpgradeCategory) => {
    const level = saved[category];
    return typeof level === "number" &&
      Number.isSafeInteger(level) &&
      level >= 0 &&
      level <= MAX_UPGRADE_LEVEL
      ? level
      : 0;
  };
  return {
    engine: validLevel("engine"),
    topSpeed: validLevel("topSpeed"),
    nitro: validLevel("nitro"),
    handling: validLevel("handling"),
  };
}

export function nextUpgradeCost(
  category: UpgradeCategory,
  currentLevel: number,
): number | null {
  if (
    !Number.isSafeInteger(currentLevel) ||
    currentLevel < 0 ||
    currentLevel >= MAX_UPGRADE_LEVEL
  ) {
    return null;
  }
  return UPGRADE_DEFINITIONS[category].costs[currentLevel] ?? null;
}

export function upgradeBenefit(
  category: UpgradeCategory,
  nextLevel: number,
): string {
  const definition = UPGRADE_DEFINITIONS[category];
  const percent = Math.round(definition.perLevel * 100);
  return `+${percent}% ${definition.benefit}`;
}

export function vehicleUpgradeEffects(
  levels: VehicleUpgradeLevels,
): VehicleUpgradeEffects {
  return {
    accelerationMultiplier: 1 + levels.engine * UPGRADE_DEFINITIONS.engine.perLevel,
    topSpeedMultiplier:
      1 + levels.topSpeed * UPGRADE_DEFINITIONS.topSpeed.perLevel,
    nitroCapacity: 1 + levels.nitro * UPGRADE_DEFINITIONS.nitro.perLevel,
    handlingMultiplier:
      1 + levels.handling * UPGRADE_DEFINITIONS.handling.perLevel,
  };
}

export function getVehiclePerformance(
  base: VehicleBasePerformance,
  levels: VehicleUpgradeLevels,
): VehiclePerformance {
  const effects = vehicleUpgradeEffects(levels);
  return {
    maxSpeed:
      MAX_SPEED * base.maxSpeedMultiplier * effects.topSpeedMultiplier,
    accelerationMultiplier:
      base.accelerationMultiplier * effects.accelerationMultiplier,
    handlingMultiplier:
      base.handlingMultiplier * effects.handlingMultiplier,
    nitroCapacity: effects.nitroCapacity,
  };
}
