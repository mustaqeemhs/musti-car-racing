import { useCallback, useEffect, useRef, useState } from "react";
import playerImgSrc from "@/assets/player-car.png";
import { BASE_SPEED, MAX_LIVES, MAX_SPEED, overlaps, pickLane, scoreFor, type Car, type Input, type Particle } from "./engine";

type Phase = "start" | "playing" | "paused" | "over";
type Hud = { score: number; speed: number; lives: number; boost: number; heat: number };

const BEST_KEY = "sketchrun.best";
const SOUND_KEY = "sketchrun.sound";
const TRAFFIC_COLORS = ["#d9d4c7", "#b8b2a3", "#8f8a7e", "#e8c25a", "#c9563f", "#6f8fa8"];

/* ---------------- audio ---------------- */
class Sfx {
  ctx: AudioContext | null = null;
  osc: OscillatorNode | null = null;
  gain: GainNode | null = null;
  siren: OscillatorNode | null = null;
  sirenGain: GainNode | null = null;
  enabled = true;
  ensure() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.osc = this.ctx.createOscillator(); this.osc.type = "sawtooth";
    this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
    this.osc.connect(f).connect(this.gain).connect(this.ctx.destination); this.osc.start();
    this.siren = this.ctx.createOscillator(); this.siren.type = "triangle";
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.ctx.destination); this.siren.start();
  }
  engine(speed: number, active: boolean, heat: number, t: number) {
    if (!this.ctx || !this.osc || !this.gain || !this.siren || !this.sirenGain) return;
    const on = active && this.enabled;
    this.osc.frequency.setTargetAtTime(50 + speed * 0.18, this.ctx.currentTime, 0.05);
    this.gain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.08);
    this.siren.frequency.setTargetAtTime(Math.sin(t * 5) > 0 ? 960 : 720, this.ctx.currentTime, 0.02);
    this.sirenGain.gain.setTargetAtTime(on ? 0.015 * heat : 0, this.ctx.currentTime, 0.1);
  }
  blip(freq: number, dur = 0.15, type: OscillatorType = "square", vol = 0.12) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  crash() {
    if (!this.ctx || !this.enabled) return;
    const len = this.ctx.sampleRate * 0.4, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = 0.35;
    s.buffer = buf; s.connect(g).connect(this.ctx.destination); s.start();
  }
}

/* ---------------- drawing helpers ---------------- */
function sketchRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  // two slightly jittered passes for a hand-drawn line feel
  for (let p = 0; p < 2; p++) {
    const j = (k: number) => Math.sin(seed * 13.7 + k * 7.1 + p * 3.3) * 1.4;
    c.beginPath();
    c.moveTo(x + j(1), y + j(2)); c.lineTo(x + w + j(3), y + j(4));
    c.lineTo(x + w + j(5), y + h + j(6)); c.lineTo(x + j(7), y + h + j(8)); c.closePath();
    c.stroke();
  }
}

