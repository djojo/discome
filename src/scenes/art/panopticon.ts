import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

const NS = 36;
const FLOORS = 4;

const FRAMINGS: Framing[] = [
  // in the courtyard, looking up at the ring
  { az: 0.3, el: 0.32, dist: 4.5, target: [0, 3.2, 0], focal: 1.4, weight: 3 },
  // from above: the whole plan of the prison
  { az: 0.8, el: 1.25, dist: 19, target: [0, 1, 0], focal: 1.8, weight: 2 },
  // from outside the ring, over the roof, toward the tower
  { az: -1.1, el: 0.45, dist: 13, target: [0, 4, 0], focal: 1.9, weight: 2 },
  // close on a row of cells
  { az: 2.4, el: 0.12, dist: 3, target: [-3.6, 2.6, 2.3], focal: 1.9, weight: 2 },
];

/**
 * The panopticon: a ring of concrete cells around a watchtower. In every cell a figure is lit by a screen.
 * A searchlight sweeps from the tower and, on each kick, stops on a cell. On the drop every cell lights up.
 * As the night drifts, more screens are on.
 */
export const panopticon = defineShaderScene({
  id: "panopticon",
  name: "Panoptique",
  energy: "medium",
  renderScale: 0.8,
  mask: true,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un anneau de cellules autour d'une tour de guet ; dans chaque cellule une silhouette devant un écran. Le faisceau de la tour s'arrête sur une cellule à chaque kick ; au drop, tout s'allume.",
  params: [paletteParam("concrete")],
  uniforms: () => ({
    uBeamAz: { value: 0 },
    uBeamTarget: { value: 0 },
    uBeamFl: { value: 1 },
    uAllLit: { value: 0 },
  }),
  update(u, f, _p, dt) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    const W = (Math.PI * 2) / NS;
    // On each kick the beam picks a cell; between kicks it holds, then drifts on
    if (f.beat) {
      u.uBeamTarget.value = Math.floor(Math.random() * NS) * W;
      u.uBeamFl.value = Math.floor(Math.random() * FLOORS);
    } else {
      u.uBeamTarget.value = (u.uBeamTarget.value as number) + dt * 0.05;
    }
    let d = ((u.uBeamTarget.value as number) - (u.uBeamAz.value as number)) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    u.uBeamAz.value = (u.uBeamAz.value as number) + d * (1 - Math.exp(-dt * 9));
    u.uAllLit.value = f.drop ? 1 : (u.uAllLit.value as number) * Math.exp(-dt / (bar * 2));
  },
  fragment: /* glsl */ `
uniform float uBeamAz;
uniform float uBeamFl;
uniform float uAllLit;
${ART_LIB}
${CAMERA_GLSL}
const float NS = ${NS}.;
const float NF = ${FLOORS}.;
const float RI = 6., RO = 7.2;   // the ring, inside and outside
const float FH = 1.6;            // floor height
const vec3 TOP = vec3(0., 6.8, 0.);
const vec3 SCREEN = vec3(.75, .86, 1.);
float gMat;                      // 0 concrete, 1 screen, 2 figure, 3 tower glass
vec2 gCell;                      // sector id, floor

/** Is the screen of this cell on? */
float cellLit(vec2 cell) {
  float h = hash12(cell + uSeed);
  return max(step(h, .25 + .5 * uDrift), uAllLit);
}

float ringD(vec3 p) {
  float r = length(p.xz);
  float d = max(max(RI - r, r - RO), max(-p.y, p.y - NF * FH));
  // bound: away from the ring, nothing to carve
  if (d > .6) return d;
  float W = 6.2831853 / NS;
  float id = floor(atan(p.z, p.x) / W + .5);
  vec3 q = p;
  q.xz *= rot(-id * W);
  float fl = clamp(floor(p.y / FH), 0., NF - 1.);
  float y0 = fl * FH;
  gCell = vec2(id, fl);
  gMat = 0.;
  // the cell: an opening on the courtyard and the room behind it
  float cell = sdBox(q - vec3(RI + .45, y0 + .85, 0.), vec3(.55, .6, .4));
  d = max(d, -cell);
  // a balcony slab along each floor
  d = min(d, sdBox(vec3(r - RI + .25, p.y - y0 - .2, 0.), vec3(.25, .04, 9.)));
  // the figure and its screen
  float fig = min(sdCapsule(q, vec3(RI + .55, y0 + .3, 0.), vec3(RI + .55, y0 + .85, 0.), .09),
                  length(q - vec3(RI + .5, y0 + 1., 0.)) - .085);
  float scr = sdBox(q - vec3(RI + .36, y0 + .78, 0.), vec3(.01, .06, .045));
  if (fig < d) { d = fig; gMat = 2.; }
  if (scr < d) { d = scr; gMat = 1.; }
  return d;
}

float towerD(vec3 p) {
  float r = length(p.xz);
  float shaft = max(r - .6, max(-p.y, p.y - 6.2));
  float cabin = max(r - 1.2, abs(p.y - 6.8) - .55);
  float roof = max(r - 1.4 + (p.y - 7.35) * 1.3, max(7.35 - p.y, p.y - 8.4));
  return min(shaft, min(cabin, roof));
}

float map(vec3 p) {
  float t = towerD(p);
  float r = ringD(p);
  if (t < r) {
    gMat = abs(p.y - 6.8) < .25 && length(p.xz) > 1.15 ? 3. : 0.;
    return t;
  }
  return r;
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .003;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

/** Where the searchlight is pointing: the cell it watches. */
vec3 beamTarget() {
  return vec3(cos(uBeamAz) * RI, uBeamFl * FH + .85, sin(uBeamAz) * RI);
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));

  vec3 col = uBase * .4 + uInk * .04 * smoothstep(-.2, .8, rd.y);
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float t = .05, tt = -1.;
  for (int i = 0; i < 120; i++) {
    float d = map(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d * .9;
    if (t > min(tg, 60.)) break;
  }
  vec3 B = TOP, T = beamTarget();
  vec3 bd = normalize(T - B);
  float hitT = tt > 0. ? tt : (tg < 60. ? tg : -1.);
  if (hitT > 0.) {
    vec3 p = ro + rd * hitT;
    float mat = 0.;
    vec2 cell = vec2(0.);
    vec3 n = vec3(0., 1., 0.);
    if (tt > 0.) {
      map(p);
      mat = gMat;
      cell = gCell;
      n = calcN(p);
    }
    float lit = cellLit(cell);
    // moonlight, concrete
    vec3 c = uInk * .3 * (.25 + .75 * clamp(dot(n, normalize(vec3(.4, 1., .3))), 0., 1.)) * .9 + uBase * .3;
    // the searchlight: a cone from the tower
    vec3 toP = p - B;
    float cone = smoothstep(.985, .997, dot(normalize(toP), bd));
    c += uInk * 1.8 * cone * clamp(dot(n, -normalize(toP)), 0., 1.) * (1. + .5 * uBeat);
    if (mat > 2.5) {
      // the tower's glass: dark, catching a little light
      c = uBase * .2 + uInk * .15 * pow(1. - abs(dot(n, -rd)), 2.) + uInk * .6 * uAllLit;
    } else if (mat > 1.5) {
      // a figure, lit from below by its screen
      c = uBase * .1 + SCREEN * lit * .5 * (.5 + .5 * dot(n, normalize(vec3(-p.x, 0., -p.z))));
    } else if (mat > .5) {
      c = SCREEN * lit * (1.4 + .6 * uHat * step(.8, hash12(cell + floor(uTime * 6.))));
    } else if (tt > 0. && length(p.xz) > RI - .05) {
      // inside a cell: the cold glow of its screen
      c += SCREEN * lit * .16 * exp(-max(length(p.xz) - RI, 0.) * 2.5) * (.5 + .5 * clamp(-dot(n, normalize(vec3(p.x, 0., p.z))), 0., 1.));
    }
    col = c;
  }
  // the beam itself in the night air
  {
    vec3 w = ro - B;
    float b = dot(rd, bd), d1 = dot(rd, w), e = dot(bd, w);
    float den = max(1. - b * b, 1e-4);
    float sc = (b * e - d1) / den;
    float tc = (e - b * d1) / den;
    float L = length(T - B);
    if (sc > 0. && (hitT < 0. || sc < hitT) && tc > 0. && tc < L) {
      float dist = length(ro + rd * sc - (B + bd * tc));
      float wdt = .04 + .1 * tc / L;
      col += uInk * exp(-dist * dist / (wdt * wdt)) * .35 * (1. + .6 * uBeat);
    }
  }
  if (hitT > 0.) col = mix(col, uBase * .4, 1. - exp(-hitT * .02));
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., hitT));
}
`,
});
