import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";

/** Framings around the head (its centre near the origin, facing +z). "open" ones once its panels slide apart. */
const FRAMINGS: Framing[] = [
  { az: 0, el: 0.04, dist: 3.5, target: [0, -0.04, 0], focal: 2, weight: 3 },
  { az: 0.62, el: 0.08, dist: 3.4, target: [0, -0.02, 0], focal: 2, weight: 3 },
  { az: -0.7, el: -0.1, dist: 3.3, target: [0, 0, 0], focal: 2, weight: 2 },
  { az: 1.4, el: 0.03, dist: 2.7, target: [0.05, 0.02, 0.1], focal: 2.1, weight: 2 },
  // close on the eyes
  { az: 0.22, el: 0.02, dist: 1.8, target: [0.02, 0.04, 0.32], focal: 2.2, weight: 2 },
  // from behind, the horizon beyond
  { az: -2.4, el: 0.12, dist: 3.4, target: [0, 0.05, 0], focal: 2, weight: 1 },
  // pulled back: the panels spread out around the light
  { az: 0.35, el: 0.12, dist: 4.6, target: [0, 0, 0], focal: 1.95, weight: 3, tag: "open" },
  { az: -0.45, el: 0.05, dist: 4.4, target: [0, 0, 0], focal: 1.95, weight: 2, tag: "open" },
  { az: 0.9, el: 0.3, dist: 4.4, target: [0, 0.05, 0], focal: 1.9, weight: 2, tag: "open" },
];

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * The android: a face of black glass panels, cut along fine seams that glow in the palette's colours (each seam
 * follows the spectrum band of its height: bass at the jaw, treble at the crown), two slits of light for eyes. The
 * glass mirrors a neon horizon, its grid and its sun. On the kick circuits light up under the glass, running out
 * from the seams; the build spreads them over the whole face. On the drop the panels unlock, then slide apart
 * mechanically onto a core of light, and close again after a few bars.
 */
