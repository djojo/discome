import type { Scene2DDef } from "../types";
import { getPalette, palCss, paletteParam } from "../palettes";
import { num } from "../utils";

const MAX = 3000;
const BUCKETS = 32;

/**
 * Particle bursts on every beat, spiralling out of the centre: a swirl that stays at the centre of the screen. The
 * worlds lay it as a blurred background (the Classique world's Nébuleuse is the 3D galaxy, 3d/galaxy.ts).
 */
export const swirl: Scene2DDef = {
  id: "swirl",
  name: "Tourbillon",
  tag: "2D",
  energy: "calm",
  kind: "2d",
  description: "Explosions de particules sur chaque beat, en spirale.",
  params: [
    paletteParam("sunset"),
    { type: "range", key: "amount", label: "Quantité", min: 0.2, max: 3, step: 0.1, default: 1 },
    { type: "range", key: "speed", label: "Vitesse", min: 0.2, max: 3, step: 0.1, default: 1 },
    { type: "range", key: "swirl", label: "Tourbillon", min: -3, max: 3, step: 0.1, default: 1.2 },
    { type: "range", key: "trail", label: "Traînée", min: 0, max: 0.97, step: 0.01, default: 0.82 },
    { type: "range", key: "hueSpeed", label: "Vitesse des couleurs", min: 0, max: 2, step: 0.05, default: 0.4 },
  ],
  create({ canvas, ctx }) {
    const px = new Float32Array(MAX);
    const py = new Float32Array(MAX);
    const vx = new Float32Array(MAX);
    const vy = new Float32Array(MAX);
    const life = new Float32Array(MAX);
    const ttl = new Float32Array(MAX);
    const hue = new Float32Array(MAX);
    const size = new Float32Array(MAX);
    const bucket = new Uint8Array(MAX);
    let count = 0;
    let spawnAcc = 0;

    const swap = (i: number, j: number) => {
      px[i] = px[j];
      py[i] = py[j];
      vx[i] = vx[j];
      vy[i] = vy[j];
      life[i] = life[j];
      ttl[i] = ttl[j];
      hue[i] = hue[j];
      size[i] = size[j];
    };

    return {
      render(f, p, dt) {
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const m = Math.min(W, H);
        const pal = getPalette(p.palette);
        const amount = num(p.amount, 1);
        const speed = num(p.speed, 1);
        const hueT = f.time * num(p.hueSpeed) * 0.2;

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(0,0,0,${1 - num(p.trail)})`;
        ctx.fillRect(0, 0, W, H);

        // Spawn: a steady stream driven by volume, plus a burst on each beat
        spawnAcc += (f.active ? f.volume * 9 + f.bass * 12 : 0.8) * amount * dt * 60;
        if (f.beat) spawnAcc += 160 * amount;
        let spawn = Math.min(Math.floor(spawnAcc), MAX - count);
        spawnAcc -= Math.floor(spawnAcc);
        while (spawn-- > 0) {
          const i = count++;
          const a = Math.random() * Math.PI * 2;
          const burst = f.beatPulse > 0.9 ? 1.8 : 0;
          const sp = m * 0.0022 * speed * (0.3 + Math.random() * (0.8 + f.bass * 2.5) + burst * Math.random());
          const r = m * 0.02 * Math.random();
          px[i] = cx + Math.cos(a) * r;
          py[i] = cy + Math.sin(a) * r;
          vx[i] = Math.cos(a) * sp;
          vy[i] = Math.sin(a) * sp;
          life[i] = 0;
          ttl[i] = 1.2 + Math.random() * 2.5;
          hue[i] = hueT + Math.random() * 0.35 + f.treble * 0.3;
          size[i] = (m / 450) * (0.7 + Math.random() * 2.3) * (1 + f.beatPulse * 0.8);
        }

        // Integrate: velocity rotates (spiral), drag, small kick on the beat
        const ang = num(p.swirl) * dt * (0.4 + f.mid * 1.2);
        const cs = Math.cos(ang);
        const sn = Math.sin(ang);
        const drag = Math.pow(0.986, dt * 60) * (1 + f.beatPulse * 0.03);
        const step = dt * 60;
        for (let i = 0; i < count; i++) {
          life[i] += dt;
          const out = px[i] < -50 || px[i] > W + 50 || py[i] < -50 || py[i] > H + 50;
          if (life[i] > ttl[i] || out) {
            swap(i, --count);
            i--;
            continue;
          }
          const nvx = (vx[i] * cs - vy[i] * sn) * drag;
          const nvy = (vx[i] * sn + vy[i] * cs) * drag;
          vx[i] = nvx;
          vy[i] = nvy;
          px[i] += nvx * step;
          py[i] += nvy * step;
          bucket[i] = Math.floor((((hue[i] + (life[i] / ttl[i]) * 0.3) % 1) + 1) % 1 * BUCKETS) % BUCKETS;
        }

        // Draw: one path per colour bucket (much faster than one fill per particle)
        ctx.globalCompositeOperation = "lighter";
        for (let b = 0; b < BUCKETS; b++) {
          ctx.fillStyle = palCss(pal, b / BUCKETS, 0.85);
          ctx.beginPath();
          let any = false;
          for (let i = 0; i < count; i++) {
            if (bucket[i] !== b) continue;
            const s = size[i] * (1 - life[i] / ttl[i]);
            if (s < 0.3) continue;
            ctx.rect(px[i] - s / 2, py[i] - s / 2, s, s);
            any = true;
          }
          if (any) ctx.fill();
        }

        // Pulsing core
        // (low alpha: the trail fade accumulates it over several frames)
        const R = m * (0.03 + f.bass * 0.05 + f.beatPulse * 0.05);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
        g.addColorStop(0, palCss(pal, hueT + 0.1, 0.08 + f.beatPulse * 0.2));
        g.addColorStop(0.35, palCss(pal, hueT + 0.3, 0.03));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
      },
    };
  },
};
