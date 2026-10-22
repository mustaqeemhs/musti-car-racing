export type Gear = "D" | "N" | "R";
export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; boost: boolean; drift: boolean };
export type VehicleModel =
  | "sedan" | "coupe" | "suv" | "muscle" | "super" | "taxi" | "van" | "police"
  | "sportbike" | "naked" | "dirtbike" | "tourer";
export type Car = {
  x: number; y: number; w: number; h: number; vy: number;
  kind: "traffic" | "police"; color: string; seed: number;
  model?: VehicleModel; nearMiss?: boolean; ahead?: boolean;
};
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
export type Pickup = { x: number; y: number };

export const MAX_LIVES = 3;
export const BASE_SPEED = 260; // px/s
export const MAX_SPEED = 1250;
export const REVERSE_SPEED = 170; // px/s — slower than any forward speed
export const NITRO_PICKUP_AMOUNT = 0.34;

export const BIKE_MODELS: VehicleModel[] = ["sportbike", "naked", "dirtbike", "tourer"];
export function isBike(model: VehicleModel) {
  return BIKE_MODELS.includes(model);
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, shrink = 0.78) {
  const aw = (a.w * shrink) / 2, ah = (a.h * shrink) / 2, bw = (b.w * shrink) / 2, bh = (b.h * shrink) / 2;
  return Math.abs(a.x - b.x) < aw + bw && Math.abs(a.y - b.y) < ah + bh;
}

/** Pick spawn lanes so that at least one lane always stays open near the spawn row. */
export function pickLane(lanes: number, blocked: Set<number>, rand: () => number): number | null {
  const free = [...Array(lanes).keys()].filter((l) => !blocked.has(l));
  if (free.length <= 1) return null;
  return free[Math.floor(rand() * free.length)] ?? null;
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
export function accelRate(speed: number, boosting: boolean) {
  const frac = Math.min(1, Math.max(0, speed / MAX_SPEED));
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
export function pickupBoost(boost: number, amount = NITRO_PICKUP_AMOUNT) {
  return Math.min(1, boost + amount);
}
