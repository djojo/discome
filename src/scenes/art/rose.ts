import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  // from far down the nave: the rose high in its wall, the shafts falling to the floor
  { az: 0.05, el: 0.02, dist: 15, target: [0, 5, 0], focal: 1.5, weight: 3 },
  // low, near the mirror floor: the rose and its reflection
  { az: -0.25, el: -0.36, dist: 13, target: [0, 4, 0], focal: 1.5, weight: 2 },
  // from below, looking up at it
  { az: 0.15, el: -0.95, dist: 6.5, target: [0, 6, 0], focal: 1.5, weight: 2 },
  // three-quarters, past the edge of a pillar
  { az: 0.62, el: 0.06, dist: 13, target: [0, 5.4, 0], focal: 1.7, weight: 2 },
];

/**
 * The rose: a huge gothic rose window made of light, in the world's single colour, high in the dark west wall of a
 * nave, seen from its floor in the haze. Its petals are screens (rounded rectangles, nothing on them) in three
 * rings around a heart; it turns very slowly. Shafts of light carry its pattern through the haze down to the mirror
 * floor. The hats light a few petals like notifications, the kick breathes the shafts; through the build the rings
 * light up one after the other from the heart outward; on the drop the rose blazes and its shafts flood the nave;
 * in the breakdown only the heart still glows.
 */
