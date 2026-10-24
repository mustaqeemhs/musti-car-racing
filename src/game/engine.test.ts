import { describe, it, expect } from "vitest";
import {
  accelRate,
  claimPickupOnce,
  claimNearMiss,
  createPursuitState,
  generateCoinNitroFormation,
  generatePickupPattern,
  isNearMiss,
  overlaps,
  pickLane,
  pickPoliceLane,
  pickupBoost,
  PICKUP_PATTERN_INTERVALS,
  raceDifficulty,
  sceneryZoneBlend,
  tiltToSteer,
  updatePursuit,
} from "./engine";

describe("engine", () => {
  it("detects overlapping cars", () => {
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 10, y: 10, w: 40, h: 80 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 40, h: 80 }, { x: 100, y: 0, w: 40, h: 80 })).toBe(false);
  });
  it("detects close passes without rewarding collisions or distant passes", () => {
    const player = { x: 0, y: 0, w: 40, h: 80 };

    expect(isNearMiss(player, { x: 45, y: 0, w: 40, h: 80 })).toBe(true);
    expect(isNearMiss(player, { x: 20, y: 0, w: 40, h: 80 })).toBe(false);
    expect(isNearMiss(player, { x: 45, y: 100, w: 40, h: 80 })).toBe(false);
    expect(isNearMiss(player, { x: 100, y: 0, w: 40, h: 80 })).toBe(false);
  });
  it("claims a near-miss reward only once and never for a collision", () => {
    const player = { x: 0, y: 0, w: 40, h: 80 };
    const passedTraffic = { x: 45, y: 0, w: 40, h: 80 };
    const rewardState: { nearMiss?: boolean } = {};

    expect(claimNearMiss(rewardState, player, passedTraffic)).toBe(true);
    expect(claimNearMiss(rewardState, player, passedTraffic)).toBe(false);
    expect(claimNearMiss({}, player, { x: 20, y: 0, w: 40, h: 80 })).toBe(false);
  });
  it("scales race pressure and police behavior gradually with elapsed time", () => {
    const early = raceDifficulty(0);
    const mid = raceDifficulty(120);
    const late = raceDifficulty(300);

    expect(early.level).toBe(1);
    expect(early.policeLimit).toBe(1);
    expect(early.aheadPoliceChance).toBe(0);
    expect(mid.level).toBeGreaterThan(early.level);
    expect(mid.policeLimit).toBe(2);
    expect(mid.policeInterval).toBeLessThan(early.policeInterval);
    expect(late.level).toBeGreaterThan(mid.level);
    expect(late.policeLimit).toBe(3);
    expect(late.trafficDensity).toBeGreaterThan(mid.trafficDensity);
    expect(late.policeSteerSpeed).toBeGreaterThan(mid.policeSteerSpeed);
    expect(late.aheadPoliceChance).toBeGreaterThan(0);
  });
  it("never blocks the last open lane", () => {
    expect(pickLane(4, new Set([0, 1, 2]), Math.random)).toBeNull();
    expect(pickLane(4, new Set([0, 1]), () => 0)).toBe(2);
  });
  it("lets police use the only safe lane without selecting a blocked lane", () => {
    expect(pickPoliceLane(4, new Set([0, 1, 2]), () => 0)).toBe(3);
    expect(pickPoliceLane(4, new Set([0, 1, 2, 3]), Math.random)).toBeNull();
  });
  it("generates varied coin trails and multi-lane patterns only in valid lanes", () => {
    const trail = generatePickupPattern(4, new Set([0]), () => 0, "coin");
    expect(trail).toEqual([
      { lane: 1, row: 0 },
      { lane: 1, row: 1 },
      { lane: 1, row: 2 },
    ]);
    expect(trail.every((pickup, index) => index === 0 || pickup.row - trail[index - 1]!.row === 1)).toBe(true);

    const staggeredTrail = generatePickupPattern(4, new Set([3]), () => 0.25, "coin");
    expect(staggeredTrail).toHaveLength(3);
    expect(staggeredTrail.map(({ row }) => row)).toEqual([0, 1, 2]);
    expect(new Set(staggeredTrail.map(({ lane }) => lane)).size).toBe(3);
    expect(staggeredTrail.every(({ lane }) => lane !== 3)).toBe(true);

    const twoLanes = generatePickupPattern(4, new Set([3]), () => 0.4, "coin");
    const threeLanes = generatePickupPattern(4, new Set([3]), () => 0.6, "coin");
    const allAvailable = generatePickupPattern(4, new Set([3]), () => 0.95, "coin");
    expect(new Set(twoLanes.map(({ lane }) => lane)).size).toBe(2);
    expect(threeLanes).toHaveLength(3);
    expect(new Set(threeLanes.map(({ lane }) => lane)).size).toBe(3);
    expect(allAvailable.map(({ lane }) => lane).sort()).toEqual([0, 1, 2]);

    for (const placement of [...trail, ...twoLanes, ...threeLanes, ...allAvailable]) {
      expect(placement.lane).toBeGreaterThanOrEqual(0);
      expect(placement.lane).toBeLessThan(4);
      expect(placement.lane).not.toBe(3);
      expect(placement.row).toBeGreaterThanOrEqual(0);
    }
    expect(generatePickupPattern(4, new Set([0, 1, 2, 3]), Math.random, "coin")).toEqual([]);
    expect(generatePickupPattern(0, new Set(), Math.random, "coin")).toEqual([]);

    const fiveLaneSweep = generatePickupPattern(5, new Set(), () => 0.95, "coin");
    expect(fiveLaneSweep.map(({ lane }) => lane).sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("creates coin-and-nitro choices in separate available lanes and degrades safely", () => {
    const combo = generateCoinNitroFormation(4, new Set([3]), () => 0);
    expect(combo.coins).toHaveLength(2);
    expect(combo.nitro).toHaveLength(1);
    expect(combo.coins.every(({ lane }) => lane !== combo.nitro[0]!.lane)).toBe(true);
    expect([...combo.coins, ...combo.nitro].every(({ lane }) => lane >= 0 && lane < 3)).toBe(true);

    const constrained = generateCoinNitroFormation(4, new Set([0, 1, 2]), () => 0);
    expect(constrained.nitro).toEqual([]);
    expect(constrained.coins.length).toBeGreaterThan(0);
  });
  it("generates single, paired, and three-lane nitro patterns without repeated lane-row placements", () => {
    const solo = generatePickupPattern(4, new Set(), () => 0, "nitro");
    const pair = generatePickupPattern(4, new Set(), () => 0.8, "nitro");
    const trio = generatePickupPattern(4, new Set(), () => 0.99, "nitro");
    expect(solo).toHaveLength(1);
    expect(pair).toHaveLength(2);
    expect(trio).toHaveLength(3);
    for (const pattern of [solo, pair, trio]) {
      const positions = pattern.map(({ lane, row }) => `${lane}:${row}`);
      expect(new Set(positions).size).toBe(pattern.length);
      expect(pattern.every(({ lane }) => lane >= 0 && lane < 4)).toBe(true);
    }
  });
  it("schedules coins and nitro more often during normal play", () => {
    expect(PICKUP_PATTERN_INTERVALS.coin).toEqual({ min: 0.8, max: 1.2 });
    expect(PICKUP_PATTERN_INTERVALS.nitro).toEqual({ min: 2.4, max: 3.6 });
  });
  it("claims each pickup object once so one reward cannot be collected twice", () => {
    const pickup: { id: string; x: number; y: number; collected?: boolean } = {
      id: "race:coin:1",
      x: 120,
      y: 80,
    };
    expect(claimPickupOnce(pickup)).toBe(true);
    expect(claimPickupOnce(pickup)).toBe(false);
    expect(pickup.collected).toBe(true);
  });
  it("raises wanted levels from collisions, with hazards less severe than traffic", () => {
    const traffic = updatePursuit(createPursuitState(), 0, 0, {
      id: "traffic:1",
      kind: "traffic-collision",
    });
    const hazard = updatePursuit(createPursuitState(), 0, 0, {
      id: "hazard:1",
      kind: "hazard-collision",
    });

    expect(traffic.state.wantedLevel).toBe(2);
    expect(traffic.events).toContain("pursuit-started");
    const duplicate = updatePursuit(traffic.state, 0, 0, {
      id: "traffic:1",
      kind: "traffic-collision",
    });
    expect(duplicate.incidentAccepted).toBe(false);
    expect(duplicate.state.alert).toBe(traffic.state.alert);
    expect(hazard.state.wantedLevel).toBe(1);
    expect(hazard.state.alert).toBeLessThan(traffic.state.alert);
  });
  it("raises wanted level three only after accumulated pressure", () => {
    let state = createPursuitState();
    for (let i = 1; i <= 2; i++) {
      state = updatePursuit(state, 0, 0, {
        id: `collision:${i}`,
        kind: "traffic-collision",
      }).state;
    }
    expect(state.wantedLevel).toBe(3);
    state = updatePursuit(state, 1, 1).state;
    expect(state.alert).toBeLessThan(70);
    expect(state.wantedLevel).toBe(3);
  });
  it("counts one alert per incident and allows near-miss attention to build gradually", () => {
    let state = createPursuitState();
    const first = updatePursuit(state, 0, 0, {
      id: "near-miss:traffic:1",
      kind: "near-miss",
    });
    state = first.state;
    const duplicate = updatePursuit(state, 0, 0, {
      id: "near-miss:traffic:1",
      kind: "near-miss",
    });
    expect(first.incidentAccepted).toBe(true);
    expect(duplicate.incidentAccepted).toBe(false);
    expect(duplicate.state.alert).toBe(first.state.alert);

    for (let i = 2; i <= 8; i++) {
      state = updatePursuit(state, 0, 0, {
        id: `near-miss:traffic:${i}`,
        kind: "near-miss",
      }).state;
    }
    expect(state.wantedLevel).toBe(2);
  });
  it("starts an alert and then a guaranteed pursuit for a clean race", () => {
    const alert = updatePursuit(createPursuitState(), 0, 22);
    const chase = updatePursuit(alert.state, 0, 32);

    expect(alert.state.wantedLevel).toBe(1);
    expect(alert.events).toContain("fallback-alert");
    expect(chase.state.wantedLevel).toBe(2);
    expect(chase.events).toContain("pursuit-started");
  });
  it("allows escape after quiet driving and suppresses incidents during cooldown", () => {
    let state = updatePursuit(createPursuitState(), 0, 0, {
      id: "collision:traffic:1",
      kind: "traffic-collision",
    }).state;
    let events: string[] = [];
    for (let i = 0; i < 400; i++) {
      const update = updatePursuit(state, 0.05, (i + 1) * 0.05);
      state = update.state;
      events = update.events;
      if (events.includes("escaped")) break;
    }

    expect(events).toContain("escaped");
    expect(state.wantedLevel).toBe(0);
    expect(state.cooldown).toBeGreaterThan(0);
    const suppressed = updatePursuit(state, 0, 30, {
      id: "collision:traffic:2",
      kind: "traffic-collision",
    });
    expect(suppressed.incidentAccepted).toBe(false);
    expect(suppressed.state.wantedLevel).toBe(0);
    const cooldownAlmostExpired = updatePursuit(state, 21.95, 51.95).state;
    const afterCooldown = updatePursuit(cooldownAlmostExpired, 0.05, 52, {
      id: "collision:traffic:2",
      kind: "traffic-collision",
    });
    expect(afterCooldown.incidentAccepted).toBe(true);
    expect(afterCooldown.state.wantedLevel).toBe(2);
  });
  it("resets pursuit state for a new race", () => {
    const initial = createPursuitState();
    const triggered = updatePursuit(initial, 0, 0, {
      id: "collision:traffic:1",
      kind: "traffic-collision",
    }).state;
    expect(triggered.wantedLevel).toBe(2);
    expect(createPursuitState()).toEqual(initial);
  });
  it("smoothly rotates scenery between city and countryside zones", () => {
    expect(sceneryZoneBlend(0)).toBe(0);
    expect(sceneryZoneBlend(8_000)).toBeCloseTo(0);
    expect(sceneryZoneBlend(9_000)).toBeCloseTo(0.5);
    expect(sceneryZoneBlend(10_000)).toBe(1);
    expect(sceneryZoneBlend(18_000)).toBe(1);
    expect(sceneryZoneBlend(20_000)).toBe(1);
    expect(sceneryZoneBlend(21_000)).toBeCloseTo(0.5);
    expect(sceneryZoneBlend(22_000)).toBeCloseTo(0);
    expect(sceneryZoneBlend(24_000)).toBeCloseTo(sceneryZoneBlend(0));
  });
  it("tilt inside the deadzone does not steer", () => {
    expect(tiltToSteer(12, 10, 1, 3)).toBe(0);
  });
  it("tilt steers relative to calibrated neutral and clamps", () => {
    expect(tiltToSteer(40, 10, 1, 3)).toBe(1);
    expect(tiltToSteer(-50, 10, 1, 3)).toBe(-1);
    expect(tiltToSteer(23.5, 10, 1, 3)).toBeCloseTo(10.5 / 27, 2); // linear from deadzone to 30° lock
  });
  it("acceleration slows near top speed and nitro accelerates harder", () => {
    expect(accelRate(1200, false)).toBeLessThan(accelRate(200, false));
    expect(accelRate(500, true)).toBeGreaterThan(accelRate(500, false));
  });
  it("refills nitro from a pickup without exceeding full", () => {
    expect(pickupBoost(0.5)).toBeCloseTo(0.84);
    expect(pickupBoost(0.9)).toBe(1);
    expect(pickupBoost(1)).toBe(1);
  });
});
