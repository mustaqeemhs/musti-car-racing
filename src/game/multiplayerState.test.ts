import { describe, expect, it } from "vitest";
import { parseRacePositions, raceCountdownSeconds } from "./multiplayerState";

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
    ).toEqual([{ userId: "friend", username: "Driver", laneRatio: 0.75, distance: 310 }]);
  });

  it("derives countdown seconds from a shared timestamp", () => {
    expect(raceCountdownSeconds(10_000, 5_500)).toBe(5);
    expect(raceCountdownSeconds(10_000, 10_100)).toBe(0);
  });
});
