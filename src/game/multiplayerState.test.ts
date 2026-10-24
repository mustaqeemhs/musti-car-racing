import { describe, expect, it } from "vitest";
import {
  allRacersFinished,
  parseRacePositions,
  parseRaceStandings,
  raceCountdownSeconds,
  stepRacerDisplays,
  syncRacerDisplays,
  type RacerDisplay,
} from "./multiplayerState";

describe("multiplayer state", () => {
  it("parses only valid remote racer positions and excludes the local player", () => {
    expect(
      parseRacePositions(
        [
          { user_id: "self", username: "musti", lane_ratio: 0.5, distance: 120 },
          { user_id: "friend", username: "Driver", lane_ratio: 0.75, distance: 310 },
          { user_id: "unready", username: "Racer", lane_ratio: null, distance: null },
          { user_id: "invalid", username: "Bad", lane_ratio: 2, distance: 10 },
          null,
        ],
        "self",
      ),
    ).toEqual([
      {
        userId: "friend",
        username: "Driver",
        laneRatio: 0.75,
        distance: 310,
        finished: false,
        finishSeconds: null,
      },
    ]);
  });

  it("marks finished racers and keeps their finish time", () => {
    const [racer] = parseRacePositions(
      [
        {
          user_id: "friend",
          username: "Driver",
          lane_ratio: 0.5,
          distance: 30000,
          finished_at: "2026-10-24T15:00:00Z",
          finish_seconds: 61.5,
        },
      ],
      "self",
    );
    expect(racer?.finished).toBe(true);
    expect(racer?.finishSeconds).toBe(61.5);
  });

  it("derives countdown seconds from a shared timestamp", () => {
    expect(raceCountdownSeconds(10_000, 5_500)).toBe(5);
    expect(raceCountdownSeconds(10_000, 10_100)).toBe(0);
  });

  it("orders results: finishers by time, then the rest by distance", () => {
    const standings = parseRaceStandings([
      { user_id: "c", username: "C", distance: 900, finished_at: null, finish_seconds: null },
      { user_id: "b", username: "B", distance: 30000, finished_at: "x", finish_seconds: 70 },
      { user_id: "a", username: "A", distance: 30000, finished_at: "x", finish_seconds: 60 },
      { user_id: "d", username: "D", distance: null, finished_at: null, finish_seconds: null },
    ]);
    expect(standings.map((row) => row.userId)).toEqual(["a", "b", "c", "d"]);
    expect(allRacersFinished(standings)).toBe(false);
    expect(allRacersFinished(standings.filter((row) => row.finished))).toBe(true);
    expect(allRacersFinished([])).toBe(false);
  });

  it("glides another racer's car toward new positions instead of jumping", () => {
    const displays = new Map<string, RacerDisplay>();
    const racer = (distance: number) => ({
      userId: "friend",
      username: "Driver",
      laneRatio: 0.5,
      distance,
      finished: false,
      finishSeconds: null,
    });

    syncRacerDisplays(displays, [racer(1000)], 0);
    syncRacerDisplays(displays, [racer(1500)], 1000);
    const display = displays.get("friend");
    expect(display?.speed).toBe(500);
    expect(display?.distance).toBe(1000);

    stepRacerDisplays(displays, 1016, 0.016);
    const moved = displays.get("friend")?.distance ?? 0;
    expect(moved).toBeGreaterThan(1000);
    expect(moved).toBeLessThan(1500);

    syncRacerDisplays(displays, [], 2000);
    expect(displays.size).toBe(0);
  });
});
