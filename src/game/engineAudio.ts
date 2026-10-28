/**
 * Engine sound for every car and bike, built live with the Web Audio API (no sound files).
 *
 * How it works (so it behaves like a real sports car instead of "just getting louder"):
 *  - The engine note is the firing frequency: rpm / 60 * cylinders / 2. Real engines make a
 *    stack of harmonics of that note, and each engine layout has its own mix (the profile's
 *    `spectrum`): a flat-plane V8 shrieks, a cross-plane V8 rumbles, a V10 wails.
 *  - A gearbox model maps speed to gear and rpm. Revs climb through each gear, drop at every
 *    upshift, blip on downshifts and bounce on the limiter. The engine has inertia.
 *  - Throttle changes the TONE (the filter opens, rasp comes in), not only the volume.
 *    Lifting off gives engine braking, exhaust pops and burble on the cars that do that.
 *  - Turbo cars have a spooling turbo whistle (with lag) and a blow-off hiss.
 *  - Wind and tyre noise add the feeling of speed on top.
 */

export type EngineProfile = {
  id: string;
  label: string;
  /** Cylinders. The engine note is rpm / 60 * cylinders / 2. */
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  /** Number of gears (cars 7, bikes 6). */
  gears: number;
  /** Strength of harmonics 1, 2, 3 ... of the engine note. This is the engine's "voice". */
  spectrum: number[];
  /** Low rumble at half the engine note, 0..1. */
  sub: number;
  /** Uneven firing (cross-plane / V4 growl), 0..1. */
  growl: number;
  /** Distortion amount. More = more aggressive. */
  drive: number;
  /** Filter openness (1 = normal). Higher = brighter, screamier. */
  brightness: number;
  /** Intake / exhaust rasp, 0..1. */
  rasp: number;
  /** Turbo whistle and blow-off, 0..1. */
  turbo: number;
  /** Exhaust pops and burble when lifting and shifting, 0..1. */
  pops: number;
  /** Electric / gear whine (hybrids), 0..1. */
  whine: number;
  /** Overall loudness, 0..1. */
  volume: number;
  /** How long a gear change cuts the power, in milliseconds. */
  shiftMs: number;
};

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  lamborghini: { id: "lamborghini", label: "Lamborghini V10", cylinders: 10, idleRpm: 1000, redlineRpm: 8500, gears: 7, spectrum: [1, 0.78, 0.62, 0.46, 0.34, 0.24, 0.17, 0.12, 0.08], sub: 0.2, growl: 0.03, drive: 2.0, brightness: 1.15, rasp: 0.45, turbo: 0, pops: 0.5, whine: 0.1, volume: 0.16, shiftMs: 70 },
  musti: { id: "musti", label: "Musti V12", cylinders: 12, idleRpm: 900, redlineRpm: 8200, gears: 7, spectrum: [1, 0.72, 0.66, 0.5, 0.42, 0.32, 0.22, 0.16, 0.1], sub: 0.3, growl: 0.02, drive: 1.8, brightness: 1.1, rasp: 0.4, turbo: 0, pops: 0.35, whine: 0.08, volume: 0.16, shiftMs: 90 },
  ferrari: { id: "ferrari", label: "Ferrari flat-plane V8", cylinders: 8, idleRpm: 1100, redlineRpm: 8900, gears: 7, spectrum: [1, 0.8, 0.3, 0.5, 0.15, 0.3, 0.1, 0.15], sub: 0.12, growl: 0.0, drive: 2.4, brightness: 1.3, rasp: 0.55, turbo: 0.35, pops: 0.6, whine: 0.05, volume: 0.15, shiftMs: 60 },
  mclaren: { id: "mclaren", label: "McLaren twin-turbo V8", cylinders: 8, idleRpm: 950, redlineRpm: 8100, gears: 7, spectrum: [1, 0.7, 0.45, 0.5, 0.28, 0.26, 0.14, 0.12], sub: 0.45, growl: 0.12, drive: 1.9, brightness: 1.0, rasp: 0.5, turbo: 0.85, pops: 0.4, whine: 0.06, volume: 0.16, shiftMs: 65 },
  mercedes: { id: "mercedes", label: "Mercedes-AMG V8", cylinders: 8, idleRpm: 800, redlineRpm: 7200, gears: 7, spectrum: [1, 0.55, 0.5, 0.35, 0.3, 0.2, 0.18, 0.1], sub: 0.85, growl: 0.55, drive: 2.8, brightness: 0.85, rasp: 0.65, turbo: 0.25, pops: 0.95, whine: 0, volume: 0.18, shiftMs: 80 },
  amgone: { id: "amgone", label: "Mercedes-AMG ONE hybrid V6", cylinders: 6, idleRpm: 1200, redlineRpm: 11000, gears: 7, spectrum: [1, 0.85, 0.6, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12, 0.08], sub: 0.1, growl: 0, drive: 1.5, brightness: 1.4, rasp: 0.5, turbo: 0.6, pops: 0.3, whine: 0.7, volume: 0.15, shiftMs: 45 },
  bugatti: { id: "bugatti", label: "Bugatti quad-turbo W16", cylinders: 16, idleRpm: 700, redlineRpm: 6700, gears: 7, spectrum: [0.9, 1, 0.55, 0.38, 0.22, 0.14, 0.08], sub: 0.75, growl: 0, drive: 1.2, brightness: 0.8, rasp: 0.25, turbo: 1.0, pops: 0.1, whine: 0.15, volume: 0.17, shiftMs: 120 },
  ducati: { id: "ducati", label: "Ducati V4", cylinders: 4, idleRpm: 1600, redlineRpm: 14500, gears: 6, spectrum: [1, 0.6, 0.5, 0.45, 0.3, 0.25, 0.15, 0.12], sub: 0.3, growl: 0.4, drive: 2.0, brightness: 1.1, rasp: 0.55, turbo: 0, pops: 0.5, whine: 0.1, volume: 0.12, shiftMs: 40 },
  bmw: { id: "bmw", label: "BMW inline-4", cylinders: 4, idleRpm: 1500, redlineRpm: 14500, gears: 6, spectrum: [1, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1], sub: 0.08, growl: 0.02, drive: 1.6, brightness: 1.3, rasp: 0.45, turbo: 0, pops: 0.3, whine: 0.2, volume: 0.12, shiftMs: 40 },
  yamaha: { id: "yamaha", label: "Yamaha crossplane R1", cylinders: 4, idleRpm: 1400, redlineRpm: 14000, gears: 6, spectrum: [1, 0.5, 0.45, 0.3, 0.28, 0.2, 0.12], sub: 0.55, growl: 0.7, drive: 2.2, brightness: 1.0, rasp: 0.55, turbo: 0, pops: 0.4, whine: 0.1, volume: 0.12, shiftMs: 45 },
  muscle: { id: "muscle", label: "American V8", cylinders: 8, idleRpm: 700, redlineRpm: 6200, gears: 6, spectrum: [1, 0.5, 0.55, 0.3, 0.28, 0.16, 0.14], sub: 0.9, growl: 0.6, drive: 2.8, brightness: 0.7, rasp: 0.6, turbo: 0, pops: 0.7, whine: 0, volume: 0.18, shiftMs: 140 },
  generic: { id: "generic", label: "Inline-4", cylinders: 4, idleRpm: 900, redlineRpm: 7000, gears: 6, spectrum: [1, 0.5, 0.35, 0.25, 0.15, 0.1], sub: 0.35, growl: 0.05, drive: 1.4, brightness: 0.9, rasp: 0.3, turbo: 0, pops: 0.15, whine: 0, volume: 0.14, shiftMs: 110 },
};

