/** Career mode: race AI rivals over the same course as an online race. */

export type CareerTierId =
  | "rookie" | "street" | "pro" | "night" | "elite" | "endurance" | "legend" | "champion";

export type CareerTier = {
  id: CareerTierId;
  name: string;
  blurb: string;
  /**
   * How fast the rivals drive compared with a reference Musti GT cruising at full push.
   * A player holding the throttle reaches about 1.35, so cups above that need nitro,
   * clean driving and a faster (or upgraded) vehicle.
   */
  pace: number;
  /** Race length compared with an online race (1 = the same). */
  lengthScale: number;
  /** Prize for 1st, 2nd, 3rd and 4th place, in Jaa'izah. */
  rewards: [number, number, number, number];
  /** 0..1: how often rivals slip up (1 = often). */
  mistakes: number;
  /** 0..1: how strongly rivals stay close to the player (the "help" that keeps races tight). */
  rubber: number;
  /** 0..1: how much rivals overtake and block. */
  aggression: number;
  /** 0..1: how well rivals use their nitro. */
  nitroSkill: number;
  /** 0..1: which cars rivals drive (0 = the slowest, 1 = the fastest). */
  vehicleLevel: number;
};

export const CAREER_TIERS: CareerTier[] = [
  { id: "rookie", name: "Rookie Cup", blurb: "Friendly rivals. Learn the road.", pace: 1.08, lengthScale: 0.7, rewards: [150, 80, 40, 10], mistakes: 0.9, rubber: 1, aggression: 0.05, nitroSkill: 0.1, vehicleLevel: 0 },
  { id: "street", name: "Street Series", blurb: "Rivals start to fight for the racing line.", pace: 1.15, lengthScale: 0.8, rewards: [220, 110, 60, 15], mistakes: 0.75, rubber: 0.9, aggression: 0.2, nitroSkill: 0.25, vehicleLevel: 0.15 },
  { id: "pro", name: "Pro Series", blurb: "Sharper drivers who rarely slip up.", pace: 1.22, lengthScale: 0.9, rewards: [320, 160, 80, 20], mistakes: 0.6, rubber: 0.8, aggression: 0.35, nitroSkill: 0.4, vehicleLevel: 0.3 },
  { id: "night", name: "Night Sprint", blurb: "A short, brutal dash. No time to recover.", pace: 1.29, lengthScale: 0.75, rewards: [450, 225, 110, 30], mistakes: 0.5, rubber: 0.65, aggression: 0.5, nitroSkill: 0.55, vehicleLevel: 0.45 },
  { id: "elite", name: "Elite Cup", blurb: "As fast as you can go without nitro.", pace: 1.35, lengthScale: 1.0, rewards: [650, 325, 160, 40], mistakes: 0.4, rubber: 0.5, aggression: 0.6, nitroSkill: 0.7, vehicleLevel: 0.6 },
  { id: "endurance", name: "Endurance Run", blurb: "A very long race. One mistake and you are done.", pace: 1.4, lengthScale: 1.4, rewards: [900, 450, 225, 50], mistakes: 0.3, rubber: 0.4, aggression: 0.65, nitroSkill: 0.8, vehicleLevel: 0.75 },
  { id: "legend", name: "Legend Run", blurb: "The fastest rivals. Use every drop of nitro.", pace: 1.46, lengthScale: 1.1, rewards: [1300, 650, 325, 75], mistakes: 0.2, rubber: 0.3, aggression: 0.8, nitroSkill: 0.9, vehicleLevel: 0.9 },
  { id: "champion", name: "World Championship", blurb: "The best drivers alive. Nothing is handed to you.", pace: 1.52, lengthScale: 1.25, rewards: [2500, 1250, 600, 150], mistakes: 0.1, rubber: 0.15, aggression: 1, nitroSkill: 1, vehicleLevel: 1 },
];

export function raceLengthFor(tier: CareerTier, baseLength: number): number {
  return Math.round(baseLength * tier.lengthScale);
}

export const AI_NAMES = [
  "Turbo Tunde", "Nitro Nia", "Drift King", "Ghost", "Blaze", "Rocket Ren", "Vex", "Sade Storm",
  "Kofi Dash", "Zara Zoom", "Rico", "Ayo Apex", "Dami Drift", "Kemi Kick", "Boss Bolu", "Ada Apex",
];

const LANE_COUNT = 4;
export const laneCentre = (lane: number) => (lane + 0.5) / LANE_COUNT;
const LANES = Array.from({ length: LANE_COUNT }, (_, index) => laneCentre(index));

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
  /** 0.94 .. 1.08: how good this driver is. */
  skill: number;
  mistakeTimer: number;
  slowTimer: number;
  boostTimer: number;
  boostCooldown: number;
  finishedAt: number | null;
};

export const AI_PAINTS = ["#d62b2b", "#1f6feb", "#f0b429", "#18b26b", "#8b5cf6", "#f97316", "#e5e7eb", "#111827"];

/**
 * Creates the rivals. `vehicleIds` must be listed from the slowest vehicle to the fastest:
 * low cups use the slow ones and the top cups use the fastest.
 */
