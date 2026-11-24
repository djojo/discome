import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Scene2DDef } from "../types";
import { accent, getPalette, ink, paletteParam, rgbCss } from "../palettes";
import { num } from "../utils";

/**
 * Chapter titles (our own), one per scene of the Arcanes world: the chapter is the plan on screen. Over any other
 * scene it moves on with every drop.
 */
const CHAPTERS = [
  { en: "THE SILENT ARCHITECT", jp: "沈黙の建築家", scene: "arcane-architect" },
  { en: "ORBIT OF THE NOMAD", jp: "放浪者の軌道", scene: "arcane-nomad" },
  { en: "THREE WITNESSES", jp: "三人の証人", scene: "arcane-prism" },
  { en: "THE RAINBOW GATE", jp: "虹の門", scene: "arcane-portal" },
  { en: "BOOK OF FREQUENCIES", jp: "周波数の書", scene: "topo-head" },
  { en: "WHERE SOUND BECOMES LIGHT", jp: "音が光になる場所", scene: "arcane-road" },
];

/** Glyphs a title flickers through while it glitches. */
const NOISE = "▓▒░#%&@$*+=/\\<>01";

/** Bottom subtitles, one per phrase. */
const VERSES = [
  "現 実 は 音 か ら 生 ま れ る 。",
  "光 は 周 波 数 の 記 憶 で あ る 。",
  "沈 黙 の 中 に も 鼓 動 が あ る 。",
  "す べ て の 世 界 は 一 つ の 歌 か ら 始 ま っ た 。",
];

const WARNING_JP = ["この映像には", "強い光の点滅が", "含まれています。"];

const THREAT: Record<AudioFrame["section"], string> = { calm: "LOW", breakdown: "DORMANT", build: "RISING", drop: "???" };

/** Centre frequency of one of the 64 log bands (32 Hz → 16 kHz). */
const bandHz = (i: number) => 32 * Math.pow(500, i / 63);

type Ctx = CanvasRenderingContext2D;

/** Alchemical-looking glyphs drawn with lines (no font needed). */
function glyph(c: Ctx, kind: number, x: number, y: number, s: number) {
  c.beginPath();
  const tri = (up: boolean) => {
    const d = up ? -1 : 1;
    c.moveTo(x, y + d * s * 0.6);
    c.lineTo(x - s * 0.55, y - d * s * 0.4);
    c.lineTo(x + s * 0.55, y - d * s * 0.4);
    c.closePath();
  };
  switch (kind % 8) {
    case 0:
      tri(true);
      break;
    case 1:
      tri(false);
      break;
    case 2:
      tri(true);
      c.moveTo(x - s * 0.45, y);
      c.lineTo(x + s * 0.45, y);
      break;
    case 3:
      tri(false);
      c.moveTo(x - s * 0.45, y);
      c.lineTo(x + s * 0.45, y);
      break;
    case 4: // hourglass
      c.moveTo(x - s * 0.5, y - s * 0.55);
      c.lineTo(x + s * 0.5, y - s * 0.55);
      c.lineTo(x - s * 0.5, y + s * 0.55);
      c.lineTo(x + s * 0.5, y + s * 0.55);
      c.closePath();
      break;
    case 5: // two triangles
      tri(true);
      tri(false);
      break;
    case 6: // circle and dot
      c.arc(x, y, s * 0.5, 0, Math.PI * 2);
      c.moveTo(x + s * 0.1, y);
      c.arc(x, y, s * 0.1, 0, Math.PI * 2);
      break;
    default: // crescent
      c.arc(x, y, s * 0.5, Math.PI * 0.3, Math.PI * 1.7);
      c.arc(x + s * 0.2, y, s * 0.38, Math.PI * 1.6, Math.PI * 0.4, true);
  }
  c.stroke();
}

/** Box with corner cuts, like a game UI panel. */
function panel(c: Ctx, x: number, y: number, w: number, h: number, cut: number) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + h - cut);
  c.lineTo(x + w - cut, y + h);
  c.lineTo(x, y + h);
  c.closePath();
  c.stroke();
}

/**
 * An esoteric video-game HUD: chapter, drifting coordinates, orbits, glyphs, a warning in Japanese,
 * and live readouts of the track (tempo, section, dominant frequency, spectrum barcode). Meant as a layer.
 */
