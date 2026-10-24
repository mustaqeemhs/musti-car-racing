import { WALLET_KEY } from "./garageData";

export const ACHIEVEMENTS = [
  {
    id: "first-race",
    title: "First Race",
    description: "Finish your first race.",
    reward: 25,
  },
  {
    id: "rookie-racer",
    title: "Rookie Racer",
    description: "Score 1,000 points in one race.",
    reward: 50,
  },
  {
    id: "high-scorer",
    title: "High Scorer",
    description: "Score 5,000 points in one race.",
    reward: 100,
  },
  {
    id: "coin-collector",
    title: "Coin Collector",
    description: "Collect 25 road coins in total.",
    reward: 50,
  },
  {
    id: "near-miss-expert",
    title: "Near-Miss Expert",
    description: "Complete 10 near misses in total.",
    reward: 75,
  },
  {
    id: "survivor",
    title: "Survivor",
    description: "Stay in one race for at least 60 seconds.",
    reward: 75,
  },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];
export type RaceStats = {
  score: number;
  distance: number;
  time: number;
};
export type RewardEventKind = "road-coin" | "near-miss";

export type ProgressionData = {
  bestScore: number;
  completedRaces: number;
  totalDistance: number;
  lifetimeCoins: number;
  lifetimeNearMisses: number;
  unlockedAchievements: AchievementId[];
  claimedAchievementRewards: AchievementId[];
  processedRaceIds: string[];
  processedRewardEventIds: string[];
};

export type CompleteRaceResult = {
  progression: ProgressionData;
  balance: number;
  newBest: boolean;
  duplicate: boolean;
  unlockedNow: AchievementId[];
};

export const EMPTY_PROGRESSION: ProgressionData = {
  bestScore: 0,
  completedRaces: 0,
  totalDistance: 0,
  lifetimeCoins: 0,
  lifetimeNearMisses: 0,
  unlockedAchievements: [],
  claimedAchievementRewards: [],
  processedRaceIds: [],
  processedRewardEventIds: [],
};

const achievementIds = new Set<string>(ACHIEVEMENTS.map(({ id }) => id));
const safeCount = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
const safeDistance = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
const validAchievementIds = (value: unknown): AchievementId[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value.filter(
            (id): id is AchievementId =>
              typeof id === "string" && achievementIds.has(id),
          ),
        ),
      )
    : [];

export function normalizeProgression(value: unknown): ProgressionData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_PROGRESSION };
  }

  const saved = value as Record<string, unknown>;
  return {
    bestScore: safeCount(saved["bestScore"]),
    completedRaces: safeCount(saved["completedRaces"]),
    totalDistance: safeDistance(saved["totalDistance"]),
    lifetimeCoins: safeCount(saved["lifetimeCoins"]),
    lifetimeNearMisses: safeCount(saved["lifetimeNearMisses"]),
    unlockedAchievements: validAchievementIds(saved["unlockedAchievements"]),
    claimedAchievementRewards: validAchievementIds(
      saved["claimedAchievementRewards"],
    ),
    processedRaceIds: Array.isArray(saved["processedRaceIds"])
      ? Array.from(
          new Set(
            saved["processedRaceIds"].filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ).slice(-500)
      : [],
    processedRewardEventIds: Array.isArray(saved["processedRewardEventIds"])
      ? Array.from(
          new Set(
            saved["processedRewardEventIds"].filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ).slice(-1000)
      : [],
  };
}

export function readProgression(): ProgressionData {
  try {
    const saved = localStorage.getItem(WALLET_KEY);
    if (!saved) return { ...EMPTY_PROGRESSION };
    const profile: unknown = JSON.parse(saved);
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return { ...EMPTY_PROGRESSION };
    }
    return normalizeProgression(
      (profile as Record<string, unknown>)["progression"],
    );
  } catch {
    return { ...EMPTY_PROGRESSION };
  }
}

