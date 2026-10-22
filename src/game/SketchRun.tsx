import { useCallback, useEffect, useRef, useState } from "react";
import playerImgSrc from "@/assets/player-car.png";
import heroImgSrc from "@/assets/hero-car.jpg";
import { BASE_SPEED, MAX_LIVES, MAX_SPEED, accelRate, overlaps, pickLane, scoreFor, tiltToSteer, type Car, type Input, type Particle, type VehicleModel } from "./engine";
import { MODEL_RATIO, MODEL_WIDTH, PAINTS, clearSpriteCache, drawLightbar, vehicleSprite } from "./carArt";
import { PlayerAccount } from "./PlayerAccount";
type Phase = "menu" | "playing" | "paused" | "over";
type Screen = "home" | "garage" | "howto" | "multi" | "controls" | "account";
type Settings = { control: "touch" | "tilt"; sens: number; neutral: number; paint: string; name: string };
type Entry = { name: string; score: number; time: number; distance: number; date: number };
type Popup = { text: string; x: number; y: number; life: number; color: string };
type Prop = { kind: "lamp" | "sign" | "building" | "tree"; side: -1 | 1; y: number; seed: number };
type Skid = { x: number; y: number; a: number };

const BEST_KEY = "mcr.best";
const SOUND_KEY = "mcr.sound";
const SET_KEY = "mcr.settings";
const BOARD_KEY = "mcr.board";
const PLAYER_PAINTS = [
  { id: "#ffffff", name: "Arctic" }, { id: "#d62b2b", name: "Rosso" }, { id: "#2a6fe0", name: "Electric" },
  { id: "#2a2b30", name: "Carbon" }, { id: "#f0c419", name: "Giallo" }, { id: "#2f9a57", name: "Verde" }, { id: "#a9aeb6", name: "Titanium" },
];
const TRAFFIC_MODELS: VehicleModel[] = ["sedan", "sedan", "coupe", "suv", "suv", "taxi", "van"];
const DEFAULT_SETTINGS: Settings = { control: "touch", sens: 1, neutral: 0, paint: "#ffffff", name: "Racer" };
const blankInput = (): Input => ({ left: false, right: false, up: false, down: false, boost: false, drift: false });

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
    this.osc.frequency.setTargetAtTime(45 + speed * 0.15, this.ctx.currentTime, 0.05);
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

function makeGrain(): HTMLCanvasElement {
  const g = document.createElement("canvas"); g.width = g.height = 256;
  const gc = g.getContext("2d")!; const id = gc.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 18; }
  gc.putImageData(id, 0, 0);
  return g;
}

function tintPlayer(img: HTMLImageElement, color: string): HTMLCanvasElement | HTMLImageElement {
  if (color === "#ffffff" || !img.naturalWidth) return img;
  const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const c = cv.getContext("2d")!;
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = "multiply"; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = "destination-in"; c.drawImage(img, 0, 0);
  return cv;
}

function readTilt(e: DeviceOrientationEvent) {
  const angle = typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
  if (angle === 90) return e.beta ?? 0;
  if (angle === 270 || angle === -90) return -(e.beta ?? 0);
  return e.gamma ?? 0;
}

