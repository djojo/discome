import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { ARCANE_GLSL } from "./arcane.glsl";

/**
 * A nave of light arches in a single colour, haze and a wet mirror floor, flown through by the shared flight:
 * nearly still in the breakdown, accelerating through the build, warp on the drop (the arches stretch into
 * streaks of light). The arch style changes with every phrase. Far down the nave stands a hooded silhouette:
 * it only comes closer during builds, vanishes in the drop's flash and reappears far away.
 */
export const cathedral = defineShaderScene({
  id: "cathedral",
  name: "Cathédrale",
  energy: "intense",
  renderScale: 0.85,
  // Alpha only marks the letterbox bars: the background may live in the dark nave, never in the bars
  mask: true,
  flight: { cruise: 1.1 },
  description:
    "Nef d'arches lumineuses d'une seule couleur : presque immobile au breakdown, elle accélère à la montée et passe en vitesse lumière au drop.",
  params: [
    paletteParam("signalRed"),
    ...flightParams(),
    { type: "range", key: "haze", label: "Brume", min: 0, max: 2, step: 0.05, default: 1 },
  ],
  uniforms: () => ({
    uHaze: { value: 1 },
    uBeatPhase: { value: 0 },
    uShapeA: { value: 0 },
    uShapeB: { value: 0 },
    uShapeMix: { value: 1 },
    uFigD: { value: 16 },
    uFigVis: { value: 1 },
  }),
  update(u, f, p, dt) {
    u.uHaze.value = num(p.haze, 1);
    u.uBeatPhase.value = f.bpm > 0 ? f.beatPhase : (f.time * 2) % 1;
    // A new arch style on every phrase (ogive, round, portico), morphing over a bar
    if ((f.downbeat && f.phraseBar === 0) || f.drop) {
      u.uShapeA.value = u.uShapeB.value;
      u.uShapeB.value = ((u.uShapeB.value as number) + 1 + Math.floor(Math.random() * 2)) % 3;
      u.uShapeMix.value = 0;
    }
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    u.uShapeMix.value = Math.min(1, (u.uShapeMix.value as number) + dt / bar);
    // The silhouette: approaches only through the build, gone in the drop, back far away afterwards
    const targetD = f.section === "build" ? 16 - 10 * Math.pow(f.buildProgress, 1.3) : f.section === "breakdown" ? 14 : 16;
    const visTarget = f.section === "drop" ? 0 : 1;
    const vis = u.uFigVis.value as number;
    u.uFigVis.value = vis + (visTarget - vis) * (1 - Math.exp(-dt * (visTarget < vis ? 5 : 0.35)));
    if (f.drop) u.uFigVis.value = 0;
    const d = u.uFigD.value as number;
    u.uFigD.value = (u.uFigVis.value as number) < 0.05 ? 18 : d + (targetD - d) * (1 - Math.exp(-dt * 0.5));
  },
  fragment: /* glsl */ `
uniform float uHaze;
uniform float uBeatPhase;
uniform float uShapeA;
uniform float uShapeB;
uniform float uShapeMix;
uniform float uFigD;
uniform float uFigVis;
${ART_LIB}
${FLIGHT_GLSL}
${ARCANE_GLSL}
const float FIG_S = .42; // scale of the silhouette
const float S = 1.7;
float gW;
/** 0 at cruise, about 0.8 at the peak of a drop. */
float gWarp;

/** Distance to the outline of one arch, in the plane of the arch (x across, y up). */
float arch(vec2 q, float shape) {
  float w = gW, h = .35;
  float x = abs(q.x);
  float pil = length(vec2(x - w, q.y - clamp(q.y, -1., h)));
  if (shape < .5) {
    // Ogive: two arcs meeting at a point
    float R = w * 1.55;
    vec2 v = vec2(x + (R - w), q.y - h);
    float tmax = acos((R - w) / R);
    float ang = atan(v.y, v.x);
    float arc;
    if (ang >= 0. && ang <= tmax) arc = abs(length(v) - R);
    else arc = min(length(vec2(x - w, q.y - h)), length(vec2(x, q.y - (h + R * sin(tmax)))));
    return min(arc, pil);
  }
  if (shape < 1.5) {
    // Round arch
    vec2 v = vec2(x, q.y - h);
    float arc = v.y > 0. ? abs(length(v) - w) : length(vec2(x - w, v.y));
    return min(arc, pil);
  }
  // Portico: straight lintel, taller pillars
  float top = h + w * .95;
  float pil2 = length(vec2(x - w, q.y - clamp(q.y, -1., top)));
  float lintel = length(vec2(x - min(x, w), q.y - top));
  return min(pil2, lintel);
}

float frameD(vec3 p, out float id) {
  id = floor(p.z / S + .5);
  // Warp: the faster we go, the more each arch stretches along the nave into a streak of light
  float stretch = 1. + gWarp * gWarp * 30.;
  float z = (p.z - S * id) / stretch;
  float a = arch(p.xy, uShapeA), b = arch(p.xy, uShapeB);
  float d2 = mix(a, b, smoothstep(0., 1., uShapeMix));
  return length(vec2(d2, z)) - .012;
}

float bright(float id, float camId) {
  float rel = camId - id;
  float pos = 9. * (1. - uBeatPhase);
  float wave = exp(-pow(rel - pos, 2.) * 1.2) * smoothstep(.2, .45, uBass);
  float breathe = .5 + .5 * sin(uTime * 1.3 + id * .4);
  float build = uBuild * step(.5, fract(uTime * 2. * (1. + 3. * uBuild))) * .8;
  return .35 + .2 * breathe + 2.2 * wave + build * 1.5 + 2.5 * uDrop;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank);
  uv += flightShake();
  // The nave breathes slowly
  gW = 1.05 * (1. + .1 * sin(uTime * .21));
  gWarp = max(uSpeed - .2, 0.);
  float camZ = -uTravel;
  vec3 ro = vec3(sin(uTime * .21) * .08 + uSway * .35, -.35 + clamp(uDive, -1., 1.2) * .3, camZ);
  vec3 rd = normalize(vec3(uv.x, uv.y + .04, -flightFocal(1.6)));
  rd.xz *= rot(sin(uTime * .17) * .05 - uSway * .06);
  float camId = floor(camZ / S + .5);
  // The silhouette standing in the nave, facing us
  vec3 figPos = vec3(0., -1. - FEET * FIG_S, camZ - uFigD);
  setupFigure(0., 0., 0.);
  float dmin = 1e3;
  float tf = -1.;
  vec3 rof = (ro - figPos) / FIG_S;
  if (uFigVis > .01) {
    tf = figMarch(rof, rd, dmin);
    if (tf > 0.) tf *= FIG_S;
  }
  vec3 accFig = vec3(0.);
  bool reflected = false, blocked = false;
  vec3 acc = vec3(0.);
  float atten = 1.;
  // Per-pixel jitter of the first step: fine noise instead of banding in the glow
  float t = hash12(fc + fract(uTime) * 17.) * .02;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    if (!reflected && !blocked && tf > 0. && t > tf) {
      // light from behind the silhouette is blocked: remember what was gathered in front of it
      accFig = acc;
      blocked = true;
    }
    if (p.y < -1. && rd.y < 0.) {
      // Wet mirror floor
      reflected = true;
      ro = vec3(p.x, -1., p.z);
      rd.y = -rd.y;
      t = .01;
      atten *= .45;
      continue;
    }
    float id;
    float d = frameD(p, id);
    float stepL = max(d * .6, .02);
    // Stretched arches gather much more light: compensate so the warp stays made of streaks, not a white-out
    acc += atten * uInk * bright(id, camId) * (.0025 / (.0012 + d * d * 5.)) * stepL * 9. / (1. + gWarp * 4.);
    t += stepL;
    if (t > 26.) break;
  }
  if (tf > 0. && !blocked) { accFig = acc; blocked = true; }
  if (blocked) {
    // A black cut-out, back-lit: a thin rim in the light colour that flares on the kick
    vec3 n = figNormal(rof + rd * (tf / FIG_S));
    float rim = pow(1. - abs(dot(n, -rd)), 3.);
    accFig += uInk * rim * (.5 + 1.3 * uBeat);
    acc = mix(acc, accFig, uFigVis);
  } else {
    acc += uInk * exp(-dmin * 30.) * .25 * uFigVis * (1. + uBeat);
  }
  vec3 col = acc;
  float lum = dot(col, vec3(.3, .59, .11));
  col = mix(col, uAccent * lum * 1.4, smoothstep(.6, 2.4, lum));
  col += uInk * .02 * uHaze * (1. + 2. * uDrop + 2. * gWarp) * (1. - abs(uv.y) * 1.2);
  col = 1. - exp(-col * 1.3);
  col *= vignette(fc / uRes);
  float lb = letterbox(fc);
  gl_FragColor = vec4(col * lb, 1. - lb);
}
`,
});
