import type { AudioFrame } from "@/lib/audio/AudioEngine";
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

type BlockKind = "spectrogram" | "numerals" | "barcode" | "wave" | "meters" | "dots";

/** A block of the layout, in grid units (12 columns × 8 rows). */
interface Block {
  kind: BlockKind;
  c: number;
  r: number;
  w: number;
  h: number;
}

/** Layouts, the first blocks are the most important (a sparse density keeps only those). */
const LAYOUTS: Block[][] = [
  [
    { kind: "spectrogram", c: 0, r: 0, w: 8, h: 4 },
    { kind: "numerals", c: 8, r: 0, w: 4, h: 2 },
    { kind: "wave", c: 0, r: 5, w: 7, h: 3 },
    { kind: "barcode", c: 8, r: 2, w: 4, h: 2 },
    { kind: "meters", c: 7, r: 5, w: 5, h: 2 },
    { kind: "dots", c: 7, r: 7, w: 5, h: 1 },
  ],
  [
    { kind: "numerals", c: 0, r: 0, w: 5, h: 3 },
    { kind: "spectrogram", c: 5, r: 0, w: 7, h: 5 },
    { kind: "barcode", c: 0, r: 3, w: 5, h: 2 },
    { kind: "wave", c: 0, r: 6, w: 12, h: 2 },
    { kind: "meters", c: 0, r: 5, w: 12, h: 1 },
  ],
  [
    { kind: "spectrogram", c: 0, r: 2, w: 12, h: 3 },
    { kind: "numerals", c: 0, r: 0, w: 4, h: 2 },
    { kind: "barcode", c: 4, r: 0, w: 8, h: 2 },
    { kind: "wave", c: 0, r: 6, w: 8, h: 2 },
    { kind: "dots", c: 8, r: 6, w: 4, h: 2 },
    { kind: "meters", c: 0, r: 5, w: 12, h: 1 },
  ],
];

const CAPTIONS: Record<BlockKind, string> = {
  spectrogram: "SPECTRUM · 32 HZ – 16 KHZ",
  numerals: "TEMPO / POSITION",
  barcode: "ONSET CODE",
  wave: "WAVEFORM",
  meters: "BANDS · 64",
  dots: "TRANSIENTS",
};

const HISTORY = 240;

/**
 * Data in two colours on a Swiss grid: a scrolling spectrogram (the history of the bands), large numerals,
 * a barcode rewritten on the attacks, the waveform, band meters and a dot matrix. The layout changes on each
 * phrase (and on the drop); the beat only drives events (ticks, rewrites, flashes); the drop inverts the frame.
 */