function drawCar(c: CanvasRenderingContext2D, car: Car, t: number) {
  const { x, y, w, h, seed } = car;
  c.save(); c.translate(x, y);
  const l = -w / 2, tp = -h / 2;
  // shadow
  c.fillStyle = "rgba(0,0,0,0.45)"; c.fillRect(l + 4, tp + 6, w, h);
  // body
  c.fillStyle = car.kind === "police" ? "#111317" : car.color;
  c.beginPath(); c.roundRect(l, tp, w, h, w * 0.22); c.fill();
  if (car.kind === "police") { c.fillStyle = "#e9e6dd"; c.fillRect(l + 2, tp + h * 0.36, w - 4, h * 0.3); }
  // hatching
  c.save(); c.beginPath(); c.roundRect(l, tp, w, h, w * 0.22); c.clip();
  c.strokeStyle = "rgba(20,20,20,0.25)"; c.lineWidth = 1;
  for (let i = -h; i < w + h; i += 5) { c.beginPath(); c.moveTo(l + i, tp); c.lineTo(l + i - h * 0.6, tp + h); c.stroke(); }
  c.restore();
  // windows
  c.fillStyle = "rgba(15,17,22,0.85)";
  c.fillRect(l + w * 0.15, tp + h * 0.2, w * 0.7, h * 0.16);
  c.fillRect(l + w * 0.18, tp + h * 0.7, w * 0.64, h * 0.12);
  c.strokeStyle = "#0b0b0b"; c.lineWidth = 1.6;
  sketchRect(c, l, tp, w, h, seed);
  // lights
  if (car.kind === "police") {
    const on = Math.sin(t * 18 + seed) > 0;
    c.shadowBlur = 24;
    c.shadowColor = on ? "#ff2b3a" : "#2b6bff";
    c.fillStyle = on ? "#ff2b3a" : "#5a2a2a"; c.fillRect(l + w * 0.12, tp + h * 0.43, w * 0.36, h * 0.07);
    c.shadowColor = !on ? "#2b7bff" : "#ff2b3a";
    c.fillStyle = !on ? "#2b7bff" : "#22305a"; c.fillRect(l + w * 0.52, tp + h * 0.43, w * 0.36, h * 0.07);
    c.shadowBlur = 0;
  } else {
    c.fillStyle = "#ff4b3a"; c.fillRect(l + 3, tp + h - 5, w * 0.22, 3); c.fillRect(l + w - 3 - w * 0.22, tp + h - 5, w * 0.22, 3);
  }
  c.restore();
}

function makeGrain(): HTMLCanvasElement {
  const g = document.createElement("canvas"); g.width = g.height = 256;
  const gc = g.getContext("2d")!; const id = gc.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 26; }
  gc.putImageData(id, 0, 0);
  gc.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 90; i++) { gc.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; gc.moveTo(x, y); gc.lineTo(x + 30 + Math.random() * 40, y + 12 + Math.random() * 20); gc.stroke(); }
  return g;
}

