import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Scene2DDef } from "../types";
import { accent, getPalette, ink, palCss, paletteParam, rgbCss } from "../palettes";

/** Deterministic random in 0..1 from an integer. */
function rand(n: number, salt = 0) {
  let x = (n * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Height of card n, in units of the column width. */
const cardH = (n: number, seed: number) => 0.12 + 0.6 + 0.5 * rand(n, seed) + 0.14;

type Ctx = CanvasRenderingContext2D;

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function heart(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.35, y - s * 0.85, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.35, y - s * 0.85, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  c.closePath();
}

/** An endless column of cards, starting at card `first` drawn at `y0`. */
interface Column {
  first: number;
  y0: number;
}

/**
 * Flux: an endless feed of cards without a single word — blurred pictures, avatars, grey bars, hearts, a row of
 * stories. It scrolls on its own, in thumb flicks (a push, a glide, a stop), faster through the build (and, over the night, faster and faster); hearts fill on the
 * kick and notification dots blink on the hats. The drop freezes it and tears it into falling pixels; in
 * the breakdown a single empty card is left, still.
 */
export const flux: Scene2DDef = {
  id: "flux",
  name: "Flux",
  tag: "2D",
  kind: "2d",
  energy: "medium",
  // it covers the whole frame: no world background showing through its dark areas
  mask: true,
  description:
    "Un fil infini de cartes sans un mot qui défile tout seul, de plus en plus vite ; au drop il se fige et se déchire en pixels, au breakdown il ne reste qu'une carte vide.",
  params: [paletteParam("mono")],
  create({ canvas, ctx }) {
    const seed = Math.floor(Math.random() * 1e6);
    const cols: Column[] = [
      { first: 0, y0: 0 },
      { first: 1000, y0: -137 },
      { first: 2000, y0: -311 },
    ];
    let vel = 0;
    let nextFlick = 0;
    /** Speed lost per second after a flick. */
    const FRICTION = 3.5;
    // The tear: a snapshot of the frozen feed, falling apart in blocks
    const snap = document.createElement("canvas");
    const sctx = snap.getContext("2d")!;
    let tearT = 99;
    let liked = new Set<number>();
    let lastBeat = 0;

    /** Draw one column of width cw centred on cx, scrolled by its own state. */
    const drawColumn = (col: Column, cx: number, cw: number, alpha: number, f: AudioFrame, pal: ReturnType<typeof getPalette>) => {
      const h = canvas.height;
      const fg = ink(pal);
      const acc = accent(pal);
      let n = col.first;
      let y = col.y0;
      const x = cx - cw / 2;
      while (y < h) {
        const ch = cardH(n, seed) * cw;
        if (y + ch > 0) {
          ctx.globalAlpha = alpha;
          // card
          roundRect(ctx, x, y, cw, ch - cw * 0.05, cw * 0.04);
          ctx.fillStyle = rgbCss(fg, 0.06);
          ctx.fill();
          // header: an avatar and two grey bars standing for a name
          const hy = y + cw * 0.06;
          ctx.beginPath();
          ctx.arc(x + cw * 0.07, hy, cw * 0.035, 0, Math.PI * 2);
          ctx.fillStyle = palCss(pal, rand(n, seed + 3));
          ctx.fill();
          ctx.fillStyle = rgbCss(fg, 0.25);
          ctx.fillRect(x + cw * 0.13, hy - cw * 0.018, cw * (0.25 + 0.2 * rand(n, seed + 4)), cw * 0.014);
          ctx.fillStyle = rgbCss(fg, 0.12);
          ctx.fillRect(x + cw * 0.13, hy + cw * 0.008, cw * 0.18, cw * 0.01);
          // the picture: soft blurred blobs in the palette
          const iy = y + cw * 0.12;
          const ih = ch - cw * 0.31;
          ctx.save();
          roundRect(ctx, x + cw * 0.02, iy, cw * 0.96, ih, cw * 0.02);
          ctx.clip();
          ctx.fillStyle = rgbCss(fg, 0.08);
          ctx.fillRect(x, iy, cw, ih);
          for (let k = 0; k < 3; k++) {
            const bx = x + cw * (0.15 + 0.7 * rand(n * 3 + k, seed + 5));
            const by = iy + ih * (0.2 + 0.6 * rand(n * 3 + k, seed + 6));
            const br = cw * (0.25 + 0.35 * rand(n * 3 + k, seed + 7));
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, palCss(pal, rand(n * 3 + k, seed + 8), 0.75));
            g.addColorStop(1, palCss(pal, rand(n * 3 + k, seed + 8), 0));
            ctx.fillStyle = g;
            ctx.fillRect(x, iy, cw, ih);
          }
          // a video: its progress bar
          if (rand(n, seed + 9) < 0.35) {
            ctx.fillStyle = rgbCss(fg, 0.3);
            ctx.fillRect(x + cw * 0.02, iy + ih - cw * 0.012, cw * 0.96, cw * 0.012);
            ctx.fillStyle = rgbCss(acc, 0.9);
            ctx.fillRect(x + cw * 0.02, iy + ih - cw * 0.012, cw * 0.96 * ((f.time * 0.1 + rand(n, seed + 10)) % 1), cw * 0.012);
          }
          ctx.restore();
          // footer: a heart (filled on the kick), a bubble, and bars standing for counters
          const fy = iy + ih + cw * 0.08;
          heart(ctx, x + cw * 0.07, fy, cw * 0.05);
          if (liked.has(n)) {
            ctx.fillStyle = rgbCss(acc, 1);
            ctx.fill();
          } else {
            ctx.strokeStyle = rgbCss(fg, 0.5);
            ctx.lineWidth = Math.max(1, cw * 0.006);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(x + cw * 0.17, fy - cw * 0.005, cw * 0.028, 0, Math.PI * 2);
          ctx.strokeStyle = rgbCss(fg, 0.5);
          ctx.stroke();
          ctx.fillStyle = rgbCss(fg, 0.2);
          ctx.fillRect(x + cw * 0.24, fy - cw * 0.01, cw * (0.08 + 0.1 * rand(n, seed + 11)), cw * 0.012);
          // a notification dot on the avatar, blinking on the hats
          if (rand(n, seed + 12) < 0.3 && f.onsetPulse > 0.4) {
            ctx.beginPath();
            ctx.arc(x + cw * 0.095, hy - cw * 0.025, cw * 0.012, 0, Math.PI * 2);
            ctx.fillStyle = rgbCss(acc, 1);
            ctx.fill();
          }
        }
        y += ch;
        n++;
      }
      ctx.globalAlpha = 1;
    };

    /** Scroll a column up by dy pixels, dropping the cards that left the top. */
    const scroll = (col: Column, dy: number, cw: number) => {
      col.y0 -= dy;
      while (col.y0 + cardH(col.first, seed) * cw < 0) {
        col.y0 += cardH(col.first, seed) * cw;
        col.first++;
      }
    };

    return {
      render(f, p, dt) {
        const w = canvas.width;
        const h = canvas.height;
        const pal = getPalette(p.palette);
        const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
        const cw = Math.min(w * 0.34, h * 0.52);
        ctx.fillStyle = rgbCss(pal.base);
        ctx.fillRect(0, 0, w, h);

        // The tear on the drop: freeze, then fall apart
        if (f.drop) {
          snap.width = w;
          snap.height = h;
          sctx.drawImage(canvas, 0, 0);
          tearT = 0;
        }
        if (tearT < bar * 2) {
          tearT += dt;
          const B = Math.max(8, Math.round(h / 26));
          const g = h * 2.2;
          for (let by = 0; by < h; by += B)
            for (let bx = 0; bx < w; bx += B) {
              const k = Math.floor(bx / B) * 7919 + Math.floor(by / B);
              const delay = rand(k, seed) * bar * 0.8 + (1 - by / h) * bar * 0.3;
              const t = Math.max(0, tearT - delay);
              if (t > 0 && by + t * t * g > h) continue;
              const ox = (rand(k, seed + 1) - 0.5) * t * w * 0.15;
              ctx.globalAlpha = Math.max(0, 1 - t / bar);
              ctx.drawImage(snap, bx, by, B, B, bx + ox, by + t * t * g * (0.6 + 0.8 * rand(k, seed + 2)), B, B);
            }
          ctx.globalAlpha = 1;
          return;
        }

        // In the breakdown: a single empty card, still, breathing, waiting to refresh
        if (f.section === "breakdown") {
          const ch = cw * 1.2;
          const a = 0.35 + 0.1 * Math.sin(f.time * 0.8);
          const sa = f.time * 4;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2 - ch / 2 - cw * 0.12, cw * 0.035, sa, sa + 4.4);
          ctx.strokeStyle = rgbCss(ink(pal), a);
          ctx.lineWidth = Math.max(1, cw * 0.008);
          ctx.stroke();
          roundRect(ctx, w / 2 - cw / 2, h / 2 - ch / 2, cw, ch, cw * 0.04);
          ctx.strokeStyle = rgbCss(ink(pal), a);
          ctx.lineWidth = Math.max(1, cw * 0.004);
          ctx.stroke();
          roundRect(ctx, w / 2 - cw * 0.46, h / 2 - ch / 2 + cw * 0.12, cw * 0.92, ch - cw * 0.31, cw * 0.02);
          ctx.fillStyle = rgbCss(ink(pal), a * 0.15);
          ctx.fill();
          return;
        }

        // Speed: on its own, faster through the build and the drop, faster and faster over the night
        const base = h * 0.12 * (1 + 1.5 * f.drift);
        const target = base * (f.section === "build" ? 1 + 6 * f.buildProgress * f.buildProgress : f.section === "drop" ? 5 : 1);
        // Thumb flicks: each one sized so that the feed keeps the target speed on average; they come faster
        // when the feed rushes
        nextFlick -= dt;
        if (nextFlick <= 0) {
          const gap = (0.7 + 0.9 * Math.random()) / (1 + (target / base - 1) * 0.5);
          nextFlick = gap;
          vel = target * gap * FRICTION;
        }
        vel *= Math.exp(-dt * FRICTION);
        scroll(cols[0], vel * dt, cw);
        scroll(cols[1], vel * dt * 0.7, cw * 0.78);
        scroll(cols[2], vel * dt * 0.85, cw * 0.78);

        // A heart fills on every kick, on a card in view
        if (f.beat && f.beatCount !== lastBeat) {
          lastBeat = f.beatCount;
          liked.add(cols[0].first + 1 + Math.floor(rand(f.beatCount, seed) * 2));
          if (liked.size > 40) liked = new Set([...liked].slice(-20));
        }

        // The side feeds, dimmer and smaller, then the main one
        drawColumn(cols[1], w / 2 - cw * 1.05, cw * 0.78, 0.35, f, pal);
        drawColumn(cols[2], w / 2 + cw * 1.05, cw * 0.78, 0.35, f, pal);
        drawColumn(cols[0], w / 2, cw, 1, f, pal);
        // fade the top and bottom into the background
        const fade = ctx.createLinearGradient(0, 0, 0, h);
        fade.addColorStop(0, rgbCss(pal.base, 1));
        fade.addColorStop(0.12, rgbCss(pal.base, 0));
        fade.addColorStop(0.88, rgbCss(pal.base, 0));
        fade.addColorStop(1, rgbCss(pal.base, 1));
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, w, h);

        // The row of stories on top of the main feed: rings in the palette, one swelling on each kick
        const sy = h * 0.07;
        const sr = cw * 0.07;
        for (let k = 0; k < 5; k++) {
          const sx = w / 2 - cw * 0.4 + k * cw * 0.2;
          const pop = k === f.beatCount % 5 ? 1 + 0.12 * f.beatPulse : 1;
          ctx.beginPath();
          ctx.arc(sx, sy, sr * pop, 0, Math.PI * 2);
          ctx.strokeStyle = palCss(pal, (k * 0.23 + f.time * 0.05) % 1);
          ctx.lineWidth = Math.max(1.5, cw * 0.01);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sx, sy, sr * 0.78, 0, Math.PI * 2);
          ctx.fillStyle = palCss(pal, rand(k, seed + 20), 0.8);
          ctx.fill();
        }
      },
    };
  },
};
