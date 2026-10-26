/** Career mode: race AI rivals over the same course as an online race. */

export type CareerTierId = "rookie" | "pro" | "legend";

export type CareerTier = {
  id: CareerTierId;
  name: string;
  blurb: string;
  /** How fast the rivals drive compared with a normal cruising player (1 = same pace). */
  pace: number;
  /** Prize for 1st, 2nd, 3rd and 4th place, in Jaa'izah. */
  rewards: [number, number, number, number];
};

export const CAREER_TIERS: CareerTier[] = [
  { id: "rookie", name: "Rookie Cup", blurb: "Friendly rivals. Learn the road.", pace: 1.1, rewards: [150, 80, 40, 10] },
  { id: "pro", name: "Pro Series", blurb: "Sharper drivers who rarely slip up.", pace: 1.24, rewards: [300, 150, 75, 20] },
  { id: "legend", name: "Legend Run", blurb: "The fastest rivals. Use your nitro!", pace: 1.38, rewards: [600, 300, 150, 40] },
];

export const AI_NAMES = [
  "Turbo Tunde", "Nitro Nia", "Drift King", "Ghost", "Blaze", "Rocket Ren", "Vex", "Sade Storm",
  "Kofi Dash", "Zara Zoom", "Rico", "Ayo Apex",
];

const LANE_COUNT = 4;
export const laneCentre = (lane: number) => (lane + 0.5) / LANE_COUNT;

export type AiRacer = {
  id: string;
  name: string;
  seat: number;
  vehicleId: string;
  paint: string;
  distance: number;
  lane: number;
  targetLane: number;
  laneTimer: number;
  speed: number;
  /** 0.94 .. 1.06: how good this driver is. */
  skill: number;
  mistakeTimer: number;
  slowTimer: number;
  boostTimer: number;
  boostCooldown: number;
  finishedAt: number | null;
};

export const AI_PAINTS = ["#d62b2b", "#1f6feb", "#f0b429", "#18b26b", "#8b5cf6", "#f97316", "#e5e7eb", "#111827"];

export function createAiRacers(tier: CareerTier, vehicleIds: string[], rand: () => number, count = 3): AiRacer[] {
  const names = [...AI_NAMES];
  const racers: AiRacer[] = [];
  for (let index = 0; index < count; index++) {
    const nameIndex = Math.floor(rand() * names.length);
    const [name] = names.splice(nameIndex, 1);
    const lane = Math.min(LANE_COUNT - 1, index + 1);
    racers.push({
      id: `ai-${index + 1}`,
      name: name ?? `Rival ${index + 1}`,
      seat: index + 1,
      vehicleId: vehicleIds.length > 0 ? vehicleIds[Math.floor(rand() * vehicleIds.length)]! : "musti-gt",
      paint: AI_PAINTS[Math.floor(rand() * AI_PAINTS.length)]!,
      distance: -60 * (index + 1),
      lane: laneCentre(lane),
      targetLane: laneCentre(lane),
      laneTimer: 1 + rand() * 2,
      speed: 0,
      skill: 0.95 + rand() * 0.1,
      mistakeTimer: 6 + rand() * 8,
      slowTimer: 0,
      boostTimer: 0,
      boostCooldown: 8 + rand() * 8,
      finishedAt: null,
    });
  }
  return racers;
}

export type AiContext = {
  /** Seconds since the race started. */
  time: number;
  playerDistance: number;
  /** The player's current cruising speed (the AI drives relative to this). */
  cruise: number;
  raceLength: number;
  tier: CareerTier;
  rand: () => number;
};

