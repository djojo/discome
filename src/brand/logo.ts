/**
 * A logo file turned into what Discome shows: its silhouette (its transparency when it has some, otherwise what stands
 * out from the colour of its edges), which the worlds sculpt; and its art, the logo itself in its own colours, shown
 * as it is. Both cropped alike, at most 1024 px, saved as PNGs: the silhouette white on transparent, the art opaque
 * (its colours carried a little past the shape, so that its edges stay clean once masked by the silhouette).
 */
const MAX = 1024;

export class LogoError extends Error {}

/** A logo mostly light (shown over a dark halo) or mostly dark (over a light one). */
export type LogoTone = "light" | "dark";

/** What the import keeps of a logo. */
export interface LogoImport {
  /** The silhouette: white shape on transparent. */
  logo: string;
  /** The logo in its own colours, opaque, cropped like the silhouette (which gives it its shape). */
  art: string;
  /** Its leading colours, the most present first (hex). */
  colors: string[];
  tone: LogoTone;
  /** Strokes so fine they may vanish at a distance. */
  thin: boolean;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    throw new LogoError("Impossible de lire cette image. Essaie un PNG, un SVG ou un JPG.");
  }
  return img;
}

function draw(img: HTMLImageElement) {
  // an SVG without a size decodes at 0 × 0 in some browsers: give it a default one
  const iw = img.naturalWidth || img.width || 512;
  const ih = img.naturalHeight || img.height || 512;
  const k = Math.min(1, MAX / Math.max(iw, ih)) * (Math.max(iw, ih) < 256 ? 256 / Math.max(iw, ih) : 1);
  const w = Math.max(1, Math.round(iw * k));
  const h = Math.max(1, Math.round(ih * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** Threshold that best splits a histogram in two (Otsu). */
function otsu(values: Float32Array): number {
  const bins = new Float64Array(256);
  for (const v of values) bins[Math.min(255, Math.floor(v * 255))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * bins[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 128;
  for (let i = 0; i < 256; i++) {
    wB += bins[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * bins[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = i;
    }
  }
  return (at + 0.5) / 255;
}

/** Coverage 0..1 of the logo's shape. */
function silhouette(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const n = w * h;
  const a = new Float32Array(n);
  let clear = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) clear++;
  if (clear > n * 0.02 && clear < n * 0.98) {
    for (let i = 0; i < n; i++) a[i] = data[i * 4 + 3] / 255;
    return a;
  }
  // No transparency: the background is the colour of the edges, the logo what stands out from it
  const edge: number[][] = [];
  for (let x = 0; x < w; x++) edge.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) edge.push([0, y], [w - 1, y]);
  const median = (ch: number) => {
    const v = edge.map(([x, y]) => data[(y * w + x) * 4 + ch]).sort((p, q) => p - q);
    return v[v.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dr = data[i * 4] - bg[0];
    const dg = data[i * 4 + 1] - bg[1];
    const db = data[i * 4 + 2] - bg[2];
    dist[i] = Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 255);
  }
  const t = Math.max(0.08, otsu(dist));
  for (let i = 0; i < n; i++) a[i] = Math.min(1, Math.max(0, (dist[i] - t) / 0.08 + 0.5));
  return a;
}

interface Box {
  x0: number;
  y0: number;
  cw: number;
  ch: number;
}

/** The shape's bounds, with a few pixels of margin. */
function cropBox(a: Float32Array, w: number, h: number): Box {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] < 0.5) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0 || x1 - x0 < 8 || y1 - y0 < 8) throw new LogoError("Aucune forme nette dans cette image : il faut un logo en aplat, de préférence sur fond transparent.");
  const m = 2;
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  return { x0, y0, cw: x1 - x0 + 1, ch: y1 - y0 + 1 };
}

/** Cropped to the shape, written as a white PNG with the shape in its alpha. */
function toPng(a: Float32Array, w: number, h: number, box = cropBox(a, w, h)): string {
  const { x0, y0, cw, ch } = box;
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = 255;
      out.data[o + 3] = Math.round(a[(y + y0) * w + x + x0] * 255);
    }
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}

/**
 * The logo's colours over the crop, opaque. Where the file is transparent its colours are unknown: the colours of the
 * shape are carried outward a few pixels (so that a masked edge never picks up black), then its mean fills the rest.
 */
