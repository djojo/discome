import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ABYSS_GLSL } from "./abyss.glsl";
import { ART_LIB, MARCH } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.15, dist: 7.6, target: [0, 0, 0], focal: 1.9, weight: 3, tag: "open" },
  { az: 0.8, el: 0.4, dist: 7, target: [0, 0, 0], focal: 1.9, weight: 2, tag: "open" },
  // close on the lace
  { az: -0.4, el: 0.1, dist: 2.7, target: [0.3, 0.2, 0.4], focal: 2.1, weight: 2 },
  { az: 2.5, el: -0.3, dist: 7.2, target: [0, 0, 0], focal: 1.9, weight: 1 },
];

/**
 * Radiolaire: the glass skeleton of a micro-organism, like the plates of the nineteenth-century naturalists.
 * A sphere of lace bristling with spines turns slowly while its mesh transforms; a second shell turns the other
 * way inside it, and a red light breathes at its heart with the bass. On the kick the spines light up; on the
 * drop the outer shell opens in two and shows the inner one, then closes again.
 */
export const radiolaria = defineShaderScene({
  id: "flesh-radiolaria",
  name: "Radiolaire",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Squelette de verre d'un micro-organisme : une sphère en dentelle hérissée d'épines dont le maillage se transforme, une coque dans la coque ; les épines s'allument au kick, la coque s'ouvre au drop.",
  params: [paletteParam("flesh")],
  uniforms: () => ({
    uOpenR: { value: 0 },
    uSpineT: { value: 9 },
    uGlow: { value: 0 },
    uMesh: { value: 0 },
    // CPU side only
    uDropAge: { value: 99 },
  }),
  update(u, f, _p, dt, ctx) {
    if (f.drop) {
      u.uDropAge.value = 0;
      ctx.camera?.request("open");
    } else u.uDropAge.value = (u.uDropAge.value as number) + dt;
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const td = (u.uDropAge.value as number) / bar;
    // open over a bar, hold two, close over two
    u.uOpenR.value = td < 1 ? td * td * (3 - 2 * td) : td < 3 ? 1 : td < 5 ? 1 - ((td - 3) / 2) ** 2 * (3 - (td - 3)) : 0;
    u.uSpineT.value = f.beat ? 0 : (u.uSpineT.value as number) + dt;
    const g = u.uGlow.value as number;
    u.uGlow.value = g + (f.bass - g) * (1 - Math.exp(-dt * (f.bass > g ? 8 : 2)));
    u.uMesh.value = (u.uMesh.value as number) + dt * 0.045;
  },
  fragment: /* glsl */ `
uniform float uOpenR;    // the drop: the outer shell opens in two
uniform float uSpineT;   // seconds since the kick
uniform float uGlow;     // the bass: the light at the heart
uniform float uMesh;     // the lace slowly transforming
${ART_LIB}
${ABYSS_GLSL}
${CAMERA_GLSL}
const float RO = 1.25, RI = .62;
float gPart;             // 0 outer lace, 1 spine, 2 inner shell

/** A lace shell: a sphere cut by a gyroid network (organic holes), the mesh drifting with ph. */
float lace(vec3 p, float R, float sc, vec3 ph, float th) {
  float shell = abs(length(p) - R) - th;
  vec3 q = p * sc + ph;
  float g = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x);
  return max(shell, (abs(g) - .42) / sc * .8);
}

/** Spines, one per cell of a cube map of directions (54), from the shell outward. */
float spines(vec3 p) {
  float r = length(p);
  if (r < RO - .1) return 1e3;
  vec3 a = abs(p);
  vec3 n;
  vec2 uv;
  if (a.x >= a.y && a.x >= a.z) { n = vec3(sign(p.x), 0., 0.); uv = p.yz / a.x; }
  else if (a.y >= a.z) { n = vec3(0., sign(p.y), 0.); uv = p.zx / a.y; }
  else { n = vec3(0., 0., sign(p.z)); uv = p.xy / a.z; }
  vec2 cell = floor((uv * .5 + .5) * 3.);
  vec2 c = (cell + .5) / 3. * 2. - 1.;
  vec3 dir = normalize(n.x != 0. ? vec3(n.x, c.x, c.y) : n.y != 0. ? vec3(c.y, n.y, c.x) : vec3(c.x, c.y, n.z));
  float len = .55 + .35 * hash13(dir * 7.1);
  float along = clamp(dot(p, dir), RO, RO + len);
  float rad = .035 * (1. - (along - RO) / len) + .004;
  return min(length(p - dir * along) - rad, .2);
}

float map(vec3 p) {
  float r = length(p);
  if (r > 2.4) return r - 2.3;
  // the organism turns slowly
  vec3 q = p;
  q.xz *= rot(uTime * .07);
  q.xy *= rot(.3 * sin(uTime * .05));
  // the drop: the outer shell opens in two halves
  float off = uOpenR * .8;
  vec3 qo = q - vec3(0., sign(q.y) * off, 0.);
  float la = lace(qo, RO, 8.5, vec3(uMesh, -uMesh * .7, uMesh * .4), .035);
  float sp = spines(qo);
  float outer = min(la, sp);
  gPart = sp < la ? 1. : 0.;
  // the inner shell turns the other way
  vec3 qi = q;
  qi.xz *= rot(-uTime * .16);
  float inner = lace(qi, RI, 12., vec3(-uMesh, uMesh, 0.), .028);
  if (inner < outer) { gPart = 2.; return inner; }
  return outer;
}
${MARCH}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = deepWater(rd, uv, 1.);
  float solid = 0.;
  // the light at the heart, seen through the lace
  float dc = length(cross(rd, -ro));
  vec3 heart = uAccent * exp(-dc * 2.6) * (.35 + 1.2 * uGlow) + mix(uAccent, uPal1, .5) * exp(-dc * 9.) * (.3 + uGlow);
  float t = march(ro, rd, 12.);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    map(p);
    float part = gPart;
    vec3 n = calcNormal(p);
    // glass: nearly invisible face-on, bright at grazing angles, a pearly film, the heart's light through it
    float fre = pow(1. - abs(dot(n, -rd)), 2.5);
    vec3 film = .5 + .5 * cos(6.2831 * (fre * 1.2 + vec3(0., .33, .67) + length(p) * .6));
    vec3 L = normalize(vec3(-.4, .7, .6));
    float spec = pow(max(dot(reflect(rd, n), L), 0.), 50.);
    vec3 c = uInk * (.14 + .9 * fre) + film * (.08 + fre * .4) + vec3(1.) * spec * .8;
    c += heart * .6 * (1. - fre);
    if (part > .5 && part < 1.5) {
      // the spines light up from the root on the kick
      float lit = exp(-uSpineT * 2.5) * smoothstep(RO + .9 * (1. - exp(-uSpineT * 6.)), RO, length(p) - .0);
      c += mix(uAccent, vec3(1., .8, .8), .5) * (lit * 2. + .15);
    }
    if (part > 1.5) c = mix(c, c * mix(uPal1, uInk, .5) * 1.3, .5);
    col = c * (.6 + .4 * calcAO(p, n));
    solid = 1.;
    col += heart * .25;
  } else col += heart;
  gl_FragColor = vec4(hdrOut(col * 1.1), 1.);
}
`,
});
