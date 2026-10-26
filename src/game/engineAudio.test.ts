import { describe, expect, it } from "vitest";
import {
  ENGINE_PROFILES,
  engineNoteHz,
  engineProfileFor,
  gearForSpeed,
  rpmFraction,
} from "./engineAudio";

describe("engine audio", () => {
  it("gives each brand its own engine character", () => {
    expect(engineProfileFor({ id: "huracan-sto", name: "Lamborghini Huracán STO" }).id).toBe("lamborghini");
    expect(engineProfileFor({ id: "f8", name: "Ferrari F8" }).id).toBe("ferrari");
    expect(engineProfileFor({ id: "765lt", name: "McLaren 765LT" }).id).toBe("mclaren");
    expect(engineProfileFor({ id: "amg", name: "Mercedes-AMG GT" }).id).toBe("mercedes");
    expect(engineProfileFor({ id: "bugatti-chiron", name: "Bugatti Chiron" }).id).toBe("bugatti");
    expect(engineProfileFor({ id: "panigale", name: "Ducati Panigale V4", cat: "bike" }).id).toBe("ducati");
    expect(engineProfileFor({ id: "m1000rr", name: "BMW M 1000 RR", cat: "bike" }).id).toBe("bmw");
    expect(engineProfileFor({ id: "r1", name: "Yamaha R1", cat: "bike" }).id).toBe("yamaha");
  });

  it("falls back to a stable sound for unknown vehicles", () => {
    const first = engineProfileFor({ id: "mystery-car", name: "Mystery", cat: "car", model: "super" });
    const second = engineProfileFor({ id: "mystery-car", name: "Mystery", cat: "car", model: "super" });
    expect(first.id).toBe(second.id);
    expect(engineProfileFor(undefined).id).toBe("generic");
    expect(engineProfileFor({ id: "x", cat: "bike" }).label).toMatch(/Ducati|BMW|Yamaha/);
  });

  it("changes gear as speed climbs and drops the revs after a shift", () => {
    const max = 1200;
    const first = gearForSpeed(80, max);
    expect(first.gear).toBe(1);
    const topOfFirst = gearForSpeed(0.16 * max, max);
    const startOfSecond = gearForSpeed(0.16 * max + 1, max);
    expect(topOfFirst.gear).toBe(1);
    expect(startOfSecond.gear).toBe(2);
    expect(rpmFraction(startOfSecond.gear, startOfSecond.frac)).toBeLessThan(
      rpmFraction(topOfFirst.gear, topOfFirst.frac),
    );
    expect(gearForSpeed(5000, max).gear).toBe(6);
    expect(gearForSpeed(-10, max).frac).toBe(0);
  });

  it("makes a higher note at higher revs, and a V10 screams higher than a V8 at the same rpm fraction", () => {
    const lambo = ENGINE_PROFILES["lamborghini"]!;
    const amg = ENGINE_PROFILES["mercedes"]!;
    expect(engineNoteHz(lambo, 1)).toBeGreaterThan(engineNoteHz(lambo, 0.2));
    expect(engineNoteHz(lambo, 1)).toBeGreaterThan(engineNoteHz(amg, 1));
    expect(engineNoteHz(lambo, 0)).toBeGreaterThanOrEqual(28);
  });
});