function toArt(data: Uint8ClampedArray, w: number, box: Box): string {
  const { x0, y0, cw, ch } = box;
  const n = cw * ch;
  const rgb = new Float32Array(n * 3);
  const known = new Uint8Array(n);
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let mn = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const o = ((y + y0) * w + x + x0) * 4;
      if (data[o + 3] < 8) continue;
      known[i] = 1;
      rgb[i * 3] = data[o];
      rgb[i * 3 + 1] = data[o + 1];
      rgb[i * 3 + 2] = data[o + 2];
      mr += data[o];
      mg += data[o + 1];
      mb += data[o + 2];
      mn++;
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    const next = known.slice();
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (known[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let k = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
          const j = yy * cw + xx;
          if (!known[j]) continue;
          r += rgb[j * 3];
          g += rgb[j * 3 + 1];
          b += rgb[j * 3 + 2];
          k++;
        }
        if (!k) continue;
        rgb[i * 3] = r / k;
        rgb[i * 3 + 1] = g / k;
        rgb[i * 3 + 2] = b / k;
        next[i] = 1;
      }
    }
    known.set(next);
  }
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(cw, ch);
  mn = Math.max(1, mn);
  for (let i = 0; i < n; i++) {
    out.data[i * 4] = known[i] ? rgb[i * 3] : mr / mn;
    out.data[i * 4 + 1] = known[i] ? rgb[i * 3 + 1] : mg / mn;
    out.data[i * 4 + 2] = known[i] ? rgb[i * 3 + 2] : mb / mn;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

/**
 * What the logo is like, from its colours (rgb, 0..255) and its shape (a, 0..1), both w × h: its leading colours
 * (a few rounds of k-means over the shape), light or dark, and whether its strokes are fine (the shape eroded by about
 * 1.2 % of its size keeps less than a third of itself).
 */
function analyze(rgb: Uint8ClampedArray, a: Float32Array, w: number, h: number) {
  const inside: number[] = [];
  for (let i = 0; i < w * h; i++) if (a[i] >= 0.5) inside.push(i);
  const step = Math.max(1, Math.floor(inside.length / 20000));
  const pts: [number, number, number][] = [];
  let luma = 0;
  for (let k = 0; k < inside.length; k += step) {
    const o = inside[k] * 4;
    const p: [number, number, number] = [rgb[o] / 255, rgb[o + 1] / 255, rgb[o + 2] / 255];
    pts.push(p);
    luma += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  }
  luma /= Math.max(1, pts.length);
  // k-means, seeded far apart
  const K = Math.min(4, pts.length);
  const centres: [number, number, number][] = pts.length ? [pts[0]] : [];
  const d2 = (p: number[], q: number[]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  while (centres.length < K) {
    let best = pts[0];
    let far = -1;
    for (const p of pts) {
      const d = Math.min(...centres.map((c) => d2(p, c)));
      if (d > far) {
        far = d;
        best = p;
      }
    }
    if (far < 0.01) break;
    centres.push([...best]);
  }
  const count = new Array<number>(centres.length).fill(0);
  for (let it = 0; it < 8; it++) {
    const sum = centres.map(() => [0, 0, 0]);
    count.fill(0);
    for (const p of pts) {
      let j = 0;
      for (let c = 1; c < centres.length; c++) if (d2(p, centres[c]) < d2(p, centres[j])) j = c;
      sum[j][0] += p[0];
      sum[j][1] += p[1];
      sum[j][2] += p[2];
      count[j]++;
    }
    centres.forEach((c, j) => {
      if (count[j]) for (let q = 0; q < 3; q++) c[q] = sum[j][q] / count[j];
    });
  }
  const colors = centres
    .map((c, j) => ({ c, n: count[j] }))
    .filter((e) => e.n >= pts.length * 0.04)
    .sort((p, q) => q.n - p.n)
    .map((e) => `#${hex2(e.c[0] * 255)}${hex2(e.c[1] * 255)}${hex2(e.c[2] * 255)}`);
  // fine strokes: erode the shape (separable minimum over a square) and see what is left
  const r = Math.max(2, Math.round(0.012 * Math.max(w, h)));
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = a[i] >= 0.5 ? 1 : 0;
  // along each row, then each column: the runs from either side give the distance to the nearest gap
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let left = 0;
    const fromLeft = new Int32Array(w);
    for (let x = 0; x < w; x++) fromLeft[x] = left = solid[y * w + x] ? left + 1 : 0;
    let right = 0;
    for (let x = w - 1; x >= 0; x--) {
      right = solid[y * w + x] ? right + 1 : 0;
      rows[y * w + x] = Math.min(fromLeft[x], right) > r ? 1 : 0;
    }
  }
  let kept = 0;
  for (let x = 0; x < w; x++) {
    let up = 0;
    const fromUp = new Int32Array(h);
    for (let y = 0; y < h; y++) fromUp[y] = up = rows[y * w + x] ? up + 1 : 0;
    let down = 0;
    for (let y = h - 1; y >= 0; y--) {
      down = rows[y * w + x] ? down + 1 : 0;
      if (Math.min(fromUp[y], down) > r) kept++;
    }
  }
  return { colors, tone: (luma < 0.3 ? "dark" : "light") as LogoTone, thin: kept < inside.length * 0.3 };
}

/** A logo file (PNG, SVG, JPG, WebP) to its silhouette and its art. Throws a LogoError with a message for the user. */
export async function importLogo(file: File): Promise<LogoImport> {
  if (!file.type.startsWith("image/") && !/\.(png|svg|jpe?g|webp|gif)$/i.test(file.name)) {
    throw new LogoError("Ce fichier n'a pas l'air d'être une image.");
  }
  const url = URL.createObjectURL(file);
  try {
    const { data, w, h } = draw(await loadImage(url));
    const a = silhouette(data, w, h);
    const box = cropBox(a, w, h);
    const logo = toPng(a, w, h, box);
    const art = toArt(data, w, box);
    return { logo, art, ...(await analyzeLogo(logo, art)) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A saved logo looked at again (after « Inverser », whose shape changes what its colours are). */
export async function analyzeLogo(logo: string, art: string): Promise<Pick<LogoImport, "colors" | "tone" | "thin">> {
  const shape = draw(await loadImage(logo));
  const colours = await loadImage(art);
  const c = document.createElement("canvas");
  c.width = shape.w;
  c.height = shape.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(colours, 0, 0, shape.w, shape.h);
  const rgb = ctx.getImageData(0, 0, shape.w, shape.h).data;
  const a = new Float32Array(shape.w * shape.h);
  for (let i = 0; i < a.length; i++) a[i] = shape.data[i * 4 + 3] / 255;
  return analyze(rgb, a, shape.w, shape.h);
}

/** The shape and its background swapped (a light logo on a dark background read the wrong way round). */
export async function invertLogo(png: string): Promise<string> {
  const { data, w, h } = draw(await loadImage(png));
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = 1 - data[i * 4 + 3] / 255;
  // (not cropped again: the art keeps lining up with it)
  return toPng(a, w, h, { x0: 0, y0: 0, cw: w, ch: h });
}
