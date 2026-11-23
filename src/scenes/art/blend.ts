import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { STUDIO_GLSL } from "./studio.glsl";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.1, dist: 6.6, target: [0, 0, 0], focal: 1.9, weight: 3 },
  { az: 0.9, el: 0.45, dist: 6, target: [0, 0, 0], focal: 1.9, weight: 2 },
  // close on the surface, where the two metals fold into each other
  { az: -0.5, el: 0.15, dist: 2.2, target: [0.4, 0.3, 0.6], focal: 2.1, weight: 2 },
  { az: 2.4, el: -0.2, dist: 7, target: [0, 0, 0], focal: 1.8, weight: 1 },
];

/**
 * Mélange: a great sphere of liquid metal where mercury and a second metal (in the world's leading colour) turn
 * together in volutes and marble each other without ever quite mixing. The seams between them light up on the kick; the
 * drop stirs everything in a whirl. As the night drifts, the coloured metal slowly wins over the mercury.
 */
export const blend = defineShaderScene({
  id: "mercury-blend",
  name: "Mélange",
  energy: "calm",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Une grande sphère de métal liquide où le mercure et un second métal (la couleur du monde) tournent en volutes et se marbrent sans se mêler ; les coutures s'allument au kick, le drop brasse tout ; le métal coloré gagne au fil de la soirée.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uFlow: { value: 0 },
    uTwist: { value: 0 },
    uShare: { value: 0.4 },
    uSeam: { value: 0 },
    uBulge: { value: 0 },
    // CPU side only
    uSpin: { value: 0 },
  }),
  update(u, f, _p, dt) {
    // The volutes flow at their own pace, a little faster when the music is full
    // (slow, heavy: a liquid metal, not a swirl of smoke)
    u.uFlow.value = (u.uFlow.value as number) + dt * 0.005;
    // The drop: a whirl that stirs everything, then slowly settles
    let spin = (u.uSpin.value as number) * Math.exp(-dt * 0.35);
    if (f.drop) spin = 0.9;
    u.uSpin.value = spin;
    u.uTwist.value = ((u.uTwist.value as number) + spin * dt) * Math.exp(-dt * 0.04);
    // The seams light up on the kick
    u.uSeam.value = f.beat ? 1 : (u.uSeam.value as number) * Math.exp(-dt * 2.5);
    const b = u.uBulge.value as number;
    u.uBulge.value = b + (f.bass - b) * (1 - Math.exp(-dt * (f.bass > b ? 8 : 2)));
    // Over the night, the coloured metal wins
    u.uShare.value = 0.36 + 0.4 * f.drift;
  },
  fragment: /* glsl */ `
uniform float uFlow;
uniform float uTwist;    // the drop's whirl, around the vertical axis
uniform float uShare;    // how much of the surface the second metal covers
uniform float uSeam;     // the kick on the seams
uniform float uBulge;    // the bass, swelling the surface
${ART_LIB}
${CAMERA_GLSL}
${STUDIO_GLSL}
const float R = 1.35;

/** The sphere's own slow turn, and the whirl (stronger near the equator, like a stirred liquid). */
vec3 toLocal(vec3 p) {
  vec3 q = p;
  q.xz *= rot(uTime * .007);
  q.xz *= rot(uTwist * (1. - q.y * q.y / (R * R)));
  return q;
}

float disp(vec3 q) {
  return (.012 + .025 * uBulge) * sin(q.x * 3.1 + uTime * .09) * sin(q.y * 2.7 - uTime * .07) * sin(q.z * 3.3 + uTime * .08);
}

float sdBlob(vec3 p) { return length(p) - R - disp(toLocal(p)); }

float blobMarch(vec3 ro, vec3 rd) {
  float b = dot(ro, rd), h = b * b - dot(ro, ro) + (R + .1) * (R + .1);
  if (h < 0.) return -1.;
  float t = max(-b - sqrt(h), 0.), t1 = -b + sqrt(h);
  for (int i = 0; i < 48; i++) {
    float d = sdBlob(ro + rd * t);
    if (d < .0006 * t) return t;
    t += d * .9;
    if (t > t1) break;
  }
  return -1.;
}

vec3 blobN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * sdBlob(p + k.xyy * e) + k.yyx * sdBlob(p + k.yyx * e) + k.yxy * sdBlob(p + k.yxy * e) + k.xxx * sdBlob(p + k.xxx * e));
}

/**
 * The marbling: a field warped by itself (the two metals carried by one flow), folded into thin streams.
 * Returns the share of the second metal (x) and how close to a seam (y).
 */
vec2 marble(vec3 q) {
  vec3 s = q * 1.1;
  vec3 w = vec3(fbm3(s + vec3(0., uFlow, 0.)), fbm3(s + vec3(5.2, 1.3 - uFlow, 2.1)), fbm3(s + vec3(1.7, 9.2, uFlow * .7)));
  // a second fold of the flow: the volutes curl into each other
  vec3 s2 = q * .9 + w * 2.6;
  // combed like marbled paper: long waves drag the streams sideways
  s2.x += .35 * sin(s2.y * 2.3 + uFlow * 1.2);
  s2.y += .25 * sin(s2.z * 1.9 - uFlow);
  float f = vnoise(s2 + uSeed) + .35 * vnoise(s2 * 1.9 + 4.);
  // folded into many thin streams
  float m = .5 + .5 * sin(f * 30. + q.y * 2.);
  float thr = 1. - uShare;
  float g = smoothstep(thr - .04, thr + .04, m);
  return vec2(g, exp(-pow((m - thr) / .025, 2.)));
}

/** Two liquid metals under the studio's lights: mercury tinted by the ink, the second one by its own colour. */
vec3 metals(vec3 n, vec3 rd, vec2 mb) {
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  vec3 env = studio(reflect(rd, n));
  vec3 silver = env * mix(uInk * .85, vec3(1.), fre);
  vec3 other = env * mix(uTint, vec3(1.), fre);
  vec3 c = mix(silver, other, mb.x);
  // the seam: a thin dark meniscus, lit up by the kick
  c *= 1. - .55 * mb.y;
  c += mix(uTint, vec3(1.), .5) * mb.y * uSeam * 1.4;
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .8 + uInk * .045 * exp(-2. * length(uv));
  float solid = 0.;
  float t = blobMarch(ro, rd);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = blobN(p);
    vec3 q = toLocal(p);
    vec2 mb = marble(q);
    // the two metals stand in relief where they meet: a meniscus along each seam, the gold a little proud
    vec3 t1 = normalize(cross(n, vec3(0., 1., .1)));
    vec3 t2 = cross(n, t1);
    const float e = .012;
    vec2 m1 = marble(toLocal(p + t1 * e));
    vec2 m2 = marble(toLocal(p + t2 * e));
    float h0 = .5 * mb.x + .8 * mb.y, h1 = .5 * m1.x + .8 * m1.y, h2 = .5 * m2.x + .8 * m2.y;
    n = normalize(n - (t1 * (h1 - h0) + t2 * (h2 - h0)) / e * .012);
    col = metals(n, rd, mb);
    solid = 1.;
  }
  gl_FragColor = vec4(hdrOut(col), solid);
}
`,
});
