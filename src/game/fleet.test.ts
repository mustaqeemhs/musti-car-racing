import { describe, expect, it } from "vitest";
import {
  buyUpgrade,
  buyVehicle,
  levelsFor,
  parseFleet,
  scaledUpgradeCost,
  selectVehicle,
  starterFleet,
  statBonus,
  upgradeCostMultiplier,
} from "./fleet";

const ids = ["musti-gt", "yamaha-r1", "huracan-sto", "bugatti-chiron"];
const starters = ["musti-gt", "yamaha-r1"];

describe("fleet", () => {
  it("starts with one car and one bike", () => {
    const fleet = starterFleet(starters);
    expect(fleet.owned).toEqual(starters);
    expect(fleet.selected).toBe("musti-gt");
  });

  it("cleans saved data and always keeps the starters", () => {
    const fleet = parseFleet(
      JSON.stringify({ owned: ["huracan-sto", "ghost-car", 5], selected: "ghost-car", upgrades: { "huracan-sto": { engine: 3, bad: -2, tyres: 99 }, ghost: { engine: 1 } } }),
      ids,
      starters,
    );
    expect(fleet.owned.sort()).toEqual(["huracan-sto", "musti-gt", "yamaha-r1"]);
    expect(fleet.selected).toBe("musti-gt");
    expect(fleet.upgrades["huracan-sto"]).toEqual({ engine: 3, tyres: 10 });
    expect(fleet.upgrades["ghost"]).toBeUndefined();
    expect(parseFleet("not json", ids, starters)).toEqual(starterFleet(starters));
    expect(parseFleet(null, ids, starters)).toEqual(starterFleet(starters));
  });

  it("buys a vehicle only with enough Jaa'izah and only once", () => {
    const fleet = starterFleet(starters);
    const sto = { id: "huracan-sto", price: 1800 };
    const poor = buyVehicle(fleet, sto, 1000);
    expect(poor).toEqual({ ok: false, reason: "funds", missing: 800 });

    const rich = buyVehicle(fleet, sto, 2000);
    expect(rich.ok).toBe(true);
    if (rich.ok) {
      expect(rich.balance).toBe(200);
      expect(rich.state.owned).toContain("huracan-sto");
      expect(rich.state.selected).toBe("huracan-sto");
      expect(buyVehicle(rich.state, sto, 9999)).toEqual({ ok: false, reason: "owned" });
    }
    expect(buyVehicle(fleet, undefined, 9999)).toEqual({ ok: false, reason: "unknown" });
  });

  it("only selects vehicles that are owned", () => {
    const fleet = starterFleet(starters);
    expect(selectVehicle(fleet, "yamaha-r1")?.selected).toBe("yamaha-r1");
    expect(selectVehicle(fleet, "bugatti-chiron")).toBeNull();
  });

  it("charges more to upgrade faster vehicles", () => {
    expect(upgradeCostMultiplier(0)).toBe(1);
    expect(upgradeCostMultiplier(3000)).toBe(1.5);
    expect(upgradeCostMultiplier(25000)).toBe(4);
    expect(scaledUpgradeCost(100, 0)).toBe(100);
    expect(scaledUpgradeCost(100, 25000)).toBe(400);
    expect(scaledUpgradeCost(null, 5000)).toBeNull();
  });

  it("keeps upgrade levels separate for each vehicle", () => {
    let fleet = starterFleet(starters);
    const first = buyUpgrade(fleet, "musti-gt", "engine", 100, 500, 5);
    expect(first.status).toBe("purchased");
    if (first.status === "purchased") {
      expect(first.balance).toBe(400);
      expect(first.level).toBe(1);
      fleet = first.state;
    }
    expect(levelsFor(fleet, "musti-gt")).toEqual({ engine: 1 });
    expect(levelsFor(fleet, "yamaha-r1")).toEqual({});

    expect(buyUpgrade(fleet, "musti-gt", "engine", 100, 50, 5).status).toBe("insufficient-funds");
    expect(buyUpgrade(fleet, "musti-gt", "engine", null, 500, 5).status).toBe("max-level");
    expect(buyUpgrade(fleet, "huracan-sto", "engine", 100, 500, 5).status).toBe("not-owned");

    const maxed = { ...fleet, upgrades: { "musti-gt": { engine: 5 } } };
    expect(buyUpgrade(maxed, "musti-gt", "engine", 100, 500, 5).status).toBe("max-level");
  });

  it("shows upgrade bonuses on the 0..100 bars", () => {
    expect(statBonus(80, 1.1)).toBe(8);
    expect(statBonus(80, 1)).toBe(0);
  });
});