export const android = defineShaderScene({
  id: "android",
  name: "Androïde",
  tag: "Visage",
  energy: "medium",
  hdr: true,
  mask: true,
  renderScale: 0.85,
  camera: { framings: FRAMINGS, glideBars: 2 },
  description:
    "Un visage d'androïde en panneaux de verre noir aux coutures de néon, qui reflète un horizon synthétique ; des circuits s'allument au kick, les panneaux s'écartent au drop sur un cœur de lumière.",
  params: [paletteParam("neon")],
  uniforms: () => ({
    uKickT: { value: 9 },
    uOpen: { value: 0 },
    uFill: { value: 0 },
    // state kept on the CPU side only
    uDropT: { value: 99 },
  }),
  update(u, f, _p, dt, ctx) {
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    if (f.drop) {
      u.uDropT.value = 0;
      ctx.camera?.request("open");
    }
    const t = (u.uDropT.value as number) + dt;
    u.uDropT.value = t;
    // the drop: the panels unlock (a short pop), hold a beat, slide apart, stay open three bars, then close
    const open =
      t < bar * 0.12
        ? 0.18 * smooth(t / (bar * 0.12))
        : t < bar * 0.3
          ? 0.18
          : t < bar * 3.6
            ? 0.18 + 0.82 * smooth((t - bar * 0.3) / (bar * 0.8))
            : 1 - smooth((t - bar * 3.6) / (bar * 2));
    u.uOpen.value = open;
    if (ctx.camera) ctx.camera.allow = (fr) => fr.tag !== "open" || t < bar * 4.5;
    // the circuits: the build spreads them over the face, the drop keeps some lit, the rest of the time only the kicks
    const fill = f.section === "build" ? f.buildProgress : f.section === "drop" ? 0.45 : 0;
    u.uFill.value = (u.uFill.value as number) + (fill - (u.uFill.value as number)) * (1 - Math.exp(-dt * 1.5));
  },
  fragment: /* glsl */ `
uniform float uKickT;   // seconds since the kick
uniform float uOpen;    // the drop: how far the panels have slid apart (0..1)
uniform float uFill;    // how much of the circuits stays lit (the build)
${ART_LIB}
${CAMERA_GLSL}
const vec3 C = vec3(0., 0., -.02);   // the centre the panels are cut from
const float NECK = -.75;             // below it, the neck, which does not open
float gMat;      // 0 a glass panel, 1 the core of light, 2 the neck
float gEdge;     // distance to the edge of the panel (its seam)
vec3 gOff;       // how far the panel has slid
float gId;       // which panel
bool gClamp = true;
vec3 coreC;      // the core's light

float bandAt(float k) {
  if (k < .5) return uBands[0];
  if (k < 1.5) return uBands[1];
  if (k < 2.5) return uBands[2];
  if (k < 3.5) return uBands[3];
  if (k < 4.5) return uBands[4];
  if (k < 5.5) return uBands[5];
  if (k < 6.5) return uBands[6];
  return uBands[7];
}

/**
 * The panel p lies in (cut by latitude and longitude around C): its id, the distance to its edge, and the way it
 * slides out. The mouth is the seam between the mask and the chin, the nose the seam between the mask's halves.
 */
float panelOf(vec3 p, out float edge, out vec3 dir) {
  vec3 v = p - C;
  float r = max(length(v), 1e-4);
  float az = atan(v.x, v.z);
  float el = asin(clamp(v.y / r, -1., 1.));
  float a = abs(az), sx = v.x < 0. ? -1. : 1.;
  float rh = r * cos(el);
  float id;
  if (p.y < NECK) { edge = NECK - p.y; dir = vec3(0.); return 20.; }
  if (el > .9) {
    // the crown, in two halves
    edge = min(r * (el - .9), abs(v.x));
    dir = normalize(vec3(sx * .55, 1., -.1));
    id = sx < 0. ? 0. : 1.;
  } else if (a < .62) {
    float ea = rh * (.62 - a);
    if (el > .3) {
      // the forehead
      edge = min(min(r * (el - .3), r * (.9 - el)), ea);
      dir = normalize(vec3(0., .55, 1.));
      id = 2.;
    } else if (el > -.6) {
      // the mask, in two halves
      edge = min(min(r * (el + .6), r * (.3 - el)), min(ea, abs(v.x)));
      dir = normalize(vec3(sx * .6, -.05, 1.));
      id = sx < 0. ? 3. : 4.;
    } else {
      // the chin
      edge = min(r * (-.6 - el), ea);
      dir = normalize(vec3(0., -1., .45));
      id = 5.;
    }
  } else if (a < 1.9) {
    float ea = rh * min(a - .62, 1.9 - a);
    if (el > -.1) {
      // the temples
      edge = min(min(r * (el + .1), r * (.9 - el)), ea);
      dir = normalize(vec3(sx, .25, -.1));
      id = sx < 0. ? 6. : 7.;
    } else {
      // the jaw
      edge = min(r * (-.1 - el), ea);
      dir = normalize(vec3(sx, -.7, .15));
      id = sx < 0. ? 8. : 9.;
    }
  } else {
    float ea = min(rh * (a - 1.9), abs(v.x));
    if (el > .35) {
      edge = min(min(r * (el - .35), r * (.9 - el)), ea);
      dir = normalize(vec3(sx * .35, .45, -1.));
      id = sx < 0. ? 10. : 11.;
    } else {
      edge = min(r * (.35 - el), ea);
      dir = normalize(vec3(sx * .35, -.4, -1.));
      id = sx < 0. ? 12. : 13.;
    }
  }
  edge = min(edge, p.y - NECK);
  return id;
}

float map(vec3 p) {
  float b = sdCapsule(p, vec3(0., .25, -.05), vec3(0., -1.5, -.15), .8 + .45 * uOpen);
  if (b > .15) { gMat = 0.; gEdge = 1.; gOff = vec3(0.); return b; }
  vec3 dir;
  float edge;
  float id = panelOf(p, edge, dir);
  float h = hash12(vec2(id, 3.7));
  // each panel its own delay and its own distance
  float k = id > 19. ? 0. : clamp(uOpen * 1.3 - .3 * h, 0., 1.);
  gOff = dir * k * (.2 + .16 * h);
  float d = sdHead(p - gOff);
  if (k > 0.) {
    // a slid panel is a shell, trimmed back from its seams
    d = max(d, -d - .05);
    d = max(d, .075 * k - edge);
  }
  gMat = id > 19. ? 2. : 0.;
  gEdge = edge;
  gId = id;
  if (uOpen > .001) {
    // the head's rough volume: no panel lies further out than its slide
    float rough = sdEllipsoid(p - C, vec3(.52, .82, .7));
    // never step over a seam into the next panel (needless far from them all)
    if (gClamp) d = min(d, max(edge * .9 + .004, (rough - .42) * .7));
    // the core, only close to it
    if (rough < d + .05) {
      float core = max(sdHead(p / .84) * .84, NECK - p.y);
      if (core < d) { d = core; gMat = 1.; }
    }
  }
  return d;
}

vec3 calcN(vec3 p) {
  gClamp = false;
  const vec2 k = vec2(1, -1);
  float h = .0015;
  vec3 n = normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
  gClamp = true;
  return n;
}

/** Circuits: traces along the rows and the columns, in long runs, with pads; aa is a pixel in cells. */
float circuit(vec2 u, float aa) {
  vec2 i = floor(u), f = fract(u);
  float row = step(.55, hash12(vec2(i.y, floor(u.x / 3.) + 17.)));
  float col = step(.72, hash12(vec2(floor(u.y / 3.) + 41., i.x)));
  float w = .08;
  float tr = max(row * (1. - smoothstep(w, w + aa, abs(f.y - .5))), col * (1. - smoothstep(w, w + aa, abs(f.x - .5))));
  float pad = step(.86, hash12(i + 5.3)) * (1. - smoothstep(.17, .17 + aa, length(f - .5)));
  return max(tr, pad);
}

/**
 * The neon studio the glass mirrors, lit like a product shot: broad strips of light at its sides and behind it (its
 * rims), a softbox above in front, and thin tubes standing all round in the dark, each following a band of the
 * spectrum. pix: how soft the reflection is (a pixel, or a satin blur).
 */
vec3 env(vec3 r, float pix) {
  float az = atan(r.x, r.z);
  float el = asin(clamp(r.y, -1., 1.));
  // the room goes dark when the head opens: its own light takes over
  float dim = 1. - .75 * uOpen;
  vec3 col = uBase * (.5 + .4 * smoothstep(-.3, .5, el));
  float v = smoothstep(-.4, -.28, el) * (1. - smoothstep(.55, .68, el));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float a = fi < 1.5 ? (fi * 2. - 1.) * 1.25 : (fi * 2. - 5.) * 2.45;
    float da = abs(mod(az - a + PI, 2. * PI) - PI);
    float strip = 1. - smoothstep(.06, .08 + pix, da);
    col += pal(fi * .33) * strip * v * 1.6 * dim;
  }
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float da = abs(mod(az - fi * .8976 - .45 + PI, 2. * PI) - PI);
    float w = .008 + pix;
    float tube = exp(-pow(da / w, 2.)) * 2.5 * (.008 / w) + exp(-da * 30.) * .1;
    col += pal(fi / 7. + .1) * tube * v * (.4 + 2.6 * bandAt(fi)) * dim;
  }
  float box = (1. - smoothstep(.4, .46 + pix, abs(az))) * (1. - smoothstep(.13, .18 + pix, abs(el - .78)));
  col += mix(uInk, vec3(1.), .65) * box * 1.1 * dim;
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);
  // the core's light: the world's colour, as bright whatever the palette (a pale one would wash the frame out)
  coreC = uTint * (.5 / max(dot(uTint, vec3(.3, .59, .11)), .25));
  vec3 bg = env(rd, pa + .004) * .5;
  vec3 col = bg;
  float t = .05, tt = -1.;
  for (int i = 0; i < 120; i++) {
    float d = map(ro + rd * t);
    if (d < .0006 * t) { tt = t; break; }
    t += d;
    if (t > 12.) break;
  }
  float mat = -1.;
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    mat = gMat;
    float edge = gEdge, pEdge = gEdge, id = gId;
    vec3 hq = p - gOff;   // the point on the head before its panel slid
    vec3 n = calcN(p);
    vec3 r = reflect(rd, n);
    float cosi = clamp(dot(n, -rd), 0., 1.);
    float aa = tt * pa * 1.5;
    if (mat > .5 && mat < 1.5) {
      // the core of light, its own circuits brighter still
      vec3 hc = p / .84;
      float tr = circuit(vec2(atan(hc.x, hc.z) * .62, hc.y) * 14., aa * 14.);
      col = coreC * (1.9 + 1.2 * uBeat) * (.6 + .4 * cosi) + mix(coreC, vec3(.6), .5) * tr * (1.5 + 2. * uBeat);
      col *= smoothstep(0., .25, uOpen);
    } else {
      // black glass on the face, satin black on the skull: what it mirrors of the neon studio
      bool face = id > 1.5 && id < 5.5;
      float F = .06 + .94 * pow(1. - cosi, 4.);
      vec3 c = uBase * .2 + (face ? env(r, pa * 4.) * mix(.22, 1., F) : env(normalize(mix(r, n, .3)), .06) * mix(.3, .8, F));
      float hy = clamp((p.y + .8) / 1.6, 0., 1.);
      if (mat < .5) {
        // the eye sockets: a seam round each eye
        vec2 eo = vec2(abs(hq.x) - .155, hq.y - .03) / vec2(.12, .078);
        float sock = face && hq.z > .3 ? abs(length(eo) - 1.) * .085 : 1.;
        // the vents in the temples, before the ears, breathing with the mids
        if (id > 5.5 && id < 7.5) {
          vec2 vq = vec2(hq.z - .12, hq.y - .1);
          float vent = (1. - smoothstep(.0, aa + .004, abs(fract(vq.y * 45.) - .5) / 45. - .002))
            * step(abs(vq.x), .07) * step(abs(vq.y), .07) * step(.3, abs(hq.x));
          c = mix(c, pal(.4) * (.2 + 2.5 * uMid), vent);
        }
        // the circuits under the glass: a faint trace always, the kick's front running out from the seams
        float tr = circuit(vec2(atan(hq.x, hq.z + .02) * .62, hq.y) * 9., aa * 9.);
        float wave = exp(-pow(edge - uKickT * .55, 2.) * 260.) * exp(-uKickT * 2.2);
        float lit = .04 + 1.4 * wave + uFill * (.5 + .5 * sin(hq.y * 7. - uTime * 2.));
        c += pal(.55 + .3 * hy) * tr * lit * (1. - F) * 1.4;
        // the eyes: two slits of light, the gaze drifting slowly, a blink now and then
        vec2 e = vec2(abs(hq.x) - .15, hq.y - .028);
        float blink = smoothstep(.0, .06, abs(fract(uTime / 5.3 + uSeed) - .5) * 2. - .02);
        float slit = (1. - smoothstep(.008 * blink, .008 * blink + aa, abs(e.y + 1.2 * e.x * e.x)))
          * (1. - smoothstep(.07, .085, abs(e.x))) * step(.3, hq.z);
        float gaze = .03 * sin(uTime * .37 + uSeed) + .012 * sin(uTime * 1.13);
        float iris = exp(-pow(hq.x - sign(hq.x) * .15 - gaze, 2.) * 900.);
        c = mix(c, uAccent * (1.6 + 2.5 * iris), slit);
        // the seams, each following the band of its height; the hats run glints along them
        float w = max(.0045, aa * .8);
        float seam = max(1. - smoothstep(w * .5, w * 1.5, edge), .35 * (1. - smoothstep(w * .3, w * 1.1, sock)));
        float glint = step(.94, hash12(floor(vec2(atan(hq.x, hq.z) * 6., hq.y * 6.)) + floor(uTime * 8.))) * uHat;
        vec3 sc = pal(.1 + .6 * hy) * (.5 + 4. * bandAt(hy * 7.) + 1.5 * exp(-uKickT * 6.) + 3. * glint);
        c = mix(c, sc, seam);
        // opened: the core's light on the panels' edges
        c += coreC * uOpen * exp(-pEdge * 18.) * (1.2 + uBeat);
      } else {
        // the neck: rings, the bass lighting the lowest
        float dr = abs(fract(p.y / .11 + .5) - .5) * .11;
        float ring = 1. - smoothstep(.003, .003 + aa, dr);
        c = mix(c, pal(.1) * (.4 + 3. * bandAt(clamp((-p.y - .75) * 4., 0., 2.))), ring);
      }
      col = c;
    }
    // the neck melts into the dark
    col = mix(col, bg, smoothstep(-.95, -1.4, p.y));
  }
  // the core's light spilling out between the panels, and round the head
  vec3 oc = vec3(0., .05, -.02) - ro;
  float s = dot(oc, rd);
  float dc = length(oc - rd * s);
  float glow = exp(-dc * dc * 3.) * uOpen * (.7 + .6 * uBeat);
  if (mat < -.5 || (mat > .5 && mat < 1.5)) col += coreC * glow;
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
