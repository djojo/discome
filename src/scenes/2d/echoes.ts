import type { Scene2DDef } from "../types";
import { getPalette, palCss, paletteParam } from "../palettes";
import { mirror01, num } from "../utils";

/** Oscilloscope drawn into a zooming, rotating feedback buffer: infinite psychedelic echoes. */
export const echoes: Scene2DDef = {
  id: "echoes",
  name: "Échos",
  tag: "2D",
  kind: "2d",
  description: "Oscilloscope dans une boucle de feedback qui zoome et tourne.",
  params: [
    paletteParam("acid"),
    {
      type: "select",
      key: "shape",
      label: "Forme",
      options: [
        { value: "circle", label: "Cercle" },
        { value: "flower", label: "Fleur" },
        { value: "line", label: "Ligne" },
      ],
      default: "flower",
    },
    { type: "range", key: "zoom", label: "Zoom du feedback", min: -1, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "spin", label: "Rotation", min: -3, max: 3, step: 0.05, default: 0.8 },
    { type: "range", key: "feedback", label: "Persistance", min: 0.5, max: 0.98, step: 0.01, default: 0.9 },
    { type: "range", key: "amp", label: "Amplitude", min: 0.2, max: 3, step: 0.05, default: 1 },
  ],
  create({ canvas, ctx }) {
    const buf = document.createElement("canvas");
    const bctx = buf.getContext("2d")!;
    let petalsPhase = 0;

    return {
      render(f, p, dt) {
        const W = canvas.width;
        const H = canvas.height;
        if (buf.width !== W || buf.height !== H) {
          buf.width = W;
          buf.height = H;
        }
        const cx = W / 2;
        const cy = H / 2;
        const m = Math.min(W, H);
        const pal = getPalette(p.palette);
        const t = f.energy * 0.08;

        // 1) copy last frame, 2) clear, 3) paint it back slightly zoomed + rotated
        bctx.globalCompositeOperation = "copy";
        bctx.drawImage(canvas, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        const zoom = 1 + num(p.zoom, 1) * (0.008 + f.bass * 0.03 + f.beatPulse * 0.025);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(num(p.spin) * dt * (0.3 + f.mid * 1.2));
        ctx.scale(zoom, zoom);
        ctx.globalAlpha = num(p.feedback, 0.9);
        ctx.drawImage(buf, -cx, -cy);
        ctx.restore();
        ctx.globalAlpha = 1;

        // Waveform
        const wave = f.waveform;
        const amp = num(p.amp, 1);
        const shape = String(p.shape);
        petalsPhase += dt * (0.5 + f.treble * 2);
        const R = m * (0.16 + f.bass * 0.05);

        const trace = () => {
          ctx.beginPath();
          if (shape === "line") {
            const SEG = 400;
            for (let j = 0; j <= SEG; j++) {
              const idx = Math.floor((j / SEG) * (wave.length - 1));
              const x = (j / SEG) * W;
              const y = cy + wave[idx] * H * 0.35 * amp;
              if (j === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          } else {
            const SEG = 360;
            for (let j = 0; j <= SEG; j++) {
              const u = j / SEG;
              const a = u * Math.PI * 2;
              const idx = Math.floor(mirror01(u) * (wave.length / 2));
              let r = R * (1 + wave[idx] * 1.2 * amp);
              if (shape === "flower") r *= 1 + 0.28 * Math.sin(a * 6 + petalsPhase) * (0.4 + f.mid);
              const x = cx + Math.cos(a) * r;
              const y = cy + Math.sin(a) * r;
              if (j === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
          }
        };

        ctx.globalCompositeOperation = "lighter";
        ctx.lineJoin = "round";
        trace();
        ctx.strokeStyle = palCss(pal, t, 0.25);
        ctx.lineWidth = m * (0.012 + f.bass * 0.012);
        ctx.stroke();
        ctx.strokeStyle = palCss(pal, t + 0.15, 0.95);
        ctx.lineWidth = Math.max(1.5, m * 0.003);
        ctx.stroke();
      },
    };
  },
};
