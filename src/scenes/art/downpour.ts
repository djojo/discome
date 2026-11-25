import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

/** Big drops brought by the hats. */
const BIG = 8;

const FRAMINGS: Framing[] = [
  // wide, from the front, the horizon of the water low in the frame
  { az: 0.25, el: 0.1, dist: 6.5, target: [0, 1, 0], focal: 1.8, weight: 3 },
  // high above: the whole surface covered in rings, the figure in the middle
  { az: 0.6, el: 1.3, dist: 6.5, target: [0, 0.3, 0], focal: 1.6, weight: 2 },
  // close on the head and shoulders, a little below the bowed face
  { az: 0.4, el: -0.08, dist: 1.4, target: [0, 1.48, 0.05], focal: 2, weight: 2 },
  // at the water line: the rings in perspective, the reflection
  { az: 2, el: 0.02, dist: 5, target: [0, 0.85, 0], focal: 1.9, weight: 2 },
];

/**
 * The downpour: a figure stands still on black water, under a fine rain of light. Every drop is a notification:
 * it draws a one-pixel ring on the water and leaves a point of light on the figure. The rain's own light catches
 * the figure's edges (a fine contour, and its faint reflection in the water). Through the breakdown the rain
 * thickens and the points pile up while the contour goes out, until the figure is made of points alone. The hats
 * bring bigger drops, the kick lights up the rings. The scene covers the whole frame (no world background).
 */