/* ---------------- component ---------------- */
export function SketchRun() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ left: false, right: false, up: false, down: false, boost: false });
  const touch = useRef<Input>({ left: false, right: false, up: false, down: false, boost: false });
  const phaseRef = useRef<Phase>("start");
  const sfx = useRef(new Sfx());
  const [phase, setPhaseState] = useState<Phase>("start");
  const [hud, setHud] = useState<Hud>({ score: 0, speed: 0, lives: MAX_LIVES, boost: 1, heat: 0 });
  const [best, setBest] = useState(0);
  const [sound, setSound] = useState(true);
  const [final, setFinal] = useState({ score: 0, newBest: false, distance: 0 });
  const [flash, setFlash] = useState(0);

  const world = useRef({
    w: 0, h: 0, roadX: 0, roadW: 0, lanes: 4, laneW: 0,
    px: 0, py: 0, pvx: 0, pw: 40, ph: 80,
    speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, scroll: 0,
    lives: MAX_LIVES, invuln: 0, boost: 1, boosting: false, shake: 0,
    cars: [] as Car[], particles: [] as Particle[], spawnT: 0, policeT: 6, heat: 0, nearMissBonus: 0,
  });

  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p); }, []);

  useEffect(() => {
    const b = Number(localStorage.getItem(BEST_KEY) || 0); setBest(b);
    const s = localStorage.getItem(SOUND_KEY); if (s === "0") { setSound(false); sfx.current.enabled = false; }
  }, []);

  const layout = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
    const r = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
    const W = world.current; const oldRoadX = W.roadX, oldRoadW = W.roadW || 1;
    W.w = r.width; W.h = r.height;
    W.roadW = Math.min(r.width * 0.92, 560); W.roadX = (r.width - W.roadW) / 2; W.laneW = W.roadW / W.lanes;
    W.pw = W.laneW * 0.56; W.ph = W.pw * 2; W.py = r.height * 0.74;
    if (!W.px) W.px = r.width / 2; else W.px = W.roadX + ((W.px - oldRoadX) / oldRoadW) * W.roadW;
    cv.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const reset = useCallback(() => {
    const W = world.current;
    Object.assign(W, { speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, lives: MAX_LIVES, invuln: 1.5, boost: 1, boosting: false, shake: 0, cars: [], particles: [], spawnT: 0.8, policeT: 6, heat: 0, pvx: 0, nearMissBonus: 0 });
    W.px = W.w / 2;
    input.current = { left: false, right: false, up: false, down: false, boost: false };
    touch.current = { left: false, right: false, up: false, down: false, boost: false };
    setHud({ score: 0, speed: 0, lives: MAX_LIVES, boost: 1, heat: 0 });
  }, []);

  const start = useCallback(() => { sfx.current.ensure(); reset(); setPhase("playing"); sfx.current.blip(660, 0.12); setTimeout(() => sfx.current.blip(990, 0.18), 120); }, [reset, setPhase]);
  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") { sfx.current.ensure(); setPhase("playing"); }
  }, [setPhase]);
  const toggleSound = useCallback(() => {
    setSound((s) => { const n = !s; sfx.current.enabled = n; localStorage.setItem(SOUND_KEY, n ? "1" : "0"); if (n) sfx.current.ensure(); return n; });
  }, []);

  /* keyboard */
  useEffect(() => {
    const map: Record<string, keyof Input> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "boost", ShiftLeft: "boost", ShiftRight: "boost" };
    const down = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k || e.code === "Space") { if (phaseRef.current !== "start" && phaseRef.current !== "over" || e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); }
      if (k) input.current[k] = true;
      if (e.code === "KeyP" || e.code === "Escape") togglePause();
      if (e.code === "KeyM") toggleSound();
      if ((e.code === "Enter" || e.code === "Space") && (phaseRef.current === "start" || phaseRef.current === "over") && !e.repeat) start();
    };
    const up = (e: KeyboardEvent) => { const k = map[e.code]; if (k) input.current[k] = false; };
    const blur = () => { input.current = { left: false, right: false, up: false, down: false, boost: false }; if (phaseRef.current === "playing") setPhase("paused"); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [start, togglePause, toggleSound, setPhase]);

  /* main loop */
  useEffect(() => {
    layout();
    const ro = new ResizeObserver(layout); if (wrapRef.current) ro.observe(wrapRef.current);
    const cv = canvasRef.current!; const c = cv.getContext("2d")!;
    const grain = makeGrain(); const grainPat = c.createPattern(grain, "repeat")!;
    const img = new Image(); img.src = playerImgSrc;
    let raf = 0, last = performance.now(), hudT = 0, t = 0;
    const W = world.current;

    const spark = (x: number, y: number, n: number, color: string, spd = 260) => {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = Math.random() * spd; W.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.5, color, size: 1.5 + Math.random() * 2.5 }); }
    };

    const hit = (car: Car) => {
      if (W.invuln > 0) return;
      W.lives -= 1; W.invuln = 2; W.shake = 0.5; W.speed *= 0.55;
      spark(W.px, W.py - W.ph * 0.3, 40, "#ffd27a", 380); spark(W.px, W.py, 20, "#ffffff", 200);
      sfx.current.crash(); setFlash((f) => f + 1);
      car.vy = car.kind === "police" ? car.vy : W.speed * 0.2;
      if (car.kind === "police") car.y += W.ph * 1.4;
      else car.y -= W.ph * 0.6;
      if (W.lives <= 0) {
        const score = scoreFor(W.distance, W.time) + W.nearMissBonus;
        const prev = Number(localStorage.getItem(BEST_KEY) || 0); const newBest = score > prev;
        if (newBest) { localStorage.setItem(BEST_KEY, String(score)); setBest(score); }
        setFinal({ score, newBest, distance: W.distance });
        phaseRef.current = "over"; setPhaseState("over");
        sfx.current.blip(180, 0.6, "sawtooth", 0.15);
      }
    };

    const update = (dt: number) => {
      const inp = { left: input.current.left || touch.current.left, right: input.current.right || touch.current.right, up: input.current.up || touch.current.up, down: input.current.down || touch.current.down, boost: input.current.boost || touch.current.boost };
      W.time += dt;
      // speed ramp
      W.cruise = Math.min(MAX_SPEED * 0.8, BASE_SPEED + W.time * 7);
      let target = W.cruise;
      if (inp.up) target = W.cruise * 1.22;
      if (inp.down) target = W.cruise * 0.45;
      W.boosting = inp.boost && W.boost > 0.02;
      if (W.boosting) { target = Math.min(MAX_SPEED, W.cruise * 1.6); W.boost = Math.max(0, W.boost - dt * 0.45); }
      else W.boost = Math.min(1, W.boost + dt * 0.09);
      W.speed += (target - W.speed) * (1 - Math.exp(-(inp.down ? 3.5 : 1.8) * dt));
      // steering
      const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const maxV = 360 + W.speed * 0.25;
      W.pvx += steer * 2600 * dt; W.pvx *= Math.exp(-(steer ? 4 : 9) * dt);
      W.pvx = Math.max(-maxV, Math.min(maxV, W.pvx));
      W.px += W.pvx * dt;
      const minX = W.roadX + W.pw / 2 + 4, maxX = W.roadX + W.roadW - W.pw / 2 - 4;
      if (W.px < minX || W.px > maxX) { W.px = Math.max(minX, Math.min(maxX, W.px)); W.pvx *= -0.3; W.speed *= Math.exp(-1.5 * dt); if (Math.random() < 0.5) spark(W.px + (W.px <= minX ? -W.pw / 2 : W.pw / 2), W.py, 2, "#ffb347", 150); }
      W.distance += W.speed * dt; W.scroll = (W.scroll + W.speed * dt) % 80;
      W.invuln = Math.max(0, W.invuln - dt); W.shake = Math.max(0, W.shake - dt);

      // traffic spawn (fair: always leave a lane open near the top)
      W.spawnT -= dt;
      if (W.spawnT <= 0) {
        const blocked = new Set<number>();
        for (const car of W.cars) if (car.kind === "traffic" && car.y < W.ph * 3) blocked.add(Math.floor((car.x - W.roadX) / W.laneW));
        const lane = pickLane(W.lanes, blocked, Math.random);
        if (lane !== null) {
          const cw = W.pw * (0.95 + Math.random() * 0.1), ch = cw * (1.85 + Math.random() * 0.4);
          W.cars.push({ kind: "traffic", x: W.roadX + W.laneW * (lane + 0.5), y: -ch, w: cw, h: ch, vy: 120 + Math.random() * 120, color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)], seed: Math.random() * 100 });
        }
        const density = Math.min(1, W.time / 90);
        W.spawnT = (0.95 - density * 0.5) * (BASE_SPEED / Math.max(W.speed, 150)) * (0.7 + Math.random() * 0.6);
      }
      // police spawn
      W.policeT -= dt;
      const policeCount = W.cars.filter((c) => c.kind === "police").length;
      if (W.policeT <= 0 && policeCount < 1 + Math.floor(W.time / 45)) {
        W.cars.push({ kind: "police", x: W.roadX + W.laneW * (Math.floor(Math.random() * W.lanes) + 0.5), y: W.h + W.ph, w: W.pw * 1.02, h: W.ph * 1.02, vy: 0, color: "#111", seed: Math.random() * 100 });
        W.policeT = 7 + Math.random() * 6; sfx.current.blip(880, 0.2, "triangle", 0.06);
      }

      let heat = 0;
      for (const car of W.cars) {
        if (car.kind === "traffic") {
          car.y += (W.speed - car.vy) * dt;
          if (!car.nearMiss && car.y > W.py && Math.abs(car.x - W.px) < W.pw * 1.25 && Math.abs(car.x - W.px) > W.pw * 0.8) { car.nearMiss = true; W.nearMissBonus += 25; sfx.current.blip(1320, 0.06, "square", 0.04); }
        } else {
          // police: pursue player; slower you are, faster they close in
          const pursuit = Math.max(W.cruise * 1.08, W.speed * 0.98) + 40;
          const rel = W.boosting ? W.speed - pursuit * 0.9 : W.speed - pursuit;
          car.y += rel * dt;
          car.y = Math.max(car.y, W.py - W.ph * 2.5);
          const dx = W.px - car.x; car.x += Math.sign(dx) * Math.min(Math.abs(dx), 140 * dt);
          car.x = Math.max(W.roadX + car.w / 2, Math.min(W.roadX + W.roadW - car.w / 2, car.x));
          heat = Math.max(heat, Math.max(0, 1 - (car.y - W.py) / (W.h * 0.6)));
          // police also crash into traffic
          for (const o of W.cars) if (o !== car && o.kind === "traffic" && overlaps(car, o)) { spark(car.x, car.y - car.h / 2, 30, "#ffd27a", 300); car.y = W.h + 9999; sfx.current.crash(); W.nearMissBonus += 150; }
        }
        if (overlaps({ x: W.px, y: W.py, w: W.pw, h: W.ph }, car)) hit(car);
      }
      W.heat += (heat - W.heat) * (1 - Math.exp(-4 * dt));
      W.cars = W.cars.filter((c) => c.y < W.h + c.h * 3 + (c.kind === "police" ? 200 : 0) && c.y > -c.h * 4);

      // exhaust / particles
      if (W.boosting || Math.random() < 0.3) {
        const n = W.boosting ? 3 : 1;
        for (let i = 0; i < n; i++) W.particles.push({ x: W.px + (Math.random() - 0.5) * W.pw * 0.5, y: W.py + W.ph / 2, vx: (Math.random() - 0.5) * 30, vy: 80 + Math.random() * 120 + (W.boosting ? 200 : 0), life: 0, max: 0.35 + Math.random() * 0.3, color: W.boosting ? "#ff7a2b" : "#9a978f", size: W.boosting ? 4 : 2.5 });
      }
    };

    const updateParticles = (dt: number) => {
      for (const p of W.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-1 * dt); }
      W.particles = W.particles.filter((p) => p.life < p.max);
      if (W.particles.length > 400) W.particles.splice(0, W.particles.length - 400);
    };

    const render = () => {
      const { w, h, roadX, roadW, laneW } = W;
      c.save();
      if (W.shake > 0) c.translate((Math.random() - 0.5) * 14 * W.shake, (Math.random() - 0.5) * 14 * W.shake);
      // verge
      c.fillStyle = "#1a1b1d"; c.fillRect(-20, -20, w + 40, h + 40);
      c.strokeStyle = "rgba(220,215,200,0.07)"; c.lineWidth = 1;
      for (let y = -80 + (W.scroll * 1.0) % 40; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(roadX - 10, y + 22); c.moveTo(roadX + roadW + 10, y); c.lineTo(w, y + 22); c.stroke(); }
      // road
      const rg = c.createLinearGradient(roadX, 0, roadX + roadW, 0);
      rg.addColorStop(0, "#232427"); rg.addColorStop(0.5, "#2c2d31"); rg.addColorStop(1, "#232427");
      c.fillStyle = rg; c.fillRect(roadX, -20, roadW, h + 40);
      // edge lines
      c.fillStyle = "#f2efe6"; c.fillRect(roadX + 4, 0, 4, h); c.fillRect(roadX + roadW - 8, 0, 4, h);
      // lane dashes w/ motion streak
      const streak = Math.min(1, (W.speed - BASE_SPEED) / 500);
      for (let i = 1; i < W.lanes; i++) {
        const x = roadX + laneW * i - 2;
        for (let y = -80 + W.scroll; y < h + 80; y += 80) {
          c.fillStyle = "#f6f3ea"; c.fillRect(x, y, 4, 40);
          if (streak > 0) { c.fillStyle = `rgba(246,243,234,${0.15 * streak})`; c.fillRect(x, y - 30 * streak, 4, 30 * streak); }
        }
      }
      // police light wash
      if (W.heat > 0.02) {
        const on = Math.sin(t * 18) > 0;
        const g = c.createRadialGradient(w / 2, h, 10, w / 2, h, h * 0.9);
        g.addColorStop(0, on ? `rgba(255,40,60,${0.35 * W.heat})` : `rgba(40,110,255,${0.35 * W.heat})`); g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      // particles under cars
      for (const p of W.particles) { c.globalAlpha = 1 - p.life / p.max; c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      c.globalAlpha = 1;
      for (const car of W.cars) drawCar(c, car, t);
      // player
      const blink = W.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) {
        c.save(); c.translate(W.px, W.py); c.rotate((W.pvx / 900) * 0.25);
        c.fillStyle = "rgba(0,0,0,0.5)"; c.fillRect(-W.pw / 2 + 5, -W.ph / 2 + 8, W.pw, W.ph);
        if (W.boosting) { c.shadowColor = "#ff7a2b"; c.shadowBlur = 30; }
        if (img.complete && img.naturalWidth) c.drawImage(img, -W.pw / 2 - W.pw * 0.04, -W.ph / 2, W.pw * 1.08, W.ph);
        else { c.fillStyle = "#eee"; c.fillRect(-W.pw / 2, -W.ph / 2, W.pw, W.ph); }
        c.restore();
      }
      // speed lines
      if (streak > 0.2) {
        c.strokeStyle = `rgba(255,255,255,${0.12 * streak})`; c.lineWidth = 1;
        for (let i = 0; i < 14; i++) { const x = ((i * 97.3 + t * 13) % 1) * w, y = ((i * 53.1 + t * W.speed * 0.004) % 1) * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 60 * streak); c.stroke(); }
      }
      // graphite grain + vignette
      c.fillStyle = grainPat; c.globalCompositeOperation = "overlay";
      c.save(); c.translate(0, (W.scroll * 0.5) % 256); c.fillRect(0, -256, w, h + 512); c.restore();
      c.globalCompositeOperation = "source-over";
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.6)");
      c.fillStyle = v; c.fillRect(0, 0, w, h);
      c.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const ph = phaseRef.current;
      if (ph === "playing") { t += dt; update(dt); updateParticles(dt); }
      else if (ph === "start") { t += dt; W.scroll = (W.scroll + 180 * dt) % 80; updateParticles(dt); }
      else if (ph === "over") { t += dt; updateParticles(dt); }
      render();
      sfx.current.engine(W.speed, ph === "playing", W.heat, t);
      hudT += dt;
      if (hudT > 0.1 && ph === "playing") { hudT = 0; setHud({ score: scoreFor(W.distance, W.time) + W.nearMissBonus, speed: Math.round(W.speed * 0.32), lives: W.lives, boost: W.boost, heat: W.heat }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [layout]);

  const hold = (k: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); touch.current[k] = true; sfx.current.ensure(); },
    onPointerUp: () => { touch.current[k] = false; },
    onPointerCancel: () => { touch.current[k] = false; },
    onLostPointerCapture: () => { touch.current[k] = false; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const playing = phase === "playing";

  return (
    <div className="game-shell">
      <div ref={wrapRef} className="game-stage" key={flash > 0 ? "s" : "s"}>
        <canvas ref={canvasRef} className="block touch-none" aria-label="Police Pursuit game canvas" />

        {/* HUD */}
        {(playing || phase === "paused") && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
            <div className="hud-panel">
              <div className="hud-label">Score</div>
              <div className="hud-value">{hud.score.toLocaleString()}</div>
              <div className="hud-label mt-1">Best {Math.max(best, hud.score).toLocaleString()}</div>
            </div>
            <div className="hud-panel text-center">
              <div className="hud-value">{hud.speed}<span className="hud-label ml-1">km/h</span></div>
              <div className="mt-1 flex justify-center gap-1" aria-label={`${hud.lives} lives left`}>
                {Array.from({ length: MAX_LIVES }).map((_, i) => <span key={i} className={i < hud.lives ? "life-pip" : "life-pip life-pip-empty"} />)}
              </div>
              <div className="meter mt-2"><div className="meter-fill-boost" style={{ width: `${hud.boost * 100}%` }} /></div>
              <div className="hud-label mt-0.5">Nitro</div>
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? "🔊" : "🔇"}</button>
                <button className="icon-btn" onClick={togglePause} aria-label={phase === "paused" ? "Resume" : "Pause"}>{phase === "paused" ? "▶" : "❚❚"}</button>
              </div>
              {hud.heat > 0.15 && <div className="heat-badge">● PURSUIT</div>}
            </div>
          </div>
        )}

        {/* Touch controls */}
        {playing && (
          <div className="touch-controls">
            <div className="flex gap-3">
              <button className="touch-btn" aria-label="Steer left" {...hold("left")}>◀</button>
              <button className="touch-btn" aria-label="Steer right" {...hold("right")}>▶</button>
            </div>
            <div className="flex gap-3">
              <button className="touch-btn touch-btn-brake" aria-label="Brake" {...hold("down")}>BRAKE</button>
              <button className="touch-btn touch-btn-boost" aria-label="Boost" {...hold("boost")}>NITRO</button>
            </div>
          </div>
        )}

        {phase === "start" && (
          <div className="overlay">
            <div className="overlay-card">
              <img src={playerImgSrc} alt="Pencil sketch supercar" width={576} height={1152} className="start-car" />
              <p className="kicker">A graphite getaway</p>
              <h1 className="title">POLICE PURSUIT</h1>
              <h2 className="subtitle">— SKETCH RUN —</h2>
              <ul className="controls-list">
                <li><kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> steer</li>
                <li><kbd>↑</kbd>/<kbd>W</kbd> gas · <kbd>↓</kbd>/<kbd>S</kbd> brake</li>
                <li><kbd>Space</kbd>/<kbd>Shift</kbd> nitro · <kbd>P</kbd> pause · <kbd>M</kbd> mute</li>
                <li className="sm:hidden">On phone: hold the big buttons at the bottom</li>
              </ul>
              <p className="tip">Dodge traffic, outrun the cops — slow down and they’ll catch you. Near misses &amp; police wrecks earn bonus points.</p>
              <button className="cta" onClick={start}>START RUN</button>
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="hud-label">Best {best.toLocaleString()}</span>
                <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? "🔊" : "🔇"}</button>
              </div>
            </div>
          </div>
        )}

        {phase === "paused" && (
          <div className="overlay">
            <div className="overlay-card">
              <h2 className="title text-4xl">PAUSED</h2>
              <p className="tip">Press P / Esc or tap resume.</p>
              <button className="cta" onClick={togglePause}>RESUME</button>
              <button className="ghost-btn mt-3" onClick={start}>Restart</button>
            </div>
          </div>
        )}

        {phase === "over" && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="kicker">Busted</p>
              <h2 className="title">GAME OVER</h2>
              <div className="final-score">{final.score.toLocaleString()}</div>
              {final.newBest ? <p className="new-best">★ New best score ★</p> : <p className="hud-label">Best {best.toLocaleString()}</p>}
              <p className="tip">Distance {(final.distance / 1000).toFixed(2)} km</p>
              <button className="cta" onClick={start}>RUN AGAIN</button>
              <p className="hud-label mt-2">or press Enter</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
