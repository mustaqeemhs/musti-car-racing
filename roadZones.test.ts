import { describe, expect, it } from "vitest";
import {
  CORRIDOR_EFFECT,
  FORK_FINISH_GAP,
  FORK_FIRST,
  FORK_WARNING,
  corridorBounds,
  corridorFor,
  forkMarks,
  lanesOf,
  medianGrowth,
  medianLanes,
  zoneAt,
  zoneByIndex,
  zonesBetween,
} from "./roadZones";

describe("road forks", () => {
  it("makes the same forks for everyone with the same seed, and different ones for another seed", () => {
    expect(zoneByIndex("room-1", 3)).toEqual(zoneByIndex("room-1", 3));
    const a = [0, 1, 2, 3].map((index) => zoneByIndex("room-1", index).start);
    const b = [0, 1, 2, 3].map((index) => zoneByIndex("room-2", index).start);
    expect(a).not.toEqual(b);
  });

  it("keeps forks in order, long enough, and apart from each other", () => {
    for (const seed of ["a", "b", "c"]) {
      for (let index = 0; index < 12; index++) {
        const zone = zoneByIndex(seed, index);
        const next = zoneByIndex(seed, index + 1);
        expect(zone.length).toBeGreaterThanOrEqual(2800);
        expect(zone.length).toBeLessThanOrEqual(3800);
        expect(next.start).toBeGreaterThan(zone.start + zone.length + 3000);
        expect(zone.start).toBeGreaterThan(FORK_FIRST - 1300);
      }
    }
  });

  it("tells you when a fork is coming and when you are inside it", () => {
    const zone = zoneByIndex("seed", 0);
    expect(zoneAt("seed", 100).phase).toBe("none");
    expect(zoneAt("seed", zone.start - FORK_WARNING - 10).phase).toBe("none");
    expect(zoneAt("seed", zone.start - 100).phase).toBe("warning");
    const inside = zoneAt("seed", zone.start + zone.length / 2);
    expect(inside.phase).toBe("inside");
    expect(inside.progress).toBeCloseTo(0.5, 1);
    expect(zoneAt("seed", zone.start + zone.length + 50).phase).toBe("none");
    expect(zoneAt("", zone.start + 10).phase).toBe("none");
  });

  it("never puts a fork in the last stretch before the finish line", () => {
    const length = 20000;
    for (let index = 0; index < 6; index++) {
      const zone = zoneByIndex("seed", index);
      const mid = zone.start + zone.length / 2;
      if (zone.start + zone.length > length - FORK_FINISH_GAP) expect(zoneAt("seed", mid, length).phase).toBe("none");
    }
    expect(forkMarks("seed", 60000).every((mark) => mark < (60000 - FORK_FINISH_GAP) / 60000)).toBe(true);
    expect(forkMarks("seed", 60000).length).toBeGreaterThanOrEqual(3);
    expect(zonesBetween("seed", 0, 30000, 60000).length).toBeGreaterThanOrEqual(2);
  });

  it("splits the lanes into corridors", () => {
    expect([0, 1, 2, 3].map((lane) => corridorFor("triple", lane))).toEqual(["shortcut", "main", "main", "nitro"]);
    expect([0, 1, 2, 3].map((lane) => corridorFor("double", lane))).toEqual(["shortcut", "shortcut", "main", "main"]);
    expect(lanesOf("triple", "main")).toEqual([1, 2]);
    expect(corridorBounds("triple", "main")).toEqual({ min: 1, max: 3 });
    expect(corridorBounds("triple", "nitro")).toEqual({ min: 3, max: 4 });
    expect(corridorBounds("double", "shortcut")).toEqual({ min: 0, max: 2 });
    expect(medianLanes("triple")).toEqual([1, 3]);
    expect(medianLanes("double")).toEqual([2]);
  });

  it("rewards each corridor differently", () => {
    expect(CORRIDOR_EFFECT.shortcut.distanceBonus).toBeGreaterThan(0);
    expect(CORRIDOR_EFFECT.main.distanceBonus).toBe(0);
    expect(CORRIDOR_EFFECT.nitro.nitroRegen).toBeGreaterThan(0);
  });

  it("grows the median wall after the split and shrinks it before the end", () => {
    const zone = zoneByIndex("seed", 0);
    expect(medianGrowth(zone, zone.start - 10)).toBe(0);
    expect(medianGrowth(zone, zone.start + 100)).toBeGreaterThan(0);
    expect(medianGrowth(zone, zone.start + 100)).toBeLessThan(1);
    expect(medianGrowth(zone, zone.start + zone.length / 2)).toBe(1);
    expect(medianGrowth(zone, zone.start + zone.length - 50)).toBeLessThan(1);
  });
});
