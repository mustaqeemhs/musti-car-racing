import { VEHICLE_DEFS } from "./carArt";
import {
  EMPTY_UPGRADE_LEVELS,
  MAX_UPGRADE_LEVEL,
  UPGRADE_CATEGORIES,
  nextUpgradeCost,
  normalizeUpgradeLevels,
  type UpgradeCategory,
  type VehicleUpgradeLevels,
} from "./vehicleUpgrades";

export const WALLET_KEY = "musti-car-racing-guest-v1";
export const GARAGE_KEY = "musti-car-racing-garage-v1";

export const VEHICLE_PRICES: Record<string, number> = {
  "musti-gt": 0,
  "vulcan-x": 2500,
  "corsa-rs": 1600,
  "brute-502": 1800,
  "metro-dx": 800,
  "ridge-4x4": 1200,
  "swift-r": 2200,
  "street-atom": 1400,
  "dune-hopper": 1100,
  "longhaul-gt": 1500,
};

export const STARTER_VEHICLE = "musti-gt";

export type UpgradePurchaseResult =
  | {
      status: "purchased";
      balance: number;
      levels: VehicleUpgradeLevels;
    }
  | {
      status: "not-owned" | "insufficient-funds" | "max-level" | "stale-level" | "missing-wallet";
      balance: number | null;
      levels: VehicleUpgradeLevels;
    };

export function readWalletBalance(): number | null {
  const saved = localStorage.getItem(WALLET_KEY);
  if (!saved) return null;

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const balance = (parsed as Record<string, unknown>)["balance"];
    return typeof balance === "number" &&
      Number.isSafeInteger(balance) &&
      balance >= 0
      ? balance
      : null;
  } catch {
    return null;
  }
}

export function addWalletCoins(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("Coin rewards must be a positive safe integer.");
  }

  const saved = localStorage.getItem(WALLET_KEY);
  let profile: Record<string, unknown>;

  if (saved === null) {
    profile = { username: "musti", balance: 0, lastDailyReward: "" };
  } else {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The saved guest wallet is invalid.");
    }

    const balance = (parsed as Record<string, unknown>)["balance"];
    if (
      typeof balance !== "number" ||
      !Number.isSafeInteger(balance) ||
      balance < 0
    ) {
      throw new Error("The saved guest wallet balance is invalid.");
    }

    profile = parsed as Record<string, unknown>;
  }

  const nextBalance = (profile["balance"] as number) + amount;
  if (!Number.isSafeInteger(nextBalance)) {
    throw new RangeError("The guest wallet balance is too large.");
  }

  localStorage.setItem(
    WALLET_KEY,
    JSON.stringify({
      ...profile,
      username: typeof profile["username"] === "string" ? profile["username"] : "Racer",
      lastDailyReward:
        typeof profile["lastDailyReward"] === "string" ? profile["lastDailyReward"] : "",
      balance: nextBalance,
    }),
  );
  return nextBalance;
}

export function readOwnedVehicles(): string[] {
  try {
    const saved = localStorage.getItem(GARAGE_KEY);
    if (!saved) return [STARTER_VEHICLE];

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [STARTER_VEHICLE];

    const validIds = new Set(VEHICLE_DEFS.map((vehicle) => vehicle.id));
    const owned = parsed.filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );

    return Array.from(new Set([STARTER_VEHICLE, ...owned]));
  } catch {
    return [STARTER_VEHICLE];
  }
}

export function saveOwnedVehicles(owned: string[]) {
  localStorage.setItem(GARAGE_KEY, JSON.stringify(owned));
}

export function readSelectedVehicle(): string {
  try {
    const selected = localStorage.getItem("musti-car-racing-selected-v1");
    return readOwnedVehicles().includes(selected ?? "")
      ? selected!
      : STARTER_VEHICLE;
  } catch {
    return STARTER_VEHICLE;
  }
}

export function saveSelectedVehicle(id: string) {
  localStorage.setItem("musti-car-racing-selected-v1", id);
}

function readGuestProfile(): Record<string, unknown> | null {
  const saved = localStorage.getItem(WALLET_KEY);
  if (!saved) return null;
  const parsed: unknown = JSON.parse(saved);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The saved guest wallet is invalid.");
  }
  return parsed as Record<string, unknown>;
}

function readUpgradeMap(
  profile: Record<string, unknown> | null,
): Record<string, VehicleUpgradeLevels> {
  const rawMap = profile?.["vehicleUpgrades"];
  const validVehicleIds = new Set(VEHICLE_DEFS.map(({ id }) => id));
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    return {};
  }

  const upgrades: Record<string, VehicleUpgradeLevels> = {};
  for (const [vehicleId, levels] of Object.entries(rawMap)) {
    if (validVehicleIds.has(vehicleId)) {
      upgrades[vehicleId] = normalizeUpgradeLevels(levels);
    }
  }
  return upgrades;
}

export function readVehicleUpgrades(vehicleId: string): VehicleUpgradeLevels {
  if (!VEHICLE_DEFS.some(({ id }) => id === vehicleId)) {
    return { ...EMPTY_UPGRADE_LEVELS };
  }
  try {
    const profile = readGuestProfile();
    return readUpgradeMap(profile)[vehicleId] ?? { ...EMPTY_UPGRADE_LEVELS };
  } catch {
    return { ...EMPTY_UPGRADE_LEVELS };
  }
}

export function purchaseVehicleUpgrade(
  vehicleId: string,
  category: UpgradeCategory,
  expectedLevel: number,
): UpgradePurchaseResult {
  if (!VEHICLE_DEFS.some(({ id }) => id === vehicleId)) {
    throw new Error("Unknown vehicle.");
  }
  if (!UPGRADE_CATEGORIES.includes(category)) {
    throw new Error("Unknown vehicle upgrade.");
  }
  if (
    !Number.isSafeInteger(expectedLevel) ||
    expectedLevel < 0 ||
    expectedLevel > MAX_UPGRADE_LEVEL
  ) {
    throw new RangeError("The expected upgrade level is invalid.");
  }

  const levelsWithoutProfile = { ...EMPTY_UPGRADE_LEVELS };
  if (!readOwnedVehicles().includes(vehicleId)) {
    return {
      status: "not-owned",
      balance: readWalletBalance(),
      levels: readVehicleUpgrades(vehicleId),
    };
  }

  const profile = readGuestProfile();
  if (!profile) {
    return {
      status: "missing-wallet",
      balance: null,
      levels: levelsWithoutProfile,
    };
  }

  const balance = profile["balance"];
  if (
    typeof balance !== "number" ||
    !Number.isSafeInteger(balance) ||
    balance < 0
  ) {
    throw new Error("The saved guest wallet balance is invalid.");
  }

  const upgradeMap = readUpgradeMap(profile);
  const levels = upgradeMap[vehicleId] ?? { ...EMPTY_UPGRADE_LEVELS };
  const currentLevel = levels[category];
  const cost = nextUpgradeCost(category, currentLevel);
  if (cost === null) {
    return { status: "max-level", balance, levels };
  }
  if (currentLevel !== expectedLevel) {
    return { status: "stale-level", balance, levels };
  }
  if (balance < cost) {
    return { status: "insufficient-funds", balance, levels };
  }

  const nextLevels = { ...levels, [category]: currentLevel + 1 };
  const nextBalance = balance - cost;
  localStorage.setItem(
    WALLET_KEY,
    JSON.stringify({
      ...profile,
      balance: nextBalance,
      vehicleUpgrades: {
        ...upgradeMap,
        [vehicleId]: nextLevels,
      },
    }),
  );
  return { status: "purchased", balance: nextBalance, levels: nextLevels };
}
