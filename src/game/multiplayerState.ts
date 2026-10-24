/** How far (in game distance units) a multiplayer race lasts. About one minute of racing. */
export const MULTIPLAYER_RACE_LENGTH = 30000;

export type OnlineRacer = {
  userId: string;
  username: string;
  laneRatio: number;
  distance: number;
  finished: boolean;
  finishSeconds: number | null;
};

export function parseRacePositions(rows: unknown, currentUserId: string): OnlineRacer[] {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((value): OnlineRacer[] => {
    if (typeof value !== "object" || value === null) return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row["user_id"] !== "string" ||
      row["user_id"] === currentUserId ||
      typeof row["username"] !== "string" ||
      typeof row["lane_ratio"] !== "number" ||
      !Number.isFinite(row["lane_ratio"]) ||
      row["lane_ratio"] < 0 ||
      row["lane_ratio"] > 1 ||
      typeof row["distance"] !== "number" ||
      !Number.isFinite(row["distance"]) ||
      row["distance"] < 0
    ) {
      return [];
    }
    const finishSeconds = row["finish_seconds"];
    return [
      {
        userId: row["user_id"],
        username: row["username"],
        laneRatio: row["lane_ratio"],
        distance: row["distance"],
        finished: typeof row["finished_at"] === "string",
        finishSeconds:
          typeof finishSeconds === "number" && Number.isFinite(finishSeconds)
            ? finishSeconds
            : null,
      },
    ];
  });
}

export function raceCountdownSeconds(startAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((startAt - now) / 1000));
}

/* ---------- results table ---------- */

export type RaceStanding = {
  userId: string;
  username: string;
  distance: number;
  finished: boolean;
  finishSeconds: number | null;
};

/** Parses every member of the room (including the local player), best first. */
export function parseRaceStandings(rows: unknown): RaceStanding[] {
  if (!Array.isArray(rows)) return [];

  const standings = rows.flatMap((value): RaceStanding[] => {
    if (typeof value !== "object" || value === null) return [];
    const row = value as Record<string, unknown>;
    if (typeof row["user_id"] !== "string" || typeof row["username"] !== "string") return [];
    const distance = row["distance"];
    const finishSeconds = row["finish_seconds"];
    return [
      {
        userId: row["user_id"],
        username: row["username"],
        distance: typeof distance === "number" && Number.isFinite(distance) ? distance : 0,
        finished: typeof row["finished_at"] === "string",
        finishSeconds:
          typeof finishSeconds === "number" && Number.isFinite(finishSeconds)
            ? finishSeconds
            : null,
      },
    ];
  });

  return standings.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishSeconds ?? 0) - (b.finishSeconds ?? 0);
    return b.distance - a.distance;
  });
}

export function allRacersFinished(standings: RaceStanding[]): boolean {
  return standings.length > 0 && standings.every((row) => row.finished);
}

/* ---------- smooth movement for other players' cars ----------
 * Positions arrive a few times per second over the network. Drawing them
 * directly makes the cars jump, especially on phones. These helpers keep a
 * "display" position per racer that glides toward the latest network position.
 */

export type RacerDisplay = {
  userId: string;
  username: string;
  laneRatio: number;
  distance: number;
  finished: boolean;
  targetLane: number;
  targetDistance: number;
  targetAt: number;
  speed: number;
};

const MAX_RACER_SPEED = 2000; // distance units per second
const MAX_EXTRAPOLATION_SECONDS = 1.2;

/** Call whenever fresh positions arrive from the server. `now` is in milliseconds. */
export function syncRacerDisplays(
  displays: Map<string, RacerDisplay>,
  racers: OnlineRacer[],
  now: number,
): void {
  const seen = new Set<string>();
  for (const racer of racers) {
    seen.add(racer.userId);
    const existing = displays.get(racer.userId);
    if (!existing) {
      displays.set(racer.userId, {
        userId: racer.userId,
        username: racer.username,
        laneRatio: racer.laneRatio,
        distance: racer.distance,
        finished: racer.finished,
        targetLane: racer.laneRatio,
        targetDistance: racer.distance,
        targetAt: now,
        speed: 0,
      });
      continue;
    }
    const elapsed = (now - existing.targetAt) / 1000;
    if (elapsed > 0.05) {
      const measured = (racer.distance - existing.targetDistance) / elapsed;
      existing.speed = Math.max(0, Math.min(MAX_RACER_SPEED, measured));
    }
    if (racer.finished) existing.speed = 0;
    existing.username = racer.username;
    existing.finished = racer.finished;
    existing.targetLane = racer.laneRatio;
    existing.targetDistance = racer.distance;
    existing.targetAt = now;
  }
  for (const id of [...displays.keys()]) {
    if (!seen.has(id)) displays.delete(id);
  }
}

/** Call every frame. Moves each display position smoothly toward where the car should be now. */
export function stepRacerDisplays(
  displays: Map<string, RacerDisplay>,
  now: number,
  dt: number,
): void {
  const laneBlend = 1 - Math.exp(-12 * dt);
  const distanceBlend = 1 - Math.exp(-8 * dt);
  for (const display of displays.values()) {
    const sinceUpdate = Math.min(MAX_EXTRAPOLATION_SECONDS, Math.max(0, (now - display.targetAt) / 1000));
    const predicted = display.targetDistance + display.speed * sinceUpdate;
    display.distance += (predicted - display.distance) * distanceBlend;
    display.laneRatio += (display.targetLane - display.laneRatio) * laneBlend;
  }
}
