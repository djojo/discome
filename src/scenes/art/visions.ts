import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { MYCELIUM_GLSL } from "./mycelium.glsl";
import { tripUniforms, updateTrip } from "./mycTrip";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

/**
 * Visions: the Mycélium world's layer (laid in screen mode over every plan, so it only shows in the dark): the
 * open-eye visuals of the trip. Networks of membranes like living cells, filaments branching like ferns, a lattice
 * that warps, all in the enchanted colours, drifting in a very slow endless zoom. Never centred (no mandala). Faint on
 * the groove, growing through the build, bursting on the drop, in front of everything in a breakdown. A ring of
 * light runs out along the lines on every kick.
 */
export const visions = defineShaderScene({
  id: "myc-visions",
  name: "Visions",
  energy: "calm",
  renderScale: 0.5,
  description:
    "Les visions du trip, en calque : des membranes de cellules, des filaments qui se ramifient comme des fougères, un pavage qui se déforme, aux couleurs enchantées, dans un zoom infini très lent. Discrètes en groove, elles grandissent pendant la montée, éclatent au drop et passent devant tout au breakdown.",
  params: [paletteParam("spores")],
  uniforms: () => ({
    ...tripUniforms(),
    uLevel: { value: 0 },
    uKick: { value: 9 },
    uDeep: { value: 0 },
  }),
  update(u, f, _p, dt) {
    updateTrip(u, f, dt);
    // deeper in a breakdown: the inner moment, the visions come forward
    u.uDeep.value = approach(u.uDeep.value as number, f.section === "breakdown" ? 1 : 0, 0.6, dt);
    // quieter over the plans whose own lights are the show (the glowworms, and the title on their cliff; the shadow
    // play of the den), so the visions never drown them
    const damp = f.shot === "myc-grotto" ? 0.5 : f.shot === "myc-den" ? 0.65 : 1;
    u.uLevel.value = approach(u.uLevel.value as number, f.trip * damp, 2, dt);
    u.uKick.value = f.beat ? 0 : (u.uKick.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uLevel;
uniform float uKick;
uniform float uDeep;
${ART_LIB}
${MYCELIUM_GLSL}

/** Membranes: the edges of warped cells (distance in the cells' units, and the cell's own number). */
vec2 cells(vec2 x) {
  vec2 i0 = floor(x);
  float d1 = 9., d2 = 9., id = 0.;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = i0 + vec2(i, j);
      float h = hash12(c);
      vec2 o = .5 + .4 * sin(uTime * (.08 + .1 * h) + 6.28 * vec2(h, fract(h * 7.3)));
      float d = length(x - c - o);
      if (d < d1) { d2 = d1; d1 = d; id = fract(h * 13.7); }
      else if (d < d2) d2 = d;
    }
  return vec2((d2 - d1) * .5, id);
}

/** Filaments branching like ferns: an orbit trap of a folded, turned, shrunk plane (thin lines where the orbit passes). */
float fern(vec2 p) {
  float d = 9.;
  float s = 1.;
  for (int i = 0; i < 6; i++) {
    p = abs(p) - vec2(.62, .28);
    p *= rot(.55 + .08 * sin(uTime * .05 + float(i)));
    p *= 1.42;
    s *= 1.42;
    d = min(d, abs(p.y) / s);
  }
  return d;
}

/** One depth of the endless zoom (k: its scale), drifting: membranes, ferns and a warped lattice, crossfading. */
vec3 layer(vec2 uv, float k, float seed, float px) {
  vec2 p = uv * k + vec2(seed * 13.1, seed * 7.7) + vec2(uTime * .01, -uTime * .007);
  // warp: nothing is straight in a vision
  p += .35 * vec2(vnoise(vec3(p * .5, uTime * .05)), vnoise(vec3(p * .5 + 4.1, uTime * .05))) - .17;
  float w = px * k;
  vec3 c = vec3(0.);
  // membranes
  vec2 ce = cells(p * 2.1);
  float mem = mycLine(ce.x / 2.1, .007, w) * smoothstep(.25, .6, vnoise(vec3(p * .8, 7.)));
  c += tripPal(ce.y * .5 + uTime * .01) * mem * .8;
  // ferns, in their own drifting frame
  float fd = fern((p - vec2(seed * 3., 1.)) * .35) / .35;
  c += tripPal(.4 + fd * .3 + seed) * mycLine(fd, .008, w) * .9;
  // a lattice that breathes and warps (hexagonal)
  vec2 h = p * 1.1;
  vec2 hq = vec2(h.x + h.y * .577, h.y * 1.155);
  vec2 hf = fract(hq) - .5;
  float hex = abs(max(abs(hf.x), max(abs(hf.y), abs(hf.x + hf.y))) - .45 - .05 * uBreath);
  float mix3 = .5 + .5 * sin(uTime * .04 + seed * 6.);
  c = mix(c, c + tripPal(.7 + hf.x) * mycLine(hex / 1.1, .01, w) * .7, mix3);
  return c;
}

void main() {
  // how much of it: faint on the groove, strong on the drop, in front of everything in a breakdown (none at all: no work)
  float level = pow(smoothstep(.25, 1., uLevel), 1.3) * (1. + .8 * uDeep);
  if (level < .003) { gl_FragColor = vec4(0., 0., 0., 1.); return; }
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float px = 1. / uRes.y;
  // the endless zoom: two depths, one fading in as the other grows past
  float z = fract(uTime * .012);
  vec3 col = vec3(0.);
  for (int i = 0; i < 2; i++) {
    float zi = fract(z + float(i) * .5);
    float k = exp2(3. - zi * 2.);
    float a = sin(zi * 3.1416);
    col += layer(uv, k, floor(uTime * .012 + float(i) * .5) + float(i) * .37, px) * a;
  }
  // a ring of light runs out along the lines from where the kick fell
  float r = length(uv - vec2(.3 * sin(floor(uTime * .5) * 1.7), .2 * cos(floor(uTime * .5) * 2.3)));
  float ring = exp(-pow((r - uKick * .9) / .06, 2.)) * exp(-uKick * 2.);
  // patches that come and go, never the whole frame evenly
  float patches = .45 + .55 * smoothstep(.3, .7, vnoise(vec3(uv * 1.4, uTime * .06)));
  col *= patches * level * (1. + 2. * ring) * 1.2;
  gl_FragColor = vec4(col, 1.);
}
`,
});
