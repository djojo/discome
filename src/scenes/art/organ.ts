import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const FRAMINGS: Framing[] = [
  // wide, from the nave
  { az: 0.04, el: 0.05, dist: 15, target: [0, 3.6, 0], focal: 1.45, weight: 3 },
  // low, near the mirror floor
  { az: 0.3, el: -0.24, dist: 12, target: [0, 2.6, 0], focal: 1.5, weight: 2 },
  // close along a rank of pipes
  { az: 1.05, el: 0.06, dist: 5.5, target: [2.6, 2.6, 0], focal: 1.8, weight: 2 },
  // looking up the tallest pipes into the vault
  { az: 0.45, el: -0.85, dist: 6, target: [4.6, 6, 0], focal: 1.4, weight: 2 },
];

/**
 * The organ: a great organ case whose pipes are made of light, in the world's single colour, rising into the dark of
 * a vault, in haze, reflected by a mirror floor. Tall pipes on the sides, smaller ones toward the centre. Each pipe
 * follows a band of the spectrum (bass in the big side pipes, treble in the small centre ones), smoothly; a breath
 * of light runs up the pipes on the kick; through the build more and more pipes stay lit; on the drop every pipe
 * flares and light bursts up into the vault; in the breakdown only a few pipes still breathe.
 */
