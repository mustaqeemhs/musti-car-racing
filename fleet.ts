/** Which vehicles the player owns, which one is picked, and each vehicle's upgrade levels. */

export const FLEET_KEY = "musti-fleet-v2";
export const MAX_UPGRADE_LEVEL_CAP = 10;

export type UpgradeLevels = Record<string, number>;

export type FleetState = {
  owned: string[];
  selected: string;
  upgrades: Record<string, UpgradeLevels>;
};

export type FleetVehicle = { id: string; price: number; cat?: string };

export function starterFleet(starterIds: string[]): FleetState {
  return { owned: [...starterIds], selected: starterIds[0] ?? "", upgrades: {} };
}

/** Reads saved data safely. Unknown vehicles are dropped and the starters are always owned. */
export function parseFleet(raw: string | null, validIds: string[], starterIds: string[]): FleetState {
  const fallback = starterFleet(starterIds);
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<FleetState>;
    const owned = new Set<string>(starterIds);
    if (Array.isArray(value.owned)) {
      for (const id of value.owned) if (typeof id === "string" && validIds.includes(id)) owned.add(id);
    }
    const upgrades: Record<string, UpgradeLevels> = {};
    if (value.upgrades && typeof value.upgrades === "object") {
      for (const [id, levels] of Object.entries(value.upgrades)) {
        if (!validIds.includes(id) || typeof levels !== "object" || levels === null) continue;
        const clean: UpgradeLevels = {};
        for (const [category, level] of Object.entries(levels)) {
          if (typeof level === "number" && Number.isInteger(level) && level > 0) {
            clean[category] = Math.min(MAX_UPGRADE_LEVEL_CAP, level);
          }
        }
        upgrades[id] = clean;
      }
    }
    const selected =
      typeof value.selected === "string" && owned.has(value.selected) ? value.selected : fallback.selected;
    return { owned: [...owned], selected, upgrades };
  } catch {
    return fallback;
  }
}

export function levelsFor(state: FleetState, vehicleId: string): UpgradeLevels {
  return state.upgrades[vehicleId] ?? {};
}

export type BuyVehicleResult =
  | { ok: true; state: FleetState; balance: number }
  | { ok: false; reason: "owned" | "funds" | "unknown"; missing?: number };

export function buyVehicle(
  state: FleetState,
  vehicle: FleetVehicle | undefined,
  balance: number,
): BuyVehicleResult {
  if (!vehicle) return { ok: false, reason: "unknown" };
  if (state.owned.includes(vehicle.id)) return { ok: false, reason: "owned" };
  if (balance < vehicle.price) return { ok: false, reason: "funds", missing: vehicle.price - balance };
  return {
    ok: true,
    balance: balance - vehicle.price,
    state: { ...state, owned: [...state.owned, vehicle.id], selected: vehicle.id },
  };
}

export function selectVehicle(state: FleetState, vehicleId: string): FleetState | null {
  return state.owned.includes(vehicleId) ? { ...state, selected: vehicleId } : null;
}

/** Faster, more expensive vehicles cost more to upgrade (1x for free vehicles up to 4x). */
export function upgradeCostMultiplier(vehiclePrice: number): number {
  return 1 + Math.min(3, Math.max(0, vehiclePrice) / 6000);
}

/** The upgrade price for this vehicle, rounded to 10. Null when the upgrade is already at its maximum. */
export function scaledUpgradeCost(baseCost: number | null, vehiclePrice: number): number | null {
  if (baseCost === null) return null;
  return Math.max(10, Math.round((baseCost * upgradeCostMultiplier(vehiclePrice)) / 10) * 10);
}

export type BuyUpgradeResult =
  | { status: "purchased"; state: FleetState; balance: number; level: number }
  | { status: "max-level" | "insufficient-funds" | "not-owned" };

export function buyUpgrade(
  state: FleetState,
  vehicleId: string,
  category: string,
  cost: number | null,
  balance: number,
  maxLevel: number,
): BuyUpgradeResult {
  if (!state.owned.includes(vehicleId)) return { status: "not-owned" };
  const level = levelsFor(state, vehicleId)[category] ?? 0;
  if (cost === null || level >= maxLevel) return { status: "max-level" };
  if (balance < cost) return { status: "insufficient-funds" };
  const levels = { ...levelsFor(state, vehicleId), [category]: level + 1 };
  return {
    status: "purchased",
    level: level + 1,
    balance: balance - cost,
    state: { ...state, upgrades: { ...state.upgrades, [vehicleId]: levels } },
  };
}

/** Shows how much an upgrade changes a stat: +12% becomes "+6" on a 0..100 bar. */
export function statBonus(base: number, ratio: number): number {
  return Math.round(base * (ratio - 1));
}
