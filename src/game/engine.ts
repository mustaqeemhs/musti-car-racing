export type Gear = "D" | "N" | "R";
export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; boost: boolean; drift: boolean };
export type VehicleModel =
  | "sedan" | "coupe" | "suv" | "muscle" | "super" | "taxi" | "van" | "police"
  | "sportbike" | "naked" | "dirtbike" | "tourer";
export type Car = {
  id?: string; x: number; y: number; w: number; h: number; vy: number;
  kind: "traffic" | "police"; color: string; seed: number;
  model?: VehicleModel; nearMiss?: boolean; ahead?: boolean;
};
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
export type Pickup = { id?: string; x: number; y: number; collected?: boolean };
export type Coin = { id?: string; x: number; y: number; collected?: boolean };
export type Hazard = {
  id?: string;
  kind: "cone" | "debris";
  x: number;
  y: number;
  w: number;
  h: number;
  nearMiss?: boolean;
};

export const MAX_LIVES = 3;
export const BASE_SPEED = 260; // px/s
export const MAX_SPEED = 1250;
export const REVERSE_SPEED = 170; // px/s — slower than any forward speed
export const NITRO_PICKUP_AMOUNT = 0.34;

export type PickupPlacement = { lane: number; row: number };
export type PickupPatternKind = "coin" | "nitro";
export const PICKUP_PATTERN_INTERVALS = {
  coin: { min: 0.8, max: 1.2 },
  nitro: { min: 2.4, max: 3.6 },
} as const;

function randomIndex(length: number, rand: () => number): number {
  const value = rand();
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
  return Math.floor(normalized * length);
}

export function generatePickupPattern(
  lanes: number,
  blocked: Set<number>,
  rand: () => number,
  kind: PickupPatternKind,
): PickupPlacement[] {
  const laneCount = Number.isFinite(lanes) ? Math.floor(lanes) : 0;
  if (laneCount <= 0) return [];
  const available = Array.from({ length: laneCount }, (_, lane) => lane).filter(
    (lane) => !blocked.has(lane),
  );
  if (available.length === 0) return [];

  const roll = randomIndex(100, rand);
  if (kind === "coin" && roll < 20) {
    const lane = available[randomIndex(available.length, rand)]!;
    const length = 3 + randomIndex(2, rand);
    return Array.from({ length }, (_, index) => ({ lane, row: index }));
  }

  const shuffled = [...available];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = randomIndex(index + 1, rand);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }

  if (kind === "coin") {
    if (roll < 36 && shuffled.length > 1) {
      return shuffled.slice(0, Math.min(3, shuffled.length)).map((lane, row) => ({
        lane,
        row,
      }));
    }
    const count =
      roll < 48
        ? Math.min(2, shuffled.length)
        : roll < 72
          ? Math.min(3, shuffled.length)
          : roll < 90
            ? Math.min(2, shuffled.length)
            : shuffled.length;
    return shuffled.slice(0, count).map((lane) => ({ lane, row: 0 }));
  }

  if (roll < 62) {
    return [{ lane: shuffled[0]!, row: 0 }];
  }
  if (roll < 91) {
    return shuffled.slice(0, Math.min(2, shuffled.length)).map((lane, index) => ({
      lane,
      row: index * 2,
    }));
  }
  return shuffled.slice(0, Math.min(3, shuffled.length)).map((lane, index) => ({
    lane,
    row: index * 2,
  }));
}

export function generateCoinNitroFormation(
  lanes: number,
  blocked: Set<number>,
  rand: () => number,
): { coins: PickupPlacement[]; nitro: PickupPlacement[] } {
  const laneCount = Number.isFinite(lanes) ? Math.floor(lanes) : 0;
  const available = Array.from({ length: Math.max(0, laneCount) }, (_, lane) => lane)
    .filter((lane) => !blocked.has(lane));
  if (available.length < 2 || randomIndex(100, rand) >= 24) {
    return {
      coins: generatePickupPattern(laneCount, blocked, rand, "coin"),
      nitro: [],
    };
  }

  const shuffled = [...available];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = randomIndex(index + 1, rand);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  const coinLanes = shuffled.slice(0, Math.min(2, shuffled.length - 1));
  return {
    coins: coinLanes.map((lane) => ({ lane, row: 0 })),
    nitro: [{ lane: shuffled[coinLanes.length]!, row: 0 }],
  };
}

export function claimPickupOnce(pickup: { collected?: boolean }): boolean {
  if (pickup.collected) return false;
  pickup.collected = true;
  return true;
}

