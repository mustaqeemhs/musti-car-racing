import type { VehicleModel } from "./engine";

/** Length/width ratio per model, used for spawn sizing. */
export const MODEL_RATIO: Record<VehicleModel, number> = { sedan: 2.05, coupe: 1.95, suv: 2.1, taxi: 2.05, van: 2.45, police: 2.1 };
export const MODEL_WIDTH: Record<VehicleModel, number> = { sedan: 0.98, coupe: 0.95, suv: 1.06, taxi: 0.98, van: 1.06, police: 1.0 };
export const PAINTS = ["#2f6fd6", "#c8312b", "#b9bec6", "#17181b", "#e3b928", "#2f8a4f", "#eeeeea", "#7a2f2a", "#3b4f6b"];

type Spec = { nose: number; tail: number; hood: number; cabin: number; glassF: number; glassR: number; roof: string };
const SPECS: Record<VehicleModel, Spec> = {
  sedan: { nose: 0.32, tail: 0.28, hood: 0.27, cabin: 0.42, glassF: 0.1, glassR: 0.08, roof: "body" },
  coupe: { nose: 0.45, tail: 0.32, hood: 0.33, cabin: 0.32, glassF: 0.12, glassR: 0.07, roof: "body" },
  suv: { nose: 0.2, tail: 0.14, hood: 0.22, cabin: 0.58, glassF: 0.09, glassR: 0.05, roof: "dark" },
  taxi: { nose: 0.32, tail: 0.28, hood: 0.27, cabin: 0.42, glassF: 0.1, glassR: 0.08, roof: "body" },
  van: { nose: 0.18, tail: 0.08, hood: 0.12, cabin: 0.78, glassF: 0.08, glassR: 0.03, roof: "light" },
  police: { nose: 0.32, tail: 0.28, hood: 0.27, cabin: 0.42, glassF: 0.1, glassR: 0.08, roof: "white" },
};

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function bodyPath(c: CanvasRenderingContext2D, w: number, h: number, s: Spec) {
  const l = -w / 2, r = w / 2, t = -h / 2, b = h / 2;
  const nf = w * s.nose, tf = w * s.tail;
  c.beginPath();
  c.moveTo(l + nf, t);
  c.lineTo(r - nf, t);
  c.quadraticCurveTo(r, t, r, t + nf * 1.1);
  c.quadraticCurveTo(r + w * 0.03, 0, r, b - tf);
  c.quadraticCurveTo(r, b, r - tf, b);
  c.lineTo(l + tf, b);
  c.quadraticCurveTo(l, b, l, b - tf);
  c.quadraticCurveTo(l - w * 0.03, 0, l, t + nf * 1.1);
  c.quadraticCurveTo(l, t, l + nf, t);
  c.closePath();
}