/** Moves one AI racer forward by dt seconds. */
export function stepAiRacer(ai: AiRacer, dt: number, context: AiContext): void {
  if (ai.finishedAt !== null) {
    ai.speed = 0;
    return;
  }
  const { tier, rand } = context;

  // Short countdown: nobody moves for the first 1.5 seconds.
  const go = context.time > 1.5;

  // Random slips and nitro bursts make rivals feel human.
  ai.mistakeTimer -= dt;
  if (ai.mistakeTimer <= 0) {
    ai.mistakeTimer = 7 + rand() * 9;
    if (rand() > ai.skill - 0.02) ai.slowTimer = 1.1;
  }
  ai.boostCooldown -= dt;
  if (ai.boostCooldown <= 0) {
    ai.boostCooldown = 12 + rand() * 10;
    ai.boostTimer = 2.2;
  }
  if (ai.slowTimer > 0) ai.slowTimer -= dt;
  if (ai.boostTimer > 0) ai.boostTimer -= dt;

  // Rubber band: rivals far ahead ease off, rivals far behind push harder.
  const gap = ai.distance - context.playerDistance;
  let band = 1;
  if (gap > 2200) band = 0.9;
  else if (gap > 1200) band = 0.96;
  else if (gap < -2200) band = tier.id === "legend" ? 1.06 : 1.12;
  else if (gap < -1200) band = 1.05;

  let target = context.cruise * tier.pace * ai.skill * band;
  if (ai.slowTimer > 0) target *= 0.55;
  if (ai.boostTimer > 0) target *= 1.15;
  if (!go) target = 0;

  const response = Math.min(1, dt * (target > ai.speed ? 1.4 : 3));
  ai.speed += (target - ai.speed) * response;
  ai.distance += ai.speed * dt;

  // Change lanes now and then, smoothly.
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTimer = 1.8 + rand() * 2.6;
    ai.targetLane = laneCentre(Math.floor(rand() * LANE_COUNT));
  }
  ai.lane += (ai.targetLane - ai.lane) * Math.min(1, dt * 2.2);

  if (ai.distance >= context.raceLength) {
    ai.distance = context.raceLength;
    ai.finishedAt = context.time;
    ai.speed = 0;
  }
}

export type CareerStanding = {
  id: string;
  name: string;
  me: boolean;
  finished: boolean;
  /** Finish time in seconds (an estimate for rivals who have not finished yet). */
  seconds: number;
  distance: number;
};

/** Final table when the player crosses the line at `myTime`. */
export function careerStandings(
  myTime: number,
  ais: AiRacer[],
  raceLength: number,
  myName = "You",
): CareerStanding[] {
  const rows: CareerStanding[] = [
    { id: "me", name: myName, me: true, finished: true, seconds: myTime, distance: raceLength },
  ];
  for (const ai of ais) {
    if (ai.finishedAt !== null) {
      rows.push({ id: ai.id, name: ai.name, me: false, finished: ai.finishedAt <= myTime, seconds: ai.finishedAt, distance: raceLength });
    } else {
      const remaining = Math.max(0, raceLength - ai.distance);
      const speed = Math.max(ai.speed, 120);
      rows.push({ id: ai.id, name: ai.name, me: false, finished: false, seconds: myTime + remaining / speed, distance: ai.distance });
    }
  }
  return rows.sort((a, b) => a.seconds - b.seconds);
}

export function placeOf(standings: CareerStanding[]): number {
  return standings.findIndex((row) => row.me) + 1;
}

export function prizeFor(tier: CareerTier, place: number): number {
  return tier.rewards[Math.max(0, Math.min(3, place - 1))] ?? 0;
}

/* ---------- progress ---------- */

export type CareerProgress = {
  /** How many cups are open (1 = only the Rookie Cup). */
  unlocked: number;
  /** Best finishing place per cup (1 = best). */
  best: Partial<Record<CareerTierId, number>>;
};

export const CAREER_KEY = "musti-career-v1";
export const EMPTY_CAREER: CareerProgress = { unlocked: 1, best: {} };

export function parseCareer(raw: string | null): CareerProgress {
  if (!raw) return { unlocked: 1, best: {} };
  try {
    const value = JSON.parse(raw) as Partial<CareerProgress>;
    const unlocked =
      typeof value.unlocked === "number" && Number.isInteger(value.unlocked)
        ? Math.max(1, Math.min(CAREER_TIERS.length, value.unlocked))
        : 1;
    const best: CareerProgress["best"] = {};
    for (const tier of CAREER_TIERS) {
      const place = value.best?.[tier.id];
      if (typeof place === "number" && Number.isInteger(place) && place >= 1 && place <= 4) best[tier.id] = place;
    }
    return { unlocked, best };
  } catch {
    return { unlocked: 1, best: {} };
  }
}

/** Records a finished cup race. A podium finish (top 3) opens the next cup. */
export function recordCareerResult(progress: CareerProgress, tierId: CareerTierId, place: number): CareerProgress {
  const index = CAREER_TIERS.findIndex((tier) => tier.id === tierId);
  if (index < 0) return progress;
  const previous = progress.best[tierId];
  const best = { ...progress.best, [tierId]: previous === undefined ? place : Math.min(previous, place) };
  const unlocked = place <= 3 ? Math.max(progress.unlocked, Math.min(CAREER_TIERS.length, index + 2)) : progress.unlocked;
  return { unlocked, best };
}
