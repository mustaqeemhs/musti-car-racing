/**
 * Real top-down pictures for the cars and bikes (src/assets/vehicles/<id>.webp).
 * The pictures are loaded once, shrunk to the size the game needs, and re-coloured
 * on request (the garage paint colours).
 */

const ART_URLS = import.meta.glob("../assets/vehicles/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function vehicleArtUrl(artId: string): string | null {
  const key = Object.keys(ART_URLS).find((path) => path.endsWith(`/${artId}.webp`));
  return key ? (ART_URLS[key] ?? null) : null;
}

const images = new Map<string, HTMLImageElement | "loading" | "failed">();
const listeners = new Set<() => void>();
const sprites = new Map<string, ArtSprite>();

/** Called whenever another picture has finished loading (so screens can redraw). */
export function onVehicleArtLoaded(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Returns the loaded picture, or null while it is still loading (and starts loading it). */
export function getVehicleArt(artId: string): HTMLImageElement | null {
  const state = images.get(artId);
  if (state && state !== "loading" && state !== "failed") return state;
  if (state === "loading" || state === "failed") return null;
  const url = vehicleArtUrl(artId);
  if (!url || typeof Image === "undefined") {
    images.set(artId, "failed");
    return null;
  }
  images.set(artId, "loading");
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    images.set(artId, image);
    for (const listener of listeners) listener();
  };
  image.onerror = () => {
    images.set(artId, "failed");
  };
  image.src = url;
  return null;
}

export function preloadVehicleArt(artIds: string[]): void {
  for (const artId of artIds) getVehicleArt(artId);
}

export function clearArtSprites(): void {
  sprites.clear();
}

/* ---------- re-colouring (pure, so it can be tested) ---------- */

export const FACTORY_PAINT = "#ffffff";

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(channel(h + 1 / 3) * 255), Math.round(channel(h) * 255), Math.round(channel(h - 1 / 3) * 255)];
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * Changes the body colour of a picture in place. Coloured paint and silver/grey paint are
 * recoloured; black carbon, glass, tyres and bright highlights are left alone.
 * `data` is the RGBA data of an ImageData. The factory colour (white) changes nothing.
 */
export function recolorPixels(data: Uint8ClampedArray, targetHex: string): void {
  if (targetHex.toLowerCase() === FACTORY_PAINT) return;
  const [tr, tg, tb] = hexToRgb(targetHex);
  const [th, ts, tl] = rgbToHsl(tr, tg, tb);
  // dark paints darken the body, light paints lighten it
  const lightFactor = tl < 0.5 ? 0.25 + tl * 1.5 : 1 + (tl - 0.5) * 0.9;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha === 0) continue;
    const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
    const [, s, l] = rgbToHsl(r, g, b);
    let nh: number, ns: number, nl: number;
    if (s > 0.3 && l > 0.1 && l < 0.92) {
      nh = th;
      ns = clamp(ts * clamp(s, 0.4, 1), 0, 1);
      nl = clamp(l * lightFactor, 0, 0.95);
    } else if (s <= 0.3 && l > 0.22 && l < 0.82) {
      nh = th;
      ns = clamp(ts * 0.75, 0, 1);
      nl = clamp(l * lightFactor, 0, 0.95);
    } else {
      continue;
    }
    const [nr, ng, nb] = hslToRgb(nh, ns, nl);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }
}

/* ---------- drawing ---------- */

export type ArtSprite = {
  canvas: HTMLCanvasElement;
  /** Width / height of the picture. */
  aspect: number;
};

/**
 * A picture scaled for the given height (in game pixels, drawn at 2x for sharpness)
 * and painted in the requested colour. Null while the picture is still loading.
 */
export function artSprite(artId: string, paint: string, height: number): ArtSprite | null {
  const image = getVehicleArt(artId);
  if (!image) return null;
  const pixelHeight = Math.max(32, Math.round(height * 2));
  const key = `${artId}|${paint}|${pixelHeight}`;
  const cached = sprites.get(key);
  if (cached) return cached;

  const aspect = image.naturalWidth / image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.height = pixelHeight;
  canvas.width = Math.max(8, Math.round(pixelHeight * aspect));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (paint.toLowerCase() !== FACTORY_PAINT) {
    try {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      recolorPixels(pixels.data, paint);
      ctx.putImageData(pixels, 0, 0);
    } catch {
      /* if the browser blocks pixel access the factory colour is shown */
    }
  }
  const sprite = { canvas, aspect };
  sprites.set(key, sprite);
  return sprite;
}