export function recordRewardEvent(
  amount: number,
  kind: RewardEventKind,
  eventId: string,
): CompleteRaceResult {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError("Coin rewards must be a positive safe integer.");
  }
  if (!eventId) throw new Error("A reward event ID is required.");

  const saved = localStorage.getItem(WALLET_KEY);
  const parsed: unknown = saved
    ? JSON.parse(saved)
    : { username: "musti", balance: 0, lastDailyReward: "" };
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The saved guest wallet is invalid.");
  }
  const profile = parsed as Record<string, unknown>;
  const balance = profile["balance"];
  if (typeof balance !== "number" || !Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("The saved guest wallet balance is invalid.");
  }

  const progression = normalizeProgression(profile["progression"]);
  if (progression.processedRewardEventIds.includes(eventId)) {
    return {
      progression,
      balance,
      newBest: false,
      duplicate: true,
      unlockedNow: [],
    };
  }

  const lifetimeCoins =
    progression.lifetimeCoins + (kind === "road-coin" ? 1 : 0);
  const lifetimeNearMisses =
    progression.lifetimeNearMisses + (kind === "near-miss" ? 1 : 0);
  if (
    !Number.isSafeInteger(lifetimeCoins) ||
    !Number.isSafeInteger(lifetimeNearMisses)
  ) {
    throw new RangeError("The saved race progression is too large.");
  }

  const unlocked = new Set(progression.unlockedAchievements);
  const candidates: AchievementId[] = [];
  if (kind === "road-coin" && lifetimeCoins >= 25) {
    candidates.push("coin-collector");
  }
  if (kind === "near-miss" && lifetimeNearMisses >= 10) {
    candidates.push("near-miss-expert");
  }
  const unlockedNow = candidates.filter((id) => !unlocked.has(id));
  for (const id of unlockedNow) unlocked.add(id);

  const claimed = new Set(progression.claimedAchievementRewards);
  const achievementReward = ACHIEVEMENTS.reduce((total, achievement) => {
    if (unlocked.has(achievement.id) && !claimed.has(achievement.id)) {
      claimed.add(achievement.id);
      return total + achievement.reward;
    }
    return total;
  }, 0);
  const nextBalance = balance + amount + achievementReward;
  if (!Number.isSafeInteger(nextBalance)) {
    throw new RangeError("The guest wallet balance is too large.");
  }

  const nextProgression: ProgressionData = {
    ...progression,
    lifetimeCoins,
    lifetimeNearMisses,
    unlockedAchievements: Array.from(unlocked),
    claimedAchievementRewards: Array.from(claimed),
    processedRewardEventIds: [
      ...progression.processedRewardEventIds,
      eventId,
    ].slice(-1000),
  };
  localStorage.setItem(
    WALLET_KEY,
    JSON.stringify({
      ...profile,
      username: typeof profile["username"] === "string" ? profile["username"] : "Racer",
      lastDailyReward:
        typeof profile["lastDailyReward"] === "string"
          ? profile["lastDailyReward"]
          : "",
      balance: nextBalance,
      progression: nextProgression,
    }),
  );

  return {
    progression: nextProgression,
    balance: nextBalance,
    newBest: false,
    duplicate: false,
    unlockedNow,
  };
}

export function completeRace(
  raceId: string,
  stats: RaceStats,
  previousBestScore = 0,
): CompleteRaceResult {
  if (!raceId) throw new Error("A race ID is required to save progression.");
  const saved = localStorage.getItem(WALLET_KEY);
  let profile: Record<string, unknown>;

  if (saved === null) {
    profile = { username: "musti", balance: 0, lastDailyReward: "" };
  } else {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The saved guest wallet is invalid.");
    }
    profile = parsed as Record<string, unknown>;
  }

  const balance = profile["balance"];
  if (typeof balance !== "number" || !Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("The saved guest wallet balance is invalid.");
  }

  const progression = normalizeProgression(profile["progression"]);
  if (progression.processedRaceIds.includes(raceId)) {
    return {
      progression,
      balance,
      newBest: false,
      duplicate: true,
      unlockedNow: [],
    };
  }

  const score = safeCount(stats.score);
  const distance = safeDistance(stats.distance);
  const time = safeDistance(stats.time);
  const previousBest = safeCount(previousBestScore);
  const bestScore = Math.max(progression.bestScore, score, previousBest);
  const completedRaces = progression.completedRaces + 1;
  const totalDistance = progression.totalDistance + distance;
  if (
    !Number.isSafeInteger(completedRaces) ||
    !Number.isFinite(totalDistance)
  ) {
    throw new RangeError("The saved race progression is too large.");
  }
  const unlocked = new Set(progression.unlockedAchievements);
  const candidates: AchievementId[] = [];

  if (completedRaces >= 1) candidates.push("first-race");
  if (score >= 1_000) candidates.push("rookie-racer");
  if (score >= 5_000) candidates.push("high-scorer");
  if (progression.lifetimeCoins >= 25) candidates.push("coin-collector");
  if (progression.lifetimeNearMisses >= 10) candidates.push("near-miss-expert");
  if (time >= 60) candidates.push("survivor");

  const unlockedNow = candidates.filter((id) => !unlocked.has(id));
  for (const id of unlockedNow) unlocked.add(id);

  const claimed = new Set(progression.claimedAchievementRewards);
  const reward = ACHIEVEMENTS.reduce((total, achievement) => {
    if (unlocked.has(achievement.id) && !claimed.has(achievement.id)) {
      claimed.add(achievement.id);
      return total + achievement.reward;
    }
    return total;
  }, 0);
  const nextBalance = balance + reward;
  if (!Number.isSafeInteger(nextBalance)) {
    throw new RangeError("The guest wallet balance is too large.");
  }

  const nextProgression: ProgressionData = {
    ...progression,
    bestScore,
    completedRaces,
    totalDistance,
    unlockedAchievements: Array.from(unlocked),
    claimedAchievementRewards: Array.from(claimed),
    processedRaceIds: [...progression.processedRaceIds, raceId].slice(-500),
  };

  localStorage.setItem(
    WALLET_KEY,
    JSON.stringify({
      ...profile,
      username: typeof profile["username"] === "string" ? profile["username"] : "Racer",
      lastDailyReward:
        typeof profile["lastDailyReward"] === "string"
          ? profile["lastDailyReward"]
          : "",
      balance: nextBalance,
      progression: nextProgression,
    }),
  );

  return {
    progression: nextProgression,
    balance: nextBalance,
    newBest: score > Math.max(progression.bestScore, previousBest),
    duplicate: false,
    unlockedNow,
  };
}
