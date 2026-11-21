import type { Scene2DDef } from "../types";
import { getPalette, palCss, paletteParam } from "../palettes";
import { mirror01, num, sampleBands } from "../utils";

/** Radial spectrum in kaleidoscopic symmetry, waveform ring and a beating core. */
export const halo: Scene2DDef = {
  id: "halo",
  name: "Halo",
  tag: "2D",
  kind: "2d",
  description: "Spectre radial en symétrie, façon mandala.",
  params: [
    paletteParam("acid"),
    { type: "range", key: "symmetry", label: "Symétrie", min: 1, max: 8, step: 1, default: 4 },
    { type: "range", key: "length", label: "Amplitude", min: 0.2, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "trail", label: "Traînée", min: 0, max: 0.95, step: 0.01, default: 0.55 },
    { type: "range", key: "spin", label: "Rotation", min: -2, max: 2, step: 0.05, default: 0.4 },
    { type: "range", key: "hueSpeed", label: "Vitesse des couleurs", min: 0, max: 2, step: 0.05, default: 0.5 },
  ],
  create({ canvas, ctx }) {
    let rot = 0;
    return {
      render(f, p, dt) {
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const m = Math.min(W, H);
        const pal = getPalette(p.palette);
        const k = Math.max(1, Math.round(num(p.symmetry, 4)));
        const t = f.time * num(p.hueSpeed) * 0.25;

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `rgba(0,0,0,${1 - num(p.trail)})`;
        ctx.fillRect(0, 0, W, H);

        rot += dt * num(p.spin) * (0.3 + f.mid * 1.5);
        const r0 = m * (0.12 + f.bass * 0.06 + f.beatPulse * 0.04);
        const maxLen = m * 0.34 * num(p.length, 1);
        const sector = (Math.PI * 2) / k;
        const bars = Math.max(12, Math.round(96 / k));
        const barW = ((Math.PI * 2 * r0) / (bars * 2 * k)) * 0.7;

        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        for (let i = 0; i < bars; i++) {
          const x = i / (bars - 1);
          const v = sampleBands(f.bands, x * 0.85);
          const len = m * 0.004 + v * maxLen;
          ctx.strokeStyle = palCss(pal, x * 0.6 + t + v * 0.25, 0.9);
          ctx.lineWidth = Math.max(1, barW * (0.5 + v));
          ctx.beginPath();
          const off = ((i + 0.5) / bars) * (sector / 2);
          for (let s = 0; s < k; s++) {
            for (let sign = -1; sign <= 1; sign += 2) {
              const a = rot + s * sector + sign * off;
              const ca = Math.cos(a);
              const sa = Math.sin(a);
              ctx.moveTo(cx + ca * r0, cy + sa * r0);
              ctx.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
            }
          }
          ctx.stroke();
        }

        // Waveform ring (mirrored so the loop closes cleanly)
        const SEG = 256;
        const wave = f.waveform;
        ctx.strokeStyle = palCss(pal, t + 0.5, 0.85);
        ctx.lineWidth = Math.max(1, m / 500);
        ctx.beginPath();
        for (let j = 0; j <= SEG; j++) {
          const idx = Math.floor(mirror01(j / SEG) * (wave.length / 2));
          const r = r0 * 0.82 * (1 + wave[idx] * 0.8);
          const a = (j / SEG) * Math.PI * 2 - rot * 0.5;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Core glow
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 0.95);
        g.addColorStop(0, palCss(pal, t + 0.3, 0.25 + f.beatPulse * 0.5));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r0 * 0.95, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  },
};
