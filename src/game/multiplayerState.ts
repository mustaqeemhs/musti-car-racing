/** How far (in game distance units) a multiplayer race lasts. About 70 seconds of racing. */
export const MULTIPLAYER_RACE_LENGTH = 36000;

/** Game speed is shown as speed * 0.26 km/h, so one game unit is about 0.0722 metres. */
export const METRES_PER_UNIT = 0.0722;

export function unitsToMetres(units: number): number {
  return Math.max(0, Math.round(units * METRES_PER_UNIT));
}

/** "1,240 m" under a kilometre, "1.3 km" above. */
export function formatDistanceToFinish(units: number): string {
  const metres = unitsToMetres(units);
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${metres} m`;
}

export type OnlineRacer = {
  userId: string;
  username: string;
  seat: number;
  vehicleId: string | null;
  paint: string | null;
  laneRatio: number;
  distance: number;
  finished: boolean;
  finishSeconds: number | null;
  dnf: boolean;
};

function readSeat(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
}

function readPaint(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function readVehicleId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9-]{1,40}$/.test(value) ? value : null;
}

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
        seat: readSeat(row["seat"]),
        vehicleId: readVehicleId(row["vehicle_id"]),
        paint: readPaint(row["vehicle_paint"]),
        laneRatio: row["lane_ratio"],
        distance: row["distance"],
        finished: typeof row["finished_at"] === "string",
        finishSeconds:
          typeof finishSeconds === "number" && Number.isFinite(finishSeconds)
            ? finishSeconds
            : null,
        dnf: row["dnf"] === true,
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
  seat: number;
  vehicleId: string | null;
  paint: string | null;
  distance: number;
  finished: boolean;
  finishSeconds: number | null;
  dnf: boolean;
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
        seat: readSeat(row["seat"]),
        vehicleId: readVehicleId(row["vehicle_id"]),
        paint: readPaint(row["vehicle_paint"]),
        distance: typeof distance === "number" && Number.isFinite(distance) ? distance : 0,
        finished: typeof row["finished_at"] === "string",
        finishSeconds:
          typeof finishSeconds === "number" && Number.isFinite(finishSeconds)
            ? finishSeconds
            : null,
        dnf: row["dnf"] === true,
      },
    ];
  });

  return standings.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.finishSeconds ?? 0) - (b.finishSeconds ?? 0);
    if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
    return b.distance - a.distance;
  });
}

/** True when nobody is still racing: everyone has finished or is DNF. */
export function allRacersDone(standings: RaceStanding[]): boolean {
  return standings.length > 0 && standings.every((row) => row.finished || row.dnf);
}

/** Live order while the race is running (furthest first). */
export function liveRaceOrder(myUserId: string, myDistance: number, others: { userId: string; distance: number }[]): number {
  let place = 1;
  for (const other of others) {
    if (other.userId !== myUserId && other.distance > myDistance) place += 1;
  }
  return place;
}

/* ---------- smooth movement for other players' cars ----------
 * Positions arrive several times per second over the network. Drawing them
 * directly makes cars jump, especially on phones. These helpers keep a
 * "display" position per racer that glides toward where the car should be now.
 */

export type RacerDisplay = {
  userId: string;
  username: string;
  seat: number;
  vehicleId: string | null;
  paint: string | null;
  laneRatio: number;
  distance: number;
  finished: boolean;
  dnf: boolean;
  targetLane: number;
  targetDistance: number;
  targetAt: number;
  speed: number;
};

const MAX_RACER_SPEED = 2400; // distance units per second
const MAX_EXTRAPOLATION_SECONDS = 0.8;

/** Call whenever the full racer list arrives from the server. `now` is in milliseconds. */
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
        seat: racer.seat,
        vehicleId: racer.vehicleId,
        paint: racer.paint,
        laneRatio: racer.laneRatio,
        distance: racer.distance,
        finished: racer.finished,
        dnf: racer.dnf,
        targetLane: racer.laneRatio,
        targetDistance: racer.distance,
        targetAt: now,
        speed: 0,
      });
      continue;
    }
    // Live broadcast updates are fresher than the database copy. Only accept the
    // database copy when it is further ahead, or when the car has finished.
    const fresher = now - existing.targetAt > 1500;
    existing.username = racer.username;
    existing.seat = racer.seat;
    existing.vehicleId = racer.vehicleId;
    existing.paint = racer.paint;
    existing.finished = racer.finished;
    existing.dnf = racer.dnf;
    if (racer.finished) {
      existing.speed = 0;
      existing.targetDistance = racer.distance;
      existing.targetLane = racer.laneRatio;
      existing.targetAt = now;
    } else if (fresher) {
      const elapsed = (now - existing.targetAt) / 1000;
      if (elapsed > 0.05) {
        const measured = (racer.distance - existing.targetDistance) / elapsed;
        existing.speed = Math.max(0, Math.min(MAX_RACER_SPEED, measured));
      }
      existing.targetLane = racer.laneRatio;
      existing.targetDistance = racer.distance;
      existing.targetAt = now;
    }
  }
  for (const id of [...displays.keys()]) {
    if (!seen.has(id)) displays.delete(id);
  }
}

export type LivePositionMessage = { u: string; l: number; d: number; v: number };

export function parseLivePosition(payload: unknown): LivePositionMessage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p["u"] !== "string" ||
    typeof p["l"] !== "number" || !Number.isFinite(p["l"]) || p["l"] < 0 || p["l"] > 1 ||
    typeof p["d"] !== "number" || !Number.isFinite(p["d"]) || p["d"] < 0 ||
    typeof p["v"] !== "number" || !Number.isFinite(p["v"]) || p["v"] < 0
  ) {
    return null;
  }
  return { u: p["u"], l: p["l"], d: p["d"], v: Math.min(MAX_RACER_SPEED, p["v"]) };
}

/**
 * Applies a live (broadcast) position. Returns false when the racer is not known yet,
 * so the caller can ask the server for the racer list (names and cars).
 */
export function applyLivePosition(
  displays: Map<string, RacerDisplay>,
  message: LivePositionMessage,
  now: number,
): boolean {
  const display = displays.get(message.u);
  if (!display) return false;
  if (display.finished) return true;
  // Ignore messages that arrive out of order.
  if (message.d < display.targetDistance - 50) return true;
  display.targetLane = message.l;
  display.targetDistance = message.d;
  display.speed = message.v;
  display.targetAt = now;
  return true;
}

/** Call every frame. Moves each display position smoothly toward where the car should be now. */
export function stepRacerDisplays(
  displays: Map<string, RacerDisplay>,
  now: number,
  dt: number,
): void {
  const laneBlend = 1 - Math.exp(-14 * dt);
  const distanceBlend = 1 - Math.exp(-10 * dt);
  for (const display of displays.values()) {
    const sinceUpdate = Math.min(MAX_EXTRAPOLATION_SECONDS, Math.max(0, (now - display.targetAt) / 1000));
    const predicted = display.targetDistance + display.speed * sinceUpdate;
    display.distance += (predicted - display.distance) * distanceBlend;
    display.laneRatio += (display.targetLane - display.laneRatio) * laneBlend;
  }
}

/* ---------- car-to-car contact ---------- */

export type Contact = "none" | "rear-ended" | "rear-ending" | "side";

/**
 * Compares my car with another racer's car. dx/dy are the other car's centre minus mine
 * (screen pixels, y grows downward). A negative dy means they are ahead of me.
 */
export function classifyContact(dx: number, dy: number, carW: number, carH: number): Contact {
  const overlapX = carW * 0.92;
  const overlapY = carH * 0.95;
  if (Math.abs(dx) >= overlapX || Math.abs(dy) >= overlapY) return "none";
  const sideways = Math.abs(dx) / overlapX;
  const lengthwise = Math.abs(dy) / overlapY;
  if (sideways > lengthwise * 0.9 && lengthwise < 0.55) return "side";
  return dy < 0 ? "rear-ending" : "rear-ended";
}
