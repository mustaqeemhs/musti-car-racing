import { describe, expect, it } from "vitest";
import {
  accelStat,
  centeredBikePreviewPosition,
  MODEL_WIDTH,
  playerBikeRenderSize,
  speedStat,
  STARTER_VEHICLE_IDS,
  VEHICLE_DEFS,
} from "./carArt";
import { BIKE_MODELS } from "./engine";

describe("motorcycle gameplay sizing", () => {
  it("uses a wider lane footprint for each motorcycle traffic model", () => {
    for (const model of BIKE_MODELS) {
      expect(MODEL_WIDTH[model]).toBeGreaterThanOrEqual(0.66);
    }
  });

  it("renders the player bike wider while keeping its height proportional", () => {
    expect(playerBikeRenderSize(100, 200)).toEqual({
      width: 86,
      height: 180,
    });
    expect(86).toBeLessThan(100);
    expect(180).toBeLessThan(200);
    expect(180 / 86).toBeGreaterThan(2);
  });

  it("centers a motorcycle preview without changing its rendered aspect ratio", () => {
    const bikeVehicles = VEHICLE_DEFS.filter((vehicle) => vehicle.cat === "bike");
    expect(bikeVehicles.length).toBeGreaterThanOrEqual(3);

    const preview = { width: 126, height: 216 };
    const position = centeredBikePreviewPosition(300, 260, preview.width, preview.height);

    expect(position).toEqual({ x: 87, y: 22 });
    expect(position.x + preview.width / 2).toBe(150);
    expect(position.y + preview.height / 2).toBe(130);
    expect(preview.width / preview.height).toBe(126 / 216);
  });
});

describe("the real vehicle roster", () => {
  const cars = VEHICLE_DEFS.filter((vehicle) => vehicle.cat === "car");
  const bikes = VEHICLE_DEFS.filter((vehicle) => vehicle.cat === "bike");

  it("starts with exactly one free car and one free bike", () => {
    expect(cars.filter((vehicle) => vehicle.price === 0)).toHaveLength(1);
    expect(bikes.filter((vehicle) => vehicle.price === 0)).toHaveLength(1);
    expect(STARTER_VEHICLE_IDS).toHaveLength(2);
  });

  it("makes the slower vehicles the cheaper ones (price follows real top speed)", () => {
    for (const group of [cars, bikes]) {
      const bySpeed = [...group].sort(
        (a, b) => a.real.topKmh - b.real.topKmh || b.real.zeroTo100 - a.real.zeroTo100,
      );
      const prices = bySpeed.map((vehicle) => vehicle.price);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
    const starterCar = cars.find((vehicle) => vehicle.price === 0)!;
    expect(starterCar.real.topKmh).toBe(Math.min(...cars.map((vehicle) => vehicle.real.topKmh)));
  });

  it("has unique ids, a picture for every real vehicle, and sensible stats", () => {
    expect(new Set(VEHICLE_DEFS.map((vehicle) => vehicle.id)).size).toBe(VEHICLE_DEFS.length);
    for (const vehicle of VEHICLE_DEFS) {
      expect(vehicle.id).toMatch(/^[a-z0-9-]{1,40}$/);
      if (vehicle.id !== "musti-gt") expect(vehicle.art).toBe(vehicle.id);
      for (const value of Object.values(vehicle.stats)) {
        expect(value).toBeGreaterThanOrEqual(20);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("scales the game speed with the real speed", () => {
    const chiron = VEHICLE_DEFS.find((vehicle) => vehicle.id === "bugatti-chiron")!;
    const starter = VEHICLE_DEFS.find((vehicle) => vehicle.id === "musti-gt")!;
    expect(chiron.maxMul).toBeGreaterThan(starter.maxMul);
    expect(starter.maxMul).toBeCloseTo(1, 1);
    expect(speedStat(420)).toBe(100);
    expect(accelStat(2.3)).toBe(100);
  });
});
