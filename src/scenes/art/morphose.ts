import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.02, dist: 5.4, target: [0, 0, 0], focal: 1.9, weight: 3, tag: "open" },
  { az: 0.55, el: 0.22, dist: 5, target: [0, 0, 0], focal: 1.9, weight: 2 },
  // close on the heart of the form
  { az: -0.3, el: 0.1, dist: 2.6, target: [0, 0, 0.1], focal: 2.1, weight: 2 },
  // from the side: the petals' depth and their curl
  { az: 1.25, el: -0.12, dist: 5.2, target: [0, 0, 0], focal: 1.9, weight: 1, tag: "open" },
];

/** Number of shape families the form travels through. */
const FAMILIES = 4;

/**
 * Morphose: the Halo in three dimensions. A floating form of nacre and translucent flesh with radial symmetry;
 * each of its branches is a band of the spectrum, lengthening, swelling and curling with it like the rays of
 * the Halo. At its own slow pace it travels from one family of shapes to the next (urchin, flower, star, ring).
 * A wave of light runs from its heart along the branches on the kick; on the drop it opens like a corolla,
 * then closes into a new family.
 */
export const morphose = defineShaderScene({
  id: "flesh-morph",
  name: "Morphose",
  energy: "medium",
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Le Halo en 3D : une forme de nacre et de chair translucide à symétrie rayonnante, dont chaque branche suit une bande du spectre ; elle passe lentement d'une famille de formes à l'autre, s'ouvre en corolle au drop.",
  params: [paletteParam("flesh")],
  uniforms: () => ({
    uArm: { value: new Array<number>(8).fill(0.3) },
    uFamA: { value: 0 },
    uFamB: { value: 1 },
    uMorph: { value: 0 },
    uOpen: { value: 0 },
    uWave: { value: 9 },
    uGlow: { value: 0 },
    uSpin: { value: 0 },
    // CPU side only
    uDropAge: { value: 99 },
    uHold: { value: 0 },
  }),
  update(u, f, _p, dt, ctx) {
    // Each branch follows its band, smoothly
    const arm = u.uArm.value as number[];
    const per = f.bands.length / 8;
    for (let i = 0; i < 8; i++) {
      let s = 0;
      for (let j = 0; j < per; j++) s += f.bands[i * per + j];
      const v = Math.min(1, (s / per) * 1.6);
      arm[i] += (v - arm[i]) * (1 - Math.exp(-dt * (v > arm[i] ? 9 : 2.5)));
    }
    // The form travels to the next family at its own pace (a transformation of ~12 s, then a hold of ~20 s)
    let m = u.uMorph.value as number;
    let hold = (u.uHold.value as number) + dt;
    if (m > 0 || hold > 20) {
      m += dt / 12;
      hold = 0;
      if (m >= 1) {
        u.uFamA.value = u.uFamB.value;
        u.uFamB.value = ((u.uFamB.value as number) + 1) % FAMILIES;
        m = 0;
      }
    }
    // The drop: it opens like a corolla over a bar, and closes into the next family
    if (f.drop) {
      u.uDropAge.value = 0;
      ctx.camera?.request("open");
      if (m < 0.5) {
        u.uFamA.value = u.uFamB.value;
        u.uFamB.value = ((u.uFamB.value as number) + 1) % FAMILIES;
        m = 0;
        hold = 0;
      }
    } else u.uDropAge.value = (u.uDropAge.value as number) + dt;
    u.uMorph.value = m;
    u.uHold.value = hold;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const td = (u.uDropAge.value as number) / bar;
    u.uOpen.value = td < 3 ? Math.sin(Math.min(1, td / 2.2) * Math.PI) : 0;
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    const g = u.uGlow.value as number;
    u.uGlow.value = g + (f.bass - g) * (1 - Math.exp(-dt * (f.bass > g ? 8 : 2)));
    u.uSpin.value = (u.uSpin.value as number) + dt * 0.08;
  },
  fragment: /* glsl */ `
uniform float uArm[8];   // the eight bands, smoothed: the branches' lengths
uniform float uFamA;     // shape family, and the next one
uniform float uFamB;
uniform float uMorph;    // 0..1 from A to B
uniform float uOpen;     // the drop's corolla
uniform float uWave;     // seconds since the kick: a wave of light along the branches
uniform float uGlow;     // the bass: the inner light
uniform float uSpin;
${ART_LIB}
${CAMERA_GLSL}
float gR;                // distance from the heart, at the last evaluation

/** A family's shape: branches count, length, thickness, curl, width, cup, heart radius, ring radius. */
void family(float f, out float n, out float len, out float th, out float curl, out float wid, out float cup, out float core, out float ring) {
  if (f < .5) { n = 16.; len = 1.25; th = .1; curl = 0.; wid = 1.; cup = .1; core = .55; ring = 0.; }          // urchin
  else if (f < 1.5) { n = 8.; len = 1.15; th = .16; curl = .15; wid = 1.7; cup = .9; core = .36; ring = 0.; } // flower
  else if (f < 2.5) { n = 6.; len = 1.7; th = .19; curl = 1.1; wid = 1.; cup = .25; core = .34; ring = 0.; }   // star
  else { n = 12.; len = .5; th = .12; curl = .4; wid = 1.4; cup = .4; core = .26; ring = .9; }                // ring
}

/** One branch (number "sector" around the heart), seen from p. */
float branchD(vec3 p, float sector, float W, float off, float shift, float len, float th, float curl, float wid, float cup, float core, float ring) {
  vec3 q = p;
  q.xy *= rot(-(sector * W - uSpin + off));
  // which band this branch follows (the spectrum goes round, mirrored)
  float k = mod(sector + shift, 16.);
  k = k > 7.5 ? 15. - k : k;
  float band = uArm[int(clamp(k, 0., 7.))];
  // it reaches beyond the heart (or the ring) by its length, curls, cups toward the viewer, flattens like a petal
  float L = (ring > 0. ? 0. : core) + len * (.55 + .75 * band);
  q.x -= ring;
  q.xy *= rot(curl * q.x * q.x * .35 * (1. + band));
  q.xz *= rot(-cup * max(q.x, 0.) * .45);
  float x = clamp(q.x, 0., L);
  float r = th * (1. + .5 * band) * (1. - .8 * x / L) * (1. + .3 * sin(x * 9. - uTime * 1.3));
  vec3 d = q - vec3(x, 0., 0.);
  d.y /= wid;
  return (length(d) - r) * (wid > 1. ? 1.2 / wid : 1.);
}

float formD(vec3 p, float f) {
  float n, len, th, curl, wid, cup, core, ring;
  family(f, n, len, th, curl, wid, cup, core, ring);
  // the drop's corolla: longer, wider, opening toward us
  len *= 1. + .5 * uOpen;
  cup += 1.2 * uOpen;
  float W = 6.2831853 / n;
  float a = (atan(p.y, p.x) + uSpin) / W;
  float s0 = floor(a + .5);
  // this branch and its nearest neighbour: no seam where two of them meet
  float arm = min(branchD(p, s0, W, 0., 0., len, th, curl, wid, cup, core, ring), branchD(p, s0 + (a > s0 ? 1. : -1.), W, 0., 0., len, th, curl, wid, cup, core, ring));
  // a second, inner crown between the first one's branches, shorter and more cupped, on other bands: a mandala
  float a2 = a - .5;
  float s1 = floor(a2 + .5);
  float l2 = len * .55, c2 = cup * 1.5 + .4;
  arm = min(arm, min(branchD(p, s1, W, W * .5, 4., l2, th * .85, curl, wid, c2, core, ring), branchD(p, s1 + (a2 > s1 ? 1. : -1.), W, W * .5, 4., l2, th * .85, curl, wid, c2, core, ring)));
  float body = length(p) - core * (1. + .12 * uGlow);
  if (ring > 0.) {
    vec2 t = vec2(length(p.xy) - ring, p.z);
    body = min(body, length(t) - th * .9);
  }
  return smin(body, arm, th * 1.1);
}

/** The form tumbles slowly on itself, so that it is never seen flat. */
vec3 tumble(vec3 p) {
  p.yz *= rot(.38 * sin(uTime * .07 + uSeed));
  p.xz *= rot(.5 * sin(uTime * .05 + uSeed * 2.));
  return p;
}

float map(vec3 p) {
  p = tumble(p);
  gR = length(p);
  if (gR > 3.4) return gR - 3.2;
  float m = smoothstep(0., 1., uMorph);
  float d = formD(p, uFamA);
  if (m > .001) d = mix(d, formD(p, uFamB), m);
  return d * .8;
}
${MARCH}

/** The heart's radius now (between the two families). */
float heartR() {
  float n, len, th, curl, wid, cup, ca, cb, ring;
  family(uFamA, n, len, th, curl, wid, cup, ca, ring);
  family(uFamB, n, len, th, curl, wid, cup, cb, ring);
  return mix(ca, cb, smoothstep(0., 1., uMorph)) * (1. + .12 * uGlow);
}

/**
 * Flesh lit from behind: dark rose where it faces us, a bright rim around the silhouette, red light through the
 * thin parts, a pearly film, a wet highlight; the heart is a dark red bulb glowing from within.
 */
vec3 shade(vec3 p, vec3 n, vec3 rd) {
  vec3 Lb = normalize(vec3(.35, .55, -.75));
  vec3 Lf = normalize(vec3(-.5, .4, .8));
  float fre = pow(1. - abs(dot(n, -rd)), 2.);
  float spec = pow(max(dot(reflect(rd, n), Lf), 0.), 40.);
  vec3 q = tumble(p);
  float r = length(q);
  vec3 c = mix(uPal1 * .32, uInk * .6, fre * .5) * (.06 + .3 * max(dot(n, Lf), 0.));
  // the rim: the light behind wrapping round the silhouette
  c += mix(uPal1, uInk, .6) * pow(fre, 3.) * (.3 + .7 * clamp(dot(n, Lb) + .3, 0., 1.)) * 1.1;
  // through the flesh
  float inside = -map(p - n * .2) / .8;
  float thin = 1. - smoothstep(0., .18, inside);
  c += uAccent * thin * (.5 + 1.3 * uGlow) * 2. + vec3(1., .45, .4) * thin * thin * .45;
  // pearl film and wet highlight
  vec3 film = .5 + .5 * cos(6.2831 * (fre * 1.4 + vec3(0., .33, .67) + r * .5));
  c += film * fre * .32 + vec3(1., .95, .92) * spec * .55;
  // the heart
  float hr = heartR();
  float heart = 1. - smoothstep(hr * 1.02, hr * 1.2, r);
  vec3 bulb = uAccent * (.35 + 1.5 * uGlow) * (1. - .6 * fre) + mix(uPal1, uInk, .5) * pow(fre, 2.) * .6 + vec3(1., .9, .9) * spec * .6;
  c = mix(c, bulb, heart);
  // fine veins running out from the heart
  float v = abs(sin(atan(q.y, q.x) * 34. + fbm3(q * 3.) * 4.));
  c = mix(c, uAccent * .4, (1. - smoothstep(.0, .08, v)) * .35 * smoothstep(hr, hr + .5, r));
  // the kick: a wave of light leaving the heart along the branches
  float w = uWave * 2.6;
  c += mix(uAccent, vec3(1., .85, .8), .4) * exp(-pow((r - w) * 5., 2.)) * exp(-uWave * 1.5) * 1.6;
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  // the dark, a deep red breath behind the form
  vec3 col = uBase * .7 + uAccent * .07 * exp(-2.2 * length(uv)) * (1. + uGlow);
  float solid = 0.;
  float t = march(ro, rd, 12.);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    col = shade(p, n, rd) * (.55 + .45 * calcAO(p, n));
    solid = 1.;
  }
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
