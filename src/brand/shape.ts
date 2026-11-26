import * as THREE from "three";
import { brandOn, brandShapeKey, WORLD_SUBTITLE, type Brand } from "./brand";
import { titleFont, type TitleFont } from "./fonts";

/**
 * The night's title (or logo) as a shape the head scenes can sculpt: a signed distance field of its outline, in the
 * frame of the heads (y up, facing +z, centred on the head). The scenes extrude it themselves (HEAD_GLSL), deep and
 * cut or round and puffy. One shape per typeface (each world writes the title in its own), built on demand.
 */
export interface TitleShape {
  /** The 2D distance field, in a 3D texture one texel deep (so it shares the heads' sampler). */
  tex: THREE.Data3DTexture;
  min: THREE.Vector3;
  size: THREE.Vector3;
  /** Half-width of the thickest stroke (scene units): how round a puffy relief can be. */
  stroke: number;
}

/** Room for the shape, in the heads' units (a head is about 1 wide and 1.4 tall). */
const TEXT_BOX = { w: 2.2, h: 1 };
const LOGO_BOX = { w: 1.8, h: 1.3 };
/** Height of the shape's centre (the middle of a head). */
const CENTER_Y = 0.05;
/** Margin around the outline, in pixels of the field: exact distances up to there, the box beyond. */
const PAD = 48;
const MAX_W = 1024;
const MAX_H = 512;

interface Mask {
  /** Coverage 0..1, row 0 at the top. */
  a: Float32Array;
  w: number;
  h: number;
  /** Size of the drawn outline (without the margins), in pixels. */
  cw: number;
  ch: number;
}

let current: Brand | null = null;
let currentKey = "";
let generation = 0;
const shapes = new Map<string, TitleShape | null>();
const building = new Set<string>();

/** The night's brand changed: the shapes are rebuilt when next asked for. */
export function setBrandContent(b: Brand) {
  const key = brandShapeKey(b);
  if (key === currentKey) return;
  currentKey = key;
  current = brandOn(b) ? { ...b } : null;
  generation++;
  for (const s of shapes.values()) s?.tex.dispose();
  shapes.clear();
  building.clear();
}

const keyFor = (font: unknown, world: unknown) =>
  current?.mode === "logo" ? "logo" : current?.mode === "world" ? `world:${String(world)}:font:${String(font)}` : `font:${String(font)}`;

/**
 * The shape for this typeface (and this world, whose name is the title by default) if it is ready; starts building it
 * otherwise. Undefined without a title.
 */
export function titleShape(font: unknown, world?: unknown): TitleShape | undefined {
  if (!current) return undefined;
  const key = keyFor(font, world);
  const done = shapes.get(key);
  if (done !== undefined) return done ?? undefined;
  if (!building.has(key)) {
    building.add(key);
    const gen = generation;
    const brand = current;
    build(brand, font, world)
      .catch(() => null)
      .then((shape) => {
        if (gen !== generation) {
          shape?.tex.dispose();
          return;
        }
        shapes.set(key, shape);
        building.delete(key);
      });
  }
  return undefined;
}

export const titleReady = (font: unknown, world?: unknown) => !!titleShape(font, world);

async function build(b: Brand, font: unknown, world: unknown): Promise<TitleShape | null> {
  if (b.mode === "logo") {
    const mask = b.logo ? await logoMask(b.logo, b.logoArt) : null;
    return mask && toShape(mask, LOGO_BOX);
  }
  const mask =
    b.mode === "world"
      ? await textMask(typeof world === "string" && world ? world : "Discome", WORLD_SUBTITLE, titleFont(font))
      : await textMask(b.title, b.subtitle, titleFont(font));
  return mask && toShape(mask, TEXT_BOX);
}

// ---------------------------------------------------------------- outlines

const canvas2d = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
};

const coverage = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const px = ctx.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255;
  return a;
};

