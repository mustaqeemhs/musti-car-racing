/**
 * Engine sound for every car and bike, built live with the Web Audio API
 * (no sound files needed). Each brand gets its own character:
 * firing rate, brightness, turbo whistle, exhaust pops and so on.
 */

export type EngineProfile = {
  id: string;
  label: string;
  /** Cylinders. The engine note is rpm / 60 * cylinders / 2. */
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  /** 0..1 mix of the saw-tooth body, the square octave and the low sub tone. */
  saw: number;
  square: number;
  sub: number;
  /** Distortion amount (more = more aggressive). */
  drive: number;
  /** Filter openness (1 = normal). Higher = brighter, screamier. */
  brightness: number;
  /** Intake / exhaust rasp, 0..1. */
  rasp: number;
  /** Turbo whistle, 0..1. */
  turbo: number;
  /** Exhaust pops and crackles on gear changes and lifting off, 0..1. */
  pops: number;
  /** Uneven firing (crossplane / V4 growl), 0..1. */
  wobble: number;
  /** Overall loudness, 0..1. */
  volume: number;
};

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  lamborghini: { id: "lamborghini", label: "Lamborghini V10", cylinders: 10, idleRpm: 1000, redlineRpm: 8500, saw: 0.9, square: 0.45, sub: 0.25, drive: 2.2, brightness: 1.15, rasp: 0.5, turbo: 0, pops: 0.45, wobble: 0.05, volume: 0.15 },
  ferrari: { id: "ferrari", label: "Ferrari flat-plane V8", cylinders: 8, idleRpm: 1100, redlineRpm: 9000, saw: 0.85, square: 0.5, sub: 0.15, drive: 2.6, brightness: 1.3, rasp: 0.6, turbo: 0, pops: 0.55, wobble: 0.02, volume: 0.14 },
  mclaren: { id: "mclaren", label: "McLaren twin-turbo V8", cylinders: 8, idleRpm: 950, redlineRpm: 8000, saw: 0.8, square: 0.35, sub: 0.5, drive: 1.8, brightness: 1.0, rasp: 0.35, turbo: 0.8, pops: 0.35, wobble: 0.08, volume: 0.15 },
  mercedes: { id: "mercedes", label: "Mercedes-AMG V8", cylinders: 8, idleRpm: 800, redlineRpm: 7200, saw: 0.8, square: 0.3, sub: 0.85, drive: 3.0, brightness: 0.85, rasp: 0.7, turbo: 0.25, pops: 0.95, wobble: 0.1, volume: 0.17 },
  bugatti: { id: "bugatti", label: "Bugatti quad-turbo W16", cylinders: 16, idleRpm: 700, redlineRpm: 6700, saw: 0.7, square: 0.25, sub: 0.7, drive: 1.2, brightness: 0.75, rasp: 0.25, turbo: 1.0, pops: 0.15, wobble: 0.0, volume: 0.17 },
  ducati: { id: "ducati", label: "Ducati V4", cylinders: 4, idleRpm: 1600, redlineRpm: 14000, saw: 0.8, square: 0.45, sub: 0.1, drive: 2.0, brightness: 1.1, rasp: 0.5, turbo: 0, pops: 0.5, wobble: 0.15, volume: 0.12 },
  bmw: { id: "bmw", label: "BMW inline-4", cylinders: 4, idleRpm: 1500, redlineRpm: 14500, saw: 0.85, square: 0.4, sub: 0.08, drive: 1.6, brightness: 1.3, rasp: 0.45, turbo: 0, pops: 0.3, wobble: 0.03, volume: 0.12 },
  yamaha: { id: "yamaha", label: "Yamaha crossplane R1", cylinders: 4, idleRpm: 1400, redlineRpm: 14000, saw: 0.85, square: 0.4, sub: 0.12, drive: 2.2, brightness: 1.0, rasp: 0.55, turbo: 0, pops: 0.4, wobble: 0.35, volume: 0.12 },
  muscle: { id: "muscle", label: "American V8", cylinders: 8, idleRpm: 700, redlineRpm: 6200, saw: 0.8, square: 0.2, sub: 0.9, drive: 2.8, brightness: 0.7, rasp: 0.6, turbo: 0, pops: 0.7, wobble: 0.12, volume: 0.17 },
  generic: { id: "generic", label: "Inline-4", cylinders: 4, idleRpm: 900, redlineRpm: 7000, saw: 0.75, square: 0.3, sub: 0.35, drive: 1.4, brightness: 0.9, rasp: 0.3, turbo: 0, pops: 0.15, wobble: 0.05, volume: 0.14 },
};

