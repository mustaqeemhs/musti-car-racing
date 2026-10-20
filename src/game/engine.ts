export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; boost: boolean };
export type Car = { x: number; y: number; w: number; h: number; vy: number; kind: "traffic" | "police"; color: string; seed: number; nearMiss?: boolean };
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

export const MAX_LIVES = 3;
export const BASE_SPEED = 260; // px/s
export const MAX_SPEED = 900;

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, shrink = 0.78) {
  const aw = (a.w * shrink) / 2, ah = (a.h * shrink) / 2, bw = (b.w * shrink) / 2, bh = (b.h * shrink) / 2;
  return Math.abs(a.x - b.x) < aw + bw && Math.abs(a.y - b.y) < ah + bh;
}

/** Pick spawn lanes so that at least one lane always stays open near the spawn row. */
export function pickLane(lanes: number, blocked: Set<number>, rand: () => number): number | null {
  const free = [...Array(lanes).keys()].filter((l) => !blocked.has(l));
  if (free.length <= 1) return null;
  return free[Math.floor(rand() * free.length)];
}

export function scoreFor(distance: number, time: number) {
  return Math.floor(distance / 10 + time * 5);
}