/* ---------------- component ---------------- */
export function SketchRun() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const input = useRef<Input>(blankInput());
  const touch = useRef<Input>(blankInput());
  const phaseRef = useRef<Phase>("menu");
  const sfx = useRef(new Sfx());
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const tiltRaw = useRef<number | null>(null);
  const tiltSmooth = useRef(0);
  const playerSprite = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const playerImg = useRef<HTMLImageElement | null>(null);
  const [phase, setPhaseState] = useState<Phase>("menu");
  const [screenName, setScreen] = useState<Screen>("home");
  const [hud, setHud] = useState<Hud>({ score: 0, speed: 0, lives: MAX_LIVES, boost: 1, heat: 0, drift: 0, traction: 1 });
  const [best, setBest] = useState(0);
  const [sound, setSound] = useState(true);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [tiltStatus, setTiltStatus] = useState<"off" | "on" | "denied" | "unsupported">("off");
  const [board, setBoard] = useState<Entry[]>([]);
  const [final, setFinal] = useState({ score: 0, newBest: false, distance: 0, time: 0, rank: 0 });

  const world = useRef({
    w: 0, h: 0, roadX: 0, roadW: 0, lanes: 4, laneW: 0,
    px: 0, py: 0, baseY: 0, pvx: 0, pw: 40, ph: 80, heading: 0,
    speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, scroll: 0,
    lives: MAX_LIVES, invuln: 0, boost: 1, boosting: false, boostVis: 0, shake: 0, hitFlash: 0,
    drift: 0, traction: 1, driftCd: 0, driftDir: 0,
    cars: [] as Car[], particles: [] as Particle[], popups: [] as Popup[], props: [] as Prop[], skids: [] as Skid[],
    spawnT: 0, policeT: 6, propT: 0, heat: 0, bonus: 0,
  });

  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p); }, []);
  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch }; settingsRef.current = n;
      localStorage.setItem(SET_KEY, JSON.stringify(n));
      if (patch.paint && playerImg.current) playerSprite.current = tintPlayer(playerImg.current, n.paint);
      return n;
    });
  }, []);

  useEffect(() => {
    setBest(Number(localStorage.getItem(BEST_KEY) || localStorage.getItem("sketchrun.best") || 0));
    if (localStorage.getItem(SOUND_KEY) === "0") { setSound(false); sfx.current.enabled = false; }
    try {
      const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) || "{}") } as Settings;
      s.control = "touch"; // tilt needs a fresh permission tap each session
      settingsRef.current = s; setSettingsState(s);
    } catch { /* ignore */ }
    try { setBoard(JSON.parse(localStorage.getItem(BOARD_KEY) || "[]")); } catch { /* ignore */ }
  }, []);

  /* tilt */
  useEffect(() => {
    if (settings.control !== "tilt") return;
    const on = (e: DeviceOrientationEvent) => { if (e.gamma == null && e.beta == null) return; tiltRaw.current = readTilt(e); };
    window.addEventListener("deviceorientation", on);
    const check = setTimeout(() => { if (tiltRaw.current == null) { setTiltStatus("unsupported"); saveSettings({ control: "touch" }); } }, 1500);
    return () => { window.removeEventListener("deviceorientation", on); clearTimeout(check); };
  }, [settings.control, saveSettings]);

  const enableTilt = useCallback(async () => {
    if (typeof DeviceOrientationEvent === "undefined") { setTiltStatus("unsupported"); return; }
    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof req === "function") {
      try { const r = await req(); if (r !== "granted") { setTiltStatus("denied"); return; } }
      catch { setTiltStatus("denied"); return; }
    }
    tiltRaw.current = null; setTiltStatus("on"); saveSettings({ control: "tilt" });
  }, [saveSettings]);
  const calibrate = useCallback(() => { if (tiltRaw.current != null) saveSettings({ neutral: tiltRaw.current }); }, [saveSettings]);

  const layout = useCallback(() => {
    const cv = canvasRef.current, wrap = wrapRef.current; if (!cv || !wrap) return;
    const r = wrap.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
    const W = world.current; const oldRoadX = W.roadX, oldRoadW = W.roadW || 1;
    W.w = r.width; W.h = r.height;
    W.roadW = Math.min(r.width * 0.8, 560); W.roadX = (r.width - W.roadW) / 2; W.laneW = W.roadW / W.lanes;
    W.pw = Math.min(W.laneW * 0.56, r.height * 0.07); W.ph = W.pw * 2;
    W.baseY = r.height * (r.height < 500 ? 0.7 : 0.72); W.py = W.baseY;
    if (!W.px) W.px = r.width / 2; else W.px = W.roadX + ((W.px - oldRoadX) / oldRoadW) * W.roadW;
    cv.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearSpriteCache();
  }, []);

  const reset = useCallback(() => {
    const W = world.current;
    Object.assign(W, { speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, lives: MAX_LIVES, invuln: 1.5, boost: 1, boosting: false, boostVis: 0, shake: 0, hitFlash: 0, drift: 0, traction: 1, driftCd: 0, driftDir: 0, cars: [], particles: [], popups: [], skids: [], spawnT: 0.8, policeT: 5, heat: 0, pvx: 0, heading: 0, bonus: 0 });
    W.px = W.w / 2;
    input.current = blankInput(); touch.current = blankInput();
    setHud({ score: 0, speed: 0, lives: MAX_LIVES, boost: 1, heat: 0, drift: 0, traction: 1 });
  }, []);

  const start = useCallback(() => { sfx.current.ensure(); reset(); setPhase("playing"); sfx.current.blip(660, 0.12); setTimeout(() => sfx.current.blip(990, 0.18), 120); }, [reset, setPhase]);
  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") { sfx.current.ensure(); setPhase("playing"); }
  }, [setPhase]);
  const toMenu = useCallback(() => { setScreen("home"); setPhase("menu"); }, [setPhase]);
  const toggleSound = useCallback(() => {
    setSound((s) => { const n = !s; sfx.current.enabled = n; localStorage.setItem(SOUND_KEY, n ? "1" : "0"); if (n) sfx.current.ensure(); return n; });
  }, []);

  /* keyboard */
  useEffect(() => {
    const map: Record<string, keyof Input> = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "boost", ShiftLeft: "boost", ShiftRight: "boost" };
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      const k = map[e.code];
      if (phaseRef.current === "playing" && (k || e.code === "Space")) e.preventDefault();
      if (k) input.current[k] = true;
      if (e.code === "KeyP" || e.code === "Escape") togglePause();
      if (e.code === "KeyM") toggleSound();
      if (e.code === "Enter" && (phaseRef.current === "menu" || phaseRef.current === "over") && !e.repeat) { e.preventDefault(); start(); }
    };
    const up = (e: KeyboardEvent) => { const k = map[e.code]; if (k) input.current[k] = false; };
    const blur = () => { input.current = blankInput(); touch.current = blankInput(); if (phaseRef.current === "playing") setPhase("paused"); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [start, togglePause, toggleSound, setPhase]);

  /* main loop */
  useEffect(() => {
    layout();
    const ro = new ResizeObserver(layout); if (wrapRef.current) ro.observe(wrapRef.current);
    const cv = canvasRef.current!; const c = cv.getContext("2d")!;
    const grainPat = c.createPattern(makeGrain(), "repeat")!;
    const img = new Image(); img.src = playerImgSrc;
    img.onload = () => { playerImg.current = img; playerSprite.current = tintPlayer(img, settingsRef.current.paint); };
    let raf = 0, last = performance.now(), hudT = 0, t = 0;
    const W = world.current;

    const spark = (x: number, y: number, n: number, color: string, spd = 260) => {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = Math.random() * spd; W.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.5, color, size: 1.5 + Math.random() * 2.5 }); }
    };
    const pop = (text: string, color = "#ffffff") => W.popups.push({ text, x: W.px, y: W.py - W.ph * 0.8, life: 0, color });

    const finish = () => {
      const score = scoreFor(W.distance, W.time) + Math.floor(W.bonus);
      const prev = Number(localStorage.getItem(BEST_KEY) || 0); const newBest = score > prev;
      if (newBest) { localStorage.setItem(BEST_KEY, String(score)); setBest(score); }
      let list: Entry[] = [];
      try { list = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]"); } catch { list = []; }
      const entry: Entry = { name: settingsRef.current.name || "Racer", score, time: W.time, distance: W.distance, date: Date.now() };
      list.push(entry); list.sort((a, b) => b.score - a.score); list = list.slice(0, 10);
      localStorage.setItem(BOARD_KEY, JSON.stringify(list)); setBoard(list);
      const rank = list.indexOf(entry) + 1;
      setFinal({ score, newBest, distance: W.distance, time: W.time, rank });
      phaseRef.current = "over"; setPhaseState("over");
      sfx.current.blip(180, 0.6, "sawtooth", 0.15);
    };

    const hit = (car: Car) => {
      if (W.invuln > 0) return;
      W.lives -= 1; W.invuln = 2; W.shake = 0.55; W.hitFlash = 1; W.speed *= 0.5; W.drift = 0;
      spark(W.px, W.py - W.ph * 0.3, 40, "#ffd27a", 380); spark(W.px, W.py, 20, "#ffffff", 200);
      sfx.current.crash();
      if (car.kind === "police") car.y += W.ph * 1.6; else { car.y -= W.ph * 0.6; car.vy = W.speed * 0.2; }
      if (W.lives <= 0) finish();
    };

    const spawnPolice = (level: number) => {
      const playerLane = Math.max(0, Math.min(W.lanes - 1, Math.floor((W.px - W.roadX) / W.laneW)));
      const ahead = level >= 2 && Math.random() < 0.3;
      const offs = ahead ? (Math.random() < 0.5 ? -1 : 1) : Math.floor(Math.random() * 3) - 1;
      const lane = Math.max(0, Math.min(W.lanes - 1, playerLane + offs));
      const w = W.pw * MODEL_WIDTH.police, h = w * MODEL_RATIO.police;
      W.cars.push({ kind: "police", model: "police", ahead, x: W.roadX + W.laneW * (lane + 0.5), y: ahead ? -h : W.h + h, w, h, vy: ahead ? W.cruise * 0.55 : 0, color: "#111", seed: Math.random() * 100 });
      sfx.current.blip(880, 0.2, "triangle", 0.06);
    };

    const update = (dt: number) => {
      const S = settingsRef.current;
      const k = input.current, tc = touch.current;
      const inp = { left: k.left || tc.left, right: k.right || tc.right, up: k.up || tc.up, down: k.down || tc.down, boost: k.boost || tc.boost };
      W.time += dt;
      const level = 1 + Math.floor(W.time / 35);
      // ---- speed ----
      W.cruise = Math.min(MAX_SPEED * 0.62, BASE_SPEED + W.time * 6);
      let target = W.cruise * 1.05;
      if (inp.up) target = Math.min(MAX_SPEED * 0.85, W.cruise * 1.35);
      if (inp.down) target = W.cruise * 0.4;
      W.boosting = inp.boost && W.boost > 0.02 && !inp.down;
      if (W.boosting) { target = Math.min(MAX_SPEED, W.cruise * 1.35 + 420); W.boost = Math.max(0, W.boost - dt * 0.38); }
      else W.boost = Math.min(1, W.boost + dt * 0.07);
      const rate = target > W.speed ? accelRate(W.speed, W.boosting) : inp.down ? 3.2 : 0.9;
      W.speed += (target - W.speed) * (1 - Math.exp(-rate * dt));
      W.boostVis += ((W.boosting ? 1 : 0) - W.boostVis) * (1 - Math.exp(-5 * dt));
      W.py = W.baseY + W.h * 0.05 * W.boostVis; // camera pulls back on nitro
      // ---- steering ----
      let steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (S.control === "tilt" && tiltRaw.current != null && steer === 0) {
        const raw = tiltToSteer(tiltRaw.current, S.neutral, S.sens, 3);
        tiltSmooth.current += (raw - tiltSmooth.current) * (1 - Math.exp(-12 * dt));
        steer = tiltSmooth.current;
      }
      const sf = W.speed / MAX_SPEED;
      W.driftCd = Math.max(0, W.driftCd - dt);
      const wantDrift = Math.abs(steer) > 0.8 && sf > 0.42 && W.traction > 0.12 && W.driftCd <= 0;
      if (wantDrift && W.drift < 0.05) W.driftDir = Math.sign(steer);
      W.drift += ((wantDrift ? 1 : 0) - W.drift) * (1 - Math.exp(-(wantDrift ? 4 : 6) * dt));
      if (W.drift > 0.2) {
        W.traction -= dt * 0.55 * W.drift;
        if (W.traction <= 0.12) { W.driftCd = 1.4; pop("GRIP LOST", "#ff6b6b"); }
        W.bonus += W.drift * W.speed * dt * 0.06;
        W.speed *= Math.exp(-0.12 * W.drift * dt);
      } else W.traction = Math.min(1, W.traction + dt * 0.4);
      const grip = 11 - 8.5 * W.drift;
      const latTarget = steer * (330 + W.speed * 0.32) * (1 + 0.2 * W.drift);
      W.pvx += (latTarget - W.pvx) * (1 - Math.exp(-grip * dt));
      W.px += W.pvx * dt;
      const headTarget = (W.pvx / 1400) * 0.35 + W.drift * W.driftDir * 0.38;
      W.heading += (headTarget - W.heading) * (1 - Math.exp(-10 * dt));
      const minX = W.roadX + W.pw / 2 + 6, maxX = W.roadX + W.roadW - W.pw / 2 - 6;
      if (W.px < minX || W.px > maxX) { W.px = Math.max(minX, Math.min(maxX, W.px)); W.pvx *= -0.3; W.speed *= Math.exp(-1.5 * dt); if (Math.random() < 0.5) spark(W.px + (W.px <= minX ? -W.pw / 2 : W.pw / 2), W.py, 2, "#ffb347", 150); }
      const dy = W.speed * dt;
      W.distance += dy; W.scroll = (W.scroll + dy) % 80;
      W.invuln = Math.max(0, W.invuln - dt); W.shake = Math.max(0, W.shake - dt); W.hitFlash = Math.max(0, W.hitFlash - dt * 2.5);

      // skid marks + smoke
      for (const s of W.skids) s.y += dy;
      W.skids = W.skids.filter((s) => s.y < W.h + 20);
      if (W.drift > 0.3) {
        const ca = Math.cos(W.heading), sa = Math.sin(W.heading);
        for (const sx of [-0.38, 0.38]) {
          const rx = sx * W.pw, ry = W.ph * 0.32;
          W.skids.push({ x: W.px + rx * ca - ry * sa, y: W.py + rx * sa + ry * ca, a: W.drift });
          if (Math.random() < 0.6) W.particles.push({ x: W.px + rx, y: W.py + ry, vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 80, life: 0, max: 0.6 + Math.random() * 0.5, color: "#c9c9c9", size: 6 + Math.random() * 6 });
        }
        if (W.skids.length > 600) W.skids.splice(0, W.skids.length - 600);
      }

      // roadside props
      W.propT -= dy;
      if (W.propT <= 0) {
        const r = Math.random();
        const kind: Prop["kind"] = r < 0.45 ? "lamp" : r < 0.6 ? "sign" : r < 0.82 ? "building" : "tree";
        W.props.push({ kind, side: Math.random() < 0.5 ? -1 : 1, y: -140, seed: Math.random() });
        W.propT = 120 + Math.random() * 160;
      }
      for (const p of W.props) p.y += dy;
      W.props = W.props.filter((p) => p.y < W.h + 200);

      // traffic spawn (fair: always leave a lane open near the top)
      W.spawnT -= dt;
      if (W.spawnT <= 0) {
        const blocked = new Set<number>();
        for (const car of W.cars) if (car.y < W.ph * 3) blocked.add(Math.floor((car.x - W.roadX) / W.laneW));
        const lane = pickLane(W.lanes, blocked, Math.random);
        if (lane !== null) {
          const model = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)] ?? "sedan";
          const cw = W.pw * MODEL_WIDTH[model], ch = cw * MODEL_RATIO[model];
          W.cars.push({ kind: "traffic", model, x: W.roadX + W.laneW * (lane + 0.5), y: -ch, w: cw, h: ch, vy: (model === "van" ? 90 : 120) + Math.random() * 130, color: PAINTS[Math.floor(Math.random() * PAINTS.length)] ?? "#b9bec6", seed: Math.random() * 100 });
        }
        const density = Math.min(1, W.time / 90);
        W.spawnT = (0.95 - density * 0.5) * (BASE_SPEED / Math.max(W.speed, 150)) * (0.7 + Math.random() * 0.6) * 1.6;
      }
      // police spawn – escalating pressure
      W.policeT -= dt;
      const policeCount = W.cars.filter((c) => c.kind === "police").length;
      if (W.policeT <= 0 && policeCount < Math.min(4, level)) { spawnPolice(level); W.policeT = Math.max(3, 8 - level) + Math.random() * 4; }

      let heat = 0;
      const player = { x: W.px, y: W.py, w: W.pw, h: W.ph };
      for (const car of W.cars) {
        if (car.kind === "traffic") {
          car.y += (W.speed - car.vy) * dt;
          if (!car.nearMiss && car.y > W.py && car.y < W.py + W.ph && Math.abs(car.x - W.px) < W.pw * 1.3 && Math.abs(car.x - W.px) > W.pw * 0.82) {
            car.nearMiss = true; W.bonus += 50; W.boost = Math.min(1, W.boost + 0.08); W.shake = Math.max(W.shake, 0.1);
            pop("NEAR MISS +50", "#7fd4ff"); sfx.current.blip(1320, 0.06, "square", 0.04);
          }
        } else {
          let pursuit = Math.max(W.cruise * 1.1, W.speed * 0.98) + 40 + level * 18;
          if (W.boosting) pursuit *= 0.82;
          if (car.ahead) { car.y += (W.speed - car.vy) * dt; if (car.y > W.py - W.ph * 3) car.ahead = false; }
          else { car.y += (W.speed - pursuit) * dt; car.y = Math.max(car.y, W.py - W.ph * 2.2); }
          // lateral: match lane from distance, ram when alongside
          const close = Math.abs(car.y - W.py) < W.ph * 2.5;
          const laneX = W.roadX + W.laneW * (Math.floor((W.px - W.roadX) / W.laneW) + 0.5);
          const tx = close ? W.px : laneX;
          const dx = tx - car.x; car.x += Math.sign(dx) * Math.min(Math.abs(dx), (110 + level * 25) * dt);
          car.x = Math.max(W.roadX + car.w / 2, Math.min(W.roadX + W.roadW - car.w / 2, car.x));
          heat = Math.max(heat, Math.max(0, 1 - Math.abs(car.y - W.py) / (W.h * 0.6)));
          for (const o of W.cars) if (o !== car && o.kind === "traffic" && overlaps(car, o)) {
            spark(car.x, car.y - car.h / 2, 30, "#ffd27a", 300); car.y = W.h + 9999; sfx.current.crash(); W.bonus += 150; pop("COP WRECKED +150", "#ffcc55");
          }
        }
        if (overlaps(player, car)) { hit(car); if (phaseRef.current !== "playing") return; }
      }
      W.heat += (heat - W.heat) * (1 - Math.exp(-4 * dt));
      W.cars = W.cars.filter((c) => c.y < W.h + c.h * 3 + (c.kind === "police" ? 200 : 0) && c.y > -c.h * 4);

      // exhaust / nitro flame
      if (W.boosting || Math.random() < 0.3) {
        const n = W.boosting ? 4 : 1;
        for (let i = 0; i < n; i++) W.particles.push({ x: W.px + (Math.random() - 0.5) * W.pw * 0.4, y: W.py + W.ph / 2, vx: (Math.random() - 0.5) * 30, vy: 80 + Math.random() * 120 + (W.boosting ? 260 : 0), life: 0, max: 0.3 + Math.random() * 0.3, color: W.boosting ? (Math.random() < 0.5 ? "#4cc3ff" : "#ff7a2b") : "#9a978f", size: W.boosting ? 4.5 : 2.5 });
      }
    };

    const updateFx = (dt: number) => {
      for (const p of W.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-1 * dt); }
      W.particles = W.particles.filter((p) => p.life < p.max);
      if (W.particles.length > 450) W.particles.splice(0, W.particles.length - 450);
      for (const p of W.popups) { p.life += dt; p.y -= 50 * dt; }
      W.popups = W.popups.filter((p) => p.life < 1.1);
    };

    const drawProp = (p: Prop) => {
      const { roadX, roadW, w } = W;
      const edge = p.side < 0 ? roadX : roadX + roadW;
      const verge = roadX;
      if (p.kind === "building") {
        if (verge < 40) return;
        const bw = Math.min(verge - 24, 60 + p.seed * 60), bh = 90 + p.seed * 120;
        const x = p.side < 0 ? 4 + p.seed * Math.max(0, verge - bw - 30) : w - 4 - bw - p.seed * Math.max(0, verge - bw - 30);
        c.fillStyle = "#111215"; c.fillRect(x, p.y, bw, bh);
        c.strokeStyle = "#2a2c31"; c.lineWidth = 1; c.strokeRect(x + 0.5, p.y + 0.5, bw - 1, bh - 1);
        c.fillStyle = "#1c1e23"; c.fillRect(x + bw * 0.15, p.y + bh * 0.15, bw * 0.3, bh * 0.2);
        c.fillStyle = "rgba(255,210,120,0.25)";
        for (let i = 0; i < 4; i++) if ((p.seed * 10 + i) % 3 < 1.4) c.fillRect(x + 6 + i * (bw / 4.5), p.y + bh - 14, 5, 5);
      } else if (p.kind === "tree") {
        if (verge < 26) return;
        const x = p.side < 0 ? edge - 22 - p.seed * (verge - 30) : edge + 22 + p.seed * (verge - 30);
        c.fillStyle = "rgba(0,0,0,0.4)"; c.beginPath(); c.arc(x + 4, p.y + 4, 13, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#1d2a22"; c.beginPath(); c.arc(x, p.y, 13, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#2a3b30"; c.beginPath(); c.arc(x - 3, p.y - 3, 7, 0, Math.PI * 2); c.fill();
      } else if (p.kind === "lamp") {
        const base = p.side < 0 ? edge - 10 : edge + 10, arm = p.side < 0 ? 34 : -34;
        const g = c.createRadialGradient(base + arm, p.y, 2, base + arm, p.y, 70);
        g.addColorStop(0, "rgba(255,236,190,0.16)"); g.addColorStop(1, "rgba(255,236,190,0)");
        c.fillStyle = g; c.fillRect(base + arm - 70, p.y - 70, 140, 140);
        c.strokeStyle = "#5a5d63"; c.lineWidth = 3; c.beginPath(); c.moveTo(base, p.y); c.lineTo(base + arm, p.y); c.stroke();
        c.fillStyle = "#6b6e74"; c.beginPath(); c.arc(base, p.y, 4, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#fff1c9"; c.fillRect(base + arm - 4, p.y - 2, 8, 4);
      } else {
        const x = p.side < 0 ? Math.max(2, edge - 42) : Math.min(w - 40, edge + 4);
        c.fillStyle = "#1f6b3d"; c.fillRect(x, p.y, 38, 20);
        c.strokeStyle = "#e9e9e4"; c.lineWidth = 1; c.strokeRect(x + 2, p.y + 2, 34, 16);
        c.fillStyle = "#e9e9e4"; c.fillRect(x + 7, p.y + 7, 18, 2); c.fillRect(x + 7, p.y + 11, 12, 2);
      }
    };

    const render = () => {
      const { w, h, roadX, roadW, laneW } = W;
      c.save();
      if (W.shake > 0) c.translate((Math.random() - 0.5) * 16 * W.shake, (Math.random() - 0.5) * 16 * W.shake);
      // verge
      c.fillStyle = "#141518"; c.fillRect(-20, -20, w + 40, h + 40);
      c.fillStyle = "#1b1c20";
      for (let y = -80 + (W.scroll % 80); y < h; y += 80) { c.fillRect(0, y, roadX - 14, 40); c.fillRect(roadX + roadW + 14, y, w, 40); }
      // road
      const rg = c.createLinearGradient(roadX, 0, roadX + roadW, 0);
      rg.addColorStop(0, "#1e1f22"); rg.addColorStop(0.5, "#292a2e"); rg.addColorStop(1, "#1e1f22");
      c.fillStyle = rg; c.fillRect(roadX, -20, roadW, h + 40);
      // asphalt patches
      c.fillStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < 6; i++) { const y = ((i * 211 + W.scroll * 1) % (h + 200)) - 100; c.fillRect(roadX + ((i * 97) % (roadW - 60)), y + ((W.distance / 1) % 1), 50, 26); }
      // skid marks
      for (const s of W.skids) { c.fillStyle = `rgba(8,8,8,${0.5 * s.a})`; c.fillRect(s.x - 2, s.y - 2, 4, 5); }
      // edge lines + barriers
      c.fillStyle = "#f2efe6"; c.fillRect(roadX + 5, -20, 3, h + 40); c.fillRect(roadX + roadW - 8, -20, 3, h + 40);
      c.fillStyle = "#8b8f96"; c.fillRect(roadX - 6, -20, 4, h + 40); c.fillRect(roadX + roadW + 2, -20, 4, h + 40);
      for (let y = -40 + (W.scroll % 40); y < h + 40; y += 40) {
        c.fillStyle = "#5b5f66"; c.fillRect(roadX - 9, y, 9, 4); c.fillRect(roadX + roadW, y, 9, 4);
        c.fillStyle = Math.floor((y - W.scroll) / 40) % 2 ? "#d22d2d" : "#e9e9e4";
        c.fillRect(roadX - 1, y, 2, 18); c.fillRect(roadX + roadW - 1, y, 2, 18);
      }
      // lane dashes w/ motion streak
      const streak = Math.min(1, (W.speed - BASE_SPEED) / 700);
      for (let i = 1; i < W.lanes; i++) {
        const x = roadX + laneW * i - 2;
        for (let y = -80 + W.scroll; y < h + 80; y += 80) {
          c.fillStyle = "#f6f3ea"; c.fillRect(x, y, 4, 38);
          if (streak > 0) { c.fillStyle = `rgba(246,243,234,${0.16 * streak})`; c.fillRect(x, y - 40 * streak, 4, 40 * streak); }
        }
      }
      for (const p of W.props) drawProp(p);
      // police light wash
      if (W.heat > 0.02) {
        const on = Math.sin(t * 18) > 0;
        const g = c.createRadialGradient(w / 2, h, 10, w / 2, h, h * 0.9);
        g.addColorStop(0, on ? `rgba(255,40,60,${0.32 * W.heat})` : `rgba(40,110,255,${0.32 * W.heat})`); g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      for (const p of W.particles) { c.globalAlpha = (1 - p.life / p.max) * (p.size > 5 ? 0.35 : 1); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = 1;
      for (const car of W.cars) {
        const model = car.model ?? "sedan";
        const spr = vehicleSprite(model, car.color, car.w, car.h);
        const sw = spr.width / 2, sh = spr.height / 2;
        c.drawImage(spr, car.x - sw / 2, car.y - sh / 2, sw, sh);
        if (car.kind === "police") { c.save(); c.translate(car.x, car.y); drawLightbar(c, car.w, car.h, t, car.seed); c.restore(); }
      }
      // player
      const blink = W.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) {
        c.save(); c.translate(W.px, W.py); c.rotate(W.heading);
        c.fillStyle = "rgba(0,0,0,0.5)"; c.beginPath(); c.roundRect(-W.pw / 2 + 5, -W.ph / 2 + 8, W.pw, W.ph, W.pw * 0.3); c.fill();
        if (W.boosting) { c.shadowColor = "#4cc3ff"; c.shadowBlur = 30; }
        const spr = playerSprite.current;
        if (spr) c.drawImage(spr, -W.pw / 2 - W.pw * 0.04, -W.ph / 2, W.pw * 1.08, W.ph);
        else { c.fillStyle = "#eee"; c.fillRect(-W.pw / 2, -W.ph / 2, W.pw, W.ph); }
        c.restore();
      }
      // popups
      c.textAlign = "center"; c.font = "bold 14px 'Space Mono', monospace";
      for (const p of W.popups) { c.globalAlpha = 1 - p.life / 1.1; c.fillStyle = p.color; c.fillText(p.text, p.x, p.y); }
      c.globalAlpha = 1;
      // speed lines
      if (streak > 0.15) {
        c.strokeStyle = `rgba(255,255,255,${0.14 * streak + 0.1 * W.boostVis})`; c.lineWidth = 1;
        for (let i = 0; i < 18; i++) { const x = ((i * 97.3 + t * 13) % 1) * w, y = ((i * 53.1 + t * W.speed * 0.004) % 1) * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 80 * streak); c.stroke(); }
      }
      // grain + vignette
      c.fillStyle = grainPat; c.globalCompositeOperation = "overlay";
      c.save(); c.translate(0, (W.scroll * 0.5) % 256); c.fillRect(0, -256, w, h + 512); c.restore();
      c.globalCompositeOperation = "source-over";
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${0.55 + 0.2 * W.boostVis})`);
      c.fillStyle = v; c.fillRect(0, 0, w, h);
      if (W.hitFlash > 0) { c.fillStyle = `rgba(255,40,40,${0.3 * W.hitFlash})`; c.fillRect(0, 0, w, h); }
      c.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const ph = phaseRef.current;
      if (ph === "playing") { t += dt; update(dt); updateFx(dt); }
      else if (ph === "menu") { t += dt; W.scroll = (W.scroll + 220 * dt) % 80; for (const p of W.props) p.y += 220 * dt; W.propT -= 220 * dt; if (W.propT <= 0) { W.props.push({ kind: Math.random() < 0.5 ? "lamp" : "building", side: Math.random() < 0.5 ? -1 : 1, y: -140, seed: Math.random() }); W.propT = 160; } W.props = W.props.filter((p) => p.y < W.h + 200); updateFx(dt); }
      else if (ph === "over") { t += dt; updateFx(dt); }
      render();
      sfx.current.engine(W.speed, ph === "playing", W.heat, t);
      hudT += dt;
      if (hudT > 0.1 && ph === "playing") { hudT = 0; setHud({ score: scoreFor(W.distance, W.time) + Math.floor(W.bonus), speed: Math.round(W.speed * 0.26), lives: W.lives, boost: W.boost, heat: W.heat, drift: W.drift, traction: W.traction }); }
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
  const tilt = settings.control === "tilt";

  const controlsPanel = (
    <div className="panel-stack">
      <div className="seg" role="radiogroup" aria-label="Steering mode">
        <button role="radio" aria-checked={!tilt} className={!tilt ? "seg-on" : ""} onClick={() => saveSettings({ control: "touch" })}>Touch buttons</button>
        <button role="radio" aria-checked={tilt} className={tilt ? "seg-on" : ""} onClick={() => void enableTilt()}>Tilt steering</button>
      </div>
      {tiltStatus === "denied" && <p className="note note-warn">Motion access was denied. Using touch buttons. You can allow it in your browser settings and try again.</p>}
      {tiltStatus === "unsupported" && <p className="note note-warn">This device or browser has no tilt sensor available. Using touch buttons.</p>}
      {tilt && (
        <>
          <p className="note">Hold your device how you like to play, then tap Calibrate to set “straight”.</p>
          <div className="row">
            <button className="btn-secondary" onClick={calibrate}>Calibrate</button>
            <label className="slider">Sensitivity
              <input type="range" min={0.5} max={2} step={0.1} value={settings.sens} onChange={(e) => saveSettings({ sens: Number(e.target.value) })} />
            </label>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="game-shell">
      <div ref={wrapRef} className={`game-stage ${playing ? "touch-none" : ""}`}>
        <canvas ref={canvasRef} className="block touch-none" aria-label="Musti Car Racing game" />

        {(playing || phase === "paused") && (
          <div className="hud">
            <div className="hud-panel">
              <div className="hud-label">Score</div>
              <div className="hud-value">{hud.score.toLocaleString()}</div>
              <div className="hud-label">Best {Math.max(best, hud.score).toLocaleString()}</div>
            </div>
            <div className="hud-panel hud-center">
              <div className="hud-value">{hud.speed}<span className="hud-label ml-1">km/h</span></div>
              <div className="mt-1 flex justify-center gap-1" aria-label={`${hud.lives} lives left`}>
                {Array.from({ length: MAX_LIVES }).map((_, i) => <span key={i} className={i < hud.lives ? "life-pip" : "life-pip life-pip-empty"} />)}
              </div>
              <div className="meter mt-1.5"><div className="meter-fill-boost" style={{ width: `${hud.boost * 100}%` }} /></div>
              <div className="meter mt-1"><div className="meter-fill-grip" style={{ width: `${hud.traction * 100}%` }} /></div>
              <div className="hud-label">{hud.drift > 0.3 ? "Drifting!" : "Nitro · Grip"}</div>
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

        {playing && (
          <div className="touch-controls">
            <div className="flex gap-3">
              {!tilt && <button className="touch-btn" aria-label="Steer left" {...hold("left")}>◀</button>}
              {!tilt && <button className="touch-btn" aria-label="Steer right" {...hold("right")}>▶</button>}
              {tilt && <div className="tilt-chip">TILT</div>}
            </div>
            <div className="flex gap-3">
              <button className="touch-btn touch-btn-brake" aria-label="Brake" {...hold("down")}>BRAKE</button>
              <button className="touch-btn touch-btn-boost" aria-label="Nitro" {...hold("boost")}>NITRO</button>
            </div>
          </div>
        )}

        {phase === "menu" && (
          <div className="menu">
            {screenName === "home" && (
              <div className="menu-home">
                <div className="hero-wrap"><img src={heroImgSrc} alt="White supercar under police lights" width={1280} height={720} className="hero-img" /></div>
                <div className="menu-col">
                  <p className="kicker">Arcade pursuit racer</p>
                  <h1 className="title">MUSTI<br />CAR RACING</h1>
                  <button className="cta" onClick={start}>RACE NOW</button>
                  <nav className="menu-grid" aria-label="Main menu">
                    <button className="btn-secondary" onClick={() => setScreen("garage")}>Garage</button>
                    <button className="btn-secondary" onClick={() => setScreen("howto")}>How to play</button>
                    <button className="btn-secondary" onClick={() => setScreen("multi")}>Multiplayer</button>
                    <button className="btn-secondary" onClick={() => setScreen("controls")}>Controls</button>
                    <button className="btn-secondary" onClick={() => setScreen("account")}>
  Guest Profile & Jaa'izah
</button>
                  </nav>
                  <div className="menu-foot">
                    <span className="hud-label">Best {best.toLocaleString()}</span>
                    <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? "🔊" : "🔇"}</button>
                  </div>
                </div>
              </div>
            )}
            {screenName === "garage" && (
              <div className="menu-card">
                <h2 className="screen-title">Garage</h2>
                <div className="garage-car" style={{ ["--paint" as string]: settings.paint }}>
                  <img src={playerImgSrc} alt="" width={576} height={1152} />
                </div>
                <div className="swatches" role="radiogroup" aria-label="Paint colour">
                  {PLAYER_PAINTS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={settings.paint === p.id} aria-label={p.name} title={p.name} className={`swatch ${settings.paint === p.id ? "swatch-on" : ""}`} style={{ background: p.id }} onClick={() => saveSettings({ paint: p.id })} />
                  ))}
                </div>
                <p className="hud-label">{PLAYER_PAINTS.find((p) => p.id === settings.paint)?.name ?? "Custom"}</p>
                <label className="field">Driver name
                  <input maxLength={16} value={settings.name} onChange={(e) => saveSettings({ name: e.target.value })} />
                </label>
                <button className="cta" onClick={() => setScreen("home")}>DONE</button>
              </div>
            )}
            {screenName === "howto" && (
              <div className="menu-card">
                <h2 className="screen-title">How to play</h2>
                <ul className="howto">
                  <li><b>Steer</b> <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> · touch arrows · or tilt your phone</li>
                  <li><b>Gas / Brake</b> <kbd>↑</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>S</kbd> · BRAKE button</li>
                  <li><b>Nitro</b> <kbd>Space</kbd> / <kbd>Shift</kbd> · NITRO button. Near misses refill it.</li>
                  <li><b>Drift</b> Steer hard at high speed to slide. Drifting scores points but drains grip — let it recover.</li>
                  <li><b>Police</b> Cops chase from behind and cut in from side lanes. Make them crash into traffic for +150.</li>
                  <li><b>Pause</b> <kbd>P</kbd>/<kbd>Esc</kbd> · <b>Mute</b> <kbd>M</kbd></li>
                </ul>
                <button className="cta" onClick={() => setScreen("home")}>GOT IT</button>
              </div>
            )}
            {screenName === "controls" && (
              <div className="menu-card">
                <h2 className="screen-title">Controls</h2>
                {controlsPanel}
                <button className="cta mt-4" onClick={() => setScreen("home")}>DONE</button>
              </div>
            )}
            {screenName === "multi" && (
              <div className="menu-card">
                <h2 className="screen-title">Multiplayer</h2>
                <p className="note">Private room races with friends are coming next. Online racing needs a live game server to sync cars and check results fairly, and that isn’t connected yet — so there’s no fake “online” mode here.</p>
                <div className="row opacity-50" aria-disabled="true">
                  <button className="btn-secondary" disabled>Create room</button>
                  <input className="code-input" placeholder="ROOM CODE" disabled />
                  <button className="btn-secondary" disabled>Join</button>
                </div>
                <h3 className="hud-label mt-4">Local leaderboard · this device</h3>
                <ol className="board">
                  {board.length === 0 && <li className="note">No races yet.</li>}
                  {board.slice(0, 5).map((e, i) => <li key={e.date}><span>{i + 1}. {e.name}</span><span>{e.score.toLocaleString()} · {e.time.toFixed(0)}s</span></li>)}
                </ol>
                <p className="note">Points and trophies only — no cash prizes.</p>
                
                <button className="cta" onClick={() => setScreen("home")}>BACK</button>
              </div>
            )}

            {screenName === "account" && (
              <div className="menu-card">
                <PlayerAccount />
                <button className="cta mt-4" onClick={() => setScreen("home")}>
                  BACK TO HOME
                </button>
              </div>
            )}
          </div>
        )}


        {phase === "paused" && (
          <div className="menu">
            <div className="menu-card">
              <h2 className="screen-title">Paused</h2>
              <button className="cta" onClick={togglePause}>RESUME</button>
              {controlsPanel}
              <div className="row mt-3">
                <button className="btn-secondary" onClick={start}>Restart</button>
                <button className="btn-secondary" onClick={toMenu}>Menu</button>
              </div>
            </div>
          </div>
        )}

        {phase === "over" && (
          <div className="menu">
            <div className="menu-card">
              <p className="kicker">Busted</p>
              <h2 className="screen-title">Race results</h2>
              <div className="final-score">{final.score.toLocaleString()}</div>
              {final.newBest ? <p className="new-best">★ New best score ★</p> : <p className="hud-label">Best {best.toLocaleString()}</p>}
              <p className="note">{settings.name} · #{final.rank} on this device · {final.time.toFixed(1)}s · {(final.distance / 1000).toFixed(2)} km</p>
              <ol className="board">
                {board.slice(0, 5).map((e, i) => <li key={e.date} className={i + 1 === final.rank ? "board-me" : ""}><span>{i + 1}. {e.name}</span><span>{e.score.toLocaleString()}</span></li>)}
              </ol>
              <button className="cta" onClick={start}>RACE AGAIN</button>
              <button className="ghost-btn mt-3" onClick={toMenu}>Main menu</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
