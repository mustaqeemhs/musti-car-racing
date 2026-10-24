import { afterEach, describe, expect, it, vi } from "vitest";
import { WALLET_KEY } from "./garageData";
import {
  ACHIEVEMENTS,
  completeRace,
  normalizeProgression,
  recordRewardEvent,
  readProgression,
} from "./progression";

function installStorage(initial?: Record<string, unknown>) {
  let saved = initial ? JSON.stringify(initial) : null;
  const storage = {
    getItem: (key: string) => (key === WALLET_KEY ? saved : null),
    setItem: (key: string, value: string) => {
      if (key === WALLET_KEY) saved = value;
    },
  };
  vi.stubGlobal("localStorage", storage);
  return {
    profile: () => (saved ? JSON.parse(saved) as Record<string, unknown> : null),
  };
}

const race = (overrides: Partial<Parameters<typeof completeRace>[1]> = {}) => ({
  score: 0,
  distance: 0,
  time: 0,
  ...overrides,
});

describe("persistent race progression", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("safely migrates an older guest wallet without changing its balance or profile fields", () => {
    const storage = installStorage({
      username: "Driver",
      balance: 640,
      lastDailyReward: "2026-10-22",
      customField: "keep me",
    });

    expect(readProgression().completedRaces).toBe(0);
    const result = completeRace("race-1", race({ score: 800, distance: 1200 }));
    const profile = storage.profile();

    expect(profile?.["balance"]).toBe(665);
    expect(profile?.["username"]).toBe("Driver");
    expect(profile?.["lastDailyReward"]).toBe("2026-10-22");
    expect(profile?.["customField"]).toBe("keep me");
    expect(result.progression.totalDistance).toBe(1200);
    expect(result.unlockedNow).toEqual(["first-race"]);
  });

  it("unlocks achievements at their exact race and lifetime thresholds", () => {
    installStorage({ username: "Racer", balance: 0, lastDailyReward: "" });

    for (let index = 0; index < 25; index++) {
      recordRewardEvent(5, "road-coin", `coin-${index}`);
    }
    for (let index = 0; index < 10; index++) {
      recordRewardEvent(2, "near-miss", `near-miss-${index}`);
    }
    const result = completeRace(
      "race-thresholds",
      race({
        score: 5000,
        distance: 24000,
        time: 60,
      }),
    );

    expect(result.progression.unlockedAchievements).toEqual(
      expect.arrayContaining(ACHIEVEMENTS.map(({ id }) => id)),
    );
    expect(result.progression.unlockedAchievements).toHaveLength(
      ACHIEVEMENTS.length,
    );
    expect(result.unlockedNow).toEqual([
      "first-race",
      "rookie-racer",
      "high-scorer",
      "survivor",
    ]);
    expect(result.balance).toBe(520);
    expect(result.progression).toMatchObject({
      bestScore: 5000,
      completedRaces: 1,
      lifetimeCoins: 25,
      lifetimeNearMisses: 10,
      totalDistance: 24000,
    });
  });

  it("grants each achievement reward only once and ignores duplicate race finalization", () => {
    const storage = installStorage({ username: "Racer", balance: 0, lastDailyReward: "" });
    const first = completeRace("same-race", race({ score: 5000, time: 60 }));
    const duplicate = completeRace("same-race", race({ score: 5000, time: 60 }));
    const nextRace = completeRace("another-race", race({ score: 5000, time: 60 }));

    expect(first.balance).toBe(250);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.unlockedNow).toEqual([]);
    expect(duplicate.balance).toBe(first.balance);
    expect(duplicate.progression.completedRaces).toBe(1);
    expect(nextRace.balance).toBe(first.balance);
    expect(nextRace.progression.completedRaces).toBe(2);
    expect((storage.profile()?.["progression"] as { claimedAchievementRewards: string[] }).claimedAchievementRewards).toHaveLength(4);
  });

  it("unlocks score and survival awards only at their race thresholds", () => {
    installStorage({ username: "Racer", balance: 0, lastDailyReward: "" });

    const below = completeRace(
      "below-thresholds",
      race({ score: 999, time: 59.9 }),
    );
    expect(below.unlockedNow).toEqual(["first-race"]);

    const rookie = completeRace("rookie", race({ score: 1000, time: 59.99 }));
    expect(rookie.unlockedNow).toEqual(["rookie-racer"]);
    const highScore = completeRace("high-score", race({ score: 5000, time: 60 }));
    expect(highScore.unlockedNow).toEqual(["high-scorer", "survivor"]);
  });

  it("persists coin and near-miss lifetime totals immediately and rewards only once per event", () => {
    installStorage({ username: "Racer", balance: 0, lastDailyReward: "" });

    for (let index = 0; index < 24; index++) {
      recordRewardEvent(5, "road-coin", `coin-${index}`);
    }
    for (let index = 0; index < 9; index++) {
      recordRewardEvent(2, "near-miss", `near-miss-${index}`);
    }
    expect(readProgression()).toMatchObject({
      lifetimeCoins: 24,
      lifetimeNearMisses: 9,
      unlockedAchievements: [],
    });

    const coin = recordRewardEvent(5, "road-coin", "coin-24");
    const duplicateCoin = recordRewardEvent(5, "road-coin", "coin-24");
    const nearMiss = recordRewardEvent(2, "near-miss", "near-miss-9");

    expect(coin.unlockedNow).toEqual(["coin-collector"]);
    expect(duplicateCoin.duplicate).toBe(true);
    expect(duplicateCoin.balance).toBe(coin.balance);
    expect(nearMiss.unlockedNow).toEqual(["near-miss-expert"]);
    expect(nearMiss.progression.lifetimeCoins).toBe(25);
    expect(nearMiss.progression.lifetimeNearMisses).toBe(10);
  });

  it("updates records without lowering a previous best", () => {
    installStorage({
      username: "Racer",
      balance: 0,
      lastDailyReward: "",
      progression: {
        bestScore: 1500,
        completedRaces: 2,
        totalDistance: 5000,
        lifetimeCoins: 4,
        lifetimeNearMisses: 3,
        unlockedAchievements: ["first-race", "rookie-racer"],
        claimedAchievementRewards: ["first-race", "rookie-racer"],
        processedRaceIds: ["older"],
        processedRewardEventIds: ["event-a"],
      },
    });

    const result = completeRace("new-race", race({ score: 500, distance: 800 }), 2000);
    expect(result.newBest).toBe(false);
    expect(result.progression.bestScore).toBe(2000);
    expect(result.progression.completedRaces).toBe(3);
    expect(result.progression.totalDistance).toBe(5800);
  });

  it("normalizes invalid legacy progression fields without losing valid achievements", () => {
    const normalized = normalizeProgression({
      bestScore: -1,
      completedRaces: Number.POSITIVE_INFINITY,
      totalDistance: "far",
      lifetimeCoins: 12.8,
      lifetimeNearMisses: 2,
      unlockedAchievements: ["first-race", "unknown", "first-race"],
      claimedAchievementRewards: ["not-an-achievement"],
      processedRaceIds: ["race-a", 2, "race-a"],
      processedRewardEventIds: ["event-a", 2, "event-a"],
    });

    expect(normalized).toMatchObject({
      bestScore: 0,
      completedRaces: 0,
      totalDistance: 0,
      lifetimeCoins: 0,
      lifetimeNearMisses: 2,
      unlockedAchievements: ["first-race"],
      claimedAchievementRewards: [],
      processedRaceIds: ["race-a"],
      processedRewardEventIds: ["event-a"],
    });
  });
});
