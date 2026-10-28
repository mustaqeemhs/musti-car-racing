import { describe, expect, it } from "vitest";
import {
  ENGINE_PROFILES,
  engineNoteHz,
  engineProfileFor,
  gearCeilings,
  gearForSpeed,
  rpmFraction,
  startingEngineState,
  stepEngine,
  stepTurbo,
  type EngineState,
} from "./engineAudio";

describe("engine profiles", () => {
  it("gives each brand its own engine character", () => {
    expect(engineProfileFor({ id: "huracan-sto", name: "Lamborghini Huracán STO" }).id).toBe("lamborghini");
    expect(engineProfileFor({ id: "musti-gt", name: "Musti GT" }).id).toBe("musti");
    expect(engineProfileFor({ id: "f8", name: "Ferrari F8" }).id).toBe("ferrari");
    expect(engineProfileFor({ id: "765lt", name: "McLaren 765LT" }).id).toBe("mclaren");
    expect(engineProfileFor({ id: "amg", name: "Mercedes-AMG GT" }).id).toBe("mercedes");
    expect(engineProfileFor({ id: "amg-one", name: "Mercedes-AMG ONE" }).id).toBe("amgone");
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

  it("describes every engine with a real harmonic voice and sensible numbers", () => {
    for (const profile of Object.values(ENGINE_PROFILES)) {
      expect(profile.spectrum.length).toBeGreaterThanOrEqual(5);
      expect(Math.max(...profile.spectrum)).toBeGreaterThan(0.8);
      expect(profile.redlineRpm).toBeGreaterThan(profile.idleRpm * 4);
      expect(profile.gears).toBeGreaterThanOrEqual(6);
      expect(profile.volume).toBeLessThan(0.25);
    }
    // bikes rev far higher than cars; the V10 sings higher than the W16 at its redline
    expect(ENGINE_PROFILES["yamaha"]!.redlineRpm).toBeGreaterThan(ENGINE_PROFILES["ferrari"]!.redlineRpm);
    expect(ENGINE_PROFILES["amgone"]!.redlineRpm).toBeGreaterThan(10000);
    expect(ENGINE_PROFILES["bugatti"]!.turbo).toBeGreaterThan(ENGINE_PROFILES["lamborghini"]!.turbo);
  });

  it("makes a higher note at higher revs", () => {
    const lambo = ENGINE_PROFILES["lamborghini"]!;
    const amg = ENGINE_PROFILES["mercedes"]!;
    expect(engineNoteHz(lambo, 1)).toBeGreaterThan(engineNoteHz(lambo, 0.2));
    expect(engineNoteHz(lambo, 1)).toBeGreaterThan(engineNoteHz(amg, 1));
    expect(engineNoteHz(lambo, 0)).toBeGreaterThanOrEqual(28);
  });
});

describe("gearbox and revs", () => {
  it("spreads the gears up to the top speed", () => {
    const ceilings = gearCeilings(7);
    expect(ceilings).toHaveLength(7);
    expect(ceilings[6]).toBe(1);
    for (let index = 1; index < ceilings.length; index++) expect(ceilings[index]!).toBeGreaterThan(ceilings[index - 1]!);
  });

  it("changes gear as speed climbs and drops the revs after a shift", () => {
    const max = 1200;
    const ceiling = gearCeilings(6)[0]! * max;
    const topOfFirst = gearForSpeed(ceiling, max, 6);
    const startOfSecond = gearForSpeed(ceiling + 1, max, 6);
    expect(topOfFirst.gear).toBe(1);
    expect(startOfSecond.gear).toBe(2);
    expect(rpmFraction(startOfSecond.gear, startOfSecond.frac)).toBeLessThan(
      rpmFraction(topOfFirst.gear, topOfFirst.frac),
    );
    expect(gearForSpeed(5000, max, 6).gear).toBe(6);
    expect(gearForSpeed(-10, max, 6).frac).toBe(0);
  });

  const profile = ENGINE_PROFILES["lamborghini"]!;
  const run = (start: EngineState, speeds: number[], throttle = 0.8, dt = 0.05) => {
    let state = start;
    const steps = [];
    for (const speed of speeds) {
      const step = stepEngine(state, profile, { speed, maxSpeed: 1200, throttle }, dt);
      state = step.state;
      steps.push(step);
    }
    return steps;
  };

  it("idles at a standstill and revs up when you press the throttle", () => {
    const idle = run(startingEngineState(profile), [0, 0, 0, 0], 0);
    expect(idle[3]!.state.rpm).toBeCloseTo(profile.idleRpm, -1);
    const revving = run(startingEngineState(profile), [0, 0, 0, 0, 0, 0], 1);
    expect(revving[5]!.state.rpm).toBeGreaterThan(profile.idleRpm + 800);
  });

  it("climbs through the revs, shifts up, and the revs fall after the shift", () => {
    const speeds = Array.from({ length: 160 }, (_, index) => 20 + index * 7); // accelerating
    const steps = run(startingEngineState(profile), speeds);
    const shiftIndex = steps.findIndex((step) => step.shifted === "up");
    expect(shiftIndex).toBeGreaterThan(5);
    const before = steps[shiftIndex - 1]!.state.rpm;
    const later = steps[shiftIndex + 8]!.state.rpm;
    expect(later).toBeLessThan(before); // the revs dropped after the gear change
    expect(steps[steps.length - 1]!.state.gear).toBeGreaterThan(2);
    // revs never leave the engine's range
    for (const step of steps) {
      expect(step.state.rpm).toBeGreaterThanOrEqual(profile.idleRpm - 1);
      expect(step.state.rpm).toBeLessThanOrEqual(profile.redlineRpm + 1);
    }
  });

  it("changes down when slowing and does not chatter between gears", () => {
    const fast = run(startingEngineState(profile), Array.from({ length: 200 }, (_, index) => 20 + index * 5));
    const gearHigh = fast[fast.length - 1]!.state.gear;
    const slowing = run(fast[fast.length - 1]!.state, Array.from({ length: 200 }, (_, index) => 1000 - index * 5), 0);
    expect(slowing[slowing.length - 1]!.state.gear).toBeLessThan(gearHigh);
    expect(slowing.some((step) => step.shifted === "down")).toBe(true);

    // wobbling speed right at a gear boundary does not flip the gear every frame
    const boundary = gearCeilings(profile.gears)[2]! * 1200;
    const wobble = run(
      { rpm: 5000, gear: 4 },
      Array.from({ length: 60 }, (_, index) => boundary + (index % 2 === 0 ? 8 : -8)),
    );
    const shifts = wobble.filter((step) => step.shifted !== null).length;
    expect(shifts).toBeLessThan(3);
  });

  it("hits the rev limiter at the redline with the throttle open", () => {
    const steps = run({ rpm: profile.redlineRpm, gear: 7 }, Array.from({ length: 30 }, () => 1190), 1);
    expect(steps.some((step) => step.limiter)).toBe(true);
  });
});

describe("turbo", () => {
  it("builds boost slowly and lets it go quickly, with a blow-off when you lift", () => {
    let pressure = 0;
    for (let frame = 0; frame < 6; frame++) pressure = stepTurbo(pressure, 1, 0.9, 0.05).pressure;
    const early = pressure;
    for (let frame = 0; frame < 40; frame++) pressure = stepTurbo(pressure, 1, 0.9, 0.05).pressure;
    expect(early).toBeLessThan(pressure); // lag: it takes time to spool
    expect(pressure).toBeGreaterThan(0.6);

    const lifted = stepTurbo(pressure, 0, 0.9, 0.05);
    expect(lifted.blowOff).toBe(true);
    expect(lifted.pressure).toBeLessThan(pressure);
    expect(stepTurbo(0, 0, 0.1, 0.05).blowOff).toBe(false);
  });
});