export const signal: Scene2DDef = {
  id: "signal",
  name: "Signal",
  tag: "2D",
  kind: "2d",
  energy: "intense",
  description:
    "Données en deux couleurs sur une grille : spectrogramme qui défile, grands chiffres, code-barres, onde ; la mise en page change à chaque phrase, le drop inverse l'image.",
  params: [
    paletteParam("mono"),
    { type: "range", key: "density", label: "Densité", min: 0.1, max: 0.9, step: 0.05, default: 0.5 },
    { type: "toggle", key: "readouts", label: "Légendes", default: true },
  ],
  create({ canvas, ctx }) {
    const seed = Math.floor(Math.random() * 1e6);
    // The spectrogram lives in a small offscreen canvas: one new column per frame, scrolled left
    const spec = document.createElement("canvas");
    spec.width = HISTORY;
    spec.height = 64;
    const sctx = spec.getContext("2d")!;
    const column = sctx.createImageData(1, 64);
    let layout = LAYOUTS[seed % LAYOUTS.length];
    let mirror = seed % 2 === 1;
    let lastPhrase = -1;
    let palKey = "";

    const relayout = (n: number) => {
      const rng = seeded(seed + n * 7919);
      layout = LAYOUTS[Math.floor(rng() * LAYOUTS.length)];
      mirror = rng() < 0.5;
    };

    const pushColumn = (f: AudioFrame, base: number[], fg: number[]) => {
      sctx.drawImage(spec, -1, 0);
      for (let i = 0; i < 64; i++) {
        const v = Math.pow(Math.min(1, f.bands[63 - i] ?? 0), 1.3);
        const o = i * 4;
        column.data[o] = base[0] + (fg[0] - base[0]) * v;
        column.data[o + 1] = base[1] + (fg[1] - base[1]) * v;
        column.data[o + 2] = base[2] + (fg[2] - base[2]) * v;
        column.data[o + 3] = 255;
      }
      sctx.putImageData(column, HISTORY - 1, 0);
    };

    return {
      render(f, p) {
        const w = canvas.width;
        const h = canvas.height;
        const u = h / 360;
        const pal = getPalette(p.palette);
        const fg = rgbCss(ink(pal));
        const dim = rgbCss(ink(pal), 0.35);
        const acc = rgbCss(accent(pal));
        const beats = f.bpm > 0 ? f.bar * 4 + f.beatInBar + f.beatPhase : f.time * 2;
        const sixteenth = Math.floor(beats * 4);
        const density = num(p.density, 0.5);
        const readouts = p.readouts !== false;
        const to255 = (c: number[]) => c.map((x) => Math.round(x * 255));

        // A new layout on each phrase, and on the drop
        const phrase = Math.floor(f.bar / 8);
        if (phrase !== lastPhrase || f.drop) {
          lastPhrase = phrase;
          relayout(phrase + (f.drop ? 101 : 0));
        }
        if (palKey !== String(p.palette)) {
          palKey = String(p.palette);
          sctx.fillStyle = rgbCss(pal.base);
          sctx.fillRect(0, 0, HISTORY, 64);
        }
        pushColumn(f, to255(pal.base), to255(ink(pal)));

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = rgbCss(pal.base);
        ctx.fillRect(0, 0, w, h);
        ctx.lineWidth = Math.max(1, u * 0.5);
        ctx.textBaseline = "top";
        const mono = (px: number, weight = 400) => `${weight} ${Math.round(px * u)}px "Geist Mono", ui-monospace, Menlo, monospace`;

        // ---- the grid: hairlines and registration crosses
        const m = 16 * u;
        const cw = (w - 2 * m) / 12;
        const rh = (h - 2 * m) / 8;
        ctx.strokeStyle = rgbCss(ink(pal), 0.08);
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          ctx.moveTo(m + i * cw, m);
          ctx.lineTo(m + i * cw, h - m);
        }
        for (let j = 0; j <= 8; j++) {
          ctx.moveTo(m, m + j * rh);
          ctx.lineTo(w - m, m + j * rh);
        }
        ctx.stroke();
        ctx.strokeStyle = dim;
        ctx.beginPath();
        for (let i = 0; i <= 12; i += 4)
          for (let j = 0; j <= 8; j += 4) {
            const x = m + i * cw;
            const y = m + j * rh;
            ctx.moveTo(x - 4 * u, y);
            ctx.lineTo(x + 4 * u, y);
            ctx.moveTo(x, y - 4 * u);
            ctx.lineTo(x, y + 4 * u);
          }
        ctx.stroke();

        // ---- the blocks (a sparse density keeps only the first ones)
        const count = Math.max(2, Math.round(2 + density * 5));
        layout.slice(0, count).forEach((b, i) => {
          const c = mirror ? 12 - b.c - b.w : b.c;
          const pad = 6 * u;
          const x = m + c * cw + pad;
          const y = m + b.r * rh + pad + (readouts ? 10 * u : 0);
          const bw = b.w * cw - 2 * pad;
          const bh = b.h * rh - 2 * pad - (readouts ? 10 * u : 0);
          ctx.fillStyle = fg;
          ctx.strokeStyle = fg;
          if (readouts) {
            ctx.font = mono(6.5);
            ctx.fillStyle = dim;
            ctx.fillText(`${String(i + 1).padStart(2, "0")} — ${CAPTIONS[b.kind]}`, x, y - 10 * u);
            ctx.fillStyle = fg;
          }
          switch (b.kind) {
            case "spectrogram": {
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(spec, x, y, bw, bh);
              ctx.imageSmoothingEnabled = true;
              break;
            }
            case "numerals": {
              const big = Math.min(bh * 0.55, bw / 3.4) / u;
              ctx.font = mono(big, 300);
              ctx.fillText(f.bpm > 0 ? f.bpm.toFixed(0) : "———", x, y);
              ctx.font = mono(big * 0.28);
              ctx.fillText(`BAR ${String(f.bar).padStart(3, "0")} · ${f.phraseBar + 1}/8`, x, y + big * u * 1.05);
              ctx.fillStyle = f.section === "drop" ? acc : fg;
              ctx.fillText(f.section.toUpperCase(), x, y + big * u * 1.05 + big * u * 0.36);
              // beat dots
              for (let k = 0; k < 4; k++) {
                ctx.fillStyle = k === f.beatInBar ? acc : dim;
                ctx.fillRect(x + bw - (4 - k) * 9 * u, y, 6 * u, 6 * u);
              }
              break;
            }
            case "barcode": {
              const quiet = f.section === "breakdown";
              const rng = seeded((quiet ? Math.floor(sixteenth / 2) : sixteenth) * 2654435761 + seed);
              let bx = 0;
              while (bx < bw) {
                const lw = Math.max(1, Math.floor(rng() * rng() * 9 * u));
                if (rng() < (quiet ? 0.25 : 0.5)) ctx.fillRect(x + bx, y, lw, bh);
                bx += lw;
              }
              break;
            }
            case "wave": {
              ctx.beginPath();
              const wave = f.waveform;
              for (let k = 0; k <= bw; k += 2) {
                const v = wave[Math.floor((k / bw) * (wave.length - 1))];
                const yy = y + bh / 2 + v * bh * 0.45;
                if (k === 0) ctx.moveTo(x + k, yy);
                else ctx.lineTo(x + k, yy);
              }
              ctx.stroke();
              ctx.fillStyle = dim;
              ctx.fillRect(x, y + bh / 2, bw, 1);
              break;
            }
            case "meters": {
              const n = 64;
              const gw = bw / n;
              for (let k = 0; k < n; k++) {
                const v = f.bands[k] ?? 0;
                ctx.fillRect(x + k * gw, y + bh * (1 - v), Math.max(1, gw * 0.55), bh * v);
              }
              break;
            }
            case "dots": {
              const g = 7 * u;
              const nx = Math.floor(bw / g);
              const ny = Math.max(1, Math.floor(bh / g));
              const rng = seeded(Math.floor(f.time * 10) * 31 + seed);
              for (let yy = 0; yy < ny; yy++)
                for (let xx = 0; xx < nx; xx++) {
                  const on = rng() < 0.12 + 0.6 * f.onsetPulse;
                  ctx.fillStyle = on ? fg : dim;
                  const s = on ? 2.4 * u : 1;
                  ctx.fillRect(x + xx * g, y + yy * g, s, s);
                }
              break;
            }
          }
        });

        // ---- scan line, one sweep per bar
        const sx = m + ((beats % 4) / 4) * (w - 2 * m);
        ctx.fillStyle = dim;
        ctx.fillRect(sx, m, 1, h - 2 * m);

        if (readouts) {
          ctx.font = mono(7);
          ctx.fillStyle = dim;
          ctx.fillText("DISCOME / SIGNAL", m, h - m + 3 * u);
          const t = `${f.time.toFixed(2)} S`;
          ctx.fillText(t, w - m - ctx.measureText(t).width, h - m + 3 * u);
        }

        // ---- kick: thin accent ticks on grid columns
        if (f.beatPulse > 0.6) {
          ctx.fillStyle = acc;
          const r2 = seeded(Math.floor(beats) * 97 + 13 + seed);
          for (let i = 0; i < 4; i++) ctx.fillRect(m + Math.floor(r2() * 13) * cw, m, Math.max(1, u), h - 2 * m);
        }

        // ---- drop: a full-frame inversion
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