const CAR_CHOICES = ["lamborghini", "ferrari", "mclaren", "mercedes", "bugatti"] as const;

export type VehicleLike = { id: string; name?: string; model?: string; cat?: string };

/** Picks the engine character from the vehicle's name (or a stable choice for unknown vehicles). */
export function engineProfileFor(vehicle: VehicleLike | undefined): EngineProfile {
  if (!vehicle) return ENGINE_PROFILES["generic"]!;
  const text = `${vehicle.id} ${vehicle.name ?? ""} ${vehicle.model ?? ""}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/amg.?one/, "amgone"],
    [/\bmusti\b/, "musti"],
    [/lambo|huracan|huracán|aventador|\bsto\b|urus/, "lamborghini"],
    [/ferrari|\bf8\b|296|sf90|488|roma/, "ferrari"],
    [/mclaren|765|720s|750s|artura/, "mclaren"],
    [/mercedes|\bamg\b/, "mercedes"],
    [/bugatti|chiron|veyron|tourbillon/, "bugatti"],
    [/ducati|panigale/, "ducati"],
    [/bmw|m ?1000|s ?1000/, "bmw"],
    [/yamaha|\br1\b|r6/, "yamaha"],
    [/muscle|brute|mustang|camaro|charger/, "muscle"],
  ];
  for (const [pattern, key] of rules) {
    if (pattern.test(text)) return ENGINE_PROFILES[key]!;
  }
  if (vehicle.cat === "bike") {
    const bikes = ["ducati", "bmw", "yamaha"] as const;
    return ENGINE_PROFILES[bikes[hashText(vehicle.id) % bikes.length]!]!;
  }
  if (vehicle.model === "sedan" || vehicle.model === "suv") return ENGINE_PROFILES["generic"]!;
  return ENGINE_PROFILES[CAR_CHOICES[hashText(vehicle.id) % CAR_CHOICES.length]!]!;
}

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/* ---------- gearbox and revs (pure, so they can be tested) ---------- */

/** The top speed of each gear as a fraction of the vehicle's top speed (the last gear is 1). */
export function gearCeilings(gears: number): number[] {
  const count = Math.max(2, Math.round(gears));
  return Array.from({ length: count }, (_, index) => Math.pow((index + 1) / count, 0.9));
}

/** Which gear the car is in, and how far through that gear. */
export function gearForSpeed(speed: number, maxSpeed: number, gears = 6): { gear: number; frac: number } {
  const top = Math.max(1, maxSpeed);
  const ceilings = gearCeilings(gears);
  let low = 0;
  for (let index = 0; index < ceilings.length; index++) {
    const high = ceilings[index]! * top;
    if (speed <= high || index === ceilings.length - 1) {
      return { gear: index + 1, frac: clamp((speed - low) / Math.max(1, high - low), 0, 1) };
    }
    low = high;
  }
  return { gear: ceilings.length, frac: 1 };
}

/** 0 = idle, 1 = redline. After a gear change the revs drop to about half. */
export function rpmFraction(gear: number, frac: number): number {
  return gear <= 1 ? 0.14 + 0.86 * frac : 0.5 + 0.5 * frac;
}

/** The note an engine makes: crankshaft turns per second times firings per turn. */
export function engineNoteHz(profile: EngineProfile, rpmFrac: number): number {
  const rpm = profile.idleRpm + (profile.redlineRpm - profile.idleRpm) * clamp(rpmFrac, 0, 1);
  return Math.max(28, (rpm / 60) * (profile.cylinders / 2));
}

export type EngineState = { rpm: number; gear: number };

export type EngineStep = {
  state: EngineState;
  rpmFrac: number;
  /** "up" or "down" in the frame the gear changed. */
  shifted: "up" | "down" | null;
  /** True while the rev limiter is cutting. */
  limiter: boolean;
};

export function startingEngineState(profile: EngineProfile): EngineState {
  return { rpm: profile.idleRpm, gear: 1 };
}

/**
 * Advances the engine by dt seconds. Gears have a little hysteresis so they do not chatter,
 * and the revs follow the target with inertia: they climb quickly, fall more slowly.
 */
export function stepEngine(
  previous: EngineState,
  profile: EngineProfile,
  input: { speed: number; maxSpeed: number; throttle: number },
  dt: number,
): EngineStep {
  const ceilings = gearCeilings(profile.gears);
  const top = Math.max(1, input.maxSpeed);
  let gear = clamp(previous.gear, 1, ceilings.length);
  let shifted: "up" | "down" | null = null;

  while (gear < ceilings.length && input.speed > ceilings[gear - 1]! * top) {
    gear += 1;
    shifted = "up";
  }
  while (gear > 1 && input.speed < ceilings[gear - 2]! * top * 0.9) {
    gear -= 1;
    shifted = shifted === "up" ? null : "down";
  }

  const low = gear > 1 ? ceilings[gear - 2]! * top : 0;
  const high = ceilings[gear - 1]! * top;
  const frac = clamp((input.speed - low) / Math.max(1, high - low), 0, 1);
  const standing = input.speed < top * 0.02;
  const targetFrac = standing ? clamp(input.throttle, 0, 1) * 0.3 : rpmFraction(gear, frac);
  const target = profile.idleRpm + (profile.redlineRpm - profile.idleRpm) * targetFrac;

  const rate = target > previous.rpm ? 7 : 4.5;
  const rpm = previous.rpm + (target - previous.rpm) * (1 - Math.exp(-rate * Math.max(0, dt)));
  const rpmFrac = clamp((rpm - profile.idleRpm) / (profile.redlineRpm - profile.idleRpm), 0, 1);
  const limiter = rpmFrac > 0.985 && input.throttle > 0.5;
  return { state: { rpm, gear }, rpmFrac, shifted, limiter };
}

/**
 * Turbo pressure with lag: it builds slowly while on the throttle and drops quickly when you lift.
 * Returns the new pressure (0..1) and whether the throttle was just snapped shut (blow-off).
 */
export function stepTurbo(
  pressure: number,
  throttle: number,
  rpmFrac: number,
  dt: number,
): { pressure: number; blowOff: boolean } {
  const target = clamp(throttle, 0, 1) * clamp(rpmFrac * 1.4 - 0.1, 0, 1);
  const rate = target > pressure ? 1.1 : 4;
  const next = pressure + (target - pressure) * (1 - Math.exp(-rate * Math.max(0, dt)));
  return { pressure: next, blowOff: pressure > 0.45 && throttle < 0.25 && next < pressure - 0.02 };
}

/* ---------- phone audio unlock ---------- */

/** Phones keep Web Audio silent while the ring switch is off. These two tricks switch the page to "playback". */
let silentAudio: HTMLAudioElement | null = null;
export function unlockAudioSession(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* not supported */
  }
  try {
    if (!silentAudio) {
      // one second of silence as a tiny WAV file
      const sampleRate = 8000;
      const samples = sampleRate;
      const buffer = new ArrayBuffer(44 + samples);
      const view = new DataView(buffer);
      const write = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
      };
      write(0, "RIFF");
      view.setUint32(4, 36 + samples, true);
      write(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      write(36, "data");
      view.setUint32(40, samples, true);
      for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
      const blob = new Blob([buffer], { type: "audio/wav" });
      silentAudio = new Audio(URL.createObjectURL(blob));
      silentAudio.loop = true;
      silentAudio.volume = 0.01;
    }
    void silentAudio.play().catch(() => {
      /* needs a tap first; the next tap tries again */
    });
  } catch {
    /* ignore */
  }
}

/* ---------- the synthesiser ---------- */

export type DriveState = {
  speed: number;
  maxSpeed: number;
  active: boolean;
  enabled: boolean;
  boosting: boolean;
  braking: boolean;
  drifting: boolean;
  dt: number;
};

export class EngineSynth {
  private readonly ctx: AudioContext;
  private profile: EngineProfile = ENGINE_PROFILES["generic"]!;
  private engine: EngineState = startingEngineState(ENGINE_PROFILES["generic"]!);
  private readonly master: GainNode;
  private readonly amp: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly shaper: WaveShaperNode;
  private readonly oscMain: OscillatorNode;
  private readonly oscThick: OscillatorNode;
  private readonly oscSub: OscillatorNode;
  private readonly gainMain: GainNode;
  private readonly gainThick: GainNode;
  private readonly gainSub: GainNode;
  private readonly raspFilter: BiquadFilterNode;
  private readonly raspGain: GainNode;
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly whineOsc: OscillatorNode;
  private readonly whineGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly squealFilter: BiquadFilterNode;
  private readonly squealGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private lastSpeed = 0;
  private lastThrottle = 0;
  private throttle = 0;
  private turbo = 0;
  private cutUntil = 0;
  private limiterPhase = 0;
  private burbleAt = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.gain.value = 0.95;
    this.master.connect(compressor).connect(ctx.destination);

    // a short room so the engine does not sound dry and flat
    const reverb = ctx.createConvolver();
    const impulseLength = Math.floor(ctx.sampleRate * 0.4);
    const impulse = ctx.createBuffer(1, impulseLength, ctx.sampleRate);
    const impulseData = impulse.getChannelData(0);
    for (let i = 0; i < impulseLength; i++) impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 3);
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.13;
    reverb.connect(wet).connect(this.master);

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.amp.connect(this.master);
    this.amp.connect(reverb);

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1500;
    this.lowpass.Q.value = 0.8;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    this.setDrive(1.5);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    const makeOsc = (type: OscillatorType): [OscillatorNode, GainNode] => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 60;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(bus);
      osc.start();
      return [osc, gain];
    };
    [this.oscMain, this.gainMain] = makeOsc("sawtooth");
    [this.oscThick, this.gainThick] = makeOsc("sawtooth");
    [this.oscSub, this.gainSub] = makeOsc("sine");
    bus.connect(this.shaper).connect(this.lowpass).connect(this.amp);

    // noise for intake rasp, wind, tyre squeal and pops
    const length = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const loop = (): AudioBufferSourceNode => {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      return source;
    };

    const rasp = loop();
    this.raspFilter = ctx.createBiquadFilter();
    this.raspFilter.type = "bandpass";
    this.raspFilter.Q.value = 0.9;
    this.raspGain = ctx.createGain();
    this.raspGain.gain.value = 0;
    rasp.connect(this.raspFilter).connect(this.raspGain).connect(this.amp);
    rasp.start();

    const wind = loop();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass";
    this.windFilter.frequency.value = 700;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    const squeal = loop();
    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = "bandpass";
    this.squealFilter.frequency.value = 2400;
    this.squealFilter.Q.value = 9;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    squeal.connect(this.squealFilter).connect(this.squealGain).connect(this.master);
    squeal.start();

    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = "sine";
    this.turboOsc.frequency.value = 1800;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(this.master);
    this.turboOsc.start();

    this.whineOsc = ctx.createOscillator();
    this.whineOsc.type = "triangle";
    this.whineOsc.frequency.value = 2400;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whineOsc.connect(this.whineGain).connect(this.master);
    this.whineOsc.start();

    this.setProfile(this.profile);
  }

  private setDrive(amount: number): void {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount);
    }
    this.shaper.curve = curve;
  }

  /** Builds the engine's "voice": a wave made of the profile's harmonic mix. */
  private makeVoice(spectrum: number[]): PeriodicWave {
    const real = new Float32Array(spectrum.length + 1);
    const imag = new Float32Array(spectrum.length + 1);
    spectrum.forEach((amplitude, index) => {
      imag[index + 1] = amplitude;
    });
    return this.ctx.createPeriodicWave(real, imag);
  }

  setProfile(profile: EngineProfile): void {
    this.profile = profile;
    this.engine = startingEngineState(profile);
    this.turbo = 0;
    this.setDrive(profile.drive);
    const voice = this.makeVoice(profile.spectrum);
    this.oscMain.setPeriodicWave(voice);
    this.oscThick.setPeriodicWave(voice);
    const now = this.ctx.currentTime;
    this.gainMain.gain.setTargetAtTime(0.55, now, 0.05);
    this.gainThick.gain.setTargetAtTime(0.3, now, 0.05);
    this.gainSub.gain.setTargetAtTime(profile.sub * 0.6, now, 0.05);
  }

  /** A short burst of noise: exhaust pop, turbo blow-off. */
  private burst(frequency: number, seconds: number, volume: number, q = 1): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + seconds + 0.05);
  }

  /** The turbo blow-off: a hiss that falls in pitch. */
  private blowOff(strength: number): void {
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(3600, now);
    filter.frequency.exponentialRampToValueAtTime(1100, now + 0.45);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05 + 0.07 * strength, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + 0.55);
  }

  /** Call every frame. */
  update(state: DriveState): void {
    const now = this.ctx.currentTime;
    const profile = this.profile;
    const on = state.active && state.enabled;
    const dt = Math.max(0.001, state.dt);
    const speedRatio = clamp(state.speed / Math.max(1, state.maxSpeed), 0, 1);

    // throttle: estimated from how the speed is changing, smoothed so it does not flutter
    const accel = (state.speed - this.lastSpeed) / dt;
    const wanted = clamp(0.4 + accel / 240 + (state.boosting ? 0.5 : 0), 0, 1);
    this.throttle += (wanted - this.throttle) * (1 - Math.exp(-9 * dt));
    this.lastSpeed = state.speed;
    const throttle = state.braking ? Math.min(this.throttle, 0.1) : this.throttle;

    const step = stepEngine(this.engine, profile, { speed: state.speed, maxSpeed: state.maxSpeed, throttle }, dt);
    this.engine = step.state;
    const rpmFrac = step.rpmFrac;

    // gear changes: the power is cut for a moment, with a pop on cars that do that
    if (on && step.shifted === "up" && now > this.cutUntil) {
      this.cutUntil = now + profile.shiftMs / 1000;
      if (profile.pops > 0.25 && Math.random() < profile.pops) this.burst(350 + Math.random() * 150, 0.1, 0.06 * profile.pops, 2);
    }
    // downshift blip while braking
    if (on && step.shifted === "down" && profile.pops > 0.25) this.burst(420, 0.08, 0.05 * profile.pops, 2);

    // lifting off: engine braking, plus burble and crackle at high revs
    const lifting = throttle < 0.3 && this.lastThrottle > 0.5;
    if (on && lifting && rpmFrac > 0.5 && profile.pops > 0.3) {
      this.burst(260 + Math.random() * 220, 0.14, 0.09 * profile.pops, 1.4);
      this.burbleAt = now + 0.12;
    }
    if (on && throttle < 0.25 && rpmFrac > 0.4 && profile.pops > 0.5 && now > this.burbleAt && Math.random() < dt * 3 * profile.pops) {
      this.burst(230 + Math.random() * 200, 0.09, 0.05 * profile.pops, 1.4);
      this.burbleAt = now + 0.1;
    }
    this.lastThrottle = throttle;

    // turbo
    const turbo = stepTurbo(this.turbo, throttle, rpmFrac, dt);
    this.turbo = turbo.pressure;
    if (on && profile.turbo > 0.2 && turbo.blowOff) this.blowOff(profile.turbo);

    // rev limiter: the engine cuts in and out very fast
    if (step.limiter) this.limiterPhase += dt * 22;
    const limiterCut = step.limiter && Math.sin(this.limiterPhase * Math.PI * 2) > 0.2;
    const cutting = now < this.cutUntil || limiterCut;

    const note = engineNoteHz(profile, rpmFrac);
    const wobble = 1 + Math.sin(now * (3 + rpmFrac * 9)) * 0.008 * profile.growl * 4;
    const t = 0.03;
    this.oscMain.frequency.setTargetAtTime(note * wobble, now, t);
    this.oscThick.frequency.setTargetAtTime(note * (1.004 + profile.growl * 0.006), now, t);
    this.oscSub.frequency.setTargetAtTime(note * 0.5, now, t);
    this.gainSub.gain.setTargetAtTime(profile.sub * 0.6 * (1.15 - 0.6 * rpmFrac), now, 0.08);

    // throttle changes the tone: the filter opens and rasp comes in under load
    const load = clamp(throttle, 0, 1);
    const open = (700 + 6200 * Math.pow(rpmFrac, 0.8) * profile.brightness) * (0.45 + 0.55 * load) * (state.boosting ? 1.2 : 1);
    this.lowpass.frequency.setTargetAtTime(open, now, 0.05);

    const level = profile.volume * (0.4 + 0.6 * load) * (0.65 + 0.35 * rpmFrac) * (state.boosting ? 1.15 : 1) * (cutting ? 0.2 : 1);
    this.amp.gain.setTargetAtTime(on ? level : 0, now, on ? 0.04 : 0.12);

    this.raspFilter.frequency.setTargetAtTime(700 + 3600 * rpmFrac, now, 0.08);
    const rasp = profile.rasp * 0.12 * (0.15 + 0.85 * load) * (0.3 + 0.7 * rpmFrac) * (state.boosting ? 1.5 : 1);
    this.raspGain.gain.setTargetAtTime(on ? rasp : 0, now, 0.07);

    // turbo whistle follows the spooling pressure, not just the revs
    this.turboOsc.frequency.setTargetAtTime(1500 + 4200 * (0.3 + 0.7 * this.turbo) * (0.6 + 0.4 * rpmFrac), now, 0.06);
    this.turboGain.gain.setTargetAtTime(on ? profile.turbo * 0.02 * this.turbo : 0, now, 0.08);

    // electric / gear whine rises with the road speed
    this.whineOsc.frequency.setTargetAtTime(1800 + 5200 * speedRatio, now, 0.08);
    this.whineGain.gain.setTargetAtTime(on ? profile.whine * 0.008 * (0.3 + 0.7 * speedRatio) : 0, now, 0.1);

    // wind and road noise: the feeling of speed
    this.windFilter.frequency.setTargetAtTime(500 + 2600 * speedRatio, now, 0.1);
    this.windGain.gain.setTargetAtTime(on ? 0.07 * speedRatio * speedRatio : 0, now, 0.12);

    // tyre squeal while braking hard or drifting
    const squealing = (state.braking && state.speed > 350) || state.drifting;
    this.squealFilter.frequency.setTargetAtTime(2000 + state.speed * 1.2, now, 0.1);
    this.squealGain.gain.setTargetAtTime(on && squealing ? 0.035 : 0, now, 0.06);
  }
}
