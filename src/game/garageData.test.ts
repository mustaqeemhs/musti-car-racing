import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addWalletCoins,
  GARAGE_KEY,
  purchaseVehicleUpgrade,
  readVehicleUpgrades,
  readWalletBalance,
  saveOwnedVehicles,
  WALLET_KEY,
} from "./garageData";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("guest wallet coin rewards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds rewards to the existing Jaa'izah balance without changing profile data", () => {
    const storage = memoryStorage();
    storage.setItem(
      WALLET_KEY,
      JSON.stringify({ username: "Driver", balance: 250, lastDailyReward: "2026-10-22" }),
    );
    vi.stubGlobal("localStorage", storage);

    expect(addWalletCoins(5)).toBe(255);
    expect(readWalletBalance()).toBe(255);
    expect(JSON.parse(storage.getItem(WALLET_KEY)!).lastDailyReward).toBe("2026-10-22");
  });

  it("creates a musti wallet for a player collecting before creating a guest profile", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);

    expect(addWalletCoins(5)).toBe(5);
    expect(readWalletBalance()).toBe(5);
    expect(JSON.parse(storage.getItem(WALLET_KEY)!).username).toBe("musti");
  });

  it("rejects invalid wallet data without replacing the saved value", () => {
    const storage = memoryStorage();
    storage.setItem(WALLET_KEY, JSON.stringify({ username: "Driver", balance: -2 }));
    vi.stubGlobal("localStorage", storage);

    expect(() => addWalletCoins(5)).toThrow("balance is invalid");
    expect(readWalletBalance()).toBeNull();
    expect(JSON.parse(storage.getItem(WALLET_KEY)!).balance).toBe(-2);
  });
});

describe("vehicle upgrade purchases", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores upgrades independently per owned vehicle and preserves other profile data", () => {
    const storage = memoryStorage();
    storage.setItem(
      WALLET_KEY,
      JSON.stringify({
        username: "Driver",
        balance: 1000,
        lastDailyReward: "2026-10-22",
        progression: { bestScore: 4200 },
      }),
    );
    storage.setItem(GARAGE_KEY, JSON.stringify(["musti-gt", "swift-r"]));
    vi.stubGlobal("localStorage", storage);

    const car = purchaseVehicleUpgrade("musti-gt", "engine", 0);
    const bike = purchaseVehicleUpgrade("swift-r", "engine", 0);
    const profile = JSON.parse(storage.getItem(WALLET_KEY)!);

    expect(car).toMatchObject({
      status: "purchased",
      balance: 700,
      levels: { engine: 1 },
    });
    expect(bike).toMatchObject({
      status: "purchased",
      balance: 400,
      levels: { engine: 1 },
    });
    expect(readVehicleUpgrades("musti-gt").engine).toBe(1);
    expect(readVehicleUpgrades("swift-r").engine).toBe(1);
    expect(readVehicleUpgrades("corsa-rs").engine).toBe(0);
    expect(profile.username).toBe("Driver");
    expect(profile.lastDailyReward).toBe("2026-10-22");
    expect(profile.progression.bestScore).toBe(4200);
  });

  it("rejects unaffordable and stale duplicate purchases without deducting twice", () => {
    const storage = memoryStorage();
    storage.setItem(
      WALLET_KEY,
      JSON.stringify({ username: "Driver", balance: 300, lastDailyReward: "" }),
    );
    vi.stubGlobal("localStorage", storage);

    const purchased = purchaseVehicleUpgrade("musti-gt", "engine", 0);
    const duplicate = purchaseVehicleUpgrade("musti-gt", "engine", 0);
    const unaffordable = purchaseVehicleUpgrade("musti-gt", "engine", 1);

    expect(purchased.status).toBe("purchased");
    expect(duplicate).toMatchObject({ status: "stale-level", balance: 0 });
    expect(unaffordable).toMatchObject({
      status: "insufficient-funds",
      balance: 0,
    });
    expect(readWalletBalance()).toBe(0);
    expect(readVehicleUpgrades("musti-gt").engine).toBe(1);
  });

  it("rejects locked vehicles and prevents upgrades above level five", () => {
    const storage = memoryStorage();
    storage.setItem(
      WALLET_KEY,
      JSON.stringify({
        username: "Driver",
        balance: 5000,
        lastDailyReward: "",
        vehicleUpgrades: { "musti-gt": { engine: 5 } },
      }),
    );
    vi.stubGlobal("localStorage", storage);

    expect(purchaseVehicleUpgrade("corsa-rs", "engine", 0).status).toBe(
      "not-owned",
    );
    expect(purchaseVehicleUpgrade("musti-gt", "engine", 5)).toMatchObject({
      status: "max-level",
      balance: 5000,
      levels: { engine: 5 },
    });
    expect(readWalletBalance()).toBe(5000);
  });

  it("migrates an older guest profile when the first upgrade is purchased", () => {
    const storage = memoryStorage();
    storage.setItem(
      WALLET_KEY,
      JSON.stringify({
        username: "Legacy",
        balance: 400,
        lastDailyReward: "2026-10-20",
        achievementData: { unlocked: ["first-race"] },
      }),
    );
    vi.stubGlobal("localStorage", storage);
    saveOwnedVehicles(["musti-gt"]);

    const purchase = purchaseVehicleUpgrade("musti-gt", "nitro", 0);
    const migrated = JSON.parse(storage.getItem(WALLET_KEY)!);

    expect(purchase).toMatchObject({
      status: "purchased",
      balance: 150,
      levels: { nitro: 1 },
    });
    expect(migrated.username).toBe("Legacy");
    expect(migrated.lastDailyReward).toBe("2026-10-20");
    expect(migrated.achievementData.unlocked).toEqual(["first-race"]);
    expect(migrated.vehicleUpgrades["musti-gt"].nitro).toBe(1);
  });
});
