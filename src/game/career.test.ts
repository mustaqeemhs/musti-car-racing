import { describe, expect, it } from "vitest";
import {
  CAREER_TIERS,
  careerStandings,
  createAiRacers,
  parseCareer,
  placeOf,
  prizeFor,
  recordCareerResult,
  stepAiRacer,
  type AiContext,
} from "./career";

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

describe("career mode", () => {
  const tier = CAREER_TIERS[0]!;

  it("creates three different rivals with real vehicle ids", () => {
    const rivals = createAiRacers(tier, ["vulcan-x", "corsa-rs"], seeded(7));
    expect(rivals).toHaveLength(3);
    expect(new Set(rivals.map((rival) => rival.name)).size).toBe(3);
    expect(rivals.every((rival) => ["vulcan-x", "corsa-rs"].includes(rival.vehicleId))).toBe(true);
    expect(rivals.map((rival) => rival.seat)).toEqual([1, 2, 3]);
  });

  it("drives rivals forward, holds them on the grid at the start and stops them at the line", () => {
    const [ai] = createAiRacers(tier, ["vulcan-x"], seeded(3));
    const rand = seeded(11);
    const context = (time: number, playerDistance: number): AiContext => ({
      time, playerDistance, cruise: 400, raceLength: 1000, tier, rand,
    });
    const startDistance = ai!.distance;
    stepAiRacer(ai!, 0.5, context(0.5, 0));
    expect(ai!.distance).toBe(startDistance); // still waiting for the start

    let time = 1.5;
    while (ai!.finishedAt === null && time < 120) {
      time += 0.05;
      stepAiRacer(ai!, 0.05, context(time, ai!.distance - 100));
    }
    expect(ai!.finishedAt).not.toBeNull();
    expect(ai!.distance).toBe(1000);
    expect(ai!.speed).toBe(0);
  });

  it("keeps a rival that is far ahead from running away (rubber band)", () => {
    const [far, near] = createAiRacers(tier, ["vulcan-x"], seeded(5), 2);
    far!.distance = 5000;
    near!.distance = 100;
    const rand = seeded(2);
    const base = { time: 20, cruise: 400, raceLength: 60000, tier, rand };
    far!.speed = 400; near!.speed = 400;
    far!.skill = near!.skill = 1;
    far!.mistakeTimer = near!.mistakeTimer = 99;
    far!.boostCooldown = near!.boostCooldown = 99;
    stepAiRacer(far!, 1, { ...base, playerDistance: 100 });
    stepAiRacer(near!, 1, { ...base, playerDistance: 100 });
    expect(far!.speed).toBeLessThan(near!.speed);
  });

  it("ranks the player against rivals and pays prizes", () => {
    const rivals = createAiRacers(tier, ["vulcan-x"], seeded(9));
    rivals[0]!.finishedAt = 50;
    rivals[1]!.finishedAt = 90;
    rivals[2]!.distance = 500;
    rivals[2]!.speed = 200;
    const standings = careerStandings(70, rivals, 1000);
    expect(placeOf(standings)).toBe(2);
    expect(standings[standings.length - 1]!.finished).toBe(false);
    expect(prizeFor(tier, 1)).toBe(150);
    expect(prizeFor(tier, 4)).toBe(10);
    expect(prizeFor(tier, 9)).toBe(10);
  });

  it("opens the next cup only for a podium finish and remembers the best place", () => {
    let progress = parseCareer(null);
    expect(progress.unlocked).toBe(1);
    progress = recordCareerResult(progress, "rookie", 4);
    expect(progress.unlocked).toBe(1);
    progress = recordCareerResult(progress, "rookie", 3);
    expect(progress.unlocked).toBe(2);
    progress = recordCareerResult(progress, "rookie", 1);
    expect(progress.best.rookie).toBe(1);
    progress = recordCareerResult(progress, "pro", 2);
    expect(progress.unlocked).toBe(3);
    progress = recordCareerResult(progress, "legend", 1);
    expect(progress.unlocked).toBe(3);
  });

  it("ignores broken saved data", () => {
    expect(parseCareer("not json")).toEqual({ unlocked: 1, best: {} });
    expect(parseCareer('{"unlocked": 99, "best": {"rookie": 77}}')).toEqual({ unlocked: 3, best: {} });
  });
});
