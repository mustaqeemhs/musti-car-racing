import { describe, expect, it } from "vitest";
import {
  CAREER_TIERS,
  careerStandings,
  createAiRacers,
  parseCareer,
  placeOf,
  prizeFor,
  raceLengthFor,
  recordCareerResult,
  stepAiRacer,
  type AiContext,
  type AiRacer,
} from "./career";

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const first = CAREER_TIERS[0]!;
const last = CAREER_TIERS[CAREER_TIERS.length - 1]!;
const cars = ["slow-1", "slow-2", "mid-1", "mid-2", "fast-1", "fast-2"];

function context(tier = first, over: Partial<AiContext> = {}): AiContext {
  return { time: 20, playerDistance: 0, playerLane: 0.5, reference: 400, raceLength: 60000, tier, rand: seeded(2), ...over };
}

/** Stops random slips, nitro and lane changes so a test can look at one behaviour. */
function quiet(ai: AiRacer): AiRacer {
  ai.mistakeTimer = 999;
  ai.boostCooldown = 999;
  ai.skill = 1;
  ai.laneTimer = 999;
  return ai;
}

function calm(ai: AiRacer): AiRacer {
  quiet(ai).speed = 400;
  return ai;
}

describe("career cups", () => {
  it("has eight cups that get harder, longer to win and better paid", () => {
    expect(CAREER_TIERS).toHaveLength(8);
    expect(new Set(CAREER_TIERS.map((tier) => tier.id)).size).toBe(8);
    for (let index = 1; index < CAREER_TIERS.length; index++) {
      const before = CAREER_TIERS[index - 1]!;
      const tier = CAREER_TIERS[index]!;
      expect(tier.pace).toBeGreaterThan(before.pace);
      expect(tier.rewards[0]).toBeGreaterThan(before.rewards[0]);
      expect(tier.mistakes).toBeLessThan(before.mistakes);
      expect(tier.rubber).toBeLessThan(before.rubber);
      expect(tier.aggression).toBeGreaterThan(before.aggression);
      expect(tier.nitroSkill).toBeGreaterThan(before.nitroSkill);
    }
    expect(last.pace).toBeGreaterThan(1.35); // needs nitro and a good vehicle
    expect(first.pace).toBeLessThan(1.35); // an easy start
  });

  it("scales the race length", () => {
    expect(raceLengthFor(first, 60000)).toBe(42000);
    expect(raceLengthFor(CAREER_TIERS.find((tier) => tier.id === "endurance")!, 60000)).toBe(84000);
  });

  it("gives the top cups the faster vehicles", () => {
    const low = createAiRacers(first, cars, seeded(7));
    const high = createAiRacers(last, cars, seeded(7));
    const rank = (id: string) => cars.indexOf(id);
    const average = (racers: AiRacer[]) => racers.reduce((sum, racer) => sum + rank(racer.vehicleId), 0) / racers.length;
    expect(low).toHaveLength(3);
    expect(new Set(low.map((rival) => rival.name)).size).toBe(3);
    expect(average(high)).toBeGreaterThan(average(low));
  });

  it("holds rivals on the grid at the start and stops them at the line", () => {
    const [ai] = createAiRacers(first, cars, seeded(3));
    const rand = seeded(11);
    const start = ai!.distance;
    stepAiRacer(ai!, 0.5, context(first, { time: 0.5, rand, raceLength: 1000 }));
    expect(ai!.distance).toBe(start);

    let time = 1.5;
    while (ai!.finishedAt === null && time < 400) {
      time += 0.05;
      stepAiRacer(ai!, 0.05, context(first, { time, rand, raceLength: 1000, playerDistance: ai!.distance - 100 }));
    }
    expect(ai!.finishedAt).not.toBeNull();
    expect(ai!.distance).toBe(1000);
    expect(ai!.speed).toBe(0);
  });

  it("drives faster in the higher cups for the same reference speed", () => {
    const [slow] = createAiRacers(first, cars, seeded(5), 1);
    const [fast] = createAiRacers(last, cars, seeded(5), 1);
    quiet(slow!); quiet(fast!);
    for (let step = 0; step < 200; step++) {
      stepAiRacer(slow!, 0.05, context(first, { playerDistance: slow!.distance }));
      stepAiRacer(fast!, 0.05, context(last, { playerDistance: fast!.distance }));
      quiet(slow!); quiet(fast!);
    }
    expect(fast!.speed).toBeGreaterThan(slow!.speed * 1.3);
  });

  it("gives less rubber-band help in the higher cups", () => {
    const makeFar = (tier: typeof first) => {
      const [ai] = createAiRacers(tier, cars, seeded(5), 1);
      calm(ai!);
      ai!.distance = 5000;
      stepAiRacer(ai!, 1, context(tier, { playerDistance: 100 }));
      return ai!.speed / (400 * tier.pace);
    };
    // a runaway leader eases off by up to 10% in the first cup, only about 1.5% in the last
    expect(makeFar(first)).toBeLessThan(makeFar(last));
  });

  it("slipstreams behind the player and drives faster than without a draft", () => {
    const [behind] = createAiRacers(first, cars, seeded(5), 1);
    const [apart] = createAiRacers(first, cars, seeded(5), 1);
    calm(behind!); calm(apart!);
    behind!.lane = 0.5; apart!.lane = 0.125;
    behind!.distance = apart!.distance = 900;
    stepAiRacer(behind!, 1, context(first, { playerDistance: 1000, playerLane: 0.5 }));
    stepAiRacer(apart!, 1, context(first, { playerDistance: 1000, playerLane: 0.5 }));
    expect(behind!.speed).toBeGreaterThan(apart!.speed);
  });

  it("blocks the player's lane in a high cup and goes round the player when stuck behind", () => {
    const blocker = calm(createAiRacers(last, cars, seeded(5), 1)[0]!);
    blocker.distance = 1100;
    blocker.laneTimer = 0;
    blocker.lane = 0.125;
    let blocked = 0;
    for (let trial = 0; trial < 40; trial++) {
      blocker.laneTimer = 0;
      stepAiRacer(blocker, 0.01, context(last, { playerDistance: 1000, playerLane: 0.625, rand: seeded(trial + 3) }));
      if (blocker.targetLane === 0.625) blocked++;
    }
    expect(blocked).toBeGreaterThan(20);

    const follower = calm(createAiRacers(last, cars, seeded(5), 1)[0]!);
    follower.distance = 900;
    follower.lane = 0.625;
    let wentRound = 0;
    for (let trial = 0; trial < 40; trial++) {
      follower.laneTimer = 0;
      stepAiRacer(follower, 0.01, context(last, { playerDistance: 1000, playerLane: 0.625, rand: seeded(trial + 9) }));
      if (follower.targetLane !== 0.625) wentRound++;
    }
    expect(wentRound).toBeGreaterThan(20);
  });

  it("ranks the player against rivals and pays prizes", () => {
    const rivals = createAiRacers(first, cars, seeded(9));
    rivals[0]!.finishedAt = 50;
    rivals[1]!.finishedAt = 90;
    rivals[2]!.distance = 500;
    rivals[2]!.speed = 200;
    const standings = careerStandings(70, rivals, 1000);
    expect(placeOf(standings)).toBe(2);
    expect(standings[standings.length - 1]!.finished).toBe(false);
    expect(prizeFor(first, 1)).toBe(150);
    expect(prizeFor(first, 4)).toBe(10);
    expect(prizeFor(first, 9)).toBe(10);
    expect(prizeFor(last, 1)).toBe(2500);
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
    progress = recordCareerResult(progress, "street", 2);
    expect(progress.unlocked).toBe(3);
    progress = recordCareerResult(progress, "champion", 1);
    expect(progress.unlocked).toBe(8);
  });

  it("ignores broken saved data", () => {
    expect(parseCareer("not json")).toEqual({ unlocked: 1, best: {} });
    expect(parseCareer('{"unlocked": 99, "best": {"rookie": 77, "pro": 2}}')).toEqual({ unlocked: 8, best: { pro: 2 } });
  });
});