export const rose = defineShaderScene({
  id: "rose",
  name: "La Rosace",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.85,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Une immense rosace de lumière dont les pétales sont des écrans ; ses rais traversent la brume jusqu'au sol miroir. Les anneaux s'allument à la montée, la rosace s'embrase au drop.",
  params: [paletteParam("signalRed")],
  uniforms: () => ({
    uRings: { value: new THREE.Vector4(0.8, 0.5, 0.35, 0.25) },
    uRot: { value: 0 },
    uFlare: { value: 0 },
    uDense: { value: 0.5 },
    uKickT: { value: 9 },
    uHatT: { value: -99 },
    uHatN: { value: 0 },
  }),
  update(u, f, _p, dt) {
    const rings = u.uRings.value as THREE.Vector4;
    const p = f.buildProgress;
    // the heart, then the three rings
    const target =
      f.section === "build"
        ? [1, 0.4 + 0.8 * smooth01(p * 3), 0.3 + 0.9 * smooth01(p * 3 - 1), 0.2 + 1 * smooth01(p * 3 - 2)]
        : f.section === "drop"
          ? [1.2, 1.1, 1.05, 1]
          : f.section === "breakdown"
            ? [0.55, 0.04, 0.03, 0.02]
            : [0.85, 0.5, 0.35, 0.25];
    const k = 1 - Math.exp(-dt * 1.2);
    rings.set(rings.x + (target[0] - rings.x) * k, rings.y + (target[1] - rings.y) * k, rings.z + (target[2] - rings.z) * k, rings.w + (target[3] - rings.w) * k);
    // its own pace: a slow turn
    u.uRot.value = (u.uRot.value as number) + dt * 0.012;
    // the drop: at once, or one soft ramp with « Limiter les flashs »
    const flare = u.uFlare.value as number;
    u.uFlare.value = f.safeFlash ? flare + (f.dropPulse * 0.7 - flare) * (1 - Math.exp(-dt * 1.5)) : f.dropPulse;
    const dense = f.section === "drop" ? 1 : f.section === "breakdown" ? 0.3 : 0.55;
    u.uDense.value = (u.uDense.value as number) + (dense - (u.uDense.value as number)) * (1 - Math.exp(-dt * 0.8));
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    if (f.onset && f.time - (u.uHatT.value as number) > 0.12) {
      u.uHatT.value = f.time;
      u.uHatN.value = ((u.uHatN.value as number) + 1) % 997;
    }
  },
  fragment: /* glsl */ `
uniform vec4 uRings;   // light of the heart and of the three rings
uniform float uRot;    // the rose's slow turn
uniform float uFlare;  // the drop
uniform float uDense;  // haze density
uniform float uKickT;  // seconds since the kick
uniform float uHatT;   // the last hat, and how many so far
uniform float uHatN;
${ART_LIB}
${CAMERA_GLSL}
const vec3 C = vec3(0., 6., 0.);   // the rose's centre, in the wall z = 0
const float R = 3.3;               // its radius
const float FLOOR = -1.;
const vec3 L = vec3(.0, -.42, .91); // the light, falling through the rose toward the nave (+z) and down
const vec2 PIL = vec2(4.7, 3.);    // the pillars (x = ±4.7, z = 3), radius .62
const float PR = .62;

/** A lancet: a rounded box below, a pointed (equilateral) arch above; q.y points out of the rose. */
float sdLancet(vec2 q, vec2 hs) {
  float w = hs.x;
  float yb = hs.y - 1.732 * w;
  float box = sdBox(vec3(q - vec2(0., (yb - hs.y) * .5), 0.), vec3(w, (yb + hs.y) * .5, 1.));
  float arch = max(max(length(q - vec2(w, yb)), length(q - vec2(-w, yb))) - 2. * w, yb - q.y);
  return min(box, arch);
}

/**
 * How much light the rose lets through at a point of its plane (xy), and how much of a petal's edge is there.
 * pix: a pixel's size on the plane. Returns (light, petal mask, ring).
 */
vec3 rose(vec2 xy, float pix) {
  vec2 v = (xy - C.xy) / R;
  float r = length(v);
  if (r > 1.04) return vec3(0.);
  float th = atan(v.y, v.x) + uRot;
  float px = pix / R;
  float lit = 0., mask = 0., ring = 0.;
  float flare = uFlare;
  float hat = exp(-(uTime - uHatT) * 5.);
  if (r < .2) {
    // the heart: a round screen
    mask = 1. - smoothstep(.17 - px, .17 + px, r);
    lit = uRings.x * (1. + .3 * sin(uTime * .7)) + 4. * flare;
    ring = 0.;
  } else {
    float n = r < .54 ? 8. : r < .84 ? 16. : 32.;
    float r0 = r < .54 ? .24 : r < .84 ? .57 : .86;
    float r1 = r < .54 ? .52 : r < .84 ? .82 : .97;
    ring = r < .54 ? 1. : r < .84 ? 2. : 3.;
    float cell = th * n / 6.2831853;
    float id = floor(cell);
    float a = fract(cell) - .5;
    // the petal: a rounded rectangle in metric units on the plane
    float rm = (r0 + r1) * .5;
    vec2 q = vec2(a * 6.2831853 * r / n, r - rm);
    vec2 hs = vec2(.34 * 6.2831853 * rm / n, (r1 - r0) * .5 - .015);
    float sd = sdLancet(q, hs);
    mask = 1. - smoothstep(-px, px, sd);
    // each screen its own light, a slow life, and the notifications on the hats
    float h = hash12(vec2(id, ring) + 3.7);
    float level = ring < 1.5 ? uRings.y : ring < 2.5 ? uRings.z : uRings.w;
    float life = .55 + .45 * sin(uTime * (.15 + .2 * h) + h * 40.);
    float notif = step(hash12(vec2(id, ring) + uHatN * 1.37), .1) * hat * 2.5;
    // the screen glows brighter at its centre
    float core = .75 + .25 * (1. - clamp(-sd / max(hs.y, 1e-3), 0., 1.));
    lit = (level * life + notif) * core + 3. * flare;
  }
  return vec3(lit * mask, mask, ring);
}

/** The light that comes through the rose along the light's direction, reaching a point p in front of the wall. */
float shaft(vec3 p) {
  if (p.z <= 0.) return 0.;
  vec3 w = p - L * (p.z / L.z);
  return rose(w.xy, .08).x;
}

/** The two pillars in front of the wall: distance along the ray, and the normal. */
float pillars(vec3 ro, vec3 rd, out vec3 nrm) {
  float best = 1e9;
  for (int i = 0; i < 2; i++) {
    vec2 c = vec2(i == 0 ? -PIL.x : PIL.x, PIL.y);
    vec2 oc = ro.xz - c;
    float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), cc = dot(oc, oc) - PR * PR;
    float h = b * b - a * cc;
    if (h > 0.) {
      float t = (-b - sqrt(h)) / a;
      if (t > 0. && t < best) {
        best = t;
        vec3 p = ro + rd * t;
        nrm = normalize(vec3(p.x - c.x, 0., p.z - c.y));
      }
    }
  }
  return best;
}

/** The light the rose throws onto a point of the floor, and the rose seen in the floor's mirror. */
vec3 floorLight(vec3 p, vec3 rd, float pa, float tFloor) {
  vec3 c = uInk * shaft(p) * .35;
  // the wet floor mirrors the rose
  vec3 rr = vec3(rd.x, -rd.y, rd.z);
  if (rr.z < -1e-3) {
    float tw = -p.z / rr.z;
    vec3 w = p + rr * tw;
    c += uInk * rose(w.xy, (tFloor + tw) * pa / max(-rr.z, .2)).x * .35;
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  vec3 col = uBase * .5;

  // the surfaces: the wall with its rose, the floor, the pillars
  float tWall = rd.z < -1e-4 ? -ro.z / rd.z : 1e9;
  float tFloor = rd.y < -1e-4 ? (FLOOR - ro.y) / rd.y : 1e9;
  vec3 pn;
  float tPil = pillars(ro, rd, pn);
  float tEnd = min(min(tWall, tFloor), min(tPil, 60.));

  if (tEnd == tWall) {
    vec3 p = ro + rd * tWall;
    vec3 rs = rose(p.xy, tWall * pa / max(-rd.z, .15));
    // the stone between the screens: dark, a little of the light the rose spills on it
    float spill = exp(-max(length(p.xy - C.xy) - R, 0.) * .6) * (.04 + .35 * uFlare);
    col = uBase * .8 + uInk * spill + uInk * rs.x * 1.4;
  } else if (tEnd == tFloor) {
    vec3 p = ro + rd * tFloor;
    col = uBase * .6 + floorLight(p, rd, pa, tFloor);
  } else if (tEnd == tPil) {
    vec3 p = ro + rd * tPil;
    // a stone pillar: dark, its edge caught by the shafts around it
    float rim = pow(1. - abs(dot(pn, -rd)), 3.);
    col = uBase * .7 + uInk * (shaft(p + pn * .3) * .25 + .03) * (.4 + rim);
  }

  // The shafts: the rose's pattern carried through the haze
  float j = hash12(fc + fract(uTime) * 37.);
  float tMax = min(tEnd, 40.);
  float dt = tMax / 28.;
  float acc = 0.;
  for (int i = 0; i < 28; i++) {
    vec3 q = ro + rd * (dt * (float(i) + j));
    if (q.y < FLOOR) break;
    acc += shaft(q) * exp(-q.z * .05) * dt;
  }
  float breath = 1. + .5 * exp(-uKickT * 4.);
  col += uInk * acc * .11 * uDense * breath * (1. + 1.5 * uFlare);
  // the haze itself, faintly lit, flooded on the drop
  col += uInk * .015 * uDense * (1. + 7. * uFlare);

  // the hottest light whitens, as glowing glass does
  float lum = dot(col, vec3(.3, .59, .11));
  col = mix(col, mix(uInk, vec3(1.), .6) * lum * 1.2, smoothstep(.8, 3., lum));
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});

function smooth01(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