export const grimoire: Scene2DDef = {
  id: "grimoire",
  name: "Grimoire",
  tag: "2D",
  kind: "2d",
  energy: "medium",
  description:
    "Interface de jeu ésotérique : chapitre, glyphes, orbites et vraies données du morceau (tempo, section, fréquence dominante). Pensé comme calque.",
  params: [
    paletteParam("cosmos"),
    { type: "toggle", key: "japanese", label: "Texte japonais", default: true },
    { type: "range", key: "detail", label: "Détail", min: 0, max: 1, step: 0.05, default: 1 },
  ],
  create({ canvas, ctx }) {
    let chapter = 0;
    /** Seconds since the chapter changed or a drop hit: the title glitches for a moment. */
    let glitch = 9;
    let dominant = 0;
    let lastBeat = -1;
    return {
      render(f, p, dt) {
        const w = canvas.width;
        const h = canvas.height;
        const u = h / 360;
        const pal = getPalette(p.palette);
        const fg = rgbCss(ink(pal), 0.9);
        const dim = rgbCss(ink(pal), 0.45);
        const acc = rgbCss(accent(pal), 0.95);
        const red = "rgba(255,74,74,0.95)";
        const jp = p.japanese !== false;
        const detail = num(p.detail, 1);
        // The chapter is the plan on screen; elsewhere it moves on with the drops
        const own = CHAPTERS.findIndex((c) => c.scene === f.shot);
        const next = own >= 0 ? own : f.drop ? (chapter + 1) % CHAPTERS.length : chapter;
        glitch = next !== chapter || f.drop ? 0 : glitch + dt;
        chapter = next;
        const beats = f.bpm > 0 ? f.bar * 4 + f.beatInBar + f.beatPhase : f.time * 2;
        // The dominant frequency is read once per beat so the number stays legible
        if (Math.floor(beats) !== lastBeat) {
          lastBeat = Math.floor(beats);
          let best = 0;
          for (let i = 1; i < f.bands.length; i++) if (f.bands[i] > f.bands[best]) best = i;
          dominant = bandHz(best);
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.lineWidth = Math.max(1, u * 0.7);
        ctx.strokeStyle = fg;
        ctx.fillStyle = fg;
        ctx.textBaseline = "top";
        const mono = (px: number) => `${Math.round(px * u)}px "Geist Mono", ui-monospace, Menlo, monospace`;
        const jpFont = (px: number) => `${Math.round(px * u)}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
        const m = 14 * u;
        const ch = CHAPTERS[chapter];

        // ---- top left: chapter, glyphs, coordinates
        panel(ctx, m, m, 150 * u, 44 * u, 0);
        ctx.font = mono(9);
        ctx.fillText(`CHAPTER_${String(chapter + 1).padStart(2, "0")}`, m + 8 * u, m + 8 * u);
        // a drop or a new chapter: the title scrambles for a moment, then settles letter by letter
        const settled = Math.floor((glitch / 0.5) * ch.en.length);
        const title =
          glitch < 0.5
            ? [...ch.en].map((c, i) => (c === " " || i < settled ? c : NOISE[Math.floor(Math.random() * NOISE.length)])).join("")
            : ch.en;
        ctx.fillText(`"${title}"`, m + 8 * u + (glitch < 0.15 ? (Math.random() - 0.5) * 6 * u : 0), m + 24 * u);
        panel(ctx, m, m + 48 * u, 150 * u, 28 * u, 0);
        for (let i = 0; i < 5; i++) {
          const flick = f.onsetPulse > 0.5 && (Math.floor(f.time * 20) + i) % 3 === 0;
          ctx.strokeStyle = flick ? acc : fg;
          glyph(ctx, i * 3 + chapter, m + 22 * u + i * 27 * u, m + 62 * u, 13 * u);
        }
        ctx.strokeStyle = fg;
        panel(ctx, m, m + 80 * u, 66 * u, 92 * u, 8 * u);
        ctx.font = mono(8);
        const drift = f.energy;
        const coords = [
          ["X_", (3640.7 + Math.sin(drift * 0.11) * 420).toFixed(1)],
          ["Y_", (-1238.4 + Math.cos(drift * 0.07) * 260).toFixed(1)],
          ["Z_", (884.2 + Math.sin(drift * 0.05 + 1) * 120).toFixed(1)],
          ["T_", `${f.bar}.${f.beatInBar + 1}`],
          ["Ω_", `${((f.beatPhase * 360 + f.bar * 33.7) % 360).toFixed(1)}°`],
          ["Φ_", `${((drift * 9) % 360).toFixed(1)}°`],
        ];
        coords.forEach(([k, v], i) => ctx.fillText(`${k} ${v}`, m + 7 * u, m + 88 * u + i * 13.5 * u));

        // ---- orbit diagram, turning with the beat
        if (detail > 0.2) {
          const ox = m + 118 * u;
          const oy = m + 128 * u;
          ctx.strokeStyle = dim;
          for (let r = 1; r <= 3; r++) {
            ctx.beginPath();
            ctx.arc(ox, oy, r * 12 * u, 0, Math.PI * 2);
            ctx.stroke();
          }
          const a0 = (beats / 4) * Math.PI * 2;
          ctx.beginPath();
          for (let k = 0; k < 12; k++) {
            const a = a0 * 0.1 + (k / 12) * Math.PI * 2;
            ctx.moveTo(ox, oy);
            ctx.lineTo(ox + Math.cos(a) * 38 * u, oy + Math.sin(a) * 38 * u);
          }
          ctx.stroke();
          ctx.fillStyle = acc;
          for (let r = 1; r <= 3; r++) {
            const a = a0 / r;
            ctx.beginPath();
            ctx.arc(ox + Math.cos(a) * r * 12 * u, oy + Math.sin(a) * r * 12 * u, (1.6 + f.beatPulse * 1.5) * u, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = fg;
          ctx.strokeStyle = fg;
        }

        // ---- top right: title in Japanese, player icon, live readouts
        const rx = w - m - 150 * u;
        if (jp) {
          panel(ctx, rx - 40 * u, m, 150 * u, 40 * u, 0);
          ctx.font = jpFont(17);
          ctx.fillText(ch.jp, rx - 32 * u, m + 10 * u);
        }
        panel(ctx, w - m - 30 * u, m, 30 * u, 40 * u, 0);
        // the robed figure as player icon: pyramid head, robe
        const ix = w - m - 15 * u;
        ctx.beginPath();
        ctx.moveTo(ix, m + 7 * u);
        ctx.lineTo(ix - 6 * u, m + 15 * u);
        ctx.lineTo(ix + 6 * u, m + 15 * u);
        ctx.closePath();
        ctx.moveTo(ix - 3 * u, m + 17 * u);
        ctx.lineTo(ix - 7 * u, m + 32 * u);
        ctx.lineTo(ix + 7 * u, m + 32 * u);
        ctx.lineTo(ix + 3 * u, m + 17 * u);
        ctx.stroke();
        ctx.font = mono(5);
        ctx.fillText("PLAYER", ix - 9 * u, m + 34 * u);

        // wireframe globe
        if (detail > 0.4) {
          const gx = rx - 4 * u;
          const gy = m + 78 * u;
          const gr = 22 * u;
          ctx.strokeStyle = dim;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.stroke();
          for (let k = 0; k < 4; k++) {
            const a = f.time * 0.4 + (k / 4) * Math.PI;
            ctx.beginPath();
            ctx.ellipse(gx, gy, Math.abs(Math.cos(a)) * gr, gr, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.ellipse(gx, gy + k * gr * 0.5, gr * Math.sqrt(1 - k * k * 0.25), gr * 0.12, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.strokeStyle = fg;
        }
        ctx.font = mono(8);
        const readouts = [
          `TEMPO:      ${f.bpm > 0 ? f.bpm.toFixed(1) : "---.-"} BPM`,
          `SECTION:    ${f.section.toUpperCase()}`,
          `BAR:        ${String(f.bar).padStart(3, "0")} · ${f.phraseBar + 1}/8`,
          `DOMINANT:   ${dominant < 1000 ? dominant.toFixed(1) + " HZ" : (dominant / 1000).toFixed(2) + " KHZ"}`,
          `ENERGY:     ${Math.round(f.volume * 100)} %`,
        ];
        readouts.forEach((t, i) => ctx.fillText(t, rx + 30 * u, m + 60 * u + i * 12 * u));

        // ---- warning (red frame on the drop)
        const wy = h * 0.43;
        ctx.strokeStyle = f.dropPulse > 0.3 && Math.floor(f.time * 8) % 2 === 0 ? red : fg;
        panel(ctx, rx, wy, 150 * u, jp ? 62 * u : 24 * u, 0);
        ctx.font = mono(8);
        ctx.fillText("WARNING", rx + 8 * u, wy + 7 * u);
        if (jp) {
          ctx.font = jpFont(9);
          WARNING_JP.forEach((l, i) => ctx.fillText(l, rx + 40 * u, wy + 20 * u + i * 13 * u));
          // warning sign
          ctx.beginPath();
          ctx.moveTo(rx + 20 * u, wy + 22 * u);
          ctx.lineTo(rx + 10 * u, wy + 40 * u);
          ctx.lineTo(rx + 30 * u, wy + 40 * u);
          ctx.closePath();
          ctx.stroke();
          ctx.fillText("!", rx + 18.5 * u, wy + 29 * u);
        }
        ctx.strokeStyle = fg;

        // ---- entity data
        if (detail > 0.6) {
          const ey = h * 0.62;
          panel(ctx, rx, ey, 150 * u, 74 * u, 0);
          ctx.font = mono(7);
          const rows = [
            ["ENTITY DATA", ""],
            ["CLASS:", "ARCHITECT"],
            ["ORIGIN:", "UNKNOWN"],
            ["HEIGHT:", "∞"],
            ["ALIGNMENT:", f.beatPulse > 0.5 ? "PULSE" : "NEUTRAL"],
            ["THREAT LVL:", THREAT[f.section]],
          ];
          rows.forEach(([k, v], i) => {
            ctx.fillText(k, rx + 8 * u, ey + 7 * u + i * 11 * u);
            ctx.fillText(v, rx + 80 * u, ey + 7 * u + i * 11 * u);
          });
        }

        // ---- bottom left: signal, with the spectrum as a barcode
        const by = h - m - 92 * u;
        ctx.strokeStyle = red;
        ctx.fillStyle = red;
        panel(ctx, m, by, 120 * u, 92 * u, 0);
        // the eye
        const ex = m + 22 * u;
        const ey2 = by + 30 * u;
        ctx.beginPath();
        ctx.moveTo(ex, ey2 - 14 * u);
        ctx.lineTo(ex + 11 * u, ey2);
        ctx.lineTo(ex, ey2 + 14 * u);
        ctx.lineTo(ex - 11 * u, ey2);
        ctx.closePath();
        ctx.moveTo(ex + (4 + 2 * f.bass) * u, ey2);
        ctx.arc(ex, ey2, (4 + 2 * f.bass) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = mono(6.5);
        const sig = f.volume > 0.6 ? "STRONG" : f.volume > 0.25 ? "STEADY" : "WEAK";
        [
          `SIGNAL: ${sig}`,
          `FREQUENCY: ${dominant.toFixed(1)} HZ`,
          `MODULATION: ${f.section === "build" ? "RISING" : "UNKNOWN"}`,
          `SOURCE: BEYOND`,
        ].forEach((t, i) => ctx.fillText(t, m + 40 * u, by + 14 * u + i * 9.5 * u));
        // barcode = the 64 bands
        const bx = m + 8 * u;
        const bw = 104 * u;
        const bh = 24 * u;
        for (let i = 0; i < f.bands.length; i++) {
          const v = f.bands[i];
          if (v < 0.08) continue;
          ctx.fillRect(bx + (i / f.bands.length) * bw, by + 60 * u + bh * (1 - v), Math.max(1, (bw / f.bands.length) * 0.6), bh * v);
        }
        ctx.strokeStyle = fg;
        ctx.fillStyle = fg;

        // ---- bottom right: rotating octahedron
        if (detail > 0.3) {
          const cx = w - m - 60 * u;
          const cy = h - m - 52 * u;
          const s = 40 * u;
          const a = f.time * 0.5 + f.beatPulse * 0.2;
          const pts = [
            [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
          ].map(([x, y, z]) => {
            const x2 = x * Math.cos(a) - z * Math.sin(a);
            const z2 = x * Math.sin(a) + z * Math.cos(a);
            return [cx + x2 * s, cy + y * s * 0.9 + z2 * s * 0.25];
          });
          const edges = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]];
          ctx.strokeStyle = dim;
          ctx.beginPath();
          for (const [i, j] of edges) {
            ctx.moveTo(pts[i][0], pts[i][1]);
            ctx.lineTo(pts[j][0], pts[j][1]);
          }
          ctx.stroke();
          ctx.fillStyle = acc;
          for (const [x, y] of pts) ctx.fillRect(x - 1.5 * u, y - 1.5 * u, 3 * u, 3 * u);
          ctx.fillStyle = fg;
          ctx.strokeStyle = fg;
        }

        // ---- bottom centre: a verse per phrase
        if (jp) {
          const verse = VERSES[Math.floor(f.bar / 8) % VERSES.length];
          ctx.font = jpFont(11);
          const tw = ctx.measureText(verse).width;
          const vx = (w - tw) / 2;
          const vy = h - m - 22 * u;
          panel(ctx, vx - 14 * u, vy - 6 * u, tw + 28 * u, 24 * u, 0);
          ctx.fillText(verse, vx, vy);
        }

        // Glitch: a few rows slip sideways on sharp attacks
        if (f.onsetPulse > 0.7 && detail > 0.5) {
          for (let k = 0; k < 3; k++) {
            const y = Math.floor(((Math.sin(f.time * 91.7 + k * 13.1) + 1) / 2) * h);
            const hh = Math.max(2, Math.floor(4 * u));
            ctx.drawImage(canvas, 0, y, w, hh, (Math.sin(f.time * 57 + k) * 12 + 6) * u, y, w, hh);
          }
        }
      },
    };
  },
};
