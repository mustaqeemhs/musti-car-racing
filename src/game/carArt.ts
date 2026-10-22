import { isBike, type VehicleModel } from "./engine";

/** Length/width ratio per model, used for spawn sizing. */
export const MODEL_RATIO: Record<VehicleModel, number> = {
  sedan: 2.05, coupe: 1.95, suv: 2.1, muscle: 2.0, super: 2.15, taxi: 2.05, van: 2.45, police: 2.1,
  sportbike: 3.6, naked: 3.4, dirtbike: 3.7, tourer: 3.8,
};
export const MODEL_WIDTH: Record<VehicleModel, number> = {
  sedan: 0.98, coupe: 0.95, suv: 1.06, muscle: 1.04, super: 0.98, taxi: 0.98, van: 1.06, police: 1.0,
  sportbike: 0.56, naked: 0.56, dirtbike: 0.54, tourer: 0.62,
};
export const PAINTS = [
  "#2f6fd6", "#c8312b", "#b9bec6", "#17181b", "#e3b928", "#2f8a4f", "#eeeeea", "#7a2f2a",
  "#3b4f6b", "#d96f1e", "#7b4fd0", "#25b7c4", "#8a1538", "#5b6770",
];

/** Playable vehicles. "musti-gt" is the hand-drawn player supercar artwork. */
export type VehicleDef = {
  id: string; name: string; model: VehicleModel | "musti"; cat: "car" | "bike";
  blurb: string;
  stats: { speed: number; accel: number; grip: number; brake: number }; // 0..100
  maxMul: number; accelMul: number; gripMul: number; // gameplay multipliers
};
export const VEHICLE_DEFS: VehicleDef[] = [
  { id: "musti-gt", name: "Musti GT", model: "musti", cat: "car", blurb: "Hand-drawn flagship supercar", stats: { speed: 92, accel: 82, grip: 62, brake: 62 }, maxMul: 1.08, accelMul: 1.0, gripMul: 1.0 },
  { id: "vulcan-x", name: "Vulcan X", model: "super", cat: "car", blurb: "Track-bred hypercoupé", stats: { speed: 96, accel: 90, grip: 74, brake: 70 }, maxMul: 1.1, accelMul: 1.1, gripMul: 1.08 },
  { id: "corsa-rs", name: "Corsa RS", model: "coupe", cat: "car", blurb: "Balanced street coupé", stats: { speed: 84, accel: 76, grip: 78, brake: 74 }, maxMul: 1.0, accelMul: 1.0, gripMul: 1.1 },
  { id: "brute-502", name: "Brute 502", model: "muscle", cat: "car", blurb: "Old-school muscle", stats: { speed: 86, accel: 88, grip: 52, brake: 50 }, maxMul: 1.02, accelMul: 1.15, gripMul: 0.9 },
  { id: "metro-dx", name: "Metro DX", model: "sedan", cat: "car", blurb: "Everyday hero", stats: { speed: 70, accel: 62, grip: 72, brake: 72 }, maxMul: 0.92, accelMul: 0.95, gripMul: 1.05 },
  { id: "ridge-4x4", name: "Ridge 4x4", model: "suv", cat: "car", blurb: "Heavy but steady", stats: { speed: 72, accel: 60, grip: 64, brake: 66 }, maxMul: 0.94, accelMul: 0.9, gripMul: 1.0 },
  { id: "swift-r", name: "Swift R", model: "sportbike", cat: "bike", blurb: "Full-fairing sportbike", stats: { speed: 94, accel: 96, grip: 88, brake: 80 }, maxMul: 1.06, accelMul: 1.35, gripMul: 1.25 },
  { id: "street-atom", name: "Street Atom", model: "naked", cat: "bike", blurb: "Nimble naked bike", stats: { speed: 82, accel: 92, grip: 90, brake: 82 }, maxMul: 0.98, accelMul: 1.4, gripMul: 1.3 },
  { id: "dune-hopper", name: "Dune Hopper", model: "dirtbike", cat: "bike", blurb: "Knobby tyres, big slides", stats: { speed: 76, accel: 90, grip: 94, brake: 76 }, maxMul: 0.94, accelMul: 1.35, gripMul: 1.35 },
  { id: "longhaul-gt", name: "Longhaul GT", model: "tourer", cat: "bike", blurb: "Stable tourer with panniers", stats: { speed: 80, accel: 70, grip: 80, brake: 84 }, maxMul: 0.98, accelMul: 1.1, gripMul: 1.15 },
];
export const PLAYER_PAINTS = [
  { id: "#ffffff", name: "Arctic" }, { id: "#d62b2b", name: "Rosso" }, { id: "#2a6fe0", name: "Electric" },
  { id: "#2a2b30", name: "Carbon" }, { id: "#f0c419", name: "Giallo" }, { id: "#2f9a57", name: "Verde" },
  { id: "#a9aeb6", name: "Titanium" }, { id: "#d96f1e", name: "Arancio" }, { id: "#7b4fd0", name: "Viola" },
  { id: "#25b7c4", name: "Ciano" },
];

