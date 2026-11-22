import type { Scene2DDef } from "../types";
import { accent, getPalette, ink, paletteParam, rgbCss } from "../palettes";
import { num } from "../utils";

/** Tiny deterministic RNG: the same 16th note always draws the same barcode. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Pure data in two colours: barcodes rewritten on every attack, a scan line per bar, live readouts. */
export const signal: Scene2DDef = {
  id: "signal",
  name: "Signal",
  tag: "2D",
  kind: "2d",
  energy: "intense",
  description: "Donnée pure en deux couleurs : codes-barres réécrits à chaque attaque, balayage par mesure, inversion au drop.",
  params: [
    paletteParam("mono"),
    { type: "range", key: "density", label: "Densité", min: 0.1, max: 0.9, step: 0.05, default: 0.5 },
    { type: "toggle", key: "readouts", label: "Données à l'écran", default: true },
  ],
  create({ canvas, ctx }) {
    return {
      render(f, p) {
        const w = canvas.width;
        const h = canvas.height;
        const u = h / 360;
        const pal = getPalette(p.palette);
        const fg = rgbCss(ink(pal));
        const beats = f.bpm > 0 ? f.bar * 4 + f.beatInBar + f.beatPhase : f.time * 2;
        const sixteenth = Math.floor(beats * 4);
        const quiet = f.section === "breakdown";
        const density = num(p.density, 0.5);

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = rgbCss(pal.base);
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = fg;
        ctx.strokeStyle = fg;

        // Dot grid
        const g = Math.max(8, Math.round(14 * u));
        for (let y = g; y < h * 0.3; y += g) for (let x = g; x < w; x += g) ctx.fillRect(x, y, 1, 1);

        // Barcode band, rewritten on every 16th (every 8th in the breakdown)
        const rng = seeded((quiet ? Math.floor(sixteenth / 2) : sixteenth) * 2654435761);
        const bandY = h * 0.36;
        const bandH = h * (0.2 + 0.08 * f.beatPulse + 0.06 * f.buildProgress);
        let x = 0;
        while (x < w) {
          const bw = Math.max(1, Math.floor(rng() * rng() * 10 * u));
          if (rng() < (quiet ? density * 0.35 : density)) ctx.fillRect(x, bandY, bw, bandH);
          x += bw;
        }

        // Scan line: one sweep per bar
        const sx = Math.floor(((beats % 4) / 4) * w);
        ctx.fillRect(sx, 0, 1, h);
        if (p.readouts !== false) {
          ctx.font = `${Math.max(9, Math.round(10 * u))}px "Geist Mono", ui-monospace, monospace`;
          ctx.textBaseline = "top";
          const vals = [
            `BPM ${f.bpm > 0 ? f.bpm.toFixed(3) : "---.---"}`,
            `BAR ${String(f.bar).padStart(3, "0")} · ${f.phraseBar + 1}/8`,
            `RMS ${(0.2 + f.volume * 0.7).toFixed(4)}`,
            `SEC ${f.section.toUpperCase()}`,
          ];
          const tx = Math.min(sx + 6 * u, w - 110 * u);
          vals.forEach((v, i) => ctx.fillText(v, tx, 12 * u + i * 13 * u));
          ctx.fillText("DISCOME / SIGNAL", 12 * u, h - 22 * u);
          ctx.fillText(`${f.time.toFixed(3)} s`, w - 80 * u, h - 22 * u);
        }

        // Oscilloscope: the real waveform, one pixel wide
        ctx.beginPath();
        const oy = h * 0.78;
        const wave = f.waveform;
        for (let i = 0; i <= w; i += 2) {
          const v = wave[Math.floor((i / w) * (wave.length - 1))];
          const y = oy + v * 60 * u;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.lineWidth = 1;
        ctx.stroke();

        // Thin vertical ticks on the kick, in the accent colour
        if (f.beatPulse > 0.6) {
          ctx.fillStyle = rgbCss(accent(pal));
          const r2 = seeded(Math.floor(beats) * 97 + 13);
          for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(r2() * w), 0, 1, h);
        }

        // Drop: a full-frame inversion
        if (f.dropPulse > 0.85) {
          ctx.globalCompositeOperation = "difference";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
        }
      },
    };
  },
};