/** Draw a top-down vehicle centered at 0,0, front facing up. */
export function drawVehicle(c: CanvasRenderingContext2D, model: VehicleModel, color: string, w: number, h: number) {
  const s = SPECS[model];
  const paint = model === "taxi" ? "#f2c21b" : model === "police" ? "#121418" : color;
  const l = -w / 2, t = -h / 2;
  // ground shadow
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath(); c.roundRect(l + w * 0.08, t + h * 0.06, w, h, w * 0.3); c.fill();
  // tires
  c.fillStyle = "#0b0b0c";
  const tw = w * 0.16, th = h * 0.17;
  for (const ty of [t + h * 0.14, t + h * 0.7]) { c.beginPath(); c.roundRect(l - tw * 0.35, ty, tw, th, 2); c.roundRect(-l - tw * 0.65, ty, tw, th, 2); c.fill(); }
  // body with side-to-side shading
  const g = c.createLinearGradient(l, 0, -l, 0);
  g.addColorStop(0, shade(paint, -0.45)); g.addColorStop(0.22, shade(paint, 0)); g.addColorStop(0.5, shade(paint, 0.22)); g.addColorStop(0.78, shade(paint, 0)); g.addColorStop(1, shade(paint, -0.45));
  bodyPath(c, w, h, s); c.fillStyle = g; c.fill();
  c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = Math.max(1, w * 0.03); c.stroke();
  // police white doors
  if (model === "police") {
    c.save(); bodyPath(c, w, h, s); c.clip();
    c.fillStyle = "#e9e9e4"; c.fillRect(l, t + h * 0.36, w, h * 0.3);
    c.restore();
  }
  // bumpers
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(l + w * 0.22, t + h * 0.005, w * 0.56, h * 0.025);
  c.fillRect(l + w * 0.2, t + h * 0.97, w * 0.6, h * 0.025);
  // headlights / taillights
  c.fillStyle = "#fff6d0";
  c.beginPath(); c.ellipse(l + w * 0.2, t + h * 0.035, w * 0.11, h * 0.018, 0.2, 0, Math.PI * 2); c.ellipse(-l - w * 0.2, t + h * 0.035, w * 0.11, h * 0.018, -0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#ff2d2d";
  c.fillRect(l + w * 0.08, t + h * 0.955, w * 0.2, h * 0.025); c.fillRect(-l - w * 0.28, t + h * 0.955, w * 0.2, h * 0.025);
  // hood crease
  const hoodEnd = t + h * s.hood;
  c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(l + w * 0.32, t + h * 0.05); c.lineTo(l + w * 0.36, hoodEnd); c.moveTo(-l - w * 0.32, t + h * 0.05); c.lineTo(-l - w * 0.36, hoodEnd); c.stroke();
  // greenhouse
  const cabT = hoodEnd, cabB = hoodEnd + h * s.cabin, inset = w * 0.12;
  const glass = c.createLinearGradient(0, cabT, 0, cabB);
  glass.addColorStop(0, "#2b3a4d"); glass.addColorStop(0.5, "#0d1219"); glass.addColorStop(1, "#24313f");
  c.fillStyle = glass;
  c.beginPath();
  c.moveTo(l + inset * 1.6, cabT); c.lineTo(-l - inset * 1.6, cabT);
  c.lineTo(-l - inset, cabT + h * s.glassF); c.lineTo(-l - inset, cabB - h * s.glassR);
  c.lineTo(-l - inset * 1.5, cabB); c.lineTo(l + inset * 1.5, cabB);
  c.lineTo(l + inset, cabB - h * s.glassR); c.lineTo(l + inset, cabT + h * s.glassF); c.closePath(); c.fill();
  // roof
  const roofT = cabT + h * s.glassF, roofB = cabB - h * s.glassR;
  const roofCol = s.roof === "white" ? "#ecebe6" : s.roof === "dark" ? shade(paint, -0.25) : s.roof === "light" ? shade(paint, 0.12) : shade(paint, 0.08);
  c.fillStyle = roofCol;
  c.beginPath(); c.roundRect(l + inset * 1.35, roofT, w - inset * 2.7, Math.max(2, roofB - roofT), w * 0.08); c.fill();
  // windshield glint
  c.strokeStyle = "rgba(200,225,255,0.35)"; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(l + w * 0.3, cabT + h * 0.02); c.lineTo(l + w * 0.42, cabT + h * s.glassF * 0.8); c.stroke();
  // side mirrors
  c.fillStyle = shade(paint, -0.2);
  c.fillRect(l - w * 0.05, cabT + h * 0.01, w * 0.09, h * 0.03); c.fillRect(-l - w * 0.04, cabT + h * 0.01, w * 0.09, h * 0.03);
  // trunk line
  c.strokeStyle = "rgba(0,0,0,0.35)";
  c.beginPath(); c.moveTo(l + w * 0.18, cabB + h * 0.04); c.lineTo(-l - w * 0.18, cabB + h * 0.04); c.stroke();
  // model specifics
  if (model === "suv") {
    c.strokeStyle = "#2a2b2e"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(l + inset * 1.6, roofT + 3); c.lineTo(l + inset * 1.6, roofB - 3); c.moveTo(-l - inset * 1.6, roofT + 3); c.lineTo(-l - inset * 1.6, roofB - 3); c.stroke();
  }
  if (model === "taxi") {
    c.fillStyle = "#151515"; c.fillRect(l + w * 0.3, (roofT + roofB) / 2 - h * 0.025, w * 0.4, h * 0.05);
    c.fillStyle = "#fff3b0"; c.fillRect(l + w * 0.34, (roofT + roofB) / 2 - h * 0.012, w * 0.32, h * 0.024);
    c.fillStyle = "#151515";
    for (let i = 0; i < 6; i++) c.fillRect(l + (i % 2 ? w * 0.94 : 0.01 * w), t + h * (0.4 + i * 0.03), w * 0.05, h * 0.015);
  }
  if (model === "van") {
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = roofT + ((roofB - roofT) * i) / 4; c.beginPath(); c.moveTo(l + inset * 1.5, y); c.lineTo(-l - inset * 1.5, y); c.stroke(); }
  }
  if (model === "coupe") {
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(l + w * 0.15, t + h * 0.93, w * 0.7, h * 0.02); // spoiler
  }
}

/** Police lightbar, drawn live every frame on top of the cached sprite. */
export function drawLightbar(c: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  const on = Math.sin(t * 18 + seed) > 0;
  const y = -h / 2 + h * 0.43;
  c.shadowBlur = 22;
  c.shadowColor = on ? "#ff2b3a" : "#2b6bff";
  c.fillStyle = on ? "#ff3344" : "#4a1c22"; c.fillRect(-w * 0.36, y, w * 0.34, h * 0.06);
  c.shadowColor = on ? "#ff2b3a" : "#2b7bff";
  c.fillStyle = on ? "#1b2550" : "#3d8bff"; c.fillRect(w * 0.02, y, w * 0.34, h * 0.06);
  c.shadowBlur = 0;
}

const cache = new Map<string, HTMLCanvasElement>();
export function clearSpriteCache() { cache.clear(); }
export function vehicleSprite(model: VehicleModel, color: string, w: number, h: number) {
  const key = `${model}|${color}|${Math.round(w)}|${Math.round(h)}`;
  let cv = cache.get(key);
  if (!cv) {
    const S = 2, pad = Math.ceil(w * 0.3);
    cv = document.createElement("canvas");
    cv.width = Math.ceil((w + pad * 2) * S); cv.height = Math.ceil((h + pad * 2) * S);
    const c = cv.getContext("2d")!;
    c.scale(S, S); c.translate(w / 2 + pad, h / 2 + pad);
    drawVehicle(c, model, color, w, h);
    cache.set(key, cv);
  }
  return cv;
}
