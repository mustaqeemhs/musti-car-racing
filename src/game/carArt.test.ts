import { describe, expect, it } from "vitest";
import {
  centeredBikePreviewPosition,
  MODEL_WIDTH,
  playerBikeRenderSize,
  VEHICLE_DEFS,
} from "./carArt";
import { BIKE_MODELS } from "./engine";

describe("motorcycle gameplay sizing", () => {
  it("uses a wider lane footprint for each motorcycle traffic model", () => {
    for (const model of BIKE_MODELS) {
      expect(MODEL_WIDTH[model]).toBeGreaterThanOrEqual(0.66);
    }
  });

  it("renders the player bike wider while keeping its height proportional", () => {
    expect(playerBikeRenderSize(100, 200)).toEqual({
      width: 86,
      height: 180,
    });
    expect(86).toBeLessThan(100);
    expect(180).toBeLessThan(200);
    expect(180 / 86).toBeGreaterThan(2);
  });

  it("centers every motorcycle preview without changing its rendered aspect ratio", () => {
    const bikeVehicles = VEHICLE_DEFS.filter((vehicle) => vehicle.cat === "bike");
    expect(bikeVehicles).toHaveLength(BIKE_MODELS.length);

    for (const model of BIKE_MODELS) {
      expect(bikeVehicles.map((vehicle) => vehicle.model)).toContain(model);
      const preview = { width: 126, height: 216 };
      const position = centeredBikePreviewPosition(300, 260, preview.width, preview.height);

      expect(position).toEqual({ x: 87, y: 22 });
      expect(position.x + preview.width / 2).toBe(150);
      expect(position.y + preview.height / 2).toBe(130);
      expect(preview.width / preview.height).toBe(126 / 216);
    }
  });
});
