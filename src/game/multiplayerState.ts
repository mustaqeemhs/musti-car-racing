export type OnlineRacer = {
  userId: string;
  username: string;
  laneRatio: number;
  distance: number;
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
    return [
      {
        userId: row["user_id"],
        username: row["username"],
        laneRatio: row["lane_ratio"],
        distance: row["distance"],
      },
    ];
  });
}

export function raceCountdownSeconds(startAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((startAt - now) / 1000));
}
