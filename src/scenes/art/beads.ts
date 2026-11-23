import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { STUDIO_GLSL } from "./studio.glsl";
import { DETAIL_GLSL } from "./detail.glsl";

/** Mercury drops on the plate. */
const N = 8;

const FRAMINGS: Framing[] = [
  // low, at the height of the drops
  { az: 0.2, el: 0.22, dist: 3.4, target: [0, 0.15, 0], focal: 1.9, weight: 3 },
  // macro: one drop and its neighbours, the room curving in them
  { az: -0.7, el: 0.15, dist: 2.2, target: [0, 0.12, 0], focal: 2.1, weight: 3 },
  { az: 1.3, el: 0.6, dist: 4, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "open" },
  { az: 0.5, el: 1.2, dist: 5.5, target: [0, 0, 0], focal: 1.8, weight: 1, tag: "open" },
];

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * Billes: drops of mercury resting on a black mirror plate, heavy, flattened by their weight. They slide slowly,
 * meet and merge, part again, and the whole room curves in them. The music never pushes them around: the kick
 * makes them tremble, the bass swells them a little. On the drop they all flow into one pool, which splashes into a
 * ring of tiny droplets sliding away, and the drops gather again.
 */
export const beads = defineShaderScene({
  id: "mercury-beads",
  name: "Billes",
  energy: "calm",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Gouttes de mercure lourdes posées sur un miroir noir : elles glissent lentement, se rejoignent et fusionnent ; elles tremblent au kick ; au drop elles coulent en une flaque qui éclabousse en gouttelettes.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uB: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0.3)) },
    uK: { value: 0.12 },
    uWob: { value: 0 },
    uSplash: { value: 99 },
    // CPU side only
    uPh: { value: Array.from({ length: N * 4 }, () => Math.random()) },
    uLow: { value: 0 },
    uDropAge: { value: 99 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt, ctx) {
    if (f.time - (u.uLast.value as number) > 1.5) u.uDropAge.value = 99;
    u.uLast.value = f.time;
    const b = u.uLow.value as number;
    const low = b + (f.bass - b) * (1 - Math.exp(-dt * (f.bass > b ? 6 : 2)));
    u.uLow.value = low;
    // the kick: a tremble running through the metal, never a push
    u.uWob.value = f.beat ? 1 : (u.uWob.value as number) * Math.exp(-dt * 3.5);
    if (f.drop) {
      u.uDropAge.value = 0;
      ctx.camera?.request("open");
    } else u.uDropAge.value = (u.uDropAge.value as number) + dt;
    // The drop: everything flows into one pool (1.2 s), which splashes; the drops then gather again (6 s)
    const td = u.uDropAge.value as number;
    const merge = td < 1.2 ? smooth(td / 1.2) : td < 1.6 ? 1 : 0;
    const after = td >= 1.6 && td < 9;
    u.uSplash.value = after ? td - 1.6 : 99;
    const regrow = after ? smooth((td - 1.6 - 0.8) / 5) : 1;
    u.uK.value = 0.12 + 0.3 * merge;

    const ph = u.uPh.value as number[];
    const drops = u.uB.value as THREE.Vector4[];
    // slow: a drop crosses the plate in about a minute
    const t = f.time * 0.045;
    for (let i = 0; i < N; i++) {
      const a = ph[i * 4], c = ph[i * 4 + 1], s = ph[i * 4 + 3];
      let x = Math.sin(t * (0.7 + 0.5 * a) + a * 6.28) * 1.3 + 0.3 * Math.sin(t * 2.3 + c * 6.28);
      let z = Math.sin(t * (0.6 + 0.5 * c) + c * 6.28) * 1.1 + 0.3 * Math.cos(t * 1.9 + a * 6.28);
      const spread = (after ? Math.max(regrow, 0.02) : 1) * (1 - merge);
      x *= spread;
      z *= spread;
      let r = (0.16 + 0.2 * s) * (1 + 0.15 * low);
      r = r + (0.62 - r) * merge;
      if (after) r *= regrow;
      drops[i].set(x, 0, z, r);
    }
  },
  fragment: /* glsl */ `
uniform vec4 uB[${N}];
uniform float uK;        // how softly they melt into each other
uniform float uWob;      // the kick: a tremble
uniform float uSplash;   // seconds since the splash
${ART_LIB}
${CAMERA_GLSL}
${STUDIO_GLSL}
${DETAIL_GLSL}

/** A drop on the plate: flattened by its weight, trembling on the kick. */
float drop(vec3 p, vec4 b, float i) {
  float w = uWob * .14 * sin(uTime * 17. + i * 2.1);
  vec3 rr = b.w * vec3(1. - .5 * w, .64 * (1. + w), 1. - .5 * w);
  return sdEllipsoid(p - vec3(b.x, rr.y * .92, b.z), rr);
}

float dropsD(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < ${N}; i++) {
    vec4 b = uB[i];
    if (b.w > .005) d = smin(d, drop(p, b, float(i)), uK);
  }
  return d;
}

/** The splash: a ring of tiny droplets sliding away over the plate, shrinking. */
float splashD(vec3 p) {
  if (uSplash > 4.) return 1e3;
  float R = .5 + 2.6 * (1. - exp(-uSplash * 1.1));
  float rb = .05 * (1. - smoothstep(1.5, 4., uSplash));
  float r = length(p.xz);
  float ring = abs(r - R) - .35;
  if (ring > .2 || p.y > .2) return max(ring, p.y - .15);
  const float M = 72.;
  float a = atan(p.z, p.x);
  float k = floor(a / 6.2831853 * M + .5);
  float h = hash12(vec2(k, 2.3));
  if (h > .7) return .08;
  float ak = k / M * 6.2831853;
  float rk = R * (.85 + .3 * hash12(vec2(k, 5.1)));
  vec3 c = vec3(cos(ak) * rk, rb * .6, sin(ak) * rk);
  float s = rb * (.6 + .8 * hash12(vec2(k, 7.7)));
  return min(sdEllipsoid(p - c, vec3(s, s * .6, s)), .08);
}

float map(vec3 p) { return min(dropsD(p), splashD(p)); }
${MARCH}

/** The other drops, seen in a drop (or in the plate). */
float march2(vec3 ro, vec3 rd, float tmax) {
  float t = .01;
  for (int i = 0; i < 40; i++) {
    float d = map(ro + rd * t);
    if (d < .002) return t;
    t += d;
    if (t > tmax) break;
  }
  return -1.;
}

/** Mercury: the room curved in it, nearly whole; the plate and the other drops in it too. */
vec3 mercury(vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 c = studio(r);
  float t2 = march2(p + n * .005, r, 5.);
  if (t2 > 0.) {
    vec3 q = p + n * .005 + r * t2;
    c = studio(reflect(r, calcNormal(q))) * .75;
  } else if (r.y < 0.) {
    // the black glass plate, seen in the drop: the room mirrored in it, darker
    c = studio(reflect(r, vec3(0., 1., 0.))) * .3;
  }
  c *= mix(uInk * .9, vec3(1.), fre);
  // contact: a thin dark line where the drop meets the plate
  c *= .25 + .75 * smoothstep(.0, .025, p.y);
  return c;
}

/**
 * Capillary ripples: fine rings running slowly out from the top of the nearest drop, never quite still, stirred by the
 * kick. Only close up, where they are wider than a few pixels.
 */
vec3 ripples(vec3 p, vec3 n, float pix) {
  const float F = 70.;
  float vis = resolved(3.1416 / F, pix);
  if (vis < .01) return n;
  float best = 1e3;
  vec4 bb = vec4(0.);
  for (int i = 0; i < ${N}; i++) {
    vec4 b = uB[i];
    if (b.w < .005) continue;
    float r = length(p.xz - b.xz) / b.w;
    if (r < best) { best = r; bb = b; }
  }
  if (best > 1.1) return n;
  vec2 dv = p.xz - bb.xz;
  float rr = length(dv);
  vec3 dir = vec3(dv.x, 0., dv.y) / max(rr, 1e-4);
  dir -= n * dot(dir, n);
  float amp = (.06 + .16 * uWob) * vis * smoothstep(1.1, .5, best) * smoothstep(.0, .3, best);
  return normalize(n - dir * cos(rr * F - uTime * 1.5) * amp);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .6 + uInk * .03 * exp(-2. * length(uv));
  float solid = 0.;
  float tp = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = march(ro, rd, min(tp, 20.));
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    col = mercury(p, ripples(p, n, pixelSize(t, n, rd)), rd);
    solid = 1.;
  } else if (tp < 40.) {
    // the plate: black glass, the drops mirrored in it, fading far away
    vec3 p = ro + rd * tp;
    vec3 r = reflect(rd, vec3(0., 1., 0.));
    float fre = .06 + .5 * pow(1. - abs(rd.y), 5.);
    vec3 c = uBase * .25 + studio(r) * fre * .5;
    float t2 = march2(p + vec3(0., .002, 0.), r, 6.);
    if (t2 > 0.) {
      vec3 q = p + r * t2;
      c = mercury(q, calcNormal(q), r) * .55;
    }
    float fade = exp(-length(p.xz) * .25);
    col = mix(col, c, fade);
    solid = fade;
  }
  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