const CAR_CHOICES = ["lamborghini", "ferrari", "mclaren", "mercedes", "bugatti"] as const;

export type VehicleLike = { id: string; name?: string; model?: string; cat?: string };

/** Picks the engine character from the car's name (or a stable choice for unknown cars). */
export function engineProfileFor(vehicle: VehicleLike | undefined): EngineProfile {
  if (!vehicle) return ENGINE_PROFILES["generic"]!;
  const text = `${vehicle.id} ${vehicle.name ?? ""} ${vehicle.model ?? ""}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/lambo|huracan|huracán|aventador|\bsto\b|urus|\bmusti\b/, "lamborghini"],
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

/** Which of 6 gears the car is in, and how far through that gear. */
export function gearForSpeed(speed: number, maxSpeed: number): { gear: number; frac: number } {
  const top = Math.max(1, maxSpeed);
  const ceilings = [0.16, 0.3, 0.46, 0.63, 0.8, 1.0];
  let low = 0;
  for (let index = 0; index < ceilings.length; index++) {
    const high = ceilings[index]! * top;
    if (speed <= high || index === ceilings.length - 1) {
      return { gear: index + 1, frac: clamp((speed - low) / Math.max(1, high - low), 0, 1) };
    }
    low = high;
  }
  return { gear: 6, frac: 1 };
}

/** 0 = idle, 1 = redline. After a gear change the revs drop to about half. */
export function rpmFraction(gear: number, frac: number): number {
  return gear <= 1 ? 0.14 + 0.86 * frac : 0.5 + 0.5 * frac;
}

/** The note an engine makes: crankshaft turns per second times firing strokes per turn. */
export function engineNoteHz(profile: EngineProfile, rpmFrac: number): number {
  const rpm = profile.idleRpm + (profile.redlineRpm - profile.idleRpm) * clamp(rpmFrac, 0, 1);
  return Math.max(28, (rpm / 60) * (profile.cylinders / 2));
}

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

export class EngineSynth {
  private readonly ctx: AudioContext;
  private profile: EngineProfile = ENGINE_PROFILES["generic"]!;
  private readonly master: GainNode;
  private readonly amp: GainNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly oscSaw: OscillatorNode;
  private readonly oscSquare: OscillatorNode;
  private readonly oscSub: OscillatorNode;
  private readonly oscThird: OscillatorNode;
  private readonly gainSaw: GainNode;
  private readonly gainSquare: GainNode;
  private readonly gainSub: GainNode;
  private readonly gainThird: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly raspFilter: BiquadFilterNode;
  private readonly raspGain: GainNode;
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly squealFilter: BiquadFilterNode;
  private readonly squealGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private lastSpeed = 0;
  private lastGear = 1;
  private shiftCutUntil = 0;
  private lastThrottle = 0;
  private wobblePhase = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(compressor).connect(ctx.destination);

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 1200;
    this.lowpass.Q.value = 0.9;
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    this.setDrive(1.5);

    const mix = ctx.createGain();
    mix.gain.value = 1;
    const makeOsc = (type: OscillatorType): [OscillatorNode, GainNode] => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 60;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(mix);
      osc.start();
      return [osc, gain];
    };
    [this.oscSaw, this.gainSaw] = makeOsc("sawtooth");
    [this.oscSquare, this.gainSquare] = makeOsc("square");
    [this.oscSub, this.gainSub] = makeOsc("sawtooth");
    [this.oscThird, this.gainThird] = makeOsc("triangle");
    mix.connect(this.shaper).connect(this.lowpass).connect(this.amp).connect(this.master);

    // noise used for intake rasp, tyre squeal and exhaust pops
    const length = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const rasp = ctx.createBufferSource();
    rasp.buffer = this.noiseBuffer;
    rasp.loop = true;
    this.raspFilter = ctx.createBiquadFilter();
    this.raspFilter.type = "bandpass";
    this.raspFilter.Q.value = 0.8;
    this.raspGain = ctx.createGain();
    this.raspGain.gain.value = 0;
    rasp.connect(this.raspFilter).connect(this.raspGain).connect(this.amp);
    rasp.start();

    const squeal = ctx.createBufferSource();
    squeal.buffer = this.noiseBuffer;
    squeal.loop = true;
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
    this.turboOsc.frequency.value = 1500;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(this.master);
    this.turboOsc.start();
  }

  private setDrive(amount: number): void {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount);
    }
    this.shaper.curve = curve;
  }

  setProfile(profile: EngineProfile): void {
    this.profile = profile;
    this.setDrive(profile.drive);
    const now = this.ctx.currentTime;
    this.gainSaw.gain.setTargetAtTime(profile.saw * 0.5, now, 0.05);
    this.gainSquare.gain.setTargetAtTime(profile.square * 0.35, now, 0.05);
    this.gainSub.gain.setTargetAtTime(profile.sub * 0.5, now, 0.05);
    this.gainThird.gain.setTargetAtTime(0.18, now, 0.05);
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

  /** Call every frame. */
  update(state: DriveState): void {
    const now = this.ctx.currentTime;
    const profile = this.profile;
    const on = state.active && state.enabled;

    const { gear, frac } = gearForSpeed(state.speed, state.maxSpeed);
    const rpmFrac = clamp(rpmFraction(gear, frac) + (state.boosting ? 0.04 : 0), 0, 1);
    const dt = Math.max(0.001, state.dt);
    const accel = (state.speed - this.lastSpeed) / dt;
    const throttle = clamp(0.42 + accel / 260 + (state.boosting ? 0.45 : 0), 0, 1);

    // gear changes: a brief power cut, a turbo blow-off or an exhaust pop
    if (on && gear > this.lastGear && now > this.shiftCutUntil) {
      this.shiftCutUntil = now + 0.09;
      if (profile.turbo > 0.2) this.burst(2600, 0.28, 0.05 + profile.turbo * 0.06, 0.6);
      if (profile.pops > 0.3 && Math.random() < profile.pops) this.burst(380, 0.1, 0.07 * profile.pops, 2);
    }
    // lifting off the throttle at high revs makes the car crackle
    if (on && this.lastThrottle > 0.7 && throttle < 0.35 && rpmFrac > 0.55 && profile.pops > 0.35) {
      this.burst(300 + Math.random() * 200, 0.12, 0.08 * profile.pops, 1.5);
    }
    this.lastGear = gear;
    this.lastThrottle = throttle;
    this.lastSpeed = state.speed;

    const cutting = now < this.shiftCutUntil;
    const note = engineNoteHz(profile, rpmFrac);
    this.wobblePhase += dt * (2 + rpmFrac * 6);
    const wobble = 1 + Math.sin(this.wobblePhase) * 0.012 * profile.wobble * 10;
    const t = 0.035;
    this.oscSaw.frequency.setTargetAtTime(note * wobble, now, t);
    this.oscSquare.frequency.setTargetAtTime(note * 2.003, now, t);
    this.oscSub.frequency.setTargetAtTime(note * 0.5, now, t);
    this.oscThird.frequency.setTargetAtTime(note * 3.01, now, t);

    const openness = (500 + 3800 * rpmFrac * profile.brightness) * (0.55 + 0.45 * throttle) * (state.boosting ? 1.25 : 1);
    this.lowpass.frequency.setTargetAtTime(openness, now, 0.05);

    const level = profile.volume * (0.3 + 0.7 * throttle) * (state.boosting ? 1.2 : 1) * (cutting ? 0.25 : 1);
    this.amp.gain.setTargetAtTime(on ? level : 0, now, on ? 0.05 : 0.12);

    this.raspFilter.frequency.setTargetAtTime(900 + 3200 * rpmFrac, now, 0.08);
    const raspLevel = profile.rasp * 0.1 * (0.2 + 0.8 * throttle) * (state.boosting ? 1.8 : 1);
    this.raspGain.gain.setTargetAtTime(on ? raspLevel : 0, now, 0.08);

    // turbo whistle rises with revs and load
    this.turboOsc.frequency.setTargetAtTime(1400 + 3600 * rpmFrac, now, 0.08);
    const whistle = profile.turbo * 0.018 * throttle * clamp(rpmFrac * 1.2 - 0.2, 0, 1);
    this.turboGain.gain.setTargetAtTime(on ? whistle : 0, now, 0.08);

    // tyre squeal while braking hard or drifting
    const squealing = (state.braking && state.speed > 350) || state.drifting;
    this.squealFilter.frequency.setTargetAtTime(2000 + state.speed * 1.2, now, 0.1);
    this.squealGain.gain.setTargetAtTime(on && squealing ? 0.035 : 0, now, 0.06);
  }
}