export function createAiRacers(tier: CareerTier, vehicleIds: string[], rand: () => number, count = 3): AiRacer[] {
  const names = [...AI_NAMES];
  const tierIndex = Math.max(0, CAREER_TIERS.findIndex((item) => item.id === tier.id));
  const racers: AiRacer[] = [];
  const centre = Math.round(tier.vehicleLevel * Math.max(0, vehicleIds.length - 1));
  for (let index = 0; index < count; index++) {
    const [name] = names.splice(Math.floor(rand() * names.length), 1);
    const lane = Math.min(LANE_COUNT - 1, index + 1);
    const pick = Math.max(0, Math.min(vehicleIds.length - 1, centre + Math.floor(rand() * 3) - 1));
    racers.push({
      id: `ai-${index + 1}`,
      name: name ?? `Rival ${index + 1}`,
      seat: index + 1,
      vehicleId: vehicleIds[pick] ?? "musti-gt",
      paint: AI_PAINTS[Math.floor(rand() * AI_PAINTS.length)]!,
      distance: -60 * (index + 1),
      lane: laneCentre(lane),
      targetLane: laneCentre(lane),
      laneTimer: 1 + rand() * 2,
      speed: 0,
      skill: 0.95 + rand() * 0.1 + tierIndex * 0.003,
      mistakeTimer: 5 + rand() * 6,
      slowTimer: 0,
      boostTimer: 0,
      boostCooldown: 5 + rand() * 8,
      finishedAt: null,
    });
  }
  return racers;
}

export type AiContext = {
  /** Seconds since the race started. */
  time: number;
  playerDistance: number;
  /** Where the player is across the road, 0 (left edge) to 1 (right edge). */
  playerLane: number;
  /**
   * The speed a reference car (a Musti GT) would be cruising at right now.
   * Rivals drive relative to this, NOT to the player's own car, so a faster or
   * upgraded vehicle really is an advantage.
   */
  reference: number;
  raceLength: number;
  tier: CareerTier;
  rand: () => number;
};

const nearestLane = (position: number) =>
  LANES.reduce((best, lane) => (Math.abs(lane - position) < Math.abs(best - position) ? lane : best), LANES[0]!);

/** Moves one AI racer forward by dt seconds. */
export function stepAiRacer(ai: AiRacer, dt: number, context: AiContext): void {
  if (ai.finishedAt !== null) {
    ai.speed = 0;
    return;
  }
  const { tier, rand } = context;
  const go = context.time > 1.5; // short countdown: nobody moves for the first 1.5 seconds
  const gap = ai.distance - context.playerDistance; // positive = the rival is ahead of the player
  const progress = Math.max(0, ai.distance) / Math.max(1, context.raceLength);

  // Slips: higher cups slip less often.
  ai.mistakeTimer -= dt;
  if (ai.mistakeTimer <= 0) {
    ai.mistakeTimer = 6 + rand() * 8;
    if (rand() < tier.mistakes * 0.75) ai.slowTimer = 0.9 + rand() * 0.7;
  }

  // Nitro: smart rivals save it for when they are behind and for the final stretch.
  ai.boostCooldown -= dt;
  if (ai.boostCooldown <= 0 && ai.boostTimer <= 0) {
    const losing = gap < 400;
    const finalPush = progress > 0.78;
    const smart = rand() < tier.nitroSkill;
    const use = smart ? losing || finalPush : rand() < 0.5;
    if (use) {
      ai.boostTimer = 2.2;
      ai.boostCooldown = 14 - 7 * tier.nitroSkill + rand() * 5;
    } else {
      ai.boostCooldown = 2 + rand() * 3;
    }
  }
  if (ai.slowTimer > 0) ai.slowTimer -= dt;
  if (ai.boostTimer > 0) ai.boostTimer -= dt;

  // Rubber band: help that keeps races close. Higher cups give much less of it.
  let band = 1;
  if (gap > 2200) band = 1 - 0.1 * tier.rubber;
  else if (gap > 1200) band = 1 - 0.04 * tier.rubber;
  else if (gap < -2200) band = 1 + 0.13 * tier.rubber;
  else if (gap < -1200) band = 1 + 0.05 * tier.rubber;

  // Slipstream: sitting right behind the player in the same lane is faster.
  const sameLane = Math.abs(ai.lane - context.playerLane) < 0.16;
  const draft = gap < 0 && gap > -260 && sameLane ? 1.05 : 1;

  let target = context.reference * tier.pace * ai.skill * band * draft;
  if (ai.slowTimer > 0) target *= 0.55;
  if (ai.boostTimer > 0) target *= 1.15;
  if (!go) target = 0;

  const response = Math.min(1, dt * (target > ai.speed ? 1.4 : 3));
  ai.speed += (target - ai.speed) * response;
  ai.distance += ai.speed * dt;

  // Lane choice: overtake when stuck behind the player, block when just ahead of them.
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTimer = Math.max(0.6, 1.8 + rand() * 2.6 - tier.aggression * 1.1);
    const behindPlayer = gap < 0 && gap > -380 && sameLane;
    const justAhead = gap > 0 && gap < 260;
    if (behindPlayer && rand() < 0.4 + 0.6 * tier.aggression) {
      // go round: the lane next to the player on the roomier side
      const roomRight = 1 - context.playerLane;
      const step = 1 / LANE_COUNT;
      const wanted = roomRight > context.playerLane ? context.playerLane + step : context.playerLane - step;
      ai.targetLane = nearestLane(Math.max(0.05, Math.min(0.95, wanted)));
    } else if (justAhead && tier.aggression > 0.35 && rand() < tier.aggression) {
      ai.targetLane = nearestLane(context.playerLane); // block the player's lane
    } else {
      ai.targetLane = LANES[Math.floor(rand() * LANE_COUNT)]!;
    }
  }
  ai.lane += (ai.targetLane - ai.lane) * Math.min(1, dt * (2.2 + 1.5 * tier.aggression));

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
  /** How many cups are open (1 = only the first cup). */
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