export const downpour = defineShaderScene({
  id: "downpour",
  name: "Averse",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.9,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une silhouette immobile sur une eau noire, sous une pluie de gouttes de lumière qui en dessine le contour : chaque goutte trace un anneau sur l'eau et laisse un point sur elle, jusqu'à ce qu'elle ne soit plus faite que de points.",
  params: [paletteParam("mono")],
  uniforms: () => ({
    uDensity: { value: 0.2 },
    uCover: { value: 0 },
    uBig: { value: Array.from({ length: BIG }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uClock: { value: 0 },
    uLast: { value: -99 },
    uHatAt: { value: -99 },
  }),
  update(u, f, _p, dt) {
    const big = u.uBig.value as THREE.Vector4[];
    // Back on screen: the rain starts again, light
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uClock.value = 0;
      for (const b of big) b.set(0, 0, -99, 0);
    }
    u.uLast.value = f.time;
    // The rain's clock runs twice as fast through a breakdown: that is where the figure gets covered
    const on = (u.uClock.value as number) + dt * (f.section === "breakdown" ? 2 : 1);
    u.uClock.value = on;
    // The rain thickens over the scene, and starts denser as the night drifts; the points pile up a bit slower
    u.uDensity.value = Math.min(1, 0.12 + 0.35 * f.drift + on / 70);
    u.uCover.value = Math.min(1, 0.02 + 0.3 * f.drift + on / 90);
    // A hat: a bigger drop near the figure (in the oldest slot)
    if (f.onset && f.time - (u.uHatAt.value as number) > 0.4) {
      u.uHatAt.value = f.time;
      let k = 0;
      for (let i = 1; i < big.length; i++) if (big[i].z < big[k].z) k = i;
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + 2 * Math.random();
      big[k].set(Math.cos(a) * r, Math.sin(a) * r, f.time + 0.6, 0.7 + 0.3 * Math.random());
    }
  },
  fragment: /* glsl */ `
uniform float uDensity;  // share of the rain cells where it rains
uniform float uCover;    // 0..1: how much of the figure the points of light cover
uniform vec4 uBig[${BIG}];     // big drops: where they land (xy), when (z), strength (w)
${ART_LIB}
${CAMERA_GLSL}
const float C = 1.;      // rain cell, on the water
const float P = 2.6;     // seconds between two drops of a cell
const float LIFE = 2.4;  // a ring's life (RS * LIFE < C: a ring never leaves the neighbouring cells)
const float RS = .38;    // ring speed
const float VF = 7.;     // fall speed
const float HTOP = 7.;   // the drops come out of the dark this high
const float SL = .4;     // streak length
const float HS = .17;    // head scale
const vec3 BC = vec3(0., .92, .02), BH = vec3(.38, .93, .28);  // the figure's box

float cellPhase(vec2 c) { return hash12(c * 1.37 + uSeed) * P; }

/** Drop number k of cell c: where it lands (xy), when (z), and whether it falls at all (w). */
vec4 dropOf(vec2 c, float k) {
  vec2 h = vec2(hash12(c + vec2(k * 17.1, 3.3)), hash12(c * 1.7 + vec2(7.1, k * 9.3)));
  float on = step(hash12(c + vec2(11.2 + uSeed, k * 5.7)), uDensity);
  return vec4((c + .12 + .76 * h) * C, k * P - cellPhase(c), on);
}

/** The figure: standing still, arms down, head bowed; it breathes. */
float figure(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float br = .5 + .5 * sin(uTime * .8);
  float d = sdEllipsoid(p - vec3(0., 1.3, 0.), vec3(.19, .17, .11) * (1. + .015 * br));
  d = smin(d, sdEllipsoid(p - vec3(0., 1.08, -.005), vec3(.15, .16, .095)), .08);
  d = smin(d, sdEllipsoid(p - vec3(0., .93, 0.), vec3(.17, .12, .1)), .07);
  d = smin(d, sdEllipsoid(q - vec3(.19, 1.39, 0.), vec3(.08, .065, .07)), .06);
  d = smin(d, sdCapsule(q, vec3(.21, 1.37, 0.), vec3(.235, 1.1, -.02), .042), .03);
  d = smin(d, sdCapsule(q, vec3(.235, 1.1, -.02), vec3(.25, .85, .03), .035), .02);
  d = smin(d, sdEllipsoid(q - vec3(.255, .77, .04), vec3(.024, .06, .036)), .03);
  d = smin(d, sdCapsule(q, vec3(.09, .93, 0.), vec3(.1, .5, .01), .075), .05);
  d = smin(d, sdCapsule(q, vec3(.1, .5, .01), vec3(.1, .1, -.01), .05), .03);
  d = smin(d, sdEllipsoid(q - vec3(.1, .04, .05), vec3(.045, .04, .11)), .04);
  vec3 h = p - vec3(0., 1.6, .015);
  h.xy *= rot(.04 * sin(uTime * .17));
  h.yz *= rot(-.38 - .06 * sin(uTime * .23));
  return smin(d, sdHead(h / HS) * HS, .04);
}

vec3 figN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .0015;
  return normalize(k.xyy * figure(p + k.xyy * h) + k.yyx * figure(p + k.yyx * h) + k.yxy * figure(p + k.yxy * h) + k.xxx * figure(p + k.xxx * h));
}

/**
 * Sphere-trace the figure, only where the ray crosses its box. x: where it hits (-1: it misses); y: how close a miss
 * came to the figure, in pixels (the contour of light just outside its silhouette). pa: a pixel, in radians; t0: how
 * far the ray has already travelled from the eye (a reflected ray).
 */
vec2 marchFigure(vec3 ro, vec3 rd, float tmax, float pa, float t0) {
  vec3 m = 1. / rd;
  vec3 n = m * (ro - BC);
  vec3 k = abs(m) * BH;
  vec3 t1 = -n - k, t2 = -n + k;
  float tn = max(max(t1.x, t1.y), t1.z), tf = min(min(min(t2.x, t2.y), t2.z), tmax);
  if (tn > tf || tf < 0.) return vec2(-1., 1e3);
  float t = max(tn, .02);
  float close = 1e3;
  for (int i = 0; i < 80; i++) {
    float d = figure(ro + rd * t);
    if (d < .0006 * t) return vec2(t, 0.);
    close = min(close, d / ((t0 + t) * pa));
    t += d;
    if (t > tf) break;
  }
  return vec2(-1., close);
}

/** The contour of light just outside the silhouette, from how close (in pixels) a ray passed: about a pixel wide. */
float contour(float close) { return exp(-close * close * .9); }

/**
 * The points of light left on the figure: one per cell of a fine grid, if the cell's turn has come (uCover);
 * each flashes as it lands, then twinkles slowly. Small and sharp, so that even close up they stay points, not
 * blots. fp: a pixel's size at that distance.
 */
float glints(vec3 p, float fp) {
  const float G = .03;
  vec3 b = floor(p / G - .5);
  float s = 0.;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec3 id = b + vec3(mod(fi, 2.), mod(floor(fi * .5), 2.), floor(fi * .25));
    float h = hash13(id + 7.7);
    if (h < uCover) {
      vec3 c = (id + .2 + .6 * vec3(hash13(id + 1.3), hash13(id + 2.7), hash13(id + 4.1))) * G;
      float R = .002 + .0025 * hash13(id + 5.9);
      float r = length(p - c);
      float W = max(R, fp);
      // a hard core and a soft glow around it
      float k = (1. - smoothstep(W * .5, W * 1.5, r)) * R / W * 1.6 + .4 * exp(-r * r / (R * R * 2.));
      float flash = 1. + 4. * exp(-(uCover - h) * 70.);
      s += k * flash * (.7 + .3 * sin(uTime * (.6 + h) + h * 40.));
    }
  }
  return s;
}

/** How much of the figure's own light is left: it goes out as the points cover it, until only the points remain. */
float bodyLight() { return 1. - smoothstep(.45, .97, uCover); }

/**
 * The figure, wet and dark: the rain's light catches its edges (a fine rim, brighter on the shoulders and the head),
 * a faint sheen on what faces the sky; then the points of light it has received.
 */
vec3 figureShade(vec3 p, vec3 n, vec3 rd, float fp) {
  float top = clamp(n.y * .5 + .5, 0., 1.);
  float rim = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
  float sheen = pow(clamp(reflect(rd, n).y, 0., 1.), 6.);
  vec3 c = uInk * bodyLight() * (.012 * top + rim * (.18 + .5 * top) + .06 * sheen * top);
  return c + uInk * glints(p, fp) * (2.2 + .4 * uBeat);
}

/** One ring (and its echo inside) spreading from o; adds its light to lum and its slope to g. */
void ring(vec2 x, vec2 o, float age, float speed, float life, float w, float amp, float fp, inout float lum, inout vec2 g) {
  vec2 v = x - o;
  float r = length(v);
  float fade = 1. - age / life;
  fade *= fade;
  float W = max(w, fp);
  float e = w / W;                 // thinner than a pixel far away: dimmer, never aliasing
  float R = age * speed;
  float d1 = r - R, d2 = r - R * .62;
  lum += amp * fade * e * ((1. - smoothstep(0., W, abs(d1))) + .45 * (1. - smoothstep(0., W, abs(d2))));
  // the ping: a flash where the drop lands
  lum += amp * 2.5 * exp(-age * 16.) * (1. - smoothstep(0., max(.025, fp), r));
  g += v / max(r, 1e-4) * amp * fade * -10. * d1 * exp(-d1 * d1 / .0012);
}

/** The rings on the water at x: their light (x) and the slope they give the surface (yz). */
vec3 ripples(vec2 x, float fp) {
  vec2 c0 = floor(x / C);
  float lum = 0.;
  vec2 g = vec2(0.);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = c0 + vec2(i, j);
      vec4 dr = dropOf(c, floor((uTime + cellPhase(c)) / P));
      float age = uTime - dr.z;
      if (dr.w > .5 && age < LIFE) ring(x, dr.xy, age, RS, LIFE, .006, 1., fp, lum, g);
    }
  for (int s = 0; s < ${BIG}; s++) {
    vec4 b = uBig[s];
    float age = uTime - b.z;
    if (age > 0. && age < 4.) ring(x, b.xy, age, .28, 4., .009, 2. * b.w, fp, lum, g);
  }
  return vec3(lum * (1. + 2. * uBeat), g);
}

/** A falling drop: a short vertical streak of light from a, seen by the ray (up to tEnd). */
float streak(vec3 ro, vec3 rd, vec3 a, float tEnd, float pa) {
  vec3 w = ro - a;
  float b = rd.y, d = dot(rd, w);
  float tc = clamp((w.y - b * d) / max(1. - b * b, 1e-4), 0., SL);
  vec3 s = a + vec3(0., tc, 0.);
  float sc = dot(s - ro, rd);
  if (sc < .05 || sc > tEnd) return 0.;
  vec3 dv = ro + rd * sc - s;
  // a fine line however close the drop: never wider than a pixel and a half, a little brighter instead
  float W = max(min(.005, sc * pa * 1.5), sc * pa * .7);
  // a drop brushing past the eye would still flash across the frame: let it through unseen
  return exp(-dot(dv, dv) / (W * W)) * min(1.6, .005 / W) * (1. - .7 * tc / SL) * exp(-sc * .04) * smoothstep(.5, 1.6, sc);
}

/** The rain the ray sees: the next drop of every cell it passes over, then the big drops. */
float rain(vec3 ro, vec3 rd, float tEnd, float pa) {
  vec2 cell = floor(ro.xz / C);
  vec2 st = vec2(rd.x < 0. ? -1. : 1., rd.z < 0. ? -1. : 1.);
  vec2 inv = 1. / max(abs(rd.xz), vec2(1e-5));
  vec2 tM = ((cell + max(st, 0.)) * C - ro.xz) * st * inv;
  vec2 tD = C * inv;
  float acc = 0.;
  for (int i = 0; i < 24; i++) {
    vec4 dr = dropOf(cell, floor((uTime + cellPhase(cell)) / P) + 1.);
    float y = VF * (dr.z - uTime);
    if (dr.w > .5 && y < HTOP) acc += streak(ro, rd, vec3(dr.x, y, dr.y), tEnd, pa);
    if (min(tM.x, tM.y) > tEnd) break;
    if (tM.x < tM.y) { cell.x += st.x; tM.x += tD.x; }
    else { cell.y += st.y; tM.y += tD.y; }
  }
  for (int s = 0; s < ${BIG}; s++) {
    vec4 b = uBig[s];
    float y = VF * (b.z - uTime);
    if (y > 0. && y < HTOP) acc += 1.8 * b.w * streak(ro, rd, vec3(b.x, y, b.y), tEnd, pa);
  }
  return acc;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  ro.y = max(ro.y, .05);
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);   // a pixel, in radians
  float tw = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  vec2 fm = marchFigure(ro, rd, min(tw, 40.), pa, 0.);
  float tt = fm.x;
  float body = bodyLight();
  vec3 col = vec3(0.);
  float tEnd = rd.y > 1e-3 ? min(30., (HTOP + SL - ro.y) / rd.y) : 30.;
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    col = figureShade(p, figN(p), rd, tt * pa);
    tEnd = tt;
  } else if (tw < 60.) {
    vec3 p = ro + rd * tw;
    // a pixel on the water, stretched at grazing angles
    float fp = tw * pa / sqrt(max(-rd.y, .02));
    vec3 rp = ripples(p.xz, fp);
    vec3 n = normalize(vec3(-rp.y, 1., -rp.z));
    vec3 rr = reflect(rd, n);
    // black water, a dark mirror: the figure trembles in it, faint, with the rings
    vec3 refl = uAccent * .03 * exp(-abs(rr.y) * 40.);
    vec2 fr = marchFigure(p + n * .002, rr, 12., pa, tw);
    if (fr.x > 0.) {
      vec3 q = p + rr * fr.x;
      refl = figureShade(q, figN(q), rr, (tw + fr.x) * pa);
    } else refl += uInk * .5 * body * contour(fr.y);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
    col = refl * (.3 + .4 * fre);
    col += uInk * rp.x * 1.25 * exp(-tw * .045);
    tEnd = tw;
  }
  // the contour of light around the figure, a pixel wide, just outside its silhouette
  if (tt < 0.) col += uInk * .55 * body * contour(fm.y);
  // the horizon: the faintest line where the water meets the night
  col += uAccent * .035 * exp(-abs(rd.y) * 70.);
  col += uInk * rain(ro, rd, tEnd, pa);
  // the scene covers the whole frame: the world's background never shows through the night
  gl_FragColor = vec4(hdrOut(col * 1.1), 1.);
}
`,
});