/** The title (and its second line, smaller) written in a world's typeface, centred. */
export async function textMask(title: string, subtitle: string, f: TitleFont): Promise<Mask | null> {
  const lines = [title, subtitle]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (f.upper ? s.toLocaleUpperCase("fr") : s));
  if (!lines.length) return null;
  const S = 200;
  const sizes = lines.map((_, i) => (i === 0 && title.trim() ? S : S * (f.second ?? 0.5)));
  await Promise.all(sizes.map((s, i) => document.fonts.load(`${f.weight} ${s}px ${f.family}`, lines[i]))).catch(() => {});
  const { ctx: probe } = canvas2d(1, 1);
  const measure = (ctx: CanvasRenderingContext2D, i: number, s: number) => {
    ctx.font = `${f.weight} ${s}px ${f.family}`;
    ctx.letterSpacing = `${(f.spacing ?? 0) * s}px`;
    const m = ctx.measureText(lines[i]);
    return { left: m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, asc: m.actualBoundingBoxAscent, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  };
  const gap = S * 0.24;
  const m0 = lines.map((_, i) => measure(probe, i, sizes[i]));
  const W = Math.max(...m0.map((m) => m.w));
  const H = m0.reduce((sum, m) => sum + m.h, 0) + gap * (lines.length - 1);
  if (!(W > 0 && H > 0)) return null;
  const k = Math.min((MAX_W - 2 * PAD) / W, (MAX_H - 2 * PAD) / H, 3);
  const w = Math.ceil(W * k + 2 * PAD);
  const h = Math.ceil(H * k + 2 * PAD);
  const { ctx } = canvas2d(w, h);
  ctx.fillStyle = "#fff";
  let y = PAD;
  lines.forEach((line, i) => {
    const m = measure(ctx, i, sizes[i] * k);
    ctx.fillText(line, PAD + (W * k - m.w) / 2 + m.left, y + m.asc);
    y += m.h + gap * k;
  });
  return { a: coverage(ctx, w, h), w, h, cw: W * k, ch: H * k };
}

/**
 * The logo's silhouette (already cropped by importLogo), with the margins around it. Where two of its colours meet
 * inside it (letters laid over a shape), a fine groove is cut, so that the worlds sculpt them too.
 */
async function logoMask(dataUrl: string, art: string | null): Promise<Mask | null> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min((MAX_W - 2 * PAD) / img.width, (MAX_H - 2 * PAD) / img.height);
  const cw = img.width * k;
  const ch = img.height * k;
  const w = Math.ceil(cw + 2 * PAD);
  const h = Math.ceil(ch + 2 * PAD);
  const { ctx } = canvas2d(w, h);
  ctx.drawImage(img, PAD, PAD, cw, ch);
  const a = coverage(ctx, w, h);
  if (art) {
    const colours = new Image();
    colours.src = art;
    await colours.decode();
    const { ctx: cc } = canvas2d(w, h);
    cc.drawImage(colours, PAD, PAD, cw, ch);
    groove(a, cc.getImageData(0, 0, w, h).data, w, h, Math.max(cw, ch));
  }
  return { a, w, h, cw, ch };
}

/**
 * Cut a groove into the shape (coverage a) wherever its colours (rgb) change sharply between two of its pixels:
 * about 1.1 % of the logo's size wide (size: its larger side, in pixels).
 */
function groove(a: Float32Array, rgb: Uint8ClampedArray, w: number, h: number, size: number) {
  const s = Math.max(1, Math.round(size / 450));
  const edge = new Uint8Array(w * h);
  const differs = (i: number, j: number) => {
    const dr = rgb[i * 4] - rgb[j * 4];
    const dg = rgb[i * 4 + 1] - rgb[j * 4 + 1];
    const db = rgb[i * 4 + 2] - rgb[j * 4 + 2];
    return dr * dr + dg * dg + db * db > (0.2 * 255) ** 2 * 3;
  };
  let any = false;
  for (let y = s; y < h - s; y++) {
    for (let x = s; x < w - s; x++) {
      const i = y * w + x;
      if (a[i] < 0.5) continue;
      for (const j of [i + s, i - s, i + s * w, i - s * w]) {
        if (a[j] >= 0.5 && differs(i, j)) {
          edge[i] = 1;
          any = true;
          break;
        }
      }
    }
  }
  if (!any) return;
  const half = Math.max(1.6, 0.0055 * size);
  const dist = distanceTo((i) => edge[i] === 1, w, h);
  for (let i = 0; i < a.length; i++) a[i] = Math.min(a[i], Math.min(1, Math.max(0, dist[i] - half + 0.5)));
}

