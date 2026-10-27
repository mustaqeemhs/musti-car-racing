import { isBike, type BikeModel, type VehicleModel } from "./engine";

/** Length/width ratio per model, used for spawn sizing. */
export const MODEL_RATIO: Record<VehicleModel, number> = {
  sedan: 2.05, coupe: 1.95, suv: 2.1, muscle: 2.0, super: 2.15, taxi: 2.05, van: 2.45, police: 2.1,
  sportbike: 3.6, naked: 3.4, dirtbike: 3.7, tourer: 3.8,
};
export const MODEL_WIDTH: Record<VehicleModel, number> = {
  sedan: 0.98, coupe: 0.95, suv: 1.06, muscle: 1.04, super: 0.98, taxi: 0.98, van: 1.06, police: 1.0,
  sportbike: 0.68, naked: 0.68, dirtbike: 0.66, tourer: 0.72,
};

export function playerBikeRenderSize(width: number, height: number) {
  return { width: width * 0.86, height: height * 0.9 };
}

export function drawBikeSprite(
  c: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const pad = Math.ceil(sourceWidth * 0.3);
  c.drawImage(
    sprite,
    pad * 2,
    pad * 2,
    sourceWidth * 2,
    sourceHeight * 2,
    x,
    y,
    width,
    height,
  );
}

export function centeredBikePreviewPosition(
  canvasWidth: number,
  canvasHeight: number,
  previewWidth: number,
  previewHeight: number,
) {
  return {
    x: (canvasWidth - previewWidth) / 2,
    y: (canvasHeight - previewHeight) / 2,
  };
}
export const PAINTS = [
  "#2f6fd6", "#c8312b", "#b9bec6", "#17181b", "#e3b928", "#2f8a4f", "#eeeeea", "#7a2f2a",
  "#3b4f6b", "#d96f1e", "#7b4fd0", "#25b7c4", "#8a1538", "#5b6770",
];

/**
 * Real-life figures shown in the garage. They are approximate manufacturer claims
 * (the "Musti GT" is the game's own car, so its figures are made up).
 */
export type VehicleReal = { topKmh: number; zeroTo100: number; hp: number };

/** Playable vehicles. "musti-gt" is the game's own supercar artwork. */
export type VehicleDef = {
  id: string; name: string; brand: string; model: VehicleModel | "musti"; cat: "car" | "bike";
  /** File name (without .webp) of the real picture in src/assets/vehicles. */
  art?: string;
  blurb: string;
  /** Jaa'izah price. 0 = unlocked from the start. */
  price: number;
  stats: { speed: number; accel: number; grip: number; brake: number; nitro: number }; // 0..100
  real: VehicleReal;
  maxMul: number; accelMul: number; gripMul: number; nitroMul: number; brakeMul: number; // gameplay multipliers
};

/** 0..100 from the real top speed: 280 km/h = 55 and 420 km/h = 100. */
export const speedStat = (kmh: number) => Math.round(Math.max(20, Math.min(100, 55 + (kmh - 280) * 0.32)));
/** 0..100 from the real 0 to 100 km/h time: 2.3 s = 100. */
export const accelStat = (seconds: number) => Math.round(Math.max(20, Math.min(100, 100 - (seconds - 2.3) * 55)));
const two = (value: number) => Math.round(value * 100) / 100;

function makeVehicle(spec: {
  id: string; name: string; brand: string; model: VehicleModel | "musti"; cat: "car" | "bike"; art?: string;
  blurb: string; price: number; real: VehicleReal; grip: number; brake: number; nitro: number;
}): VehicleDef {
  const speed = speedStat(spec.real.topKmh);
  const accel = accelStat(spec.real.zeroTo100);
  const bike = spec.cat === "bike";
  const def: VehicleDef = {
    id: spec.id, name: spec.name, brand: spec.brand, model: spec.model, cat: spec.cat,
    blurb: spec.blurb, price: spec.price, real: spec.real,
    stats: { speed, accel, grip: spec.grip, brake: spec.brake, nitro: spec.nitro },
    maxMul: two(1 + ((speed - 57) / 43) * 0.26),
    accelMul: bike ? two(1.12 + (accel / 100) * 0.3) : two(0.9 + (accel / 100) * 0.33),
    gripMul: bike ? two(0.85 + (spec.grip / 100) * 0.5) : two(0.76 + (spec.grip / 100) * 0.4),
    nitroMul: two(0.8 + (spec.nitro / 100) * 0.4),
    brakeMul: two(0.8 + (spec.brake / 100) * 0.4),
  };
  if (spec.art) def.art = spec.art;
  return def;
}

