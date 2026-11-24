/**
 * A logo file turned into the silhouette Discome sculpts: its transparency when it has some, otherwise what stands
 * out from the colour of its edges. Cropped, at most 1024 px, saved as a PNG (white shape, transparent elsewhere).
 */
const MAX = 1024;

export class LogoError extends Error {}

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

/** Cropped to the shape (a few pixels of margin), written as a white PNG with the shape in its alpha. */
function toPng(a: Float32Array, w: number, h: number): string {
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
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
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

/** A logo file (PNG, SVG, JPG, WebP) to its silhouette. Throws a LogoError with a message for the user. */
export async function importLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(png|svg|jpe?g|webp|gif)$/i.test(file.name)) {
    throw new LogoError("Ce fichier n'a pas l'air d'être une image.");
  }
  const url = URL.createObjectURL(file);
  try {
    const { data, w, h } = draw(await loadImage(url));
    return toPng(silhouette(data, w, h), w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The shape and its background swapped (a light logo on a dark background read the wrong way round). */
export async function invertLogo(png: string): Promise<string> {
  const { data, w, h } = draw(await loadImage(png));
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = 1 - data[i * 4 + 3] / 255;
  return toPng(a, w, h);
}
