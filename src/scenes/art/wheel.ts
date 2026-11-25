import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { WHITE_GLSL } from "./white.glsl";

const FRAMINGS: Framing[] = [
  // at the potter's eye, a little above the wheel
  { az: 0.25, el: 0.32, dist: 3.4, target: [0, 0.45, 0], focal: 1.9, weight: 3 },
  // low, level with the clay
  { az: -0.5, el: 0.05, dist: 3, target: [0, 0.5, 0], focal: 2, weight: 2 },
  // from above, into the opening
  { az: 0.1, el: 1.15, dist: 2.6, target: [0, 0.6, 0], focal: 1.8, weight: 2 },
  // close on the turning wall of wet clay
  { az: 0.8, el: 0.15, dist: 1.4, target: [0.15, 0.55, 0.1], focal: 2.1, weight: 2 },
];

const DROPS = 8;

/**
 * The wheel: white porcelain clay, wet, spinning on a potter's wheel, with no hands. Through the build it slowly
 * rises from a centred lump into a tall vase (its shape follows the build); on the drop the vase slumps on itself,
 * then rises again over a few bars. Slip shines in streaks on it; the hats throw drops of slip off its rim.
 */
export const wheel = defineShaderScene({
  id: "wheel",
  name: "Le Tour",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.85,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "De l'argile blanche et mouillée tourne sur un tour de potier : elle s'élève en vase à la montée, s'affaisse au drop puis remonte ; des gouttes de barbotine partent sur les charleys.",
  params: [paletteParam("porcelain")],
  uniforms: () => ({
    uShape: { value: 0.2 },
    uSlump: { value: 0 },
    uSpin: { value: 0 },
    uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, -99, 0, 0)) },
    // state kept on the CPU side only
    uDropT: { value: 99 },
    uHatAt: { value: -99 },
    uNext: { value: 0 },
  }),
  update(u, f, _p, dt) {
    // the wheel turns at its own speed
    u.uSpin.value = (u.uSpin.value as number) + dt * 4.2;
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    if (f.drop) u.uDropT.value = 0;
    const dropT = (u.uDropT.value as number) + dt;
    u.uDropT.value = dropT;
    // the shape: the build raises it; the drop slumps it, then it rises again over four bars
    const goal =
      f.section === "build" ? 0.25 + 0.75 * f.buildProgress : dropT < bar * 4 ? 0.12 + 0.5 * Math.max(0, dropT / (bar * 4) - 0.15) : f.section === "breakdown" ? 0.4 : 0.6;
    const s = u.uShape.value as number;
    const rate = dropT < bar * 0.6 ? 3.5 : 0.35;
    u.uShape.value = s + (goal - s) * (1 - Math.exp(-dt * rate));
    // the slump: a lean and a wobble that settle
    u.uSlump.value = dropT < bar * 4 ? Math.sin(Math.min(1, dropT / (bar * 0.5)) * Math.PI * 0.5) * Math.exp(-dropT / (bar * 1.6)) : 0;
    // a hat throws a drop of slip off the rim
    if (f.onset && f.time - (u.uHatAt.value as number) > 0.18) {
      u.uHatAt.value = f.time;
      const i = (u.uNext.value as number) % DROPS;
      u.uNext.value = i + 1;
      (u.uDrops.value as THREE.Vector4[])[i].set(Math.random() * Math.PI * 2, f.time, 0.7 + Math.random() * 0.6, Math.random());
    }
  },
  fragment: /* glsl */ `
uniform float uShape;   // 0: a centred lump, 1: a tall vase
uniform float uSlump;   // the drop's slump
uniform float uSpin;    // the wheel's angle
uniform vec4 uDrops[${DROPS}];  // drops of slip: angle, birth time, speed, size
${ART_LIB}
${CAMERA_GLSL}
${WHITE_GLSL}
const float FLOORT = -.62;
const vec3 L = normalize(vec3(-.55, .75, .5));
float gMat;   // 0 clay, 1 wheel, 2 splash pan

/** The clay's height and its radius at height y (a solid of revolution, its shape following uShape). */
float clayH() { return mix(.38, 1.3, uShape); }
float clayR(float y) {
  float H = clayH();
  float u = clamp(y / H, 0., 1.);
  float lump = .34 * sqrt(max(1. - u * u, 0.)) + .04 * (1. - u);
  float vase = .12 + .2 * exp(-pow((u - .36) / .24, 2.)) - .045 * exp(-pow((u - .82) / .1, 2.)) + .05 * smoothstep(.86, 1., u);
  return mix(lump, vase, smoothstep(.1, .9, uShape));
}

float clay(vec3 p) {
  // the slump: the vase leans and sags
  p.xz -= vec2(.16, .05) * uSlump * p.y * p.y;
  p.y /= 1. - .35 * uSlump;
  float ang = atan(p.z, p.x);
  float r = clayR(p.y);
  // throwing rings, and a slight asymmetry that turns with the wheel (so the turning shows)
  r += .0025 * sin(p.y * 70.) + .004 * sin(ang * 3. - uSpin + p.y * 5.) + .03 * uSlump * sin(ang * 2. + p.y * 9.);
  float H = clayH();
  float d = (length(p.xz) - r) * .6;
  d = max(d, p.y - H);
  // a vase is hollow: its wall a finger thick, open at the top
  float open = smoothstep(.3, .55, uShape);
  if (open > .01 && p.y > .12) d = max(d, -((length(p.xz) - (r - .03)) * .6) - (1. - open) * .2);
  return max(d, -p.y);
}

float map(vec3 p) {
  float c = clay(p);
  // the wheel head, and the splash pan around it
  float head = max(length(p.xz) - .52, abs(p.y + .03) - .03);
  vec2 pq = vec2(length(p.xz) - .78, p.y + .1);
  float pan = max(length(pq) - .1, -(length(p.xz) - .7)) ;
  pan = max(pan, p.y - .02);
  float base = max(length(p.xz) - .74, max(p.y + .1, -.6 - p.y));
  float d = min(c, min(head, min(pan, base)));
  gMat = c <= min(head, min(pan, base)) ? 0. : head < min(pan, base) ? 1. : 2.;
  return d;
}

vec3 calcN(vec3 p) {
  vec2 e = vec2(.0015, 0.);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  // the white studio, the wheel's soft shadow on the floor
  vec3 col = studioW(rd);
  if (rd.y < -1e-3) {
    vec3 fq = ro + rd * ((FLOORT - ro.y) / rd.y);
    col *= 1. - .3 * exp(-dot(fq.xz, fq.xz) * 2.5);
  }
  float t = .05, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .0006 * t) { tt = t; break; }
    t += d;
    if (t > 12.) break;
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec3 n = calcN(p);
    float dif = clamp(dot(n, L), 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
    float spe = pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 70.);
    if (mat < .5) {
      // wet porcelain clay: soft white, shining; streaks of slip that turn with it
      float ang = atan(p.z, p.x) - uSpin;
      float streak = smoothstep(.55, 1., sin(ang * 7. + p.y * 3. + sin(ang * 2.) * 2.)) * (.5 + .5 * sin(p.y * 13.));
      vec3 c = uInk * vec3(1., .985, .96) * (.55 + .9 * dif) + uInk * .28;
      c *= 1. - .1 * streak;
      c = mix(c, envW(reflect(rd, n)), .06 + .5 * fre);
      c += (.9 + .8 * streak) * spe + pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 16.) * .12;
      // inside the vase: shade
      if (length(p.xz) < clayR(p.y) - .02) c *= .55;
      col = c;
    } else if (mat < 1.5) {
      // the wheel head: plaster grey, its lines turning
      float ang = atan(p.z, p.x) - uSpin;
      col = uInk * (.6 + .5 * dif) * (.85 + .1 * step(.5, fract(ang * 6. / 6.2831)));
    } else {
      // the splash pan, splattered with slip
      col = uInk * (.5 + .45 * dif) + uInk * .15 * step(.8, vnoise(p * 20.));
    }
    col = mix(col, studioW(rd), smoothstep(6., 14., tt));
  }
  // the drops of slip thrown off the rim
  float H = clayH();
  for (int i = 0; i < ${DROPS}; i++) {
    vec4 dr = uDrops[i];
    float age = uTime - dr.y;
    if (age < 0. || age > 1.4) continue;
    float a = dr.x;
    vec3 o = vec3(cos(a), 0., sin(a)) * clayR(H * .95);
    o.y = H * .95;
    vec3 tang = vec3(-sin(a), 0., cos(a));
    vec3 q = o + (tang * 1.6 + normalize(o * vec3(1., 0., 1.)) * .6) * dr.z * age + vec3(0., 1.2 * age - 4.9 * age * age, 0.);
    float s = dot(q - ro, rd);
    if (s < 0. || (tt > 0. && s > tt)) continue;
    float dd = length(q - ro - rd * s);
    float R = (.012 + .01 * dr.w);
    float W = max(R, s * pa);
    // a white drop: its rim darker against the white, a glint
    col = mix(col, uInk * .7, (1. - smoothstep(W * .6, W * 1.2, dd)) * .7);
    col += vec3(1.) * exp(-dd * dd / (W * W * .15)) * .6;
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