/** Slowest and cheapest first. The price follows the real-life speed. */
export const VEHICLE_DEFS: VehicleDef[] = [
  makeVehicle({ id: "musti-gt", name: "Musti GT", brand: "Musti", model: "musti", cat: "car", blurb: "The house supercar. Your starter.", price: 0, real: { topKmh: 285, zeroTo100: 3.4, hp: 520 }, grip: 62, brake: 62, nitro: 58 }),
  makeVehicle({ id: "huracan-sto", name: "Lamborghini Huracán STO", brand: "Lamborghini", model: "super", cat: "car", art: "huracan-sto", blurb: "V10 track weapon with a racing wing", price: 1800, real: { topKmh: 310, zeroTo100: 3.0, hp: 640 }, grip: 88, brake: 86, nitro: 70 }),
  makeVehicle({ id: "huracan-evo", name: "Lamborghini Huracán EVO", brand: "Lamborghini", model: "super", cat: "car", art: "huracan-evo", blurb: "Everyday V10 thunder", price: 2800, real: { topKmh: 325, zeroTo100: 2.9, hp: 640 }, grip: 82, brake: 80, nitro: 66 }),
  makeVehicle({ id: "mclaren-765lt", name: "McLaren 765LT", brand: "McLaren", model: "super", cat: "car", art: "mclaren-765lt", blurb: "Longtail lightweight, pure speed", price: 4200, real: { topKmh: 330, zeroTo100: 2.8, hp: 755 }, grip: 90, brake: 90, nitro: 78 }),
  makeVehicle({ id: "ferrari-f8", name: "Ferrari F8 Tributo", brand: "Ferrari", model: "super", cat: "car", art: "ferrari-f8", blurb: "Twin-turbo V8 legend", price: 5500, real: { topKmh: 340, zeroTo100: 2.9, hp: 710 }, grip: 84, brake: 84, nitro: 72 }),
  makeVehicle({ id: "mclaren-720s", name: "McLaren 720S", brand: "McLaren", model: "super", cat: "car", art: "mclaren-720s", blurb: "Aero-sculpted supercar", price: 6200, real: { topKmh: 341, zeroTo100: 2.9, hp: 710 }, grip: 86, brake: 86, nitro: 74 }),
  makeVehicle({ id: "amg-one", name: "Mercedes-AMG ONE", brand: "Mercedes-AMG", model: "super", cat: "car", art: "amg-one", blurb: "Formula 1 hybrid power for the road", price: 10000, real: { topKmh: 352, zeroTo100: 2.9, hp: 1063 }, grip: 92, brake: 92, nitro: 86 }),
  makeVehicle({ id: "bugatti-chiron", name: "Bugatti Chiron", brand: "Bugatti", model: "super", cat: "car", art: "bugatti-chiron", blurb: "Quad-turbo W16, the speed king", price: 25000, real: { topKmh: 420, zeroTo100: 2.4, hp: 1479 }, grip: 78, brake: 90, nitro: 95 }),
  makeVehicle({ id: "yamaha-r1", name: "Yamaha YZF-R1", brand: "Yamaha", model: "sportbike", cat: "bike", art: "yamaha-r1", blurb: "Crossplane screamer. Your starter bike.", price: 0, real: { topKmh: 299, zeroTo100: 3.1, hp: 200 }, grip: 90, brake: 84, nitro: 70 }),
  makeVehicle({ id: "ducati-v4r", name: "Ducati Panigale V4 R", brand: "Ducati", model: "sportbike", cat: "bike", art: "ducati-v4r", blurb: "V4 racing icon with winglets", price: 3000, real: { topKmh: 299, zeroTo100: 2.8, hp: 234 }, grip: 92, brake: 90, nitro: 84 }),
  makeVehicle({ id: "bmw-m1000rr", name: "BMW M 1000 RR", brand: "BMW", model: "sportbike", cat: "bike", art: "bmw-m1000rr", blurb: "Aero-winglet superbike", price: 4800, real: { topKmh: 306, zeroTo100: 3.1, hp: 212 }, grip: 91, brake: 88, nitro: 78 }),
];

/** The vehicles every new player starts with: one car and one bike. */
export const STARTER_VEHICLE_IDS = VEHICLE_DEFS.filter((vehicle) => vehicle.price === 0).map((vehicle) => vehicle.id);
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
export function drawVehicle(c: CanvasRenderingContext2D, model: Exclude<VehicleModel, BikeModel>, color: string, w: number, h: number) {
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
export function drawMotorcycle(c: CanvasRenderingContext2D, model: BikeModel, color: string, w: number, h: number) {
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

const bikeImages: Partial<Record<BikeModel, HTMLImageElement>> = {};

const bikeImagePaths: Partial<Record<BikeModel, string>> = {
  sportbike: "/bikes/Red%20sport%20bike.png",
  naked: "/bikes/black%20street%20bike.png",
  dirtbike: "/bikes/Green%20dirt%20bike.png",
};

for (const [model, path] of Object.entries(bikeImagePaths)) {
  if (!path) continue;

  if (typeof window === "undefined") continue;

const img = new window.Image();
  img.onload = () => clearSpriteCache();
  img.src = path;
  bikeImages[model as BikeModel] = img;
}

export function clearSpriteCache() {
  cache.clear();
}

export function vehicleSprite(
  model: VehicleModel,
  color: string,
  w: number,
  h: number,
) {
  const key = `${model}|${color}|${Math.round(w)}|${Math.round(h)}`;

  let cv = cache.get(key);

  if (!cv) {
    const S = 2;
    const pad = Math.ceil(w * 0.3);

    cv = document.createElement("canvas");
    cv.width = Math.ceil((w + pad * 2) * S);
    cv.height = Math.ceil((h + pad * 2) * S);

    const c = cv.getContext("2d")!;
    c.scale(S, S);
    c.translate(w / 2 + pad, h / 2 + pad);

    const bikeImage = isBike(model) ? bikeImages[model] : undefined;

    if (bikeImage?.complete && bikeImage.naturalWidth > 0) {
      c.drawImage(bikeImage, -w / 2, -h / 2, w, h);
    } else if (isBike(model)) {
      drawMotorcycle(c, model, color, w, h);
    } else {
      drawVehicle(c, model, color, w, h);
    }

    cache.set(key, cv);
  }

  return cv;
}
