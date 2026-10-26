import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import playerImgSrc from "@/assets/player-car.png";
import heroImgSrc from "@/assets/hero-car.jpg";
import { getSupabaseClient } from "@/lib/supabase";
import { MultiplayerLobby, type MultiplayerRaceStart } from "./MultiplayerLobby";
import {
  BASE_SPEED,
  MAX_LIVES,
  MAX_SPEED,
  NITRO_PICKUP_AMOUNT,
  accelRate,
  claimPickupOnce,
  claimNearMiss,
  createPursuitState,
  generateCoinNitroFormation,
  generatePickupPattern,
  isBike,
  overlaps,
  pickupBoost,
  PICKUP_PATTERN_INTERVALS,
  pickLane,
  pickPoliceLane,
  raceDifficulty,
  sceneryZoneBlend,
  scoreFor,
  tiltToSteer,
  updatePursuit,
  type Car,
  type Coin,
  type Hazard,
  type Input,
  type Particle,
  type Pickup,
  type PursuitIncidentKind,
  type PursuitEvent,
  type VehicleModel,
} from "./engine";

import {
  MODEL_RATIO,
  MODEL_WIDTH,
  PAINTS,
  clearSpriteCache,
  centeredBikePreviewPosition,
  drawBikeSprite,
  drawLightbar,
  playerBikeRenderSize,
  vehicleSprite,
  VEHICLE_DEFS,
  type VehicleDef,
} from "./carArt";

import {
  WALLET_KEY,
  VEHICLE_PRICES,
  readOwnedVehicles,
  readWalletBalance,
  readVehicleUpgrades,
  purchaseVehicleUpgrade,
  saveOwnedVehicles,
  readSelectedVehicle,
  saveSelectedVehicle,
} from "./garageData";
import {
  ACHIEVEMENTS,
  EMPTY_PROGRESSION,
  completeRace,
  recordRewardEvent,
  readProgression,
  type AchievementId,
  type ProgressionData,
  type RewardEventKind,
} from "./progression";
import {
  EMPTY_UPGRADE_LEVELS,
  UPGRADE_CATEGORIES,
  UPGRADE_DEFINITIONS,
  MAX_UPGRADE_LEVEL,
  nextUpgradeCost,
  upgradeBenefit,
  getVehiclePerformance,
  type UpgradeCategory,
  type VehicleUpgradeLevels,
} from "./vehicleUpgrades";
import { PlayerAccount } from "./PlayerAccount";
import {
  METRES_PER_UNIT,
  MULTIPLAYER_RACE_LENGTH,
  allRacersDone,
  applyLivePosition,
  classifyContact,
  formatDistanceToFinish,
  liveRaceOrder,
  parseLivePosition,
  parseRacePositions,
  parseRaceStandings,
  stepRacerDisplays,
  syncRacerDisplays,
  type OnlineRacer,
  type RaceStanding,
  type RacerDisplay,
} from "./multiplayerState";
import { EngineSynth, engineProfileFor, unlockAudioSession, type EngineProfile } from "./engineAudio";
import {
  CAREER_KEY,
  CAREER_TIERS,
  EMPTY_CAREER,
  careerStandings,
  createAiRacers,
  parseCareer,
  placeOf,
  prizeFor,
  recordCareerResult,
  stepAiRacer,
  type AiRacer,
  type CareerProgress,
  type CareerStanding,
  type CareerTier,
} from "./career";
type Phase = "menu" | "playing" | "paused" | "over";
type Screen = "home" | "garage" | "howto" | "multi" | "career" | "controls" | "account" | "achievements" | "upgrades";
type Settings = { control: "touch" | "tilt"; sens: number; neutral: number; paint: string; name: string };
type Entry = { name: string; score: number; time: number; distance: number; date: number };
type Popup = { text: string; x: number; y: number; life: number; color: string };
type Hud = {
  score: number;
  speed: number;
  lives: number;
  progress: number;
  boost: number;
  heat: number;
  drift: number;
  traction: number;
  wantedLevel: number;
  policeWarning: number;
};
type Prop = { kind: "lamp" | "sign" | "building" | "tree" | "shrub" | "barrier"; side: -1 | 1; y: number; seed: number };
type Skid = { x: number; y: number; a: number };

const BEST_KEY = "mcr.best";
const SOUND_KEY = "mcr.sound";
const SET_KEY = "mcr.settings";
const BOARD_KEY = "mcr.board";
const COIN_REWARD = 5;
const NEAR_MISS_COIN_REWARD = 2;
const PLAYER_PAINTS = [
  { id: "#ffffff", name: "Arctic" }, { id: "#d62b2b", name: "Rosso" }, { id: "#2a6fe0", name: "Electric" },
  { id: "#2a2b30", name: "Carbon" }, { id: "#f0c419", name: "Giallo" }, { id: "#2f9a57", name: "Verde" }, { id: "#a9aeb6", name: "Titanium" },
];
const TRAFFIC_MODELS: VehicleModel[] = ["sedan", "sedan", "coupe", "suv", "suv", "taxi", "van"];
const DEFAULT_SETTINGS: Settings = { control: "touch", sens: 1, neutral: 0, paint: "#ffffff", name: "musti" };
const blankInput = (): Input => ({ left: false, right: false, up: false, down: false, boost: false, drift: false });
const makeRaceId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ---------------- audio ---------------- */
class Sfx {
  ctx: AudioContext | null = null;
  siren: OscillatorNode | null = null;
  sirenGain: GainNode | null = null;
  synth: EngineSynth | null = null;
  profile: EngineProfile | null = null;
  enabled = true;
  /** Must be called from a tap or key press: browsers keep sound off until then. */
  ensure() {
    unlockAudioSession();
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    void this.ctx.resume();
    this.siren = this.ctx.createOscillator(); this.siren.type = "triangle";
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.ctx.destination); this.siren.start();
    this.synth = new EngineSynth(this.ctx);
    if (this.profile) this.synth.setProfile(this.profile);
  }
  /** Chooses the engine sound that matches the car or bike being driven. */
  setVehicle(profile: EngineProfile) {
    this.profile = profile;
    this.synth?.setProfile(profile);
  }
  engine(speed: number, active: boolean, heat: number, t: number, drive?: { maxSpeed: number; boosting: boolean; braking: boolean; drifting: boolean; dt: number }) {
    if (!this.ctx || !this.siren || !this.sirenGain) return;
    const on = active && this.enabled;
    this.synth?.update({
      speed,
      maxSpeed: drive?.maxSpeed ?? 1200,
      active,
      enabled: this.enabled,
      boosting: drive?.boosting ?? false,
      braking: drive?.braking ?? false,
      drifting: drive?.drifting ?? false,
      dt: drive?.dt ?? 0.016,
    });
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


/** Adds (or removes) Jaa'izah from the guest wallet. Returns the new balance, or null if there is no wallet. */
function adjustWallet(delta: number): number | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    const profile = raw ? JSON.parse(raw) : null;
    if (!profile || typeof profile.balance !== "number" || !Number.isFinite(profile.balance)) return null;
    const next = Math.max(0, Math.round(profile.balance + delta));
    localStorage.setItem(WALLET_KEY, JSON.stringify({ ...profile, balance: next }));
    return next;
  } catch {
    return null;
  }
}

const SEAT_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b"];
const remotePlayerSprites = new Map<string, HTMLCanvasElement | HTMLImageElement>();