/** The shape the worlds sculpt from the night's logo (its grooves included), white on transparent, for a preview. */
export async function sculptedLogo(logo: string, art: string | null): Promise<string | null> {
  const m = await logoMask(logo, art);
  if (!m) return null;
  const { c, ctx } = canvas2d(Math.ceil(m.cw), Math.ceil(m.ch));
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const o = (y * c.width + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(m.a[(y + PAD) * m.w + x + PAD] * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

// ---------------------------------------------------------------- distance field

const INF = 1e20;

/** Squared distance transform of one line (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance (in pixels) from every pixel to the nearest pixel where `seed` is true. */
function distanceTo(seed: (i: number) => boolean, w: number, h: number): Float32Array {
  const n = Math.max(w, h);
  const g = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = seed(i) ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) g[y] = out[y * w + x];
    edt1d(g, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) g[x] = out[y * w + x];
    edt1d(g, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

function toShape(m: Mask, box: { w: number; h: number }): TitleShape {
  const { a, w, h } = m;
  const toIn = distanceTo((i) => a[i] >= 0.5, w, h);
  const toOut = distanceTo((i) => a[i] < 0.5, w, h);
  const unit = Math.min(box.w / m.cw, box.h / m.ch);
  const data = new Uint16Array(w * h);
  let stroke = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // the outline runs between pixel centres; anti-aliased pixels place it within the pixel
      let px = a[i] >= 0.5 ? 0.5 - toOut[i] : toIn[i] - 0.5;
      if (a[i] > 0.02 && a[i] < 0.98) px = 0.5 - a[i];
      const d = px * unit;
      if (-d > stroke) stroke = -d;
      data[(h - 1 - y) * w + x] = THREE.DataUtils.toHalfFloat(d);
    }
  }
  const tex = new THREE.Data3DTexture(data, w, h, 1);
  tex.format = THREE.RedFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 2;
  tex.needsUpdate = true;
  const size = new THREE.Vector3(w * unit, h * unit, 1);
  const min = new THREE.Vector3(-size.x / 2, CENTER_Y - size.y / 2, -0.5);
  return { tex, min, size, stroke };
}

/**
 * The night's signature: its title (in a world's typeface, on one line), its logo, or DISCOME by default, white on
 * transparent, 256 px tall (sharp even large on a big screen), for the mark in a corner.
 */
export async function signatureCanvas(b: Brand, font: unknown): Promise<HTMLCanvasElement | null> {
  if (!brandOn(b)) return null;
  const H = 256;
  if (b.mode === "logo") {
    // (its grooved shape, as the worlds sculpt it: letters laid over a shape stay readable even this small)
    const img = new Image();
    img.src = (b.logoArt ? await sculptedLogo(b.logo!, b.logoArt).catch(() => null) : null) ?? b.logo!;
    await img.decode();
    const w = Math.max(1, Math.round((img.width / img.height) * H));
    const { c, ctx } = canvas2d(Math.min(w, H * 8), H);
    ctx.drawImage(img, 0, 0, c.width, H);
    return c;
  }
  const f = titleFont(font);
  const text = (b.mode === "world" ? [WORLD_SUBTITLE] : [b.title, b.subtitle])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (f.upper ? s.toLocaleUpperCase("fr") : s))
    .join("  ·  ");
  const size = 200;
  await document.fonts.load(`${f.weight} ${size}px ${f.family}`, text).catch(() => {});
  const { ctx: probe } = canvas2d(1, 1);
  probe.font = `${f.weight} ${size}px ${f.family}`;
  probe.letterSpacing = `${(f.spacing ?? 0) * size}px`;
  const m = probe.measureText(text);
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight + 8);
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 8);
  const k = H / h;
  const { c, ctx } = canvas2d(Math.max(1, Math.round(w * k)), H);
  ctx.scale(k, k);
  ctx.font = probe.font;
  ctx.letterSpacing = probe.letterSpacing;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 4 + m.actualBoundingBoxLeft, 4 + m.actualBoundingBoxAscent);
  return c;
}