type Spec = { nose: number; tail: number; hood: number; cabin: number; glassF: number; glassR: number; roof: string };
const SPECS: Record<Exclude<VehicleModel, "sportbike" | "naked" | "dirtbike" | "tourer">, Spec> = {
  sedan: { nose: 0.32, tail: 0.28, hood: 0.27, cabin: 0.42, glassF: 0.1, glassR: 0.08, roof: "body" },
  coupe: { nose: 0.45, tail: 0.32, hood: 0.33, cabin: 0.32, glassF: 0.12, glassR: 0.07, roof: "body" },
  suv: { nose: 0.2, tail: 0.14, hood: 0.22, cabin: 0.58, glassF: 0.09, glassR: 0.05, roof: "dark" },
  muscle: { nose: 0.22, tail: 0.22, hood: 0.48, cabin: 0.3, glassF: 0.08, glassR: 0.08, roof: "body" },
  super: { nose: 0.52, tail: 0.4, hood: 0.3, cabin: 0.26, glassF: 0.14, glassR: 0.06, roof: "dark" },
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

/** Draw a top-down car centered at 0,0, front facing up. */
export function drawVehicle(c: CanvasRenderingContext2D, model: Exclude<VehicleModel, "sportbike" | "naked" | "dirtbike" | "tourer">, color: string, w: number, h: number) {
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
  if (model === "coupe" || model === "super") {
    c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(l + w * 0.15, t + h * 0.93, w * 0.7, h * 0.02); // spoiler
  }
  if (model === "super") {
    // racing stripes + big rear wing
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(-w * 0.09, t + h * 0.05, w * 0.18, h * 0.9);
    c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(l - w * 0.05, t + h * 0.9, w * 1.1, h * 0.045);
  }
  if (model === "muscle") {
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.fillRect(l + w * 0.12, t + h * 0.9, w * 0.76, h * 0.03); // rear stripe block
    c.fillStyle = "rgba(255,255,255,0.16)"; c.fillRect(-w * 0.07, t + h * 0.05, w * 0.14, h * 0.4);
  }
}

/** Draw a top-down motorcycle centered at 0,0, front facing up. */
export function drawMotorcycle(c: CanvasRenderingContext2D, model: "sportbike" | "naked" | "dirtbike" | "tourer", color: string, w: number, h: number) {
  const t = -h / 2, b = h / 2;
  const paint = color;
  // ground shadow
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath(); c.ellipse(w * 0.08, h * 0.04, w * 0.55, h * 0.52, 0, 0, Math.PI * 2); c.fill();
  // tires (two wheels)
  const tireW = w * 0.36;
  c.fillStyle = "#0b0b0c";
  c.beginPath(); c.roundRect(-tireW / 2, t + h * 0.03, tireW, h * 0.17, tireW / 2); c.fill();
  c.beginPath(); c.roundRect(-tireW / 2, b - h * 0.2, tireW, h * 0.17, tireW / 2); c.fill();
  if (model === "dirtbike") { // knobby tread
    c.fillStyle = "#1c1c1e";
    for (let i = 0; i < 5; i++) { c.fillRect(-tireW / 2, t + h * (0.045 + i * 0.032), tireW, 1.5); c.fillRect(-tireW / 2, b - h * (0.195 - i * 0.032), tireW, 1.5); }
  }
  // wheel hubs
  c.fillStyle = "#7d828a";
  c.beginPath(); c.arc(0, t + h * 0.115, tireW * 0.18, 0, Math.PI * 2); c.arc(0, b - h * 0.115, tireW * 0.18, 0, Math.PI * 2); c.fill();
  // frame
  c.strokeStyle = "#3a3d44"; c.lineWidth = Math.max(2, w * 0.14);
  c.beginPath(); c.moveTo(0, t + h * 0.16); c.lineTo(0, t + h * 0.44); c.moveTo(0, t + h * 0.56); c.lineTo(0, b - h * 0.14); c.stroke();
  // fork + handlebars
  c.strokeStyle = "#8a8f97"; c.lineWidth = Math.max(1.5, w * 0.09);
  c.beginPath(); c.moveTo(0, t + h * 0.05); c.lineTo(0, t + h * 0.24); c.stroke();
  c.strokeStyle = "#2c2e33"; c.lineWidth = Math.max(2, w * 0.12);
  c.beginPath(); c.moveTo(-w * 0.34, t + h * 0.24); c.lineTo(w * 0.34, t + h * 0.24); c.stroke();
  c.fillStyle = "#16171a"; c.fillRect(-w * 0.42, t + h * 0.215, w * 0.14, h * 0.05); c.fillRect(w * 0.28, t + h * 0.215, w * 0.14, h * 0.05);
  // fenders
  c.fillStyle = shade(paint, -0.15);
  c.beginPath(); c.roundRect(-tireW * 0.62, t + h * 0.015, tireW * 1.24, h * 0.06, tireW * 0.4); c.fill();
  c.beginPath(); c.roundRect(-tireW * 0.62, b - h * 0.235, tireW * 1.24, h * 0.05, tireW * 0.4); c.fill();
  // tank (paint)
  c.fillStyle = paint;
  c.beginPath(); c.ellipse(0, t + h * 0.42, w * 0.3, h * 0.09, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = shade(paint, 0.3);
  c.beginPath(); c.ellipse(-w * 0.06, t + h * 0.4, w * 0.14, h * 0.05, 0, 0, Math.PI * 2); c.fill();
  // seat
  c.fillStyle = "#1a1b1f";
  c.beginPath(); c.roundRect(-w * 0.16, t + h * 0.52, w * 0.32, h * 0.2, w * 0.1); c.fill();
  // tail + taillight
  c.fillStyle = shade(paint, -0.1);
  c.beginPath(); c.roundRect(-w * 0.12, t + h * 0.86, w * 0.24, h * 0.07, w * 0.06); c.fill();
  c.fillStyle = "#ff2d2d"; c.fillRect(-w * 0.07, b - h * 0.03, w * 0.14, h * 0.02);
  // headlight
  c.fillStyle = "#fff6d0"; c.shadowColor = "#fff6d0"; c.shadowBlur = w * 0.5;
  c.beginPath(); c.arc(0, t + h * 0.035, w * 0.09, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  // exhausts
  c.strokeStyle = "#9aa0a8"; c.lineWidth = Math.max(1.5, w * 0.08);
  c.beginPath(); c.moveTo(w * 0.1, t + h * 0.7); c.lineTo(w * 0.2, b - h * 0.06); c.stroke();
  // per-style extras
  if (model === "sportbike") { // full fairing + windscreen
    c.fillStyle = paint;
    c.beginPath(); c.moveTo(-w * 0.3, t + h * 0.14); c.quadraticCurveTo(-w * 0.42, t + h * 0.3, -w * 0.26, t + h * 0.36);
    c.lineTo(w * 0.26, t + h * 0.36); c.quadraticCurveTo(w * 0.42, t + h * 0.3, w * 0.3, t + h * 0.14); c.closePath(); c.fill();
    c.fillStyle = "rgba(180,215,255,0.7)";
    c.beginPath(); c.moveTo(-w * 0.14, t + h * 0.1); c.lineTo(w * 0.14, t + h * 0.1); c.lineTo(w * 0.1, t + h * 0.2); c.lineTo(-w * 0.1, t + h * 0.2); c.closePath(); c.fill();
  }
  if (model === "naked") { // exposed engine block
    c.fillStyle = "#565b63"; c.beginPath(); c.roundRect(-w * 0.14, t + h * 0.46, w * 0.28, h * 0.1, 2); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.2)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-w * 0.14, t + h * 0.51); c.lineTo(w * 0.14, t + h * 0.51); c.stroke();
  }
  if (model === "dirtbike") { // high front fender + number plate
    c.fillStyle = paint;
    c.beginPath(); c.roundRect(-tireW * 0.7, t + h * 0.005, tireW * 1.4, h * 0.035, tireW * 0.4); c.fill();
    c.fillStyle = "#efeee8"; c.fillRect(-w * 0.16, t + h * 0.05, w * 0.32, h * 0.06);
  }
  if (model === "tourer") { // tall screen + panniers + crash bar
    c.fillStyle = "rgba(170,205,240,0.55)";
    c.beginPath(); c.moveTo(-w * 0.16, t + h * 0.12); c.lineTo(w * 0.16, t + h * 0.12); c.lineTo(w * 0.2, t + h * 0.3); c.lineTo(-w * 0.2, t + h * 0.3); c.closePath(); c.fill();
    c.fillStyle = shade(paint, -0.25);
    c.beginPath(); c.roundRect(-w * 0.44, t + h * 0.74, w * 0.2, h * 0.12, 2); c.roundRect(w * 0.24, t + h * 0.74, w * 0.2, h * 0.12, 2); c.fill();
    c.strokeStyle = "#b9bec6"; c.lineWidth = Math.max(1.5, w * 0.07);
    c.beginPath(); c.moveTo(-w * 0.3, t + h * 0.3); c.quadraticCurveTo(-w * 0.4, t + h * 0.2, -w * 0.3, t + h * 0.12); c.stroke();
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
    if (isBike(model)) drawMotorcycle(c, model, color, w, h);
    else drawVehicle(c, model, color, w, h);
    cache.set(key, cv);
  }
  return cv;
}
