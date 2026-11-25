import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { WHITE_GLSL } from "./white.glsl";

/**
 * The series: in a white workshop, rows of shelves carry porcelain faces all alike, cast from the same mould (the
 * standard beauty of the filters). The camera glides along the shelves; the faces never move, the light passes over
 * them with the rhythm (a band of light sweeps the row on the kick). On the drop one of them, the one in front of us,
 * cracks, and a vermilion light comes out of the crack; it stays cracked until the next drop takes another. Over the
 * night the rows grow longer: more shelves.
 */
export const series = defineShaderScene({
  id: "series",
  name: "La Série",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.8,
  description:
    "Des étagères de visages de porcelaine identiques, sortis du même moule, dans un atelier blanc ; au drop, un seul se fend et une lumière vermillon sort de la fêlure.",
  params: [paletteParam("porcelain")],
  uniforms: () => ({
    uTravel: { value: 0 },
    uKickT: { value: 9 },
    uCrackX: { value: 9999 },
    uCrackY: { value: 0 },
    uCrackT: { value: 99 },
    uView: { value: 0 },
    uRows: { value: 1 },
    uLastPhrase: { value: -1 },
  }),
  update(u, f, _p, dt) {
    u.uTravel.value = (u.uTravel.value as number) + dt * 0.18;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // a new way of looking at the shelves on every phrase
    const phrase = Math.floor(f.bar / 8);
    if (phrase !== u.uLastPhrase.value) {
      u.uLastPhrase.value = phrase;
      u.uView.value = Math.floor(Math.random() * 3);
    }
    // the drop: the face in front of us cracks
    if (f.drop) {
      const view = u.uView.value as number;
      const camX = (u.uTravel.value as number) + (view === 1 ? 0 : 0.9);
      u.uCrackX.value = Math.round(camX / 0.62);
      u.uCrackY.value = view === 2 ? 1 : 0;
      u.uCrackT.value = 0;
    }
    u.uCrackT.value = (u.uCrackT.value as number) + dt;
    u.uRows.value = 1 + Math.round(2 * f.drift);
  },
  fragment: /* glsl */ `
uniform float uTravel;  // how far along the shelves
uniform float uKickT;   // seconds since the kick
uniform float uCrackX;  // the face that cracked (column, row), and since when
uniform float uCrackY;
uniform float uCrackT;
uniform float uView;    // 0: three-quarters along the row, 1: face to face, 2: high, looking down the rows
uniform float uRows;    // shelves above the first one
${ART_LIB}
${WHITE_GLSL}
const float SX = .62;   // spacing of the faces along a shelf
const float SY = 1.05;  // spacing of the shelves
const float S = .27;    // the faces' scale
const float WALL = -.42;
const vec3 L = normalize(vec3(-.5, .75, .6));
float gMat;             // 0 face, 1 shelf or wall
vec2 gCell;

/** One face from the mould, on its neck and round foot; origin at the shelf's top. */
float bust(vec3 q) {
  float foot = max(length(q.xz) - .09, abs(q.y - .02) - .02);
  float neck = sdCapsule(q, vec3(0., .03, 0.), vec3(0., .24, .01), .055);
  float head = sdHead((q - vec3(0., .4, .02)) / S) * S;
  return min(foot, smin(neck, head, .04));
}

float map(vec3 p) {
  // the wall behind, the shelves, the faces on them
  float wall = p.z - WALL;
  float row = clamp(floor(p.y / SY + .5), 0., uRows);
  float yr = row * SY;
  float shelf = sdBox(p - vec3(p.x, yr - .03, -.17), vec3(1., .03, .26));
  float col = floor(p.x / SX + .5);
  gCell = vec2(col, row);
  vec3 q = p - vec3(col * SX, yr, 0.);
  // cheap bound around each face
  float b = sdCapsule(q, vec3(0., 0., .02), vec3(0., .52, .02), .22);
  float face = b > .1 ? b : bust(q);
  // never step past a neighbour's face
  face = min(face, max(SX * .5 - abs(q.x), .02));
  float d = min(min(wall, shelf), face);
  gMat = face <= min(wall, shelf) ? 0. : 1.;
  return d;
}

vec3 calcN(vec3 p) {
  vec2 e = vec2(.0015, 0.);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

/** The crack of the face that broke: a few lines of a Voronoi net over it, widening with time. */
float crackOf(vec3 q) {
  vec3 g = q * 9.;
  vec3 i0 = floor(g);
  float d1 = 9., d2 = 9.;
  for (int k = 0; k < 8; k++) {
    vec3 c = i0 + vec3(float(k & 1), float((k >> 1) & 1), float(k >> 2));
    vec3 o = vec3(hash13(c), hash13(c + 1.7), hash13(c + 3.1));
    float d = length(g - c - o);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  float grow = smoothstep(0., 1.2, uCrackT);
  // only the cracks near a line down the face, spreading out from it
  float reach = exp(-abs(q.x) * (14. - 10. * grow));
  return (1. - smoothstep(.02, .06, d2 - d1)) * reach;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float T = uTravel;
  // three ways of looking, each sliding along the shelves at its own pace
  vec3 ro, ta;
  float focal = 1.7;
  if (uView < .5) { ro = vec3(T - .9, .55, 1.6); ta = vec3(T + .9, .35, -.1); }
  else if (uView < 1.5) { ro = vec3(T + .08 * sin(uTime * .1), .42, 1.25); ta = vec3(T, .4, 0.); focal = 1.9; }
  else { ro = vec3(T - .4, 2.6, 2.); ta = vec3(T + .9, .9, -.1); focal = 1.6; }
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  vec3 col = studioW(rd);
  float t = .02, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .0006 * t) { tt = t; break; }
    t += d;
    if (t > 30.) break;
  }
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec2 cell = gCell;
    vec3 n = calcN(p);
    float dif = clamp(dot(n, L), 0., 1.);
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 4.);
    // the light passing over them: a band sweeping the row on the kick
    float sweep = exp(-pow(p.x - (T - 2. + uKickT * 6.), 2.) * 1.5) * exp(-uKickT * .8);
    if (mat < .5) {
      // the glazed face
      vec3 c = uInk * (.6 + 1.05 * dif) + uInk * .3;
      c = mix(c, envW(reflect(rd, n)), .03 + .4 * fre);
      c += pow(clamp(dot(reflect(-L, n), -rd), 0., 1.), 60.) * .7;
      c *= 1. + .5 * sweep;
      // the one that cracked: its crack, and the vermilion light coming out of it
      if (cell.x == uCrackX && cell.y == uCrackY) {
        vec3 q = p - vec3(cell.x * SX, cell.y * SY + .4, .02);
        float cr = crackOf(q);
        c = mix(c, uAccent * (1.6 + 2.5 * exp(-uCrackT * 1.5) + 1.2 * uBeat), cr);
      }
      col = c;
    } else {
      // the white workshop: wall and shelves, softly lit
      col = uInk * (.8 + .45 * dif) * (1. + .25 * sweep);
    }
    // the vermilion light spilling from the crack onto its neighbours and the wall
    vec3 cp = vec3(uCrackX * SX, uCrackY * SY + .42, .1);
    float dc = length(p - cp);
    col += uAccent * exp(-dc * 3.5) * .6 * smoothstep(0., .5, uCrackT) * step(uCrackT, 600.);
    col = mix(col, studioW(rd), smoothstep(12., 38., tt));
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