export type BikeModel = "sportbike" | "naked" | "dirtbike" | "tourer";
export const BIKE_MODELS: BikeModel[] = ["sportbike", "naked", "dirtbike", "tourer"];
export function isBike(model: VehicleModel): model is BikeModel {
  return (
    model === "sportbike" ||
    model === "naked" ||
    model === "dirtbike" ||
    model === "tourer"
  );
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, shrink = 0.78) {
  const aw = (a.w * shrink) / 2, ah = (a.h * shrink) / 2, bw = (b.w * shrink) / 2, bh = (b.h * shrink) / 2;
  return Math.abs(a.x - b.x) < aw + bw && Math.abs(a.y - b.y) < ah + bh;
}

export function isNearMiss(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  maxGap = a.w * 0.8,
) {
  const verticalOverlap = Math.abs(a.y - b.y) < (a.h + b.h) * 0.39;
  const horizontalGap = Math.abs(a.x - b.x) - (a.w + b.w) * 0.39;
  return verticalOverlap && horizontalGap >= 0 && horizontalGap <= maxGap;
}

export function claimNearMiss(
  reward: { nearMiss?: boolean },
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  if (reward.nearMiss || overlaps(a, b) || !isNearMiss(a, b)) return false;
  reward.nearMiss = true;
  return true;
}

export type RaceDifficulty = {
  level: number;
  pressure: number;
  trafficDensity: number;
  policeLimit: number;
  policeInterval: number;
  aheadPoliceChance: number;
  policeSteerSpeed: number;
};

export type WantedLevel = 0 | 1 | 2 | 3;
export type PursuitIncidentKind = "traffic-collision" | "hazard-collision" | "near-miss";
export type PursuitState = {
  alert: number;
  wantedLevel: WantedLevel;
  quietTime: number;
  cooldown: number;
  fallbackTriggered: boolean;
  fallbackChaseTriggered: boolean;
  processedIncidents: string[];
};
export type PursuitEvent =
  | "alert-raised"
  | "pursuit-started"
  | "wanted-level-raised"
  | "escaped"
  | "fallback-alert";
export type PursuitUpdate = {
  state: PursuitState;
  events: PursuitEvent[];
  incidentAccepted: boolean;
};

export const PURSUIT_ALERT_THRESHOLD = 30;
export const PURSUIT_ESCAPE_QUIET_SECONDS = 14;
export const PURSUIT_COOLDOWN_SECONDS = 22;
export const PURSUIT_FALLBACK_ALERT_SECONDS = 22;
export const PURSUIT_FALLBACK_CHASE_SECONDS = 32;

export function createPursuitState(): PursuitState {
  return {
    alert: 0,
    wantedLevel: 0,
    quietTime: 0,
    cooldown: 0,
    fallbackTriggered: false,
    fallbackChaseTriggered: false,
    processedIncidents: [],
  };
}

function getWantedLevel(alert: number): WantedLevel {
  if (alert >= 70) return 3;
  if (alert >= PURSUIT_ALERT_THRESHOLD) return 2;
  return alert > 0 ? 1 : 0;
}

export function updatePursuit(
  previous: PursuitState,
  dt: number,
  elapsedSeconds: number,
  incident?: { id: string; kind: PursuitIncidentKind },
): PursuitUpdate {
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  let alert = previous.alert;
  let quietTime = previous.quietTime;
  const cooldownRemaining = Math.max(0, previous.cooldown - step);
  let cooldown = cooldownRemaining < 1e-6 ? 0 : cooldownRemaining;
  let fallbackTriggered = previous.fallbackTriggered;
  let fallbackChaseTriggered = previous.fallbackChaseTriggered;
  let processedIncidents = previous.processedIncidents;
  const events: PursuitEvent[] = [];
  let incidentAccepted = false;

  if (
    incident &&
    incident.id.length > 0 &&
    cooldown === 0 &&
    !processedIncidents.includes(incident.id)
  ) {
    const increment =
      incident.kind === "traffic-collision"
        ? 36
        : incident.kind === "hazard-collision"
          ? 18
          : 4;
    alert = Math.min(100, alert + increment);
    quietTime = 0;
    processedIncidents = [...processedIncidents, incident.id].slice(-256);
    incidentAccepted = true;
  }

  if (
    !incidentAccepted &&
    previous.wantedLevel === 0 &&
    !fallbackTriggered &&
    cooldown === 0 &&
    elapsed >= PURSUIT_FALLBACK_ALERT_SECONDS
  ) {
    alert = Math.max(alert, 14);
    fallbackTriggered = true;
    events.push("fallback-alert");
  }
  if (
    !incidentAccepted &&
    fallbackTriggered &&
    !fallbackChaseTriggered &&
    cooldown === 0 &&
    elapsed >= PURSUIT_FALLBACK_CHASE_SECONDS
  ) {
    alert = Math.max(alert, PURSUIT_ALERT_THRESHOLD + 2);
    fallbackChaseTriggered = true;
  }

  const wantedLevel = getWantedLevel(alert);
  if (incidentAccepted) events.push("alert-raised");
  if (wantedLevel > previous.wantedLevel) {
    events.push(
      previous.wantedLevel < 2 && wantedLevel >= 2
        ? "pursuit-started"
        : "wanted-level-raised",
    );
  }

  const pursuitActive = previous.wantedLevel >= 2 || wantedLevel >= 2;
  if (pursuitActive) {
    quietTime += step;
    alert = Math.max(0, alert - step * 2.5);
    if (quietTime >= PURSUIT_ESCAPE_QUIET_SECONDS && alert < PURSUIT_ALERT_THRESHOLD) {
      alert = 0;
      quietTime = 0;
      cooldown = PURSUIT_COOLDOWN_SECONDS;
      events.push("escaped");
    }
  } else if (wantedLevel === 1) {
    quietTime += step;
    alert = Math.max(0, alert - step * 1.5);
  } else {
    quietTime = 0;
  }

  const nextWantedLevel = getWantedLevel(alert);
  return {
    state: {
      alert,
      wantedLevel: events.includes("escaped")
        ? 0
        : previous.wantedLevel >= 2 && nextWantedLevel < previous.wantedLevel
          ? previous.wantedLevel
          : nextWantedLevel,
      quietTime,
      cooldown,
      fallbackTriggered,
      fallbackChaseTriggered,
      processedIncidents,
    },
    events,
    incidentAccepted,
  };
}