function tintPlayer(
  img: HTMLImageElement,
  color: string
): HTMLCanvasElement | HTMLImageElement {
  if (!img.naturalWidth) return img;

  // Shrink the artwork once. Drawing a very large image every frame can come out
  // blank (a white box) on some phones, so the game always draws this smaller copy.
  const MAX_SIDE = 512;
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const baseW = Math.max(1, Math.round(img.naturalWidth * scale));
  const baseH = Math.max(1, Math.round(img.naturalHeight * scale));
  const base = document.createElement("canvas");
  base.width = baseW;
  base.height = baseH;
  const baseCtx = base.getContext("2d");
  if (!baseCtx) return img;
  baseCtx.drawImage(img, 0, 0, baseW, baseH);

  if (color === "#ffffff") return base;

  const cv = document.createElement("canvas");
  cv.width = baseW;
  cv.height = baseH;

  const ctx = cv.getContext("2d");
  if (!ctx) return base;

  // Preserve the original artwork and transparency.
  ctx.drawImage(base, 0, 0);

  // Apply a color overlay while keeping the original lighting.
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // Restore the original image's brightness and details.
  ctx.globalAlpha = 0.30;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(base, 0, 0);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

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
  const selectedVehicleRef = useRef("musti-gt");
  const playerSprite = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const playerImg = useRef<HTMLImageElement | null>(null);
  const [phase, setPhaseState] = useState<Phase>("menu");
  const [screenName, setScreen] = useState<Screen>("home");
  const [hud, setHud] = useState<Hud>({ score: 0, speed: 0, lives: MAX_LIVES, progress: 0, boost: 1, heat: 0, drift: 0, traction: 1, wantedLevel: 0, policeWarning: 0 });
  const [best, setBest] = useState(0);
  const [sound, setSound] = useState(true);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [tiltStatus, setTiltStatus] = useState<"off" | "on" | "denied" | "unsupported">("off");
  const [board, setBoard] = useState<Entry[]>([]);
  const [progression, setProgression] = useState<ProgressionData>(EMPTY_PROGRESSION);
  const [progressionError, setProgressionError] = useState("");
  const [final, setFinal] = useState<{
  score: number;
  newBest: boolean;
  distance: number;
  time: number;
  rank: number;
  coinsCollected: number;
  nearMisses: number;
  unlockedNow: AchievementId[];
  progression: ProgressionData;
  saveError: string;
} | null>(null);
  const [ownedVehicles, setOwnedVehicles] = useState<string[]>(["musti-gt"]);
const [selectedVehicle, setSelectedVehicleState] = useState("musti-gt");
const [garageBalance, setGarageBalance] = useState<number | null>(null);
const [garageMessage, setGarageMessage] = useState("");
const [garageIndex, setGarageIndex] = useState(0);
const [walletError, setWalletError] = useState("");
const [upgradeVehicleId, setUpgradeVehicleId] = useState("musti-gt");
const [upgradeLevels, setUpgradeLevels] = useState<VehicleUpgradeLevels>({
  ...EMPTY_UPGRADE_LEVELS,
});
const [upgradeMessage, setUpgradeMessage] = useState("");
const [multiplayerRace, setMultiplayerRace] = useState<MultiplayerRaceStart | null>(null);
const multiplayerRaceRef = useRef<MultiplayerRaceStart | null>(null);
const [multiplayerSyncMessage, setMultiplayerSyncMessage] = useState("");
const [onlineStandings, setOnlineStandings] = useState<RaceStanding[]>([]);
const [onlinePlace, setOnlinePlace] = useState<number | null>(null);
const [onlineMyId, setOnlineMyId] = useState("");
const [replayBusy, setReplayBusy] = useState(false);
const [onlineNote, setOnlineNote] = useState("");
const remoteStepAt = useRef(0);
const finishRef = useRef<() => void>(() => {});
const debugRef = useRef(false);
const careerRef = useRef<{ tier: CareerTier } | null>(null);
const startingCareerRef = useRef(false);
const [careerRun, setCareerRun] = useState<CareerTier | null>(null);
const [career, setCareer] = useState<CareerProgress>(EMPTY_CAREER);
const [careerResult, setCareerResult] = useState<{ tier: CareerTier; place: number; prize: number; standings: CareerStanding[]; unlockedNext: boolean } | null>(null);
const [roomMoved, setRoomMoved] = useState(false);
const [roomClosed, setRoomClosed] = useState(false);
const [netDebug, setNetDebug] = useState("");
const [raceMenuOpen, setRaceMenuOpen] = useState(false);
const [onlinePot, setOnlinePot] = useState<{ pot: number; won: boolean } | null>(null);
const [livePlace, setLivePlace] = useState(1);
const [mapDots, setMapDots] = useState<{ id: string; p: number; color: string; me: boolean; name: string }[]>([]);

  const world = useRef({
    w: 0, h: 0, roadX: 0, roadW: 0, lanes: 4, laneW: 0,
    px: 0, py: 0, baseY: 0, pvx: 0, pw: 40, ph: 80, heading: 0,
    speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, scroll: 0,
    boostCapacity: 1,
    vehiclePerformance: getVehiclePerformance(
      { maxSpeedMultiplier: 1, accelerationMultiplier: 1, handlingMultiplier: 1 },
      EMPTY_UPGRADE_LEVELS,
    ),
    raceId: "", coinsCollected: 0, nearMisses: 0,
    rewardEventSequence: 0, entitySequence: 0, unlockedAchievementsThisRace: [] as AchievementId[],
    lives: MAX_LIVES, invuln: 0, boost: 1, boosting: false, boostVis: 0, shake: 0, hitFlash: 0,
    drift: 0, traction: 1, driftCd: 0, driftDir: 0,
    cars: [] as Car[], pickups: [] as Pickup[], coins: [] as Coin[], hazards: [] as Hazard[], particles: [] as Particle[], popups: [] as Popup[], props: [] as Prop[], skids: [] as Skid[], remoteRacers: [] as OnlineRacer[], remoteViews: new Map<string, RacerDisplay>(), bumpCd: 0, ai: [] as AiRacer[],
    spawnT: 0, pickupT: 1.2, coinT: 0.25, hazardT: 5, policeT: 6, difficultyLevel: 1, pursuit: createPursuitState(), policeWarning: 0, propT: 0, heat: 0, bonus: 0, walletSaveFailed: false,
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

  const purchaseOrSelectVehicle = (vehicleId: string) => {
    const vehicle = VEHICLE_DEFS.find((item) => item.id === vehicleId);
    if (!vehicle) return;

    const owned = readOwnedVehicles();

    // Already owned: select it without charging the player.
    if (owned.includes(vehicleId)) {
      saveSelectedVehicle(vehicleId);
      setSelectedVehicleState(vehicleId);
      selectedVehicleRef.current = vehicleId;
      setGarageMessage(`${vehicle.name} selected!`);
      return;
    }

    try {
      const rawProfile = localStorage.getItem(WALLET_KEY);
      const profile = rawProfile ? JSON.parse(rawProfile) : null;

      if (
        !profile ||
        typeof profile.balance !== "number" ||
        !Number.isFinite(profile.balance)
      ) {
        setGarageMessage("Create your guest profile before buying vehicles.");
        return;
      }

      const price = VEHICLE_PRICES[vehicleId] ?? 0;

      if (profile.balance < price) {
        setGarageBalance(profile.balance);
        setGarageMessage(
          `Not enough Jaa'izah. You need ${(price - profile.balance).toLocaleString()} more.`
        );
        return;
      }

      const updatedProfile = {
        ...profile,
        balance: profile.balance - price,
      };

      localStorage.setItem(WALLET_KEY, JSON.stringify(updatedProfile));

      const updatedOwned = [...owned, vehicleId];
      saveOwnedVehicles(updatedOwned);
      saveSelectedVehicle(vehicleId);

      setOwnedVehicles(updatedOwned);
      setSelectedVehicleState(vehicleId);
      selectedVehicleRef.current = vehicleId;
      setGarageBalance(updatedProfile.balance);
      setGarageMessage(`${vehicle.name} purchased and selected!`);
    } catch {
      setGarageMessage("Purchase failed. Please try again.");
    }
  };

  const chooseUpgradeVehicle = (vehicleId: string) => {
    if (!ownedVehicles.includes(vehicleId)) {
      setUpgradeMessage("Only vehicles you own can be upgraded.");
      return;
    }
    setUpgradeVehicleId(vehicleId);
    setUpgradeLevels(readVehicleUpgrades(vehicleId));
    setUpgradeMessage("");
  };

  const buyUpgrade = (category: UpgradeCategory) => {
    const currentLevel = upgradeLevels[category];
    try {
      const result = purchaseVehicleUpgrade(
        upgradeVehicleId,
        category,
        currentLevel,
      );
      setGarageBalance(result.balance);
      if (result.status === "purchased") {
        setUpgradeLevels(result.levels);
        setUpgradeMessage(
          `${UPGRADE_DEFINITIONS[category].title} upgraded to level ${result.levels[category]}.`,
        );
      } else if (result.status === "insufficient-funds") {
        setUpgradeMessage("Not enough Jaa'izah for that upgrade.");
      } else if (result.status === "max-level") {
        setUpgradeLevels(result.levels);
        setUpgradeMessage(`${UPGRADE_DEFINITIONS[category].title} is already maxed.`);
      } else if (result.status === "stale-level") {
        setUpgradeLevels(result.levels);
        setUpgradeMessage("Upgrade details refreshed. Please review the new price.");
      } else if (result.status === "not-owned") {
        setUpgradeMessage("Only vehicles you own can be upgraded.");
      } else {
        setUpgradeMessage("Create a guest profile before purchasing upgrades.");
      }
    } catch (error) {
      console.error("Could not purchase vehicle upgrade.", error);
      setUpgradeMessage("Upgrade purchase failed. Check your saved wallet and try again.");
    }
  };

  useEffect(() => {
    const legacyBest = Number(
      localStorage.getItem(BEST_KEY) || localStorage.getItem("sketchrun.best") || 0,
    );
    const savedProgression = readProgression();
    setBest(
      Math.max(
        Number.isSafeInteger(legacyBest) && legacyBest >= 0 ? legacyBest : 0,
        savedProgression.bestScore,
      ),
    );
    if (localStorage.getItem(SOUND_KEY) === "0") { setSound(false); sfx.current.enabled = false; }
    try {
      const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SET_KEY) || "{}") } as Settings;
      s.control = "touch"; // tilt needs a fresh permission tap each session
      settingsRef.current = s; setSettingsState(s);
    } catch { /* ignore */ }
    try { setBoard(JSON.parse(localStorage.getItem(BOARD_KEY) || "[]")); } catch { /* ignore */ }
    setProgression(savedProgression);
    try {
  const owned = readOwnedVehicles();
  const selectedId = readSelectedVehicle();
  setOwnedVehicles(owned);
  setSelectedVehicleState(selectedId);
  selectedVehicleRef.current = selectedId;
  setUpgradeVehicleId(selectedId);
  setUpgradeLevels(readVehicleUpgrades(selectedId));

  setGarageBalance(readWalletBalance());
} catch {
  setGarageBalance(null);
}
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
    const upgradeLevels = readVehicleUpgrades(selectedVehicleRef.current);
    const vehicleDef = VEHICLE_DEFS.find(
      (vehicle) => vehicle.id === selectedVehicleRef.current,
    );
    W.vehiclePerformance = getVehiclePerformance(
      {
        maxSpeedMultiplier: vehicleDef?.maxMul ?? 1,
        accelerationMultiplier: vehicleDef?.accelMul ?? 1,
        handlingMultiplier: vehicleDef?.gripMul ?? 1,
      },
      upgradeLevels,
    );
    Object.assign(W, { speed: BASE_SPEED, cruise: BASE_SPEED, distance: 0, time: 0, raceId: makeRaceId(), coinsCollected: 0, nearMisses: 0, rewardEventSequence: 0, entitySequence: 0, unlockedAchievementsThisRace: [], lives: MAX_LIVES, invuln: 1.5, boostCapacity: W.vehiclePerformance.nitroCapacity, boost: W.vehiclePerformance.nitroCapacity, boosting: false, boostVis: 0, shake: 0, hitFlash: 0, drift: 0, traction: 1, driftCd: 0, driftDir: 0, cars: [], pickups: [], coins: [], hazards: [], particles: [], popups: [], skids: [], remoteRacers: [], remoteViews: new Map<string, RacerDisplay>(), bumpCd: 0, ai: [] as AiRacer[], spawnT: 0.8, pickupT: 1.2, coinT: 0.25, hazardT: 5, policeT: 1, difficultyLevel: 1, pursuit: createPursuitState(), policeWarning: 0, heat: 0, pvx: 0, heading: 0, bonus: 0, walletSaveFailed: false });
    setWalletError("");
    setProgressionError("");
    setFinal(null);
    W.px = multiplayerRaceRef.current
      ? W.roadX + W.laneW * (multiplayerRaceRef.current.seat + 0.5)
      : W.w / 2;
    input.current = blankInput(); touch.current = blankInput();
    setHud({ score: 0, speed: 0, lives: MAX_LIVES, progress: 0, boost: W.boost, heat: 0, drift: 0, traction: 1, wantedLevel: 0, policeWarning: 0 });
  }, []);

  const start = useCallback(() => {
    if (!startingCareerRef.current) { careerRef.current = null; setCareerRun(null); setCareerResult(null); world.current.ai = []; }
    sfx.current.ensure();
    sfx.current.setVehicle(engineProfileFor(VEHICLE_DEFS.find((vehicle) => vehicle.id === selectedVehicleRef.current)));
    reset(); setPhase("playing"); sfx.current.blip(660, 0.12); setTimeout(() => sfx.current.blip(990, 0.18), 120);
  }, [reset, setPhase]);
  const startMultiplayerRace = useCallback((race: MultiplayerRaceStart) => {
    multiplayerRaceRef.current = race;
    setMultiplayerRace(race);
    setMultiplayerSyncMessage("");
    setOnlineStandings([]);
    setOnlinePlace(null);
    setOnlineNote("");
    setOnlinePot(null);
    setRoomMoved(false);
    setRoomClosed(false);
    setRaceMenuOpen(false);
    setLivePlace(1);
    setMapDots([]);
    // Everyone puts their stake in the pot when the race starts.
    if (race.stake > 0) {
      const key = `musti-stake-${race.roomId}-${race.startAt}`;
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          const balance = adjustWallet(-race.stake);
          if (balance !== null) setGarageBalance(balance);
        }
      } catch {
        /* storage unavailable: the race still starts */
      }
    }
    start();
  }, [start]);
  const togglePause = useCallback(() => {
    // Online races never freeze: this only opens a small menu while the race keeps running.
    if (multiplayerRaceRef.current) {
      if (phaseRef.current === "playing") setRaceMenuOpen((open) => !open);
      return;
    }
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") { sfx.current.ensure(); setPhase("playing"); }
  }, [setPhase]);
  useEffect(() => {
    try {
      setCareer(parseCareer(localStorage.getItem(CAREER_KEY)));
    } catch {
      /* storage unavailable: career starts fresh */
    }
  }, []);

  const startCareer = useCallback((tierId: CareerTier["id"]) => {
    const tier = CAREER_TIERS.find((item) => item.id === tierId);
    if (!tier) return;
    multiplayerRaceRef.current = null;
    setMultiplayerRace(null);
    setCareerResult(null);
    setMapDots([]);
    setLivePlace(1);
    careerRef.current = { tier };
    setCareerRun(tier);
    startingCareerRef.current = true;
    try {
      start();
    } finally {
      startingCareerRef.current = false;
    }
    const W = world.current;
    const carIds = VEHICLE_DEFS.filter((vehicle) => vehicle.cat === "car").map((vehicle) => vehicle.id);
    W.ai = createAiRacers(tier, carIds, Math.random);
    W.remoteViews.clear();
    const now = performance.now();
    for (const ai of W.ai) {
      W.remoteViews.set(ai.id, {
        userId: ai.id, username: ai.name, seat: ai.seat, vehicleId: ai.vehicleId, paint: ai.paint,
        laneRatio: ai.lane, distance: ai.distance, finished: false, dnf: false,
        targetLane: ai.lane, targetDistance: ai.distance, targetAt: now, speed: 0, lastLiveAt: 0, local: true,
      });
    }
  }, [start]);

  /** The player crossed the line in a career race: work out the place, pay the prize, unlock the next cup. */
  const completeCareer = useCallback((tier: CareerTier, myTime: number) => {
    const W = world.current;
    const standings = careerStandings(myTime, W.ai, MULTIPLAYER_RACE_LENGTH, "You");
    const place = placeOf(standings);
    const prize = prizeFor(tier, place);
    let unlockedNext = false;
    try {
      const before = parseCareer(localStorage.getItem(CAREER_KEY));
      const after = recordCareerResult(before, tier.id, place);
      unlockedNext = after.unlocked > before.unlocked;
      localStorage.setItem(CAREER_KEY, JSON.stringify(after));
      setCareer(after);
    } catch {
      /* the race result still shows */
    }
    if (prize > 0) {
      const balance = adjustWallet(prize);
      if (balance !== null) setGarageBalance(balance);
    }
    setCareerResult({ tier, place, prize, standings, unlockedNext });
  }, []);

  const toMenu = useCallback(() => {
    const race = multiplayerRaceRef.current;
    if (race) {
      try {
        void getSupabaseClient()
          .rpc("leave_multiplayer_room", { p_room_id: race.roomId })
          .then(({ error }) => {
            if (error) {
              console.error("Could not leave the multiplayer room.", error);
              setMultiplayerSyncMessage(`Could not leave online room: ${error.message}`);
            }
          });
      } catch (error) {
        console.error("Could not connect to leave the multiplayer room.", error);
        setMultiplayerSyncMessage("Could not connect to leave the online room.");
      }
    }
    multiplayerRaceRef.current = null;
    setMultiplayerRace(null);
    world.current.remoteRacers = [];
    world.current.remoteViews.clear();
    careerRef.current = null;
    setCareerRun(null);
    setCareerResult(null);
    world.current.ai = [];
    setScreen("home");
    setPhase("menu");
  }, [setPhase]);

  /** Tells the server this player crossed the finish line (retries a couple of times). */
  const reportOnlineFinish = useCallback(async (race: MultiplayerRaceStart, distance: number) => {
    let lastMessage = "Could not record your finish.";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await getSupabaseClient().rpc("finish_multiplayer_race", {
          p_room_id: race.roomId,
          p_distance: distance,
        });
        if (!error) {
          const row = Array.isArray(data) ? data[0] : data;
          const place = typeof row?.place === "number" ? row.place : null;
          const pot = typeof row?.pot === "number" ? row.pot : 0;
          if (place !== null) setOnlinePlace(place);
          if (pot > 0) {
            if (place === 1) {
              // The winner takes the whole pot (paid once per race).
              const key = `musti-pot-${race.roomId}-${race.startAt}`;
              try {
                if (!localStorage.getItem(key)) {
                  localStorage.setItem(key, "1");
                  const balance = adjustWallet(pot);
                  if (balance !== null) setGarageBalance(balance);
                  setOnlinePot({ pot, won: true });
                }
              } catch {
                setOnlinePot({ pot, won: true });
              }
            } else {
              setOnlinePot({ pot, won: false });
            }
          }
          setOnlineNote("");
          return;
        }
        lastMessage = `Could not record your finish: ${error.message}`;
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : lastMessage;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    setOnlineNote(lastMessage);
  }, []);

  /** Replay: put the room back to "waiting" and return to the room page. */
  const replayOnline = useCallback(async () => {
    const race = multiplayerRaceRef.current;
    if (!race) return;
    setReplayBusy(true);
    setOnlineNote("");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("reset_multiplayer_room", { p_room_id: race.roomId });
      if (error) {
        // Another player may already have reset the room and started a new race.
        const { data: roomRow } = await supabase
          .from("multiplayer_rooms")
          .select("status, starts_at")
          .eq("id", race.roomId)
          .maybeSingle();
        const startsAt = roomRow?.starts_at ? Date.parse(roomRow.starts_at) : 0;
        if (!(roomRow?.status === "racing" && startsAt > race.startAt + 1000)) {
          setOnlineNote(error.message);
          return;
        }
      }
      multiplayerRaceRef.current = null;
      setMultiplayerRace(null);
      world.current.remoteRacers = [];
      world.current.remoteViews.clear();
      setScreen("multi");
      setPhase("menu");
    } catch (error) {
      setOnlineNote(error instanceof Error ? error.message : "Could not start a replay.");
    } finally {
      setReplayBusy(false);
    }
  }, [setPhase]);

  /** After finishing: keep the results table fresh and keep this player marked as present. */
  useEffect(() => {
    if (phase !== "over" || !multiplayerRace) return;
    let active = true;
    const roomId = multiplayerRace.roomId;
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      setOnlineNote(error instanceof Error ? error.message : "Online results are unavailable.");
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setOnlineMyId(data.session?.user.id ?? "");
    });
    const poll = async () => {
      const [state, roomResult] = await Promise.all([
        supabase.rpc("get_multiplayer_race_state", { p_room_id: roomId }),
        supabase.from("multiplayer_rooms").select("status, starts_at").eq("id", roomId).maybeSingle(),
      ]);
      if (!active) return;
      const roomRow = roomResult.data;
      const startsAt = roomRow?.starts_at ? Date.parse(roomRow.starts_at) : 0;
      // Another player already pressed REPLAY: the room is waiting again (or a new race began).
      const moved =
        !!roomRow &&
        (roomRow.status === "waiting" || (roomRow.status === "racing" && startsAt > multiplayerRace.startAt + 1000));
      setRoomMoved(moved);
      setRoomClosed(!roomResult.error && roomRow === null);
      if (moved) return; // keep showing the final table
      if (state.error) {
        setOnlineNote(`Could not read the results: ${state.error.message}`);
        return;
      }
      setOnlineStandings(parseRaceStandings(state.data));
    };
    void poll();
    const pollTimer = window.setInterval(() => void poll(), 1500);
    const heartbeat = window.setInterval(() => {
      void Promise.resolve(supabase.rpc("touch_multiplayer_room", { p_room_id: roomId }));
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(pollTimer);
      window.clearInterval(heartbeat);
    };
  }, [multiplayerRace, phase]);

  useEffect(() => {
    if (phase !== "playing" || !multiplayerRace) return;

    let active = true;
    let raceIsActive = true;
    let userId = "";
    let sendingPosition = false;
    let refreshing = false;
    let lastRosterRefresh = 0;
    let lastSyncError = "";
    let channelReady = false;
    let channel: RealtimeChannel | null = null;
    const raceWorld = world.current;
    const setSyncError = (message: string) => {
      if (message !== lastSyncError) {
        lastSyncError = message;
        console.error(message);
      }
      setMultiplayerSyncMessage("Online racers disconnected; reconnecting…");
    };

    try {
      const supabase = getSupabaseClient();
      // The session lives in the browser, so this does not call the server.
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setSyncError(error?.message ?? "Sign in again to synchronize this race.");
          return;
        }
        userId = data.session.user.id;
      });

      /** Full roster from the database: names, cars, finished and DNF flags. */
      const refreshRoster = async () => {
        if (!raceIsActive || refreshing) return;
        refreshing = true;
        lastRosterRefresh = performance.now();
        try {
          if (!userId) {
            const { data: sessionData } = await supabase.auth.getSession();
            userId = sessionData.session?.user.id ?? "";
          }
          const { data, error } = await supabase.rpc("get_multiplayer_race_state", {
            p_room_id: multiplayerRace.roomId,
          });
          if (!active) return;
          if (error) {
            setSyncError(`Could not read online racer positions: ${error.message}`);
            return;
          }
          raceWorld.remoteRacers = parseRacePositions(data, userId);
          syncRacerDisplays(raceWorld.remoteViews, raceWorld.remoteRacers, performance.now());
          const me = parseRaceStandings(data).find((row) => row.userId === userId);
          if (me?.dnf && phaseRef.current === "playing") {
            setOnlineNote("Time's up. You were marked DNF (did not finish).");
            finishRef.current();
          }
          lastSyncError = "";
          setMultiplayerSyncMessage("");
        } finally {
          refreshing = false;
        }
      };

      channel = supabase
        .channel(`multiplayer-race-${multiplayerRace.roomId}`, {
          config: { broadcast: { self: false, ack: false } },
        })
        .on("broadcast", { event: "pos" }, ({ payload }) => {
          const message = parseLivePosition(payload);
          if (!message || message.u === userId) return;
          const known = applyLivePosition(raceWorld.remoteViews, message, performance.now());
          if (!known && performance.now() - lastRosterRefresh > 1000) void refreshRoster();
        })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "multiplayer_rooms",
            filter: `id=eq.${multiplayerRace.roomId}`,
          },
          (payload) => {
            if (payload.new["status"] !== "racing") {
              raceIsActive = false;
              raceWorld.remoteRacers = [];
              setMultiplayerSyncMessage(
                "The online room ended or its host left. Your local race can continue.",
              );
            }
          },
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") {
            channelReady = true;
            void refreshRoster();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            channelReady = false;
            setMultiplayerSyncMessage("Realtime connection lost; reconnecting…");
          }
        });

      // Live position: fast, goes straight to the other players without touching the database.
      const liveTimer = window.setInterval(() => {
        if (!channel || !channelReady || !userId || !active || !raceIsActive) return;
        if (phaseRef.current !== "playing") return;
        const W = raceWorld;
        void Promise.resolve(
          channel.send({
            type: "broadcast",
            event: "pos",
            payload: {
              u: userId,
              l: Math.max(0, Math.min(1, (W.px - W.roadX) / W.roadW)),
              d: W.distance,
              v: W.speed,
            },
          }),
        ).catch(() => {
          /* a dropped live packet is harmless; the next one follows in a moment */
        });
      }, 160);

      // Saved copy: lets late joiners and the results table see where everyone is.
      const positionTimer = window.setInterval(() => {
        if (!userId || sendingPosition || !active || !raceIsActive) return;
        sendingPosition = true;
        const W = raceWorld;
        void Promise.resolve(
          supabase.rpc("update_multiplayer_race_position", {
            p_room_id: multiplayerRace.roomId,
            p_lane_ratio: Math.max(0, Math.min(1, (W.px - W.roadX) / W.roadW)),
            p_distance: W.distance,
          }),
        )
          .then(({ error }) => {
            if (error && active) {
              setSyncError(`Could not send online racer position: ${error.message}`);
            } else if (!error && active) {
              lastSyncError = "";
            }
          })
          .finally(() => {
            sendingPosition = false;
          });
      }, 500);
      const rosterTimer = window.setInterval(() => {
        if (raceIsActive) void refreshRoster();
      }, 700);
      const maintenanceTimer = window.setInterval(() => {
        if (!raceIsActive || !active) return;
        void Promise.resolve(supabase.rpc("cleanup_expired_multiplayer_rooms")).then(({ error }) => {
          if (error && active) {
            setSyncError(`Could not refresh the online room: ${error.message}`);
          }
        });
      }, 10000);

      return () => {
        active = false;
        window.clearInterval(liveTimer);
        window.clearInterval(positionTimer);
        window.clearInterval(rosterTimer);
        window.clearInterval(maintenanceTimer);
        raceWorld.remoteRacers = [];
        raceWorld.remoteViews.clear();
        if (channel) void supabase.removeChannel(channel);
      };
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Multiplayer synchronization is unavailable.",
      );
      return () => {
        active = false;
        raceWorld.remoteRacers = [];
        raceWorld.remoteViews.clear();
        if (channel) void channel.unsubscribe();
      };
    }
  }, [multiplayerRace, phase]);
  useEffect(() => {
    const unlock = () => sfx.current.ensure();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchend", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    debugRef.current = new URLSearchParams(window.location.search).has("debug");
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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
      if (e.code === "Enter" && (phaseRef.current === "menu" || phaseRef.current === "over") && !multiplayerRaceRef.current && !e.repeat) { e.preventDefault(); start(); }
    };
    const up = (e: KeyboardEvent) => { const k = map[e.code]; if (k) input.current[k] = false; };
    const blur = () => { input.current = blankInput(); touch.current = blankInput(); if (phaseRef.current === "playing" && !multiplayerRaceRef.current) setPhase("paused"); };
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
    const pop = (text: string, color = "#ffffff") => {
      const stackOffset = W.popups.filter((popup) => popup.life < 0.3).length * 18;
      W.popups.push({
        text,
        x: W.px,
        y: W.py - W.ph * 0.8 - stackOffset,
        life: 0,
        color,
      });
    };

    const showPursuitEvents = (events: PursuitEvent[]) => {
      for (const event of events) {
        if (event === "fallback-alert") {
          W.policeWarning = 3;
          pop("POLICE ALERT · WANTED 1", "#ffb85c");
          sfx.current.blip(760, 0.2, "triangle", 0.06);
        } else if (event === "pursuit-started") {
          W.policeWarning = 3.5;
          W.policeT = 0.35;
          pop("PURSUIT STARTED · WANTED 2", "#ff717d");
          sfx.current.blip(980, 0.16, "triangle", 0.08);
        } else if (
          event === "wanted-level-raised" &&
          W.pursuit.wantedLevel === 3
        ) {
          W.policeWarning = 3.5;
          W.policeT = Math.min(W.policeT, 0.5);
          pop("HIGH PRESSURE · WANTED 3", "#ff717d");
          sfx.current.blip(1120, 0.18, "triangle", 0.08);
        } else if (event === "escaped") {
          W.cars = W.cars.filter((car) => car.kind !== "police");
          W.policeT = 1;
          W.heat = 0;
          W.policeWarning = 2;
          pop("PURSUIT ESCAPED", "#8ef0b0");
          sfx.current.blip(660, 0.16, "sine", 0.06);
        } else if (
          event === "wanted-level-raised" &&
          W.pursuit.wantedLevel === 1
        ) {
          W.policeWarning = 2.5;
          pop("POLICE ALERT · WANTED 1", "#ffb85c");
          sfx.current.blip(760, 0.2, "triangle", 0.06);
        }
      }
    };

    const registerPursuitIncident = (
      kind: PursuitIncidentKind,
      entityId: string,
    ) => {
      const result = updatePursuit(W.pursuit, 0, W.time, {
        id: `${kind}:${entityId}`,
        kind,
      });
      W.pursuit = result.state;
      showPursuitEvents(result.events);
    };

    const rewardCoins = (
      amount: number,
      kind: RewardEventKind,
      entityId?: string,
    ) => {
      if (W.walletSaveFailed) return null;
      try {
        const eventId =
          entityId ??
          `${W.raceId}:${kind}:${W.rewardEventSequence++}`;
        const result = recordRewardEvent(amount, kind, eventId);
        setGarageBalance(result.balance);
        setProgression(result.progression);
        setWalletError("");
        if (result.duplicate) return result.balance;
        for (const id of result.unlockedNow) {
          if (!W.unlockedAchievementsThisRace.includes(id)) {
            W.unlockedAchievementsThisRace.push(id);
          }
          const achievement = ACHIEVEMENTS.find((item) => item.id === id);
          if (achievement) pop(`ACHIEVEMENT · ${achievement.title}`, "#ffe36e");
        }
        return result.balance;
      } catch (error) {
        W.walletSaveFailed = true;
        setWalletError("Coin reward could not be saved. Check browser storage and try another race.");
        console.error("Could not save coin reward to the guest wallet.", error);
        return null;
      }
    };

    const finish = () => {
      if (phaseRef.current !== "playing") return;
      const score = scoreFor(W.distance, W.time) + Math.floor(W.bonus);
      const storedBest = Number(
        localStorage.getItem(BEST_KEY) ||
          localStorage.getItem("sketchrun.best") ||
          0,
      );
      const prev = Number.isSafeInteger(storedBest) && storedBest >= 0 ? storedBest : 0;
      let savedProgression = EMPTY_PROGRESSION;
      let newBest = false;
      let unlockedNow: AchievementId[] = [];
      let saveError = "";
      let balanceAfterProgression: number | null = null;
      try {
        savedProgression = readProgression();
        const completion = completeRace(W.raceId, {
          score,
          distance: W.distance,
          time: W.time,
        }, prev);
        savedProgression = completion.progression;
        unlockedNow = Array.from(
          new Set([...W.unlockedAchievementsThisRace, ...completion.unlockedNow]),
        );
        balanceAfterProgression = completion.balance;
        newBest = completion.newBest;
        setProgression(savedProgression);
        setProgressionError("");
        if (completion.duplicate) {
          saveError = "This race was already recorded; its progression rewards were not added again.";
        }
      } catch (error) {
        saveError = "Race progression could not be saved. Your in-race wallet rewards remain available.";
        setProgressionError(saveError);
        console.error("Could not save race progression.", error);
      }
      if (newBest) { localStorage.setItem(BEST_KEY, String(score)); setBest(score); }
      else setBest(Math.max(prev, savedProgression.bestScore));
      if (balanceAfterProgression !== null) setGarageBalance(balanceAfterProgression);
      let list: Entry[] = [];
      try { list = JSON.parse(localStorage.getItem(BOARD_KEY) || "[]"); } catch { list = []; }
      const entry: Entry = { name: settingsRef.current.name || "musti", score, time: W.time, distance: W.distance, date: Date.now() };
      list.push(entry); list.sort((a, b) => b.score - a.score); list = list.slice(0, 10);
      localStorage.setItem(BOARD_KEY, JSON.stringify(list)); setBoard(list);
      const rank = list.indexOf(entry) + 1;
      setFinal({
        score,
        newBest,
        distance: W.distance,
        time: W.time,
        rank,
        coinsCollected: W.coinsCollected,
        nearMisses: W.nearMisses,
        unlockedNow,
        progression: savedProgression,
        saveError,
      });
      phaseRef.current = "over"; setPhaseState("over");
      W.pursuit = createPursuitState();
      W.policeWarning = 0;
      W.policeT = 0;
      W.heat = 0;
      W.cars = W.cars.filter((car) => car.kind !== "police");
      if (unlockedNow.length > 0) {
        const achievement = ACHIEVEMENTS.find(({ id }) => id === unlockedNow[0]);
        if (achievement) pop(`ACHIEVEMENT · ${achievement.title}`, "#ffe36e");
      }
      sfx.current.blip(180, 0.6, "sawtooth", 0.15);
    };

    finishRef.current = finish;
    const hit = (
      car: Car,
      message = car.kind === "police" ? "POLICE HIT · -1 LIFE" : "CRASH · -1 LIFE",
      incidentKind?: PursuitIncidentKind,
    ) => {
      if (W.invuln > 0) return;
      if (incidentKind || car.kind === "traffic") {
        registerPursuitIncident(
          incidentKind ?? "traffic-collision",
          car.id ?? `${W.raceId}:collision:${W.entitySequence++}`,
        );
      }
      const onlineRace = multiplayerRaceRef.current !== null || careerRef.current !== null; if (!onlineRace) W.lives -= 1; W.invuln = onlineRace ? 1.2 : 2; W.shake = 0.55; W.hitFlash = 1; W.speed *= 0.5; W.drift = 0;
      spark(W.px, W.py - W.ph * 0.3, 40, "#ffd27a", 380); spark(W.px, W.py, 20, "#ffffff", 200);
      pop(onlineRace ? "CRASH · SLOWED" : message, "#ff7373");
      sfx.current.crash();
      if (car.kind === "police") car.y += W.ph * 1.6; else { car.y -= W.ph * 0.6; car.vy = W.speed * 0.2; }
      if (!onlineRace && W.lives <= 0) finish();
    };

    const spawnPolice = (difficulty: ReturnType<typeof raceDifficulty>) => {
      const ahead = Math.random() < difficulty.aheadPoliceChance;
      const w = W.pw * MODEL_WIDTH.police, h = w * MODEL_RATIO.police;
      const spawnY = ahead ? -h * 3 : W.h + h * 2.5;
      const blocked = new Set<number>();
      const blockIfNearSpawn = (x: number, y: number, height: number) => {
        if (Math.abs(y - spawnY) < Math.max(h, height) * 2.5) {
          const lane = Math.floor((x - W.roadX) / W.laneW);
          if (lane >= 0 && lane < W.lanes) blocked.add(lane);
        }
      };
      for (const car of W.cars) blockIfNearSpawn(car.x, car.y, car.h);
      for (const pickup of W.pickups) blockIfNearSpawn(pickup.x, pickup.y, W.laneW);
      for (const coin of W.coins) blockIfNearSpawn(coin.x, coin.y, W.laneW);
      for (const hazard of W.hazards) blockIfNearSpawn(hazard.x, hazard.y, hazard.h);
      if (ahead) {
        blocked.add(
          Math.max(0, Math.min(W.lanes - 1, Math.floor((W.px - W.roadX) / W.laneW))),
        );
      }
      const lane = pickPoliceLane(W.lanes, blocked, Math.random);
      if (lane === null) return false;
      W.cars.push({ kind: "police", model: "police", ahead, x: W.roadX + W.laneW * (lane + 0.5), y: spawnY, w, h, vy: ahead ? W.cruise * 0.55 : 0, color: "#111", seed: Math.random() * 100 });
      sfx.current.blip(880, 0.2, "triangle", 0.06);
      return true;
    };

    const update = (dt: number) => {
      const S = settingsRef.current;
      const { maxSpeed: vehicleMaxSpeed, accelerationMultiplier: accelMul, handlingMultiplier: gripMul } = W.vehiclePerformance;

      const k = input.current, tc = touch.current;
      const inp = { left: k.left || tc.left, right: k.right || tc.right, up: k.up || tc.up, down: k.down || tc.down, boost: k.boost || tc.boost };
      W.time += dt;
      const difficulty = raceDifficulty(W.time);
      W.policeWarning = Math.max(0, W.policeWarning - dt);
      const pursuitUpdate = updatePursuit(W.pursuit, dt, W.time);
      W.pursuit = pursuitUpdate.state;
      showPursuitEvents(pursuitUpdate.events);
      if (difficulty.level > W.difficultyLevel) {
        W.difficultyLevel = difficulty.level;
        W.policeWarning = 4.5;
        pop(`POLICE PRESSURE RISING · ROAD LEVEL ${difficulty.level}`, "#ffb85c");
        sfx.current.blip(980, 0.16, "triangle", 0.08);
      }
      // ---- speed ----
      W.cruise = Math.min(
        vehicleMaxSpeed * 0.62,
        BASE_SPEED + W.time * 6 * (vehicleMaxSpeed / MAX_SPEED),
      );

      let target = W.cruise * 1.05;

      if (inp.up) {
        target = Math.min(vehicleMaxSpeed * 0.85, W.cruise * 1.35);
      }

      if (inp.down) {
        target = W.cruise * 0.4;
      }

      W.boosting = inp.boost && W.boost > 0.02 && !inp.down;

      if (W.boosting) {
        target = Math.min(
          vehicleMaxSpeed,
          W.cruise * 1.35 + 420
        );
        W.boost = Math.max(0, W.boost - dt * 0.38);
      } else {
        W.boost = Math.min(
          W.boostCapacity,
          W.boost + dt * 0.07 * W.boostCapacity,
        );
      }

      const rate =
        target > W.speed
          ? accelRate(W.speed, W.boosting, vehicleMaxSpeed) * accelMul
          : inp.down
            ? 3.2 * gripMul
            : 0.9;

      W.speed +=
        (target - W.speed) * (1 - Math.exp(-rate * dt));

      W.boostVis += ((W.boosting ? 1 : 0) - W.boostVis) * (1 - Math.exp(-5 * dt));
      W.py = W.baseY + W.h * 0.05 * W.boostVis; // camera pulls back on nitro
      // ---- steering ----
      let steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (S.control === "tilt" && tiltRaw.current != null && steer === 0) {
        const raw = tiltToSteer(tiltRaw.current, S.neutral, S.sens, 3);
        tiltSmooth.current += (raw - tiltSmooth.current) * (1 - Math.exp(-12 * dt));
        steer = tiltSmooth.current;
      }
      const sf = W.speed / vehicleMaxSpeed;
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
      const grip = (11 - 8.5 * W.drift) * gripMul;
      const latTarget = steer * (330 + W.speed * 0.32) * (1 + 0.2 * W.drift);
      W.pvx += (latTarget - W.pvx) * (1 - Math.exp(-grip * dt));
      W.px += W.pvx * dt;
      const headTarget = (W.pvx / 1400) * 0.35 + W.drift * W.driftDir * 0.38;
      W.heading += (headTarget - W.heading) * (1 - Math.exp(-10 * dt));
      const minX = W.roadX + W.pw / 2 + 6, maxX = W.roadX + W.roadW - W.pw / 2 - 6;
      if (W.px < minX || W.px > maxX) { W.px = Math.max(minX, Math.min(maxX, W.px)); W.pvx *= -0.3; W.speed *= Math.exp(-1.5 * dt); if (Math.random() < 0.5) spark(W.px + (W.px <= minX ? -W.pw / 2 : W.pw / 2), W.py, 2, "#ffb347", 150); }
      const dy = W.speed * dt;
      W.distance += dy; W.scroll = (W.scroll + dy) % 80;
      const finishingRace = multiplayerRaceRef.current;
      if (finishingRace && W.distance >= MULTIPLAYER_RACE_LENGTH && phaseRef.current === "playing") {
        const finishDistance = W.distance;
        finish();
        void reportOnlineFinish(finishingRace, finishDistance);
      }
      const careerNow = careerRef.current;
      if (careerNow && W.distance >= MULTIPLAYER_RACE_LENGTH && phaseRef.current === "playing") {
        const myTime = W.time;
        finish();
        completeCareer(careerNow.tier, myTime);
      }
      if (careerNow && phaseRef.current === "playing") {
        const aiContext = { time: W.time, playerDistance: W.distance, cruise: W.cruise, raceLength: MULTIPLAYER_RACE_LENGTH, tier: careerNow.tier, rand: Math.random };
        const aiNow = performance.now();
        for (const ai of W.ai) {
          stepAiRacer(ai, dt, aiContext);
          const view = W.remoteViews.get(ai.id);
          if (view) {
            view.distance = ai.distance; view.targetDistance = ai.distance;
            view.laneRatio = ai.lane; view.targetLane = ai.lane;
            view.finished = ai.finishedAt !== null; view.speed = 0; view.targetAt = aiNow;
          }
        }
      }
      // Racers bump into each other: the car behind loses speed, the car in front gets a small push.
      if ((finishingRace || careerNow) && phaseRef.current === "playing") {
        W.bumpCd = Math.max(0, W.bumpCd - dt);
        if (W.bumpCd === 0) {
          for (const racer of W.remoteViews.values()) {
            if (racer.finished) continue;
            const rx = W.roadX + racer.laneRatio * W.roadW;
            const ry = W.py - (racer.distance - W.distance);
            const contact = classifyContact(rx - W.px, ry - W.py, W.pw, W.ph);
            if (contact === "none") continue;
            W.bumpCd = 0.45;
            const rival = careerNow ? W.ai.find((entry) => entry.id === racer.userId) : undefined;
            if (rival) {
              if (contact === "rear-ending") rival.speed *= 1.05;
              else if (contact === "rear-ended") rival.speed *= 0.85;
              else rival.speed *= 0.96;
            }
            const away = W.px >= rx ? 1 : -1;
            const minX = W.roadX + W.pw / 2;
            const maxX = W.roadX + W.roadW - W.pw / 2;
            if (contact === "rear-ending") {
              W.speed *= 0.82;
              W.px = Math.max(minX, Math.min(maxX, W.px + away * W.pw * 0.3));
              W.shake = Math.max(W.shake, 0.35);
              pop("BUMP", "#ffd27a");
            } else if (contact === "rear-ended") {
              W.speed *= 1.05;
              W.shake = Math.max(W.shake, 0.2);
            } else {
              W.speed *= 0.95;
              W.px = Math.max(minX, Math.min(maxX, W.px + away * W.pw * 0.35));
              W.shake = Math.max(W.shake, 0.25);
              pop("SIDE SWIPE", "#ffd27a");
            }
            sfx.current.blip(140, 0.1);
            spark(W.px, W.py - W.ph * 0.4, 14, "#ffd27a", 220);
            break;
          }
        }
      }
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
        const isCity = Math.random() < sceneryZoneBlend(W.distance);
        const r = Math.random();
        const kind: Prop["kind"] = isCity
          ? r < 0.38 ? "building" : r < 0.64 ? "lamp" : r < 0.82 ? "sign" : "barrier"
          : r < 0.48 ? "tree" : r < 0.73 ? "shrub" : r < 0.88 ? "barrier" : "sign";
        W.props.push({ kind, side: Math.random() < 0.5 ? -1 : 1, y: -140, seed: Math.random() });
        if (W.props.length > 40) W.props.splice(0, W.props.length - 40);
        W.propT = 120 + Math.random() * 160;
      }
      for (const p of W.props) p.y += dy;
      W.props = W.props.filter((p) => p.y < W.h + 200);

      const blockedPickupLanes = () => {
        const blocked = new Set<number>();
        const spawnY = -W.laneW * 0.6;
        const block = (x: number, y: number, halfHeight: number) => {
          if (Math.abs(y - spawnY) < Math.max(W.laneW * 0.7, halfHeight + W.laneW * 0.25)) {
            const lane = Math.floor((x - W.roadX) / W.laneW);
            if (lane >= 0 && lane < W.lanes) blocked.add(lane);
          }
        };
        for (const car of W.cars) block(car.x, car.y, car.h / 2);
        for (const pickup of W.pickups) block(pickup.x, pickup.y, W.laneW * 0.35);
        for (const coin of W.coins) block(coin.x, coin.y, W.laneW * 0.2);
        for (const hazard of W.hazards) block(hazard.x, hazard.y, hazard.h / 2);
        return blocked;
      };

      // Reserve only lanes with an object close enough to collide at the spawn row.
      W.pickupT -= dt;
      if (W.pickupT <= 0 && W.pickups.length < 6) {
        const pattern = generatePickupPattern(
          W.lanes,
          blockedPickupLanes(),
          Math.random,
          "nitro",
        );
        const remainingSlots = Math.max(0, 6 - W.pickups.length);
        const accepted = pattern.slice(0, remainingSlots);
        if (accepted.length > 0) {
          for (const placement of accepted) {
            W.pickups.push({
              id: `${W.raceId}:nitro:${W.entitySequence++}`,
              x: W.roadX + W.laneW * (placement.lane + 0.5),
              y: -W.laneW * (0.6 + placement.row * 1.35),
            });
          }
        }
        const interval = PICKUP_PATTERN_INTERVALS.nitro;
        W.pickupT =
          accepted.length > 0
            ? interval.min + Math.random() * (interval.max - interval.min)
            : 0.45;
      }
      for (const pickup of W.pickups) pickup.y += dy;

      W.coinT -= dt;
      if (W.coinT <= 0 && W.coins.length < 12) {
        const pattern = generateCoinNitroFormation(
          W.lanes,
          blockedPickupLanes(),
          Math.random,
        );
        const acceptedCoins = pattern.coins.slice(0, Math.max(0, 12 - W.coins.length));
        const acceptedNitro = pattern.nitro.slice(0, Math.max(0, 6 - W.pickups.length));
        for (const placement of acceptedCoins) {
            W.coins.push({
              id: `${W.raceId}:coin:${W.entitySequence++}`,
              x: W.roadX + W.laneW * (placement.lane + 0.5),
              y: -W.laneW * (0.6 + placement.row * 1.35),
            });
        }
        for (const placement of acceptedNitro) {
          W.pickups.push({
            id: `${W.raceId}:nitro:${W.entitySequence++}`,
            x: W.roadX + W.laneW * (placement.lane + 0.5),
            y: -W.laneW * (0.6 + placement.row * 1.35),
          });
        }
        const interval = PICKUP_PATTERN_INTERVALS.coin;
        W.coinT =
          acceptedCoins.length > 0 || acceptedNitro.length > 0
            ? interval.min + Math.random() * (interval.max - interval.min)
            : 0.35;
      }
      for (const coin of W.coins) coin.y += dy;

      W.hazardT -= dt;
      if (W.hazardT <= 0 && W.hazards.length < 2) {
        const blocked = new Set<number>();
        for (const car of W.cars) {
          if (car.y > -W.ph * 4 && car.y < W.ph * 3) {
            blocked.add(Math.floor((car.x - W.roadX) / W.laneW));
          }
        }
        for (const pickup of W.pickups) {
          if (pickup.y > -W.ph * 4 && pickup.y < W.ph * 3) {
            blocked.add(Math.floor((pickup.x - W.roadX) / W.laneW));
          }
        }
        for (const coin of W.coins) {
          if (coin.y > -W.ph * 4 && coin.y < W.ph * 3) {
            blocked.add(Math.floor((coin.x - W.roadX) / W.laneW));
          }
        }
        for (const hazard of W.hazards) {
          if (hazard.y > -W.ph * 4 && hazard.y < W.ph * 3) {
            blocked.add(Math.floor((hazard.x - W.roadX) / W.laneW));
          }
        }
        const lane = pickLane(W.lanes, blocked, Math.random);
        if (lane !== null) {
          const kind = Math.random() < 0.55 ? "cone" : "debris";
          const width = W.laneW * (kind === "cone" ? 0.3 : 0.44);
          W.hazards.push({
            id: `${W.raceId}:hazard:${W.entitySequence++}`,
            kind,
            x: W.roadX + W.laneW * (lane + 0.5),
            y: -W.laneW * 0.7,
            w: width,
            h: width * (kind === "cone" ? 1.15 : 0.55),
          });
        }
        W.hazardT = 6 + Math.random() * 2.5;
      }
      for (const hazard of W.hazards) hazard.y += dy;

      // traffic spawn (fair: always leave a lane open near the top)
      W.spawnT -= dt;
      if (W.spawnT <= 0) {
        const blocked = new Set<number>();
        for (const car of W.cars) if (car.y < W.ph * 3) blocked.add(Math.floor((car.x - W.roadX) / W.laneW));
        for (const pickup of W.pickups) {
          if (pickup.y < W.ph * 3 && pickup.y > -W.ph * 4) {
            blocked.add(Math.floor((pickup.x - W.roadX) / W.laneW));
          }
        }
        for (const coin of W.coins) {
          if (coin.y < W.ph * 3 && coin.y > -W.ph * 4) {
            blocked.add(Math.floor((coin.x - W.roadX) / W.laneW));
          }
        }
        for (const hazard of W.hazards) {
          if (hazard.y < W.ph * 3 && hazard.y > -W.ph * 4) {
            blocked.add(Math.floor((hazard.x - W.roadX) / W.laneW));
          }
        }
        const lane = pickLane(W.lanes, blocked, Math.random);
        if (lane !== null) {
          const model = TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)] ?? "sedan";
          const cw = W.pw * MODEL_WIDTH[model], ch = cw * MODEL_RATIO[model];
          W.cars.push({ id: `${W.raceId}:traffic:${W.entitySequence++}`, kind: "traffic", model, x: W.roadX + W.laneW * (lane + 0.5), y: -ch, w: cw, h: ch, vy: (model === "van" ? 90 : 120) + Math.random() * 130, color: PAINTS[Math.floor(Math.random() * PAINTS.length)] ?? "#b9bec6", seed: Math.random() * 100 });
        }
        W.spawnT = (0.95 - difficulty.trafficDensity * 0.38) * (BASE_SPEED / Math.max(W.speed, 150)) * (0.7 + Math.random() * 0.6) * 1.6;
      }
      // police spawn – escalating pressure
      if (W.pursuit.wantedLevel >= 2) W.policeT -= dt;
      const policeCount = W.cars.filter((c) => c.kind === "police").length;
      const policeLimit = W.pursuit.wantedLevel >= 3 ? 2 : 1;
      if (
        W.pursuit.wantedLevel >= 2 &&
        W.policeT <= 0 &&
        policeCount < policeLimit
      ) {
        W.policeT = spawnPolice(difficulty)
          ? difficulty.policeInterval + Math.random() * 2
          : 0.75;
      } else if (
        W.pursuit.wantedLevel >= 2 &&
        W.policeT <= 0 &&
        policeCount >= policeLimit
      ) {
        W.policeT = difficulty.policeInterval + Math.random() * 2;
      }

      let heat = 0;
      const player = { x: W.px, y: W.py, w: W.pw, h: W.ph };
      for (const car of W.cars) {
        if (car.kind === "traffic") {
          car.y += (W.speed - car.vy) * dt;
          if (claimNearMiss(car, player, car)) {
            W.nearMisses += 1;
            W.bonus += 50; W.boost = Math.min(W.boostCapacity, W.boost + 0.08 * W.boostCapacity); W.shake = Math.max(W.shake, 0.1);
            const reward = rewardCoins(
              NEAR_MISS_COIN_REWARD,
              "near-miss",
              `${W.raceId}:near-miss:${car.id ?? W.rewardEventSequence++}`,
            );
            registerPursuitIncident(
              "near-miss",
              car.id ?? `${W.raceId}:near-miss:${W.entitySequence++}`,
            );
            pop(reward === null ? "NEAR MISS +50" : `NEAR MISS +50 · +${NEAR_MISS_COIN_REWARD} COINS`, "#7fd4ff");
            sfx.current.blip(1320, 0.06, "square", 0.04);
          }
        } else {
          let pursuit = Math.max(
            W.cruise * (1.04 + difficulty.pressure * 0.05),
            W.speed * (0.94 + difficulty.pressure * 0.06),
          ) + 18 + difficulty.pressure * 30;
          if (W.boosting) pursuit *= 0.82;
          if (car.ahead) { car.y += (W.speed - car.vy) * dt; if (car.y > W.py - W.ph * 3) car.ahead = false; }
          else { car.y += (W.speed - pursuit) * dt; car.y = Math.max(car.y, W.py - W.ph * 2.2); }
          // lateral: match lane from distance, ram when alongside
          const close = Math.abs(car.y - W.py) < W.ph * 3.5;
          const laneX = W.roadX + W.laneW * (Math.floor((W.px - W.roadX) / W.laneW) + 0.5);
          let tx = laneX;
          if (close) {
            const safeOffset = (W.pw + car.w) * 0.62;
            const minPoliceX = W.roadX + car.w / 2;
            const maxPoliceX = W.roadX + W.roadW - car.w / 2;
            const left = Math.max(minPoliceX, W.px - safeOffset);
            const right = Math.min(maxPoliceX, W.px + safeOffset);
            const preferred = car.x < W.px ? left : right;
            const alternative = car.x < W.px ? right : left;
            tx =
              Math.abs(preferred - W.px) > Math.abs(alternative - W.px)
                ? preferred
                : alternative;
          }
          const dx = tx - car.x; car.x += Math.sign(dx) * Math.min(Math.abs(dx), difficulty.policeSteerSpeed * dt);
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

      for (let i = W.pickups.length - 1; i >= 0; i--) {
        const pickup = W.pickups[i];
        if (!pickup) continue;
        const pickupSize = W.laneW * 0.5;
        if (
          overlaps(player, { x: pickup.x, y: pickup.y, w: pickupSize, h: pickupSize * 1.45 }) &&
          claimPickupOnce(pickup)
        ) {
          W.pickups.splice(i, 1);
          const previousBoost = W.boost;
          W.boost = pickupBoost(
            W.boost,
            NITRO_PICKUP_AMOUNT * W.boostCapacity,
            W.boostCapacity,
          );
          const restored = Math.round(
            ((W.boost - previousBoost) / W.boostCapacity) * 100,
          );
          spark(pickup.x, pickup.y, 20, "#59dcff", 220);
          pop(restored > 0 ? `NITRO +${restored}%` : "NITRO FULL", "#72e7ff");
          sfx.current.blip(1040, 0.09, "sine", 0.08);
          sfx.current.blip(1480, 0.13, "sine", 0.06);
          continue;
        }
      }
      W.pickups = W.pickups.filter((pickup) => pickup.y < W.h + W.laneW);

      for (let i = W.hazards.length - 1; i >= 0; i--) {
        const hazard = W.hazards[i];
        if (!hazard) continue;
        if (claimNearMiss(hazard, player, hazard)) {
          W.nearMisses += 1;
          const reward = rewardCoins(
            NEAR_MISS_COIN_REWARD,
            "near-miss",
            `${W.raceId}:near-miss:${hazard.id ?? W.rewardEventSequence++}`,
          );
          pop(
            reward === null
              ? "HAZARD DODGED"
              : `HAZARD DODGED · +${NEAR_MISS_COIN_REWARD} COINS`,
            "#ffbf66",
          );
          registerPursuitIncident(
            "near-miss",
            hazard.id ?? `${W.raceId}:hazard-near-miss:${W.entitySequence++}`,
          );
          spark(hazard.x, hazard.y, 10, "#ffbf66", 180);
          sfx.current.blip(1180, 0.08, "sine", 0.07);
        }
        if (overlaps(player, hazard)) {
          W.hazards.splice(i, 1);
          hit({
            kind: "traffic",
            x: hazard.x,
            y: hazard.y,
            w: hazard.w,
            h: hazard.h,
            vy: W.speed * 0.2,
            color: "#f97316",
            seed: 0,
            id: hazard.id ?? `${W.raceId}:hazard-collision:${W.entitySequence++}`,
          }, "ROAD HAZARD · -1 LIFE", "hazard-collision");
          if (phaseRef.current !== "playing") return;
        }
      }
      W.hazards = W.hazards.filter(
        (hazard) => hazard.y > -W.laneW && hazard.y < W.h + W.laneW,
      );

      for (let i = W.coins.length - 1; i >= 0; i--) {
        const coin = W.coins[i];
        if (!coin) continue;
        if (overlaps(player, {
          x: coin.x,
          y: coin.y,
          w: W.laneW * 0.38,
          h: W.laneW * 0.38,
        }) && claimPickupOnce(coin)) {
          W.coins.splice(i, 1);
          const balance = rewardCoins(
            COIN_REWARD,
            "road-coin",
            coin.id ?? `${W.raceId}:coin:${W.rewardEventSequence++}`,
          );
          if (balance !== null) {
            W.coinsCollected += 1;
            spark(coin.x, coin.y, 28, "#ffd84a", 300);
            spark(coin.x, coin.y, 12, "#fff2b2", 180);
            pop(`+${COIN_REWARD} COINS`, "#ffe36e");
            sfx.current.blip(1240, 0.08, "sine", 0.09);
            sfx.current.blip(1660, 0.12, "sine", 0.07);
          }
        }
      }
      W.coins = W.coins.filter(
        (coin) => coin.y > -W.laneW && coin.y < W.h + W.laneW,
      );

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
      } else if (p.kind === "shrub") {
        if (verge < 24) return;
        const x = p.side < 0 ? edge - 20 - p.seed * (verge - 30) : edge + 20 + p.seed * (verge - 30);
        c.fillStyle = "#253d2b";
        c.beginPath();
        c.ellipse(x, p.y, 17, 9, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#36553a";
        c.beginPath();
        c.ellipse(x - 5, p.y - 3, 8, 5, 0, 0, Math.PI * 2);
        c.fill();
      } else if (p.kind === "barrier") {
        const x = p.side < 0 ? Math.max(2, edge - 34) : Math.min(w - 32, edge + 18);
        c.fillStyle = "#6d7278";
        c.fillRect(x, p.y - 5, 16, 10);
        c.fillStyle = "#c7c8c5";
        c.fillRect(x, p.y - 4, 16, 2);
        c.fillStyle = "#e6a83e";
        c.fillRect(x + (p.seed > 0.5 ? 8 : 2), p.y - 1, 5, 3);
        c.fillStyle = "#555a60";
        c.fillRect(x + 2, p.y + 5, 3, 8);
        c.fillRect(x + 11, p.y + 5, 3, 8);
      } else {
        const x = p.side < 0 ? Math.max(2, edge - 42) : Math.min(w - 40, edge + 4);
        c.fillStyle = "#1f6b3d"; c.fillRect(x, p.y, 38, 20);
        c.strokeStyle = "#e9e9e4"; c.lineWidth = 1; c.strokeRect(x + 2, p.y + 2, 34, 16);
        c.fillStyle = "#e9e9e4"; c.fillRect(x + 7, p.y + 7, 18, 2); c.fillRect(x + 7, p.y + 11, 12, 2);
      }
    };

    const drawPickup = (pickup: Pickup) => {
      const size = W.laneW * 0.5;
      const pulse = 0.85 + Math.sin(t * 5 + pickup.x) * 0.15;
      c.save();
      c.translate(pickup.x, pickup.y);
      c.scale(pulse, pulse);
      c.shadowColor = "#25cfff";
      c.shadowBlur = 24;
      c.fillStyle = "rgba(25,190,255,0.2)";
      c.beginPath();
      c.ellipse(0, 0, size * 0.43, size * 0.58, 0, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 12;
      c.fillStyle = "#123d57";
      c.strokeStyle = "#8af0ff";
      c.lineWidth = 2.5;
      c.beginPath();
      c.roundRect(-size * 0.27, -size * 0.38, size * 0.54, size * 0.86, size * 0.1);
      c.fill();
      c.stroke();
      c.fillStyle = "#9ff5ff";
      c.beginPath();
      c.roundRect(-size * 0.12, -size * 0.51, size * 0.24, size * 0.15, size * 0.04);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "#35d9ff";
      c.beginPath();
      c.moveTo(size * 0.05, -size * 0.2);
      c.lineTo(-size * 0.1, size * 0.02);
      c.lineTo(size * 0.02, size * 0.02);
      c.lineTo(-size * 0.05, size * 0.22);
      c.lineTo(size * 0.14, -size * 0.04);
      c.lineTo(size * 0.02, -size * 0.04);
      c.closePath();
      c.fill();
      c.restore();
    };

    const drawCoin = (coin: Coin) => {
      const radius = W.laneW * 0.18;
      const pulse = 0.94 + Math.sin(t * 6 + coin.x) * 0.06;
      c.save();
      c.translate(coin.x, coin.y);
      c.scale(pulse, pulse);
      c.shadowColor = "#ffd43b";
      c.shadowBlur = 18;
      const gold = c.createRadialGradient(-radius * 0.35, -radius * 0.4, 1, 0, 0, radius * 1.2);
      gold.addColorStop(0, "#fff6a8");
      gold.addColorStop(0.45, "#ffd43b");
      gold.addColorStop(1, "#d88708");
      c.fillStyle = gold;
      c.strokeStyle = "#fff2a1";
      c.lineWidth = Math.max(2, radius * 0.17);
      c.beginPath();
      c.arc(0, 0, radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = "#b97008";
      c.lineWidth = Math.max(1, radius * 0.09);
      c.beginPath();
      c.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#9b5a06";
      c.font = `900 ${radius * 1.15}px serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("$", 0, radius * 0.03);
      c.restore();
    };

    const drawHazard = (hazard: Hazard) => {
      const { x, y, w, h } = hazard;
      c.save();
      c.translate(x, y);
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.beginPath();
      c.ellipse(2, h * 0.38, w * 0.62, h * 0.2, 0, 0, Math.PI * 2);
      c.fill();
      if (hazard.kind === "cone") {
        c.shadowColor = "rgba(255,115,35,0.55)";
        c.shadowBlur = 8;
        c.fillStyle = "#f97316";
        c.beginPath();
        c.moveTo(0, -h * 0.52);
        c.lineTo(w * 0.44, h * 0.42);
        c.lineTo(-w * 0.44, h * 0.42);
        c.closePath();
        c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = "#fff1d6";
        c.lineWidth = Math.max(2, w * 0.1);
        c.beginPath();
        c.moveTo(-w * 0.27, h * 0.05);
        c.lineTo(w * 0.27, h * 0.05);
        c.stroke();
        c.fillStyle = "#c2410c";
        c.fillRect(-w * 0.55, h * 0.38, w * 1.1, h * 0.16);
      } else {
        c.rotate(Math.sin(t * 1.7 + x) * 0.06);
        c.fillStyle = "#a9a49a";
        c.strokeStyle = "#e1d7c3";
        c.lineWidth = Math.max(1.5, w * 0.06);
        c.beginPath();
        c.moveTo(-w * 0.48, -h * 0.28);
        c.lineTo(w * 0.28, -h * 0.5);
        c.lineTo(w * 0.5, h * 0.1);
        c.lineTo(w * 0.2, h * 0.42);
        c.lineTo(-w * 0.42, h * 0.3);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = "#716b61";
        c.fillRect(-w * 0.18, -h * 0.12, w * 0.32, h * 0.12);
      }
      c.restore();
    };

    const render = () => {
      const { w, h, roadX, roadW, laneW } = W;
      c.save();
      if (W.shake > 0) c.translate((Math.random() - 0.5) * 16 * W.shake, (Math.random() - 0.5) * 16 * W.shake);
      // verge
      c.fillStyle = "#141518"; c.fillRect(-20, -20, w + 40, h + 40);
      c.fillStyle = "#1b1c20";
      for (let y = -80 + (W.scroll % 80); y < h; y += 80) { c.fillRect(0, y, roadX - 14, 40); c.fillRect(roadX + roadW + 14, y, w, 40); }
      const cityBlend = sceneryZoneBlend(W.distance);
      c.fillStyle = `rgba(66,78,103,${cityBlend * 0.12})`;
      c.fillRect(0, 0, roadX - 14, h);
      c.fillRect(roadX + roadW + 14, 0, w, h);
      c.fillStyle = `rgba(42,76,42,${(1 - cityBlend) * 0.2})`;
      c.fillRect(0, 0, roadX - 14, h);
      c.fillRect(roadX + roadW + 14, 0, w, h);
      for (const side of [-1, 1] as const) {
        const startX = side < 0 ? 0 : roadX + roadW + 16;
        const available = side < 0 ? roadX - 18 : w - startX;
        if (available < 28) continue;
        for (let i = 0; i < 4; i++) {
          const x = startX + (available * (i + 0.5)) / 4;
          const y = ((i * 173 + W.scroll * 0.42) % (h + 180)) - 90;
          const bw = Math.min(44, available / 4 + 4);
          const bh = 54 + ((i * 31) % 56);
          c.globalAlpha = cityBlend * 0.34;
          c.fillStyle = "#252a34";
          c.fillRect(x - bw / 2, y - bh, bw, bh);
          c.fillStyle = "#d2b97d";
          for (let windowIndex = 0; windowIndex < 3; windowIndex++) {
            c.fillRect(x - bw * 0.28 + windowIndex * bw * 0.27, y - bh + 12, 3, 5);
            c.fillRect(x - bw * 0.28 + windowIndex * bw * 0.27, y - bh + 24, 3, 5);
          }
          c.globalAlpha = (1 - cityBlend) * 0.3;
          c.fillStyle = "#304a34";
          c.beginPath();
          c.arc(x, y, 13 + (i % 2) * 4, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#405a3d";
          c.beginPath();
          c.arc(x - 5, y - 5, 7, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
        }
      }
      // road
      const rg = c.createLinearGradient(roadX, 0, roadX + roadW, 0);
      rg.addColorStop(0, "#1e1f22"); rg.addColorStop(0.5, "#292a2e"); rg.addColorStop(1, "#1e1f22");
      c.fillStyle = rg; c.fillRect(roadX, -20, roadW, h + 40);
      // asphalt patches
      c.fillStyle = "rgba(0,0,0,0.12)";
      for (let i = 0; i < 6; i++) { const y = ((i * 211 + W.scroll * 1) % (h + 200)) - 100; c.fillRect(roadX + ((i * 97) % (roadW - 60)), y + ((W.distance / 1) % 1), 50, 26); }
      // online race finish line: distance boards, a wide checkered strip and a gantry
      if (multiplayerRaceRef.current || careerRef.current) {
        const finishY = W.py - (MULTIPLAYER_RACE_LENGTH - W.distance);
        c.save();
        c.textAlign = "center";
        for (const metres of [500, 300, 100]) {
          const boardY = finishY + metres / METRES_PER_UNIT;
          if (boardY < -40 || boardY > h + 40) continue;
          c.fillStyle = "rgba(255,255,255,0.55)";
          c.fillRect(roadX, boardY - 3, roadW, 6);
          c.fillStyle = "#ffffff";
          c.font = "bold 16px 'Bebas Neue', sans-serif";
          c.fillText(`${metres} m`, roadX + roadW / 2, boardY - 10);
        }
        if (finishY > -160 && finishY < h + 160) {
          const squares = 18;
          const sq = roadW / squares;
          const rows = 5;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < squares; col++) {
              c.fillStyle = (col + row) % 2 === 0 ? "#f5f5f5" : "#111";
              c.fillRect(roadX + col * sq, finishY - sq * 2.5 + row * sq, sq + 0.5, sq + 0.5);
            }
          }
          // gantry across the road
          const gantryY = finishY - sq * 2.5 - 46;
          c.fillStyle = "rgba(10,10,14,0.92)";
          c.fillRect(roadX - 10, gantryY, roadW + 20, 40);
          c.fillStyle = "#ff3b3b";
          c.fillRect(roadX - 10, gantryY + 36, roadW + 20, 4);
          c.fillStyle = "#3b82f6";
          c.fillRect(roadX - 10, gantryY, roadW + 20, 4);
          c.fillStyle = "#ffffff";
          c.font = "bold 28px 'Bebas Neue', sans-serif";
          c.fillText("FINISH", roadX + roadW / 2, gantryY + 30);
          c.fillStyle = "#222";
          c.fillRect(roadX - 18, gantryY, 8, 70);
          c.fillRect(roadX + roadW + 10, gantryY, 8, 70);
        }
        c.restore();
      }
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
      for (const hazard of W.hazards) drawHazard(hazard);
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
        if (isBike(model)) {
          drawBikeSprite(c, spr, car.w, car.h, car.x - car.w / 2, car.y - car.h / 2, car.w, car.h);
        } else {
          c.drawImage(spr, car.x - sw / 2, car.y - sh / 2, sw, sh);
        }
        if (car.kind === "police") { c.save(); c.translate(car.x, car.y); drawLightbar(c, car.w, car.h, t, car.seed); c.restore(); }
      }
      for (const pickup of W.pickups) drawPickup(pickup);
      for (const coin of W.coins) drawCoin(coin);
      if (W.remoteViews.size > 0) {
        const nowMs = performance.now();
        const stepSeconds = remoteStepAt.current ? Math.min(0.1, (nowMs - remoteStepAt.current) / 1000) : 0.016;
        remoteStepAt.current = nowMs;
        stepRacerDisplays(W.remoteViews, nowMs, stepSeconds);
        const racers = [...W.remoteViews.values()].sort((first, second) => first.distance - second.distance);
        for (const racer of racers) {
          const racerX = roadX + racer.laneRatio * roadW;
          const racerY = W.py - (racer.distance - W.distance);
          const color = SEAT_COLORS[racer.seat] ?? "#aaaaaa";
          if (racerY <= -W.ph || racerY >= W.h + W.ph) {
            if (racerY <= -W.ph && !racer.finished) {
              // a racer far ahead: show a small arrow at the top edge
              const arrowX = Math.max(roadX + 14, Math.min(roadX + roadW - 14, racerX));
              c.save();
              c.fillStyle = color;
              c.globalAlpha = 0.9;
              c.beginPath();
              c.moveTo(arrowX, 18);
              c.lineTo(arrowX - 9, 34);
              c.lineTo(arrowX + 9, 34);
              c.closePath();
              c.fill();
              c.fillStyle = "#e9f7ff";
              c.font = "bold 10px 'Space Mono', monospace";
              c.textAlign = "center";
              c.fillText(`${racer.username} ${formatDistanceToFinish(racer.distance - W.distance)}`, arrowX, 48);
              c.restore();
            }
            continue;
          }
          const def: VehicleDef | undefined = VEHICLE_DEFS.find((vehicle) => vehicle.id === racer.vehicleId) ?? VEHICLE_DEFS[0];
          const paintColor = racer.paint ?? "#ffffff";
          let sprite: HTMLCanvasElement | HTMLImageElement | null = null;
          const racerModel = def?.model;
          if (racerModel === "musti") {
            sprite = remotePlayerSprites.get(paintColor) ?? null;
            if (!sprite && playerImg.current) {
              sprite = tintPlayer(playerImg.current, paintColor);
              remotePlayerSprites.set(paintColor, sprite);
            }
          } else if (racerModel) {
            sprite = vehicleSprite(racerModel, paintColor, W.pw, W.ph);
          }
          c.save();
          c.translate(racerX, racerY);
          if (sprite) {
            if (def?.cat === "bike") {
              const size = playerBikeRenderSize(W.pw, W.ph);
              drawBikeSprite(c, sprite as HTMLCanvasElement, W.pw, W.ph, -size.width / 2, -size.height / 2, size.width, size.height);
            } else {
              const carWidth = W.pw * 1.08;
              c.drawImage(sprite, -carWidth / 2, -W.ph / 2, carWidth, W.ph);
            }
          } else {
            c.fillStyle = color;
            c.fillRect(-W.pw / 2, -W.ph / 2, W.pw, W.ph);
          }
          c.fillStyle = color;
          c.fillRect(-W.pw * 0.5, W.ph * 0.5 + 4, W.pw, 3);
          c.fillStyle = "#e9f7ff";
          c.font = "bold 11px 'Space Mono', monospace";
          c.textAlign = "center";
          c.fillText(racer.finished ? `${racer.username} 🏁` : racer.username, 0, -W.ph * 0.62, W.laneW * 1.6);
          c.restore();
        }
      }
      // player
      const blink = W.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) {
        c.save(); c.translate(W.px, W.py); c.rotate(W.heading);
        const selectedVehicleIsBike = VEHICLE_DEFS.some(
  (vehicle) =>
    vehicle.id === selectedVehicleRef.current &&
    vehicle.cat === "bike"
);

if (!selectedVehicleIsBike) {
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.roundRect(
    -W.pw / 2 + 5,
    -W.ph / 2 + 8,
    W.pw,
    W.ph,
    W.pw * 0.3
  );
  c.fill();
}
        if (W.boosting) { c.shadowColor = "#4cc3ff"; c.shadowBlur = 30; }

const selectedDef = VEHICLE_DEFS.find(
  (vehicle) => vehicle.id === selectedVehicleRef.current
);
const spr =
  selectedDef && selectedDef.model !== "musti"
    ? vehicleSprite(
        selectedDef.model,
        settingsRef.current.paint,
        W.pw,
        W.ph
      )
    : playerSprite.current;


if (spr) {
  if (selectedDef?.cat === "bike") {
    const size = playerBikeRenderSize(W.pw, W.ph);
    drawBikeSprite(
      c,
      spr as HTMLCanvasElement,
      W.pw,
      W.ph,
      -size.width / 2,
      -size.height / 2,
      size.width,
      size.height,
    );
  } else {
    const carWidth = W.pw * 1.08;
    c.drawImage(spr, -carWidth / 2, -W.ph / 2, carWidth, W.ph);
  }
}

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
      sfx.current.engine(W.speed, ph === "playing", W.heat, t, {
        maxSpeed: W.vehiclePerformance.maxSpeed,
        boosting: W.boosting,
        braking: input.current.down,
        drifting: Math.abs(W.drift) > 0.35,
        dt,
      });
      hudT += dt;
      if (hudT > 0.1 && ph === "playing") { hudT = 0; setHud({ score: scoreFor(W.distance, W.time) + Math.floor(W.bonus), speed: Math.round(W.speed * 0.26), lives: W.lives, progress: Math.min(1, W.distance / MULTIPLAYER_RACE_LENGTH), boost: W.boost, heat: W.heat, drift: W.drift, traction: W.traction, wantedLevel: W.pursuit.wantedLevel, policeWarning: W.policeWarning });
        const onlineRace = multiplayerRaceRef.current;
        if (onlineRace || careerRef.current) {
          const dots = [{ id: "me", p: Math.min(1, W.distance / MULTIPLAYER_RACE_LENGTH), color: SEAT_COLORS[onlineRace?.seat ?? 0] ?? "#ffffff", me: true, name: "You" }];
          const others: { userId: string; distance: number }[] = [];
          for (const racer of W.remoteViews.values()) {
            dots.push({ id: racer.userId, p: Math.max(0, Math.min(1, racer.distance / MULTIPLAYER_RACE_LENGTH)), color: SEAT_COLORS[racer.seat] ?? "#aaaaaa", me: false, name: racer.username });
            others.push({ userId: racer.userId, distance: racer.distance });
          }
          setMapDots(dots);
          setLivePlace(liveRaceOrder("me", W.distance, others));
          if (debugRef.current && onlineRace) {
            const nowMs = performance.now();
            setNetDebug([...W.remoteViews.values()].map((racer) => `${racer.username}: ${racer.lastLiveAt ? `${Math.round(nowMs - racer.lastLiveAt)} ms since live packet` : "NO LIVE PACKETS"} · ${Math.round(racer.speed)} u/s`).join("\n"));
          }
        }
      }
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
  const unlockedAchievementIds = new Set(progression.unlockedAchievements);
  const achievementValue = (id: AchievementId) => {
    if (id === "first-race") return `${Math.min(1, progression.completedRaces)} / 1`;
    if (id === "rookie-racer") return `${Math.min(1000, progression.bestScore).toLocaleString()} / 1,000 best`;
    if (id === "high-scorer") return `${Math.min(5000, progression.bestScore).toLocaleString()} / 5,000 best`;
    if (id === "coin-collector") return `${Math.min(25, progression.lifetimeCoins)} / 25 coins`;
    if (id === "near-miss-expert") return `${Math.min(10, progression.lifetimeNearMisses)} / 10 near misses`;
    return "One race · 60 seconds";
  };

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
              <div className="hud-label" style={{ color: "#ffe36e", opacity: 1 }}>
                COINS {garageBalance?.toLocaleString() ?? "0"} Jaa'izah
              </div>
            </div>
            <div className="hud-panel hud-center">
              <div className="hud-value">{hud.speed}<span className="hud-label ml-1">km/h</span></div>
              {multiplayerRace || careerRun ? (
                <div className="race-map" aria-label="Race map">
                  <div className="race-map-top">
                    <span className="race-map-place">P{livePlace}/{Math.max(1, mapDots.length)}</span>
                    <span className="race-map-dist">{formatDistanceToFinish((1 - hud.progress) * MULTIPLAYER_RACE_LENGTH)} to finish</span>
                  </div>
                  <div className="race-map-track">
                    <div className="race-map-fill" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
                    {mapDots.map((dot) => (
                      <span
                        key={dot.id}
                        className={dot.me ? "race-dot race-dot-me" : "race-dot"}
                        style={{ left: `${dot.p * 100}%`, background: dot.color }}
                        title={dot.name}
                      />
                    ))}
                    <span className="race-map-flag" aria-hidden="true">🏁</span>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex justify-center gap-1" aria-label={`${hud.lives} lives left`}>
                  {Array.from({ length: MAX_LIVES }).map((_, i) => <span key={i} className={i < hud.lives ? "life-pip" : "life-pip life-pip-empty"} />)}
                </div>
              )}
              <div className="meter mt-1.5"><div className="meter-fill-boost" style={{ width: `${(hud.boost / world.current.boostCapacity) * 100}%` }} /></div>
              <div className="meter mt-1"><div className="meter-fill-grip" style={{ width: `${hud.traction * 100}%` }} /></div>
              <div className="hud-label">{hud.drift > 0.3 ? "Drifting!" : "Nitro · Grip"}</div>
            </div>
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? "🔊" : "🔇"}</button>
                <button className="icon-btn" onClick={togglePause} aria-label={phase === "paused" ? "Resume" : "Pause"}>{phase === "paused" ? "▶" : "❚❚"}</button>
              </div>
              <div
                className={`heat-badge wanted-badge wanted-${hud.wantedLevel} ${hud.policeWarning > 0 ? "police-warning" : ""}`}
                role="status"
                aria-live="polite"
              >
                {hud.wantedLevel === 0
                  ? "WANTED 0"
                  : hud.wantedLevel === 1
                    ? "POLICE ALERT · LEVEL 1"
                    : hud.wantedLevel === 2
                      ? "PURSUIT · LEVEL 2"
                      : "HIGH PRESSURE · LEVEL 3"}
              </div>
              {walletError && (
                <div
                  role="alert"
                  className="hud-label"
                  style={{ color: "#ff8e8e", opacity: 1, maxWidth: 180, textAlign: "right" }}
                >
                  {walletError}
                </div>
              )}
              {multiplayerSyncMessage && (
                <div
                  role="status"
                  className="hud-label"
                  style={{ color: "#ffcf72", opacity: 1, maxWidth: 180, textAlign: "right" }}
                >
                  {multiplayerSyncMessage}
                </div>
              )}
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
                <div className="hero-wrap"><img src={heroImgSrc} alt="White supercar under blue and red police lights" width={1280} height={720} className="hero-img" /></div>
                <div className="menu-col">
                  <p className="kicker">Arcade pursuit racer</p>
                  {multiplayerSyncMessage && (
                    <p className="note note-warn" role="alert">{multiplayerSyncMessage}</p>
                  )}
                  <h1 className="title">MUSTI<br />CAR RACING</h1>
                  <button className="cta" onClick={start}>RACE NOW</button>
                  <nav className="menu-grid" aria-label="Main menu">
                    <button className="btn-secondary" onClick={() => setScreen("garage")}>Garage</button>
                    <button className="btn-secondary" onClick={() => setScreen("howto")}>How to play</button>
                    <button className="btn-secondary" onClick={() => setScreen("career")}>Career</button>
                    <button className="btn-secondary" onClick={() => setScreen("multi")}>Multiplayer</button>
                    <button className="btn-secondary" onClick={() => setScreen("controls")}>Controls</button>
                    <button className="btn-secondary" onClick={() => setScreen("achievements")}>Achievements</button>
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

            {screenName === "career" && (
              <div className="menu-card career-card">
                <h2 className="screen-title">CAREER</h2>
                <p className="note">Race three AI rivals over the full course. Finish on the podium to open the next cup and win Jaa'izah.</p>
                <div className="career-tiers">
                  {CAREER_TIERS.map((tier, index) => {
                    const locked = index >= career.unlocked;
                    const best = career.best[tier.id];
                    return (
                      <div key={tier.id} className={locked ? "career-tier career-locked" : "career-tier"}>
                        <div className="career-info">
                          <strong>{tier.name}</strong>
                          <span className="hud-label">{tier.blurb}</span>
                          <span className="note">Prizes: 1st {tier.rewards[0]} · 2nd {tier.rewards[1]} · 3rd {tier.rewards[2]} Jaa'izah</span>
                          {best ? <span className="hud-label">Best finish: #{best}</span> : null}
                        </div>
                        <button className="cta career-btn" disabled={locked} onClick={() => startCareer(tier.id)}>
                          {locked ? "LOCKED" : "START"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button className="btn-secondary" onClick={() => setScreen("home")}>BACK</button>
              </div>
            )}

{screenName === "garage" && (
  <div className="menu-card">
    <h2 className="screen-title">VEHICLE GARAGE</h2>

    <p className="note">
      Unlock your next ride with Jaa'izah. Your first car is free!
    </p>

    <div className="garage-wallet">
      <span>YOUR BALANCE</span>
      <strong>
        {garageBalance === null
          ? "Guest profile required"
          : `${garageBalance.toLocaleString()} Jaa'izah`}
      </strong>
    </div>


<div className="garage-showroom">
  <button
    className="garage-arrow"
    aria-label="Previous vehicle"
    onClick={() =>
      setGarageIndex((i) => (i - 1 + VEHICLE_DEFS.length) % VEHICLE_DEFS.length)
    }
  >
    &#10094;
  </button>

  {(() => {
    const vehicle = VEHICLE_DEFS[garageIndex];
    if (!vehicle) return null;
    const vehicleModel = vehicle.model;
    const owned = ownedVehicles.includes(vehicle.id);
    const selected = selectedVehicle === vehicle.id;
    const price = VEHICLE_PRICES[vehicle.id] ?? 0;

    return (
      <div className="garage-feature">
        <div className="garage-stage">
          {vehicleModel === "musti" ? (
            <img
              className="garage-feature-image"
              src={playerImgSrc}
              alt={vehicle.name}
              style={{ filter: `drop-shadow(0 0 24px ${settings.paint})` }}
            />
          ) : (
            <canvas
              className="garage-feature-canvas"
              ref={(node) => {
                if (!node) return;
                const ctx = node.getContext("2d");
                if (!ctx) return;
                ctx.clearRect(0, 0, node.width, node.height);
                const sprite = vehicleSprite(
                  vehicleModel,
                  settings.paint,
                  105,
                  180,
                );
                if (vehicle.cat === "bike") {
                  const previewWidth = 126;
                  const previewHeight = 216;
                  const position = centeredBikePreviewPosition(
                    node.width,
                    node.height,
                    previewWidth,
                    previewHeight,
                  );
                  drawBikeSprite(
                    ctx,
                    sprite,
                    105,
                    180,
                    position.x,
                    position.y,
                    previewWidth,
                    previewHeight,
                  );
                } else {
                  const previewWidth = sprite.width / 2;
                  const previewHeight = sprite.height / 2;
                  ctx.drawImage(
                    sprite,
                    (node.width - previewWidth) / 2,
                    (node.height - previewHeight) / 2,
                    previewWidth,
                    previewHeight,
                  );
                }
              }}
              width={300}
              height={260}
              aria-label={`${vehicle.name} vehicle preview`}
            />
          )}

          <span className="garage-stage-number">
            {String(garageIndex + 1).padStart(2, "0")} / {VEHICLE_DEFS.length}
          </span>
        </div>

        <p className="garage-vehicle-type">
          {vehicle.cat === "bike" ? "MOTORCYCLE" : "PERFORMANCE CAR"}
        </p>

        <h2 className="garage-feature-name">{vehicle.name}</h2>
        <p className="garage-feature-description">{vehicle.blurb}</p>

        <div className="garage-performance">
          {[
            ["TOP SPEED", vehicle.stats.speed],
            ["ACCELERATION", vehicle.stats.accel],
            ["GRIP", vehicle.stats.grip],
            ["BRAKING", vehicle.stats.brake],
          ].map(([label, value]) => (
            <div className="garage-stat" key={label}>
              <div className="garage-stat-heading">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="garage-stat-track">
                <div
                  className="garage-stat-fill"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="garage-feature-footer">
          <div className="garage-feature-price">
            <span>{owned ? "OWNED VEHICLE" : "UNLOCK PRICE"}</span>
            <strong>
              {owned ? "UNLOCKED" : `${price.toLocaleString()} Jaa'izah`}
            </strong>
          </div>

          <button
            className="cta garage-action"
            onClick={() => purchaseOrSelectVehicle(vehicle.id)}
          >
            {selected
              ? "CURRENT RIDE"
              : owned
                ? "SELECT VEHICLE"
                : "BUY VEHICLE"}
          </button>
          {owned && (
            <button
              className="btn-secondary"
              onClick={() => {
                chooseUpgradeVehicle(vehicle.id);
                setScreen("upgrades");
              }}
            >
              TUNE THIS VEHICLE
            </button>
          )}
        </div>
      </div>
    );
  })()}

  <button
    className="garage-arrow"
    aria-label="Next vehicle"
    onClick={() =>
      setGarageIndex((i) => (i + 1) % VEHICLE_DEFS.length)
    }
  >
    &#10095;
  </button>
</div>


    {garageMessage && (
      <p className="garage-message" role="status">
        {garageMessage}
      </p>
    )}

    <div className="garage-customisation">
      <h3>Paint Customisation</h3>

      <div className="swatches" role="radiogroup" aria-label="Paint colour">
        {PLAYER_PAINTS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={settings.paint === p.id}
            aria-label={p.name}
            title={p.name}
            className={`swatch ${settings.paint === p.id ? "swatch-on" : ""}`}
            style={{ background: p.id }}
            onClick={() => saveSettings({ paint: p.id })}
          />
        ))}
      </div>

      <p className="hud-label">
        {PLAYER_PAINTS.find((p) => p.id === settings.paint)?.name ?? "Custom"}
      </p>

      <label className="field">
        Driver name
        <input
          maxLength={16}
          value={settings.name}
          onChange={(e) => saveSettings({ name: e.target.value })}
        />
      </label>
    </div>

    <button className="cta" onClick={() => setScreen("home")}>
      BACK TO HOME
    </button>
  </div>
)}

{screenName === "upgrades" && (
  <div className="menu-card upgrades-screen">
    <p className="kicker">Workshop</p>
    <h2 className="screen-title">VEHICLE UPGRADES</h2>
    <p className="note">
      Every ride starts stock at level 0. Tune owned vehicles independently; changes take effect the next time you race in that vehicle.
    </p>
    <div className="garage-wallet">
      <span>YOUR BALANCE</span>
      <strong>
        {garageBalance === null
          ? "Guest profile required"
          : `${garageBalance.toLocaleString()} Jaa'izah`}
      </strong>
    </div>
    <label className="field">
      Owned vehicle
      <select
        className="upgrade-vehicle-select"
        value={upgradeVehicleId}
        onChange={(event) => chooseUpgradeVehicle(event.target.value)}
      >
        {ownedVehicles.map((vehicleId) => {
          const vehicle = VEHICLE_DEFS.find((item) => item.id === vehicleId);
          return vehicle ? (
            <option key={vehicleId} value={vehicleId}>
              {vehicle.name}{selectedVehicle === vehicleId ? " · Current ride" : ""}
            </option>
          ) : null;
        })}
      </select>
    </label>
    {upgradeMessage && (
      <p className="garage-message" role="status">{upgradeMessage}</p>
    )}
    <div className="upgrade-list">
      {UPGRADE_CATEGORIES.map((category) => {
        const definition = UPGRADE_DEFINITIONS[category];
        const level = upgradeLevels[category];
        const cost = nextUpgradeCost(category, level);
        const affordable = cost !== null && garageBalance !== null && garageBalance >= cost;
        return (
          <article className="upgrade-card" key={category}>
            <div className="upgrade-card-heading">
              <div>
                <h3>{definition.title}</h3>
                <p>Level {level} / {MAX_UPGRADE_LEVEL}</p>
              </div>
              <div className="upgrade-level-pips" aria-label={`Upgrade level ${level} of ${MAX_UPGRADE_LEVEL}`}>
                {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, index) => (
                  <span key={index} className={index < level ? "upgrade-pip upgrade-pip-on" : "upgrade-pip"} />
                ))}
              </div>
            </div>
            {cost === null ? (
              <>
                <p className="upgrade-benefit">Maximum level reached</p>
                <button className="upgrade-buy" disabled>MAX LEVEL</button>
              </>
            ) : (
              <>
                <p className="upgrade-benefit">
                  Next: Level {level + 1} · {upgradeBenefit(category, level + 1)}
                </p>
                <button
                  className={`upgrade-buy ${affordable ? "upgrade-buy-affordable" : "upgrade-buy-unaffordable"}`}
                  disabled={!affordable}
                  onClick={() => buyUpgrade(category)}
                >
                  {garageBalance === null
                    ? `${cost.toLocaleString()} Jaa'izah`
                    : affordable
                      ? `BUY · ${cost.toLocaleString()} Jaa'izah`
                      : `NEED ${(cost - garageBalance).toLocaleString()} MORE`}
                </button>
              </>
            )}
          </article>
        );
      })}
    </div>
    <div className="upgrade-actions">
      <button className="btn-secondary" onClick={() => setScreen("garage")}>BACK TO GARAGE</button>
      <button className="cta" onClick={() => setScreen("home")}>BACK TO HOME</button>
    </div>
  </div>
)}

            {screenName === "howto" && (
              <div className="menu-card">
                <h2 className="screen-title">How to play</h2>
                <ul className="howto">
                  <li><b>Steer</b> <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> · touch arrows · or tilt your phone</li>
                  <li><b>Gas / Brake</b> <kbd>↑</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>S</kbd> · BRAKE button</li>
                  <li><b>Nitro</b> <kbd>Space</kbd> / <kbd>Shift</kbd> · NITRO button. Collect glowing road canisters and make near misses to refill it.</li>
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
                <MultiplayerLobby
                  onRaceStart={startMultiplayerRace}
                  onBack={() => setScreen("home")}
                  vehicleId={selectedVehicle}
                  paint={settings.paint}
                />
                <h3 className="hud-label mt-4">Local leaderboard · this device</h3>
                <ol className="board">
                  {board.length === 0 && <li className="note">No races yet.</li>}
                  {board.slice(0, 5).map((e, i) => <li key={e.date}><span>{i + 1}. {e.name}</span><span>{e.score.toLocaleString()} · {e.time.toFixed(0)}s</span></li>)}
                </ol>
                <p className="note">Points and trophies only — no cash prizes.</p>

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

            {screenName === "achievements" && (
              <div className="menu-card achievements-screen">
                <p className="kicker">Driver progression</p>
                <h2 className="screen-title">Achievements</h2>
                <div className="progression-summary">
                  <span>{progression.completedRaces} races</span>
                  <span>{progression.lifetimeCoins} road coins</span>
                  <span>{progression.lifetimeNearMisses} near misses</span>
                  <span>{(progression.totalDistance / 1000).toFixed(2)} km</span>
                </div>
                {progressionError && <p className="note note-warn" role="alert">{progressionError}</p>}
                <div className="achievement-list">
                  {ACHIEVEMENTS.map((achievement) => {
                    const unlocked = unlockedAchievementIds.has(achievement.id);
                    const rewardClaimed = progression.claimedAchievementRewards.includes(achievement.id);
                    return (
                      <article
                        key={achievement.id}
                        className={`achievement-card ${unlocked ? "achievement-unlocked" : ""}`}
                      >
                        <div className="achievement-heading">
                          <strong>{achievement.title}</strong>
                          <span>{unlocked ? "UNLOCKED" : "LOCKED"}</span>
                        </div>
                        <p>{achievement.description}</p>
                        <div className="achievement-footer">
                          <span>{achievementValue(achievement.id)}</span>
                          <span>{rewardClaimed ? `+${achievement.reward} CLAIMED` : `REWARD ${achievement.reward}`}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <button className="cta" onClick={() => setScreen("home")}>BACK TO HOME</button>
              </div>
            )}
          </div>
        )}


        {netDebug && multiplayerRace && phase === "playing" && <pre className="net-debug">{netDebug}</pre>}

        {multiplayerRace && phase === "playing" && raceMenuOpen && (
          <div className="race-menu" role="dialog" aria-label="Race menu">
            <p className="note">The race keeps going for everyone.</p>
            <button className="cta race-menu-btn" onClick={() => setRaceMenuOpen(false)}>BACK TO RACE</button>
            <button className="btn-secondary" onClick={toMenu}>LEAVE RACE (DNF)</button>
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

        {phase === "over" && final && (
          <div className="menu">
            <div className="menu-card results-card">
              <p className="kicker">{multiplayerRace || careerResult ? "Finish line" : "Busted"}</p>
              <h2 className="screen-title">Race results</h2>
              <div className="final-score">{final.score.toLocaleString()}</div>
              {final.newBest ? <p className="new-best">★ New best score ★</p> : <p className="hud-label">Best {best.toLocaleString()}</p>}
              <p className="note">{settings.name} · #{final.rank} on this device</p>
              <div className="result-stats">
                <div><span>Distance</span><strong>{(final.distance / 1000).toFixed(2)} km</strong></div>
                <div><span>Time</span><strong>{final.time.toFixed(1)} s</strong></div>
                <div><span>Road coins</span><strong>{final.coinsCollected}</strong></div>
                <div><span>Near misses</span><strong>{final.nearMisses}</strong></div>
              </div>
              {final.unlockedNow.length > 0 && (
                <section className="results-unlocks" role="status" aria-live="polite">
                  <strong>ACHIEVEMENT UNLOCKED</strong>
                  {final.unlockedNow.map((id) => {
                    const achievement = ACHIEVEMENTS.find((item) => item.id === id);
                    return achievement ? (
                      <span key={id}>{achievement.title} · +{achievement.reward} Jaa'izah</span>
                    ) : null;
                  })}
                </section>
              )}
              {final.saveError && <p className="note note-warn" role="alert">{final.saveError}</p>}
              {multiplayerRace ? (
                <section className="race-standings" aria-live="polite">
                  <h3 className="hud-label">{onlinePlace ? `You finished #${onlinePlace}` : "Recording your finish…"}</h3>
                  {onlinePot && (
                    <p className={onlinePot.won ? "note pot-won" : "note"}>
                      {onlinePot.won
                        ? `You won the pot: +${onlinePot.pot.toLocaleString()} Jaa'izah`
                        : `The ${onlinePot.pot.toLocaleString()} Jaa'izah pot went to the winner.`}
                    </p>
                  )}
                  <ol className="board">
                    {onlineStandings.map((row, i) => (
                      <li key={row.userId} className={row.userId === onlineMyId ? "board-me" : ""}>
                        <span>{i + 1}. {row.username}{row.userId === onlineMyId ? " (you)" : ""}</span>
                        <span>{row.finished && row.finishSeconds !== null ? `${row.finishSeconds.toFixed(1)} s` : row.dnf ? "DNF" : "racing…"}</span>
                      </li>
                    ))}
                  </ol>
                  {roomMoved && <p className="note pot-won">A player already started the next round. Press REPLAY to join them.</p>}
                  {roomClosed && <p className="note note-warn">This room was closed. Leave the room to go back to the menu.</p>}
                  {!roomMoved && !allRacersDone(onlineStandings) && <p className="note">Waiting for the other racers to finish…</p>}
                  {onlineNote && <p className="note note-warn" role="alert">{onlineNote}</p>}
                </section>
              ) : careerResult ? (
                <section className="race-standings" aria-live="polite">
                  <h3 className="hud-label">{`${careerResult.tier.name}: you finished #${careerResult.place}`}</h3>
                  <p className={careerResult.prize > 0 ? "note pot-won" : "note"}>
                    {careerResult.prize > 0 ? `Prize: +${careerResult.prize.toLocaleString()} Jaa'izah` : "No prize this time."}
                  </p>
                  {careerResult.unlockedNext && <p className="note pot-won">New cup unlocked! Open the Career menu.</p>}
                  <ol className="board">
                    {careerResult.standings.map((row, i) => (
                      <li key={row.id} className={row.me ? "board-me" : ""}>
                        <span>{i + 1}. {row.name}</span>
                        <span>{row.finished ? `${row.seconds.toFixed(1)} s` : `≈ ${row.seconds.toFixed(1)} s`}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : (
                <ol className="board">
                  {board.slice(0, 5).map((e, i) => <li key={e.date} className={i + 1 === final.rank ? "board-me" : ""}><span>{i + 1}. {e.name}</span><span>{e.score.toLocaleString()}</span></li>)}
                </ol>
              )}
              {multiplayerRace ? (
                <>
                  <button className="cta" disabled={replayBusy || roomClosed || !(allRacersDone(onlineStandings) || roomMoved)} onClick={() => void replayOnline()}>{replayBusy ? "PLEASE WAIT…" : "REPLAY"}</button>
                  <button className="btn-secondary" disabled={replayBusy} onClick={toMenu}>LEAVE ROOM</button>
                </>
              ) : careerResult ? (
                <>
                  <button className="cta" onClick={() => startCareer(careerResult.tier.id)}>RACE AGAIN</button>
                  <button className="btn-secondary" onClick={() => { careerRef.current = null; setCareerRun(null); world.current.ai = []; setScreen("career"); setPhase("menu"); }}>CAREER MENU</button>
                </>
              ) : (
                <>
                  <button className="cta" onClick={start}>RACE AGAIN</button>
                  <button className="btn-secondary" onClick={() => { setScreen("garage"); setPhase("menu"); }}>GARAGE</button>
                </>
              )}
              {!multiplayerRace && <button className="ghost-btn mt-3" onClick={toMenu}>Main menu</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
