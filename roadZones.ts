/**
 * Road forks: now and then the highway splits into corridors with a concrete median between them.
 *  - "triple": left lane = SHORTCUT (saves distance, crowded), middle two lanes = MAIN road,
 *              right lane = NITRO route (clear road, coins and free nitro).
 *  - "double": left two lanes = SHORTCUT, right two lanes = MAIN road.
 * The forks come from a seed, so every player in the same room sees the forks at the same place.
 */

export type ZoneKind = "triple" | "double";
export type Corridor = "shortcut" | "main" | "nitro";
export type RoadZone = { index: number; kind: ZoneKind; start: number; length: number };

export const FORK_FIRST = 6500;
export const FORK_SPACING = 11000;
/** The warning signs appear this far before the split. */
export const FORK_WARNING = 900;
/** The median grows over this distance at the start of a fork and shrinks at its end. */
export const FORK_TAPER = 350;
/** A fork never overlaps the last stretch before the finish line. */
export const FORK_FINISH_GAP = 4500;
const LANES = 4;

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A repeatable random number between 0 and 1 for (seed, index, salt). */
export function seededUnit(seed: string, index: number, salt: number): number {
  let value = (hashSeed(`${seed}|${index}|${salt}`) + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function zoneByIndex(seed: string, index: number): RoadZone {
  const jitter = (seededUnit(seed, index, 1) - 0.5) * 2400;
  return {
    index,
    kind: seededUnit(seed, index, 2) < 0.55 ? "triple" : "double",
    start: Math.round(FORK_FIRST + index * FORK_SPACING + jitter),
    length: Math.round(2800 + seededUnit(seed, index, 3) * 1000),
  };
}

export type ZoneState = { zone: RoadZone | null; phase: "none" | "warning" | "inside"; progress: number };

/** Where the car is relative to the forks: before one (warning), inside one, or on open road. */
export function zoneAt(seed: string, distance: number, raceLength = Infinity): ZoneState {
  if (!seed || distance < FORK_FIRST - FORK_WARNING - 2500) return { zone: null, phase: "none", progress: 0 };
  const guess = Math.floor((distance - FORK_FIRST) / FORK_SPACING);
  for (let index = Math.max(0, guess - 1); index <= guess + 1; index++) {
    const zone = zoneByIndex(seed, index);
    if (zone.start + zone.length > raceLength - FORK_FINISH_GAP) continue;
    if (distance >= zone.start && distance <= zone.start + zone.length) {
      return { zone, phase: "inside", progress: (distance - zone.start) / zone.length };
    }
    if (distance >= zone.start - FORK_WARNING && distance < zone.start) {
      return { zone, phase: "warning", progress: 0 };
    }
  }
  return { zone: null, phase: "none", progress: 0 };
}

/** Every fork that overlaps a stretch of road (used to draw them). */
export function zonesBetween(seed: string, from: number, to: number, raceLength = Infinity): RoadZone[] {
  if (!seed) return [];
  const zones: RoadZone[] = [];
  const first = Math.max(0, Math.floor((from - FORK_FIRST) / FORK_SPACING) - 1);
  const last = Math.floor((to - FORK_FIRST) / FORK_SPACING) + 1;
  for (let index = first; index <= last; index++) {
    const zone = zoneByIndex(seed, index);
    if (zone.start + zone.length > raceLength - FORK_FINISH_GAP) continue;
    if (zone.start + zone.length >= from && zone.start - FORK_WARNING <= to) zones.push(zone);
  }
  return zones;
}

/** Positions of the forks along a race (0..1), for the map bar. */
export function forkMarks(seed: string, raceLength: number): number[] {
  const marks: number[] = [];
  for (let index = 0; index < 40; index++) {
    const zone = zoneByIndex(seed, index);
    if (zone.start + zone.length > raceLength - FORK_FINISH_GAP) break;
    marks.push(Math.round((zone.start / raceLength) * 1000) / 1000);
  }
  return marks;
}

/** Which corridor a lane (0 = far left) belongs to. */
export function corridorFor(kind: ZoneKind, lane: number): Corridor {
  const index = Math.max(0, Math.min(LANES - 1, Math.floor(lane)));
  if (kind === "triple") return index === 0 ? "shortcut" : index === LANES - 1 ? "nitro" : "main";
  return index < 2 ? "shortcut" : "main";
}

export function lanesOf(kind: ZoneKind, corridor: Corridor): number[] {
  return Array.from({ length: LANES }, (_, lane) => lane).filter((lane) => corridorFor(kind, lane) === corridor);
}

/** The lane numbers where a median wall stands (between two corridors). */
export function medianLanes(kind: ZoneKind): number[] {
  return kind === "triple" ? [1, 3] : [2];
}

/** The sideways limits of a corridor, in lane units (0 = left edge of the road, 4 = right edge). */
export function corridorBounds(kind: ZoneKind, corridor: Corridor): { min: number; max: number } {
  const lanes = lanesOf(kind, corridor);
  if (lanes.length === 0) return { min: 0, max: LANES };
  return { min: Math.min(...lanes), max: Math.max(...lanes) + 1 };
}

export type CorridorEffect = {
  /** Extra distance gained for every metre driven (0.3 = 30% faster progress). */
  distanceBonus: number;
  /** Nitro refilled per second, as a share of the tank. */
  nitroRegen: number;
};

export const CORRIDOR_EFFECT: Record<Corridor, CorridorEffect> = {
  shortcut: { distanceBonus: 0.3, nitroRegen: 0 },
  main: { distanceBonus: 0, nitroRegen: 0 },
  nitro: { distanceBonus: 0, nitroRegen: 0.22 },
};

/** How thick the median wall is (0..1): it grows after the split starts and shrinks before the end. */
export function medianGrowth(zone: RoadZone, distance: number): number {
  const fromStart = distance - zone.start;
  const toEnd = zone.start + zone.length - distance;
  if (fromStart < 0 || toEnd < 0) return 0;
  return Math.max(0, Math.min(1, fromStart / FORK_TAPER, toEnd / FORK_TAPER));
}