export function raceDifficulty(elapsedSeconds: number): RaceDifficulty {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  const pressure = Math.min(1, elapsed / 240);
  return {
    level: 1 + Math.floor(elapsed / 60),
    pressure,
    trafficDensity: Math.min(1, elapsed / 150),
    policeLimit: elapsed < 60 ? 1 : elapsed < 150 ? 2 : 3,
    policeInterval: 12 - pressure * 5,
    aheadPoliceChance:
      elapsed < 120 ? 0 : Math.min(0.16, (elapsed - 120) / 600),
    policeSteerSpeed: 85 + pressure * 65,
  };
}

/** Pick spawn lanes so that at least one lane always stays open near the spawn row. */
export function pickLane(lanes: number, blocked: Set<number>, rand: () => number): number | null {
  const free = [...Array(lanes).keys()].filter((l) => !blocked.has(l));
  if (free.length <= 1) return null;
  return free[Math.floor(rand() * free.length)] ?? null;
}

export function pickPoliceLane(
  lanes: number,
  blocked: Set<number>,
  rand: () => number,
): number | null {
  const free = [...Array(lanes).keys()].filter((lane) => !blocked.has(lane));
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.floor(Math.max(0, rand()) * free.length));
  return free[index] ?? null;
}

export function sceneryZoneBlend(distance: number): number {
  const cycle = ((Number.isFinite(distance) ? distance : 0) % 24_000 + 24_000) % 24_000;
  const smooth = (progress: number) => progress * progress * (3 - 2 * progress);
  if (cycle < 8_000) return 0;
  if (cycle < 10_000) return smooth((cycle - 8_000) / 2_000);
  if (cycle < 20_000) return 1;
  if (cycle < 22_000) return 1 - smooth((cycle - 20_000) / 2_000);
  return 0;
}

export function scoreFor(distance: number, time: number) {
  return Math.floor(distance / 10 + time * 5);
}

/**
 * Convert a device tilt angle (degrees) into a steering axis in [-1, 1].
 * sensitivity 1 = full lock at 30° from neutral; deadzone in degrees.
 */
export function tiltToSteer(angle: number, neutral: number, sensitivity: number, deadzone = 3) {
  const d = angle - neutral;
  if (Math.abs(d) <= deadzone) return 0;
  const range = 30 / Math.max(0.2, sensitivity);
  const v = (Math.abs(d) - deadzone) / Math.max(1, range - deadzone);
  return Math.sign(d) * Math.min(1, v);
}

/** Gradual acceleration: response rate shrinks as you approach top speed. */
export function accelRate(speed: number, boosting: boolean, maxSpeed = MAX_SPEED) {
  const frac = Math.min(1, Math.max(0, speed / maxSpeed));
  return (boosting ? 2.4 : 1.1) * (1 - 0.65 * frac);
}

/**
 * Effective gear: while driving forward, holding brake near a standstill
 * engages reverse automatically. Explicit N/R gears are chosen in the UI.
 */
export function effGear(gear: Gear, brakeHeld: boolean, speed: number): Gear {
  if (gear === "N" || gear === "R") return gear;
  return brakeHeld && speed < 30 ? "R" : "D";
}

/** Nitro canisters refill the boost meter, capped at full. */
export function pickupBoost(
  boost: number,
  amount = NITRO_PICKUP_AMOUNT,
  capacity = 1,
) {
  return Math.min(capacity, boost + amount);
}
