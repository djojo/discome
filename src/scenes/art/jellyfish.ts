import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  { az: 0, el: 0.05, dist: 6.5, target: [0, -0.6, 0], focal: 1.8, weight: 3, tag: "open" },
  { az: 0.7, el: -0.35, dist: 5.5, target: [0, -0.3, 0], focal: 1.9, weight: 2 },
  // close under the bell, among the arms
  { az: -0.5, el: -0.15, dist: 2.8, target: [0, -0.2, 0], focal: 2, weight: 2 },
  { az: 2.2, el: 0.5, dist: 6, target: [0, -0.5, 0], focal: 1.8, weight: 1, tag: "open" },
];

/**
 * Méduse: a bioluminescent jellyfish whose bell beats at its own pace (a quick contraction, a slow release),
 * frilled arms under it and long filaments trailing and waving. Marine snow drifts past. On the kick its radial
 * canals light up; on the drop a swarm of small jellyfish rises around it.
 */
export const jellyfish = defineShaderScene({
  id: "flesh-jelly",
  name: "Méduse",
  energy: "calm",
  renderScale: 0.75,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Une méduse bioluminescente dont l'ombrelle bat à son propre rythme, ses filaments ondulant derrière elle ; ses canaux s'allument au kick, un essaim de petites méduses s'élève au drop.",
  params: [paletteParam("flesh")],
  uniforms: () => ({
    uPulse: { value: 0 },
    uCanal: { value: 0 },
    uSwarm: { value: 99 },
    uGlow: { value: 0 },
    // CPU side only
    uPhase: { value: 0 },
  }),
  update(u, f, _p, dt, ctx) {
    // Its own beat: a cycle of ~2.8 s, a quick contraction then a slow release
    const ph = ((u.uPhase.value as number) + dt / 2.8) % 1;
    u.uPhase.value = ph;
    u.uPulse.value = ph < 0.25 ? Math.sin((ph / 0.25) * Math.PI * 0.5) : Math.cos(((ph - 0.25) / 0.75) * Math.PI * 0.5);
    u.uCanal.value = f.beat ? 1 : (u.uCanal.value as number) * Math.exp(-dt * 3);
    if (f.drop) {
      u.uSwarm.value = 0;
      ctx.camera?.request("open");
    } else u.uSwarm.value = (u.uSwarm.value as number) + dt;
    const g = u.uGlow.value as number;
    u.uGlow.value = g + (f.bass - g) * (1 - Math.exp(-dt * (f.bass > g ? 8 : 2)));
  },
  fragment: /* glsl */ `
uniform float uPulse;    // 0 relaxed .. 1 contracted
uniform float uCanal;    // the kick, along the radial canals
uniform float uSwarm;    // seconds since the drop
uniform float uGlow;     // the bass: the inner light
${ART_LIB}
${CAMERA_GLSL}
float gPart;             // 0 bell, 1 arms, 2 filaments, 3 small jellies
float gFil;              // closest approach to a filament (for their glow)

/** The bell: a thin dome, narrower and taller when it contracts. */
float bell(vec3 p, float s) {
  vec3 r = vec3(1.05 - .18 * uPulse, .7 + .12 * uPulse, 1.05 - .18 * uPulse) * s;
  float e = sdEllipsoid(p, r);
  float shell = abs(e) - .045 * s;
  // open underneath, with a slightly scalloped rim
  float a = atan(p.z, p.x);
  float cut = p.y + .05 * s - .03 * s * sin(a * 16.);
  return max(shell, -cut);
}

float filaments(vec3 p) {
  // twelve long filaments hanging from the rim, waving with a delay down their length
  const float N = 12.;
  float W = 6.2831853 / N;
  float a = atan(p.z, p.x) + uTime * .05;
  float s = floor(a / W + .5);
  vec3 q = p;
  q.xz *= rot(-(s * W - uTime * .05));
  float y = clamp(-q.y, 0., 4.8);
  float rim = (1.0 - .18 * uPulse) * .95;
  float sw = .06 + .07 * y;
  vec2 c = vec2(rim + .1 * y * (1. - .3 * uPulse) + sw * sin(y * 1.6 - uTime * 1.6 + s), sw * sin(y * 1.9 - uTime * 1.2 + s * 2.));
  float d = length(vec2(q.x, q.z) - c);
  d = max(d - .016 * (1. - y / 6.), max(q.y + .02, -q.y - 4.8));
  gFil = min(gFil, d);
  return d;
}

float arms(vec3 p) {
  // four frilled oral arms in the middle
  float a = atan(p.z, p.x);
  float W = 1.5708;
  float s = floor(a / W + .5);
  vec3 q = p;
  q.xz *= rot(-s * W);
  float y = clamp(-q.y, 0., 2.4);
  vec2 c = vec2(.18 + .08 * sin(y * 2. - uTime * 1.4 + s), .08 * sin(y * 2.4 - uTime + s));
  vec2 d2 = vec2(q.x, q.z) - c;
  // a ribbon with ruffles
  float rib = length(d2 * vec2(1., 2.2)) / 2.2 - .07 * (1. - y / 2.6) - .01 * sin(y * 14.);
  return max(rib, max(q.y + .1, -q.y - 2.4));
}

/** The swarm of the drop: small jellies rising all around. */
float swarm(vec3 p) {
  if (uSwarm > 8.) return 1e3;
  vec3 q = p - vec3(0., uSwarm * 1.1 - 4., 0.);
  const float C = 1.7;
  vec3 id = floor(q / C + .5);
  if (abs(id.x) + abs(id.z) < .5 || abs(id.y) > 3.) return C * .4;
  vec3 l = q - id * C;
  float h = hash13(id + 4.2);
  if (h > .5) return C * .4;
  l += (vec3(hash13(id + 1.), hash13(id + 2.), hash13(id + 3.)) - .5) * .5;
  float s = .22 + .1 * h;
  vec3 r = vec3(1., .7, 1.) * s;
  float e = abs(sdEllipsoid(l, r)) - .03 * s;
  return min(max(e, -l.y - .02), C * .4);
}

float map(vec3 p) {
  vec3 q = p;
  // a slow sway of the whole animal
  q.xy *= rot(.08 * sin(uTime * .21));
  q.y -= .15 * uPulse;
  float b = bell(q, 1.);
  float ar = arms(q);
  float fi = filaments(q);
  float sw = swarm(p);
  float d = b;
  gPart = 0.;
  if (ar < d) { d = ar; gPart = 1.; }
  if (fi < d) { d = fi; gPart = 2.; }
  if (sw < d) { d = sw; gPart = 3.; }
  return d;
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float e = .002;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

/** Marine snow: specks drifting down past the animal (it rises), in three depths. */
vec3 snow(vec2 uv) {
  vec3 c = vec3(0.);
  for (int i = 0; i < 3; i++) {
    float z = 1. + float(i) * .9;
    vec2 g = uv * (9. + 7. * float(i)) + vec2(float(i) * 3.1, uTime * (.25 / z));
    vec2 id = floor(g);
    float h = hash12(id + float(i) * 13.);
    if (h > .82) {
      vec2 o = vec2(hash12(id + 2.), hash12(id + 5.)) - .5;
      c += vec3(.8, .85, .9) * (1. - smoothstep(.0, .09, length(fract(g) - .5 - o * .6))) * (.25 / z);
    }
  }
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 col = uBase * .6 + mix(uAccent, uPal1, .5) * .06 * exp(-1.6 * length(uv - vec2(0., .1)));
  col += snow(uv);
  float solid = 0.;
  gFil = 1e3;
  float t = .1, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d * .8;
    if (t > 14.) break;
  }
  // the filaments glow in the water, even where the ray only passes near them
  col += mix(uAccent, uInk, .4) * exp(-gFil * 25.) * .5 * (1. + uGlow);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float part = gPart;
    vec3 n = calcN(p);
    float fre = pow(1. - abs(dot(n, -rd)), 2.);
    vec3 film = .5 + .5 * cos(6.2831 * (fre * 1.3 + vec3(0., .33, .67) + p.y * .3));
    if (part < .5 || part > 2.5) {
      // the bell: almost invisible glass, bright at its edges, lit from within
      vec3 c = mix(uPal1, uInk, .5) * (.06 + .85 * fre) + film * fre * .3;
      c += uAccent * (.15 + .6 * uGlow) * (1. - fre) * .6;
      if (part < .5) {
        // the radial canals, and the kick running down them
        float a = atan(p.z, p.x);
        float canal = 1. - smoothstep(.0, .06, abs(sin(a * 4.)));
        c += mix(uAccent, vec3(1., .8, .8), .5) * canal * (.15 + 1.6 * uCanal);
        // the rim's bioluminescent dots
        c += mix(uInk, uAccent, .3) * (1. - smoothstep(.0, .05, abs(p.y + .02))) * (.6 + .6 * sin(a * 32. + uTime * 3.));
      }
      col = mix(col, c, .85);
      solid = .85;
    } else {
      // arms and filaments: glowing, half transparent ribbons
      vec3 c = mix(uAccent, uPal1, part > 1.5 ? .3 : .55) * (.5 + .9 * uGlow) * (.5 + .7 * fre) + film * fre * .3;
      col = mix(col, c, .8);
      solid = .8;
    }
  }
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
