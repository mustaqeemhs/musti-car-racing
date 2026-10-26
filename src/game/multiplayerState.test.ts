import { describe, expect, it } from "vitest";
import {
  allRacersDone,
  applyLivePosition,
  classifyContact,
  formatDistanceToFinish,
  liveRaceOrder,
  parseLivePosition,
  parseRacePositions,
  parseRaceStandings,
  raceCountdownSeconds,
  stepRacerDisplays,
  syncRacerDisplays,
  type OnlineRacer,
  type RacerDisplay,
} from "./multiplayerState";

const racer = (distance: number, extra: Partial<OnlineRacer> = {}): OnlineRacer => ({
  userId: "friend",
  username: "Driver",
  seat: 1,
  vehicleId: "vulcan-x",
  paint: "#d62b2b",
  laneRatio: 0.5,
  distance,
  finished: false,
  finishSeconds: null,
  dnf: false,
  ...extra,
});

describe("multiplayer state", () => {
  it("parses valid remote racers (with their car) and excludes the local player", () => {
    expect(
      parseRacePositions(
        [
          { user_id: "self", username: "musti", lane_ratio: 0.5, distance: 120 },
          {
            user_id: "friend", username: "Driver", seat: 2, vehicle_id: "vulcan-x",
            vehicle_paint: "#d62b2b", lane_ratio: 0.75, distance: 310,
          },
          { user_id: "unready", username: "Racer", lane_ratio: null, distance: null },
          { user_id: "invalid", username: "Bad", lane_ratio: 2, distance: 10 },
          null,
        ],
        "self",
      ),
    ).toEqual([
      racer(310, { seat: 2, laneRatio: 0.75 }),
    ]);
  });

  it("rejects malformed car ids and colours", () => {
    const [parsed] = parseRacePositions(
      [{ user_id: "a", username: "A", vehicle_id: "BAD ID!", vehicle_paint: "red", lane_ratio: 0.1, distance: 5 }],
      "self",
    );
    expect(parsed?.vehicleId).toBeNull();
    expect(parsed?.paint).toBeNull();
  });

  it("derives countdown seconds from a shared timestamp", () => {
    expect(raceCountdownSeconds(10_000, 5_500)).toBe(5);
    expect(raceCountdownSeconds(10_000, 10_100)).toBe(0);
  });

  it("orders results: finishers by time, then the rest by distance, DNF last", () => {
    const standings = parseRaceStandings([
      { user_id: "c", username: "C", distance: 900, finished_at: null, finish_seconds: null },
      { user_id: "b", username: "B", distance: 30000, finished_at: "x", finish_seconds: 70 },
      { user_id: "a", username: "A", distance: 30000, finished_at: "x", finish_seconds: 60 },
      { user_id: "d", username: "D", distance: 4000, finished_at: null, finish_seconds: null, dnf: true },
    ]);
    expect(standings.map((row) => row.userId)).toEqual(["a", "b", "c", "d"]);
    expect(allRacersDone(standings)).toBe(false);
    expect(allRacersDone(standings.filter((row) => row.finished || row.dnf))).toBe(true);
    expect(allRacersDone([])).toBe(false);
  });

  it("counts a DNF racer as done", () => {
    const standings = parseRaceStandings([
      { user_id: "a", username: "A", distance: 1, finished_at: "x", finish_seconds: 60 },
      { user_id: "b", username: "B", distance: 1, finished_at: null, dnf: true },
    ]);
    expect(allRacersDone(standings)).toBe(true);
  });

  it("works out my live place", () => {
    const others = [
      { userId: "a", distance: 500 },
      { userId: "b", distance: 100 },
    ];
    expect(liveRaceOrder("me", 300, others)).toBe(2);
    expect(liveRaceOrder("me", 900, others)).toBe(1);
  });

  it("formats the distance to the finish", () => {
    expect(formatDistanceToFinish(0)).toBe("0 m");
    expect(formatDistanceToFinish(6925)).toBe("500 m");
    expect(formatDistanceToFinish(60000)).toBe("4.3 km");
  });

  it("glides another racer's car toward new positions instead of jumping", () => {
    const displays = new Map<string, RacerDisplay>();
    syncRacerDisplays(displays, [racer(1000)], 0);
    syncRacerDisplays(displays, [racer(1500)], 2000);
    const display = displays.get("friend");
    expect(display?.speed).toBe(250);
    expect(display?.distance).toBe(1000);

    stepRacerDisplays(displays, 2016, 0.016);
    const moved = displays.get("friend")?.distance ?? 0;
    expect(moved).toBeGreaterThan(1000);
    expect(moved).toBeLessThan(1500);

    syncRacerDisplays(displays, [], 3000);
    expect(displays.size).toBe(0);
  });

  it("takes live broadcast positions and ignores late or unknown ones", () => {
    const displays = new Map<string, RacerDisplay>();
    syncRacerDisplays(displays, [racer(1000)], 0);

    const live = parseLivePosition({ u: "friend", l: 0.3, d: 1200, v: 400 });
    expect(live).not.toBeNull();
    expect(applyLivePosition(displays, live!, 100)).toBe(true);
    expect(displays.get("friend")?.speed).toBe(400);
    expect(displays.get("friend")?.targetDistance).toBe(1200);

    // an older packet arriving late is ignored
    applyLivePosition(displays, { u: "friend", l: 0.9, d: 100, v: 1 }, 200);
    expect(displays.get("friend")?.targetDistance).toBe(1200);

    // unknown racer: ask the caller to refresh the roster
    expect(applyLivePosition(displays, { u: "stranger", l: 0.1, d: 5, v: 5 }, 300)).toBe(false);

    expect(parseLivePosition({ u: "x", l: 5, d: 1, v: 1 })).toBeNull();
    expect(parseLivePosition(null)).toBeNull();
  });

  it("keeps a finished racer parked at the line", () => {
    const displays = new Map<string, RacerDisplay>();
    syncRacerDisplays(displays, [racer(36000, { finished: true, finishSeconds: 61 })], 0);
    applyLivePosition(displays, { u: "friend", l: 0.9, d: 99999, v: 500 }, 100);
    expect(displays.get("friend")?.targetDistance).toBe(36000);
  });

  it("classifies car contact", () => {
    expect(classifyContact(200, 0, 60, 110)).toBe("none");
    expect(classifyContact(5, -80, 60, 110)).toBe("rear-ending");
    expect(classifyContact(5, 80, 60, 110)).toBe("rear-ended");
    expect(classifyContact(50, 10, 60, 110)).toBe("side");
  });
});

describe("smooth racing without live packets", () => {
  it("keeps following the saved copy when live packets stop, and prefers live packets while they flow", () => {
    const displays = new Map<string, RacerDisplay>();
    syncRacerDisplays(displays, [racer(1000)], 0);
    applyLivePosition(displays, { u: "friend", l: 0.5, d: 1100, v: 300 }, 100);

    // a saved copy arriving while live packets are fresh does not override them
    syncRacerDisplays(displays, [racer(900)], 400);
    expect(displays.get("friend")?.targetDistance).toBe(1100);

    // after the live packets stop, the saved copy is used again
    syncRacerDisplays(displays, [racer(1500)], 2500);
    expect(displays.get("friend")?.targetDistance).toBe(1500);
  });

  it("does not move computer-driven rivals with network smoothing", () => {
    const displays = new Map<string, RacerDisplay>();
    syncRacerDisplays(displays, [racer(0)], 0);
    const display = displays.get("friend")!;
    display.local = true;
    display.distance = 500;
    display.targetDistance = 500;
    stepRacerDisplays(displays, 5000, 0.016);
    expect(display.distance).toBe(500);
    syncRacerDisplays(displays, [racer(9999)], 6000);
    expect(displays.get("friend")?.targetDistance).toBe(500);
  });
});