export const organ = defineShaderScene({
  id: "organ",
  name: "Les Orgues",
  energy: "calm",
  hdr: true,
  mask: true,
  renderScale: 0.85,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "Un orgue dont les tuyaux sont de lumière : chacun suit une bande du spectre, un souffle monte au kick, au drop tous flambent et la lumière jaillit vers la voûte.",
  params: [paletteParam("signalRed")],
  uniforms: () => ({
    uLev: { value: new Array<number>(8).fill(0) },
    uKickT: { value: 9 },
    uFlare: { value: 0 },
    uBuildL: { value: 0 },
    uQuiet: { value: 0 },
  }),
  update(u, f, _p, dt) {
    // The bands, smoothed: the pipes rise and fall, never twitch
    const lev = u.uLev.value as number[];
    for (let i = 0; i < 8; i++) {
      const b = Math.min(1, f.bands[Math.floor((i * f.bands.length) / 8)] ?? 0);
      const k = 1 - Math.exp(-dt * (b > lev[i] ? 6 : 2.5));
      lev[i] += (b - lev[i]) * k;
    }
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    const flare = u.uFlare.value as number;
    u.uFlare.value = f.safeFlash ? flare + (f.dropPulse * 0.7 - flare) * (1 - Math.exp(-dt * 1.5)) : f.dropPulse;
    const build = f.section === "build" ? f.buildProgress : f.section === "drop" ? 1 : 0;
    u.uBuildL.value = (u.uBuildL.value as number) + (build - (u.uBuildL.value as number)) * (1 - Math.exp(-dt * 1.5));
    const quiet = f.section === "breakdown" ? 1 : 0;
    u.uQuiet.value = (u.uQuiet.value as number) + (quiet - (u.uQuiet.value as number)) * (1 - Math.exp(-dt * 0.8));
  },
  fragment: /* glsl */ `
uniform float uLev[8];  // the spectrum, smoothed: bass (0) to treble (7)
uniform float uKickT;   // seconds since the kick
uniform float uFlare;   // the drop
uniform float uBuildL;  // how far the build has lit the case
uniform float uQuiet;   // the breakdown
${ART_LIB}
${CAMERA_GLSL}
const float SP = .42;    // spacing of the pipes
const float NX = 15.;    // pipes on each side of the centre
const float Y0 = .3;     // the pipes stand on the case at this height
const float FLOOR = -1.;
float gLit;              // light of the nearest pipe
float gTop;              // its top
float gPipeD;            // distance to the nearest pipe
float gPipeX;            // and to its axis, across
vec2 gAxis;              // the nearest pipe's axis (xz)
float gFloor = .02;      // the cell-edge bound's floor: kept above the hit threshold, or the edges show as false hits

/** Height of pipe i: tall towers at the sides, a central tower, flats between them. */
float pipeH(float i) {
  float a = abs(i) / NX;
  return 2. + 6.6 * pow(a, 1.5) + 1.7 * exp(-i * i * .12) - 1. * exp(-pow(abs(i) - 6.5, 2.) * .25);
}

/** The light of pipe i (row: 0 front, 1 back), at height y: its band, the build, the drop, the kick's breath. */
float pipeLight(float i, float row, float y) {
  float a = abs(i) / NX;
  int b = int(clamp(7. - floor(a * 8.), 0., 7.));
  float band = 0.;
  for (int k = 0; k < 8; k++) if (k == b) band = uLev[k];
  float h = hash12(vec2(i, row) + 4.1);
  float lit = .5 + 1.3 * band * band;
  // the build lights them one by one, and they stay lit
  lit += .7 * step(h, uBuildL);
  // the breakdown: only a few still breathe
  float breathe = step(.82, h) * (.35 + .25 * sin(uTime * (.4 + .3 * h) + h * 30.));
  lit = mix(lit, breathe, uQuiet);
  // the kick: a breath of light running up the pipe
  float top = Y0 + pipeH(i) * (1. - .25 * row);
  float wy = Y0 + uKickT * 7.;
  lit += .9 * exp(-pow(y - wy, 2.) * 1.2) * exp(-uKickT * 1.2) * step(y, top);
  return lit + 1.1 * uFlare;
}

/** One rank of pipes (z = zr, shifted by off cells): distance; the nearest pipe's light and top in the globals. */
float rank(vec3 p, float zr, float off, float row) {
  // away from the rank, its plane is a safe bound (the pipes are at most .2 thick)
  float dz = abs(p.z - zr);
  if (dz > .4) return dz - .18;
  float i = clamp(floor((p.x - off * SP) / SP + .5), -NX, NX);
  float qx = p.x - (i * SP + off * SP);
  float h = pipeH(i) * (1. - .25 * row);
  float r = min(.05 + .011 * h, .16);
  float top = Y0 + h;
  float dx = length(vec2(qx, p.z - zr)) - r;
  float d = max(dx, max(Y0 - p.y, p.y - top));
  // the cell's edge: never step over a neighbour
  float edge = SP * .5 - abs(qx) + .02;
  if (d < gPipeD) {
    gPipeD = d;
    gLit = pipeLight(i, row, p.y);
    gTop = top;
    gPipeX = dx;
    gAxis = vec2(i * SP + off * SP, zr);
  }
  return abs(i) >= NX ? d : min(d, max(edge, gFloor));
}

float map(vec3 p) {
  gPipeD = 1e3;
  float d = rank(p, 0., 0., 0.);
  d = min(d, rank(p, -.7, .5, 1.));
  // the case they stand on: dark wood, wider than the pipes
  float caseD = sdBox(p - vec3(0., (Y0 + FLOOR) * .5 - .01, -.35), vec3(NX * SP + .6, (Y0 - FLOOR) * .5, .75));
  return min(d, caseD);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  vec3 acc = vec3(0.);
  float atten = 1.;
  bool reflected = false;
  float t = hash12(fc + fract(uTime) * 23.) * .03;
  vec3 surf = vec3(0.);
  for (int i = 0; i < 120; i++) {
    vec3 p = ro + rd * t;
    if (p.y < FLOOR && rd.y < 0. && !reflected) {
      // the wet mirror floor
      reflected = true;
      ro = vec3(p.x, FLOOR, p.z);
      rd.y = -rd.y;
      t = .01;
      atten *= .45;
      continue;
    }
    gFloor = max(.02, .002 * t * 1.6);
    float d = map(p);
    float stepL = max(d * .7, .015);
    // the pipes' own light in the haze around them
    // (capped: on the drop the pipes themselves blaze, the haze around them must not turn into a white wall)
    acc += atten * uInk * min(gLit, 1.) * (.0012 / (.0006 + gPipeD * gPipeD * 4.)) * stepL * 4.;
    // the drop: light bursting up out of the pipes into the vault
    if (uFlare > .01 && p.y > gTop) {
      float dx = max(gPipeX, 0.);
      acc += atten * uInk * uFlare * exp(-dx * dx * 60.) * exp(-(p.y - gTop) * .25) * stepL * .35;
    }
    if (d < .002 * t) {
      if (gPipeD <= d + 1e-4) {
        // a pipe: a tube of light, brighter along its middle, a dark mouth near its foot
        vec3 q = p;
        float mouth = 1. - .8 * exp(-pow((q.y - (Y0 + .55)) * 9., 2.));
        // round: brightest where it faces us, a thin hot line along its middle
        vec2 nx = normalize(q.xz - gAxis);
        float facing = abs(dot(nx, normalize(-rd.xz)));
        mouth *= .35 + .65 * facing * facing + .5 * pow(facing, 40.);
        // (bounded: a whole wall of pipes at full light would bloom into one white blur)
        surf = mix(uInk, vec3(1.), .35 * uFlare) * min(gLit, 1.6) * 2.2 * mouth;
      } else {
        // the case: dark wood catching a little of the pipes' light
        surf = uBase * .6 + uInk * .02;
      }
      acc += atten * surf;
      break;
    }
    t += stepL;
    if (t > 40.) break;
  }
  // the vault: a faint glow high up when the pipes flare
  acc += uInk * uFlare * .12 * smoothstep(.1, .8, rd.y);
  vec3 col = acc + uBase * .4;
  float lum = dot(col, vec3(.3, .59, .11));
  col = mix(col, mix(uInk, vec3(1.), .6) * lum * 1.2, smoothstep(.8, 3., lum));
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
