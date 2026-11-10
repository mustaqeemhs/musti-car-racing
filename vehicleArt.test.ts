import { describe, expect, it } from "vitest";
import { FACTORY_PAINT, hslToRgb, recolorPixels, rgbToHsl } from "./vehicleArt";

const pixel = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);

describe("vehicle recolouring", () => {
  it("converts colours back and forth", () => {
    const [h, s, l] = rgbToHsl(214, 43, 43);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(Math.abs(r - 214)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 43)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 43)).toBeLessThanOrEqual(1);
  });

  it("leaves the picture alone for the factory colour", () => {
    const data = pixel(240, 120, 20);
    recolorPixels(data, FACTORY_PAINT);
    expect(Array.from(data)).toEqual([240, 120, 20, 255]);
  });

  it("turns an orange body blue", () => {
    const data = pixel(240, 120, 20);
    recolorPixels(data, "#2a6fe0");
    expect(data[2]!).toBeGreaterThan(data[0]!);
    expect(data[3]).toBe(255);
  });

  it("recolours a grey body but keeps black carbon and see-through pixels", () => {
    const grey = pixel(150, 150, 155);
    recolorPixels(grey, "#d62b2b");
    expect(grey[0]!).toBeGreaterThan(grey[2]!);

    const carbon = pixel(20, 20, 22);
    recolorPixels(carbon, "#d62b2b");
    expect(Array.from(carbon)).toEqual([20, 20, 22, 255]);

    const clear = pixel(150, 150, 155, 0);
    recolorPixels(clear, "#d62b2b");
    expect(Array.from(clear)).toEqual([150, 150, 155, 0]);
  });

  it("makes the body darker for a dark paint and lighter for a light paint", () => {
    const dark = pixel(160, 160, 165);
    recolorPixels(dark, "#2a2b30");
    const light = pixel(160, 160, 165);
    recolorPixels(light, "#f0c419");
    expect(rgbToHsl(dark[0]!, dark[1]!, dark[2]!)[2]).toBeLessThan(rgbToHsl(light[0]!, light[1]!, light[2]!)[2]);
  });
});
