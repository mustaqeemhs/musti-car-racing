/** Flames and afterfire at the back of a car or bike. Drawn on a canvas, centred on the vehicle. */

export type ExhaustOptions = {
  kind: "car" | "bike";
  /** The vehicle picture as drawn (game pixels), centred on (0, 0). */
  width: number;
  height: number;
  /** 0..1: how hard the vehicle is being pushed. */
  intensity: number;
  boosting: boolean;
  /** 0..1 afterfire pop. It fades out quickly. */
  pop: number;
  /** Seconds, used to make the flames flicker. */
  time: number;
  /** A number that is different for each vehicle, so flames do not flicker together. */
  seed: number;
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Flames start to show at about a quarter of top speed and are full at about 80%. */
export function flameIntensity(speedRatio: number, boosting: boolean): number {
  if (boosting) return 1;
  return clamp((speedRatio - 0.25) / 0.55, 0, 1);
}

/** Where the exhaust tips are, as offsets from the centre of the picture. */
export function exhaustPipes(kind: "car" | "bike", width: number, height: number): { x: number; y: number }[] {
  if (kind === "bike") return [{ x: width * 0.17, y: height * 0.4 }];
  return [
    { x: -width * 0.17, y: height * 0.495 },
    { x: width * 0.17, y: height * 0.495 },
  ];
}

export function drawExhaustFlames(c: CanvasRenderingContext2D, o: ExhaustOptions): void {
  if (o.intensity < 0.04 && o.pop < 0.04) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  const widthScale = o.kind === "bike" ? 0.55 : 1;
  for (const [index, pipe] of exhaustPipes(o.kind, o.width, o.height).entries()) {
    const flicker = 0.82 + 0.18 * Math.sin(o.time * 55 + o.seed * 3 + index * 1.7) + Math.random() * 0.14;
    const length = (0.08 + 0.5 * o.intensity) * o.height * flicker * (o.boosting ? 1.45 : 1);
    const half = (0.03 + 0.025 * o.intensity) * o.width * widthScale * (o.boosting ? 1.2 : 1);
    const jitter = (Math.random() - 0.5) * half * 0.9;
    const gradient = c.createLinearGradient(pipe.x, pipe.y, pipe.x, pipe.y + length);
    if (o.boosting) {
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.3, "rgba(140,210,255,0.9)");
      gradient.addColorStop(0.7, "rgba(50,120,255,0.5)");
      gradient.addColorStop(1, "rgba(30,80,255,0)");
    } else {
      gradient.addColorStop(0, "rgba(255,255,225,0.95)");
      gradient.addColorStop(0.25, "rgba(255,205,70,0.85)");
      gradient.addColorStop(0.6, "rgba(255,95,25,0.5)");
      gradient.addColorStop(1, "rgba(255,40,0,0)");
    }
    c.fillStyle = gradient;
    c.beginPath();
    c.moveTo(pipe.x - half, pipe.y);
    c.quadraticCurveTo(pipe.x - half * 0.9, pipe.y + length * 0.55, pipe.x + jitter, pipe.y + length);
    c.quadraticCurveTo(pipe.x + half * 0.9, pipe.y + length * 0.55, pipe.x + half, pipe.y);
    c.closePath();
    c.fill();

    // soft glow around the flame
    const glow = c.createRadialGradient(pipe.x, pipe.y + length * 0.15, 0, pipe.x, pipe.y + length * 0.15, half * 3.2);
    glow.addColorStop(0, o.boosting ? "rgba(90,170,255,0.32)" : "rgba(255,140,40,0.3)");
    glow.addColorStop(1, "rgba(255,120,30,0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(pipe.x, pipe.y + length * 0.15, half * 3.2, 0, Math.PI * 2);
    c.fill();

    // afterfire pop: a bright burst with a few sparks
    if (o.pop > 0.04) {
      const burst = o.pop * o.height * 0.2;
      const pop = c.createRadialGradient(pipe.x, pipe.y + burst * 0.4, 0, pipe.x, pipe.y + burst * 0.4, burst);
      pop.addColorStop(0, `rgba(255,240,170,${0.9 * o.pop})`);
      pop.addColorStop(0.5, `rgba(255,150,40,${0.55 * o.pop})`);
      pop.addColorStop(1, "rgba(255,90,20,0)");
      c.fillStyle = pop;
      c.beginPath();
      c.arc(pipe.x, pipe.y + burst * 0.4, burst, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = `rgba(255,210,90,${o.pop})`;
      c.lineWidth = 1.4;
      for (let spark = 0; spark < 4; spark++) {
        const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const reach = burst * (0.8 + Math.random() * 0.9);
        c.beginPath();
        c.moveTo(pipe.x, pipe.y + burst * 0.3);
        c.lineTo(pipe.x + Math.cos(angle) * reach, pipe.y + burst * 0.3 + Math.sin(angle) * reach);
        c.stroke();
      }
    }
  }
  c.restore();
}
