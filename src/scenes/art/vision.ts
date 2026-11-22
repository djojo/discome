import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { NIGHT_GLSL } from "./night.glsl";

/**
 * La Vision: the trance of the breakdown. A slow, endless dive into a mandala that folds back on itself: rings of
 * yarn bands, cactus ribs with their white tufts, scalloped petals and eyes, each ring a motif, mirrored in an
 * eight-fold kaleidoscope. The kick makes the rings breathe; the eyes blink at their own pace.
 */
export const vision = defineShaderScene({
  id: "canyon-vision",
  name: "La Vision",
  energy: "calm",
  description:
    "La transe du breakdown : une plongée lente et sans fin dans un mandala de fils, de côtes de cactus, de pétales et d'yeux, replié en kaléidoscope ; les anneaux respirent au kick.",
  params: [paletteParam("peyote"), { type: "range", key: "symmetry", label: "Symétrie", min: 5, max: 12, step: 1, default: 8 }],
  uniforms: () => ({
    uZoom: { value: 0 },
    uK: { value: 8 },
  }),
  update(u, f, p, dt) {
    u.uK.value = Number(p.symmetry ?? 8);
    // the dive: its own slow, steady pace (a trance does not hurry)
    u.uZoom.value = (u.uZoom.value as number) + dt * 0.3;
  },
  fragment: /* glsl */ `
uniform float uZoom;
uniform float uK;
${ART_LIB}
${NIGHT_GLSL}

/** An eye: almond, iris of yarn rings, a dark pupil; it blinks now and then. x, y in [0,1] across the tile. */
vec3 eye(vec2 q, float id) {
  float blink = smoothstep(.0, .06, abs(fract(uTime * .07 + id * .37) - .5) - .44);
  vec2 c = q - .5;
  float lid = .3 * (1. - c.x * c.x / .2) * (1. - .9 * (1. - blink));
  float inEye = smoothstep(.01, -.01, abs(c.y) - lid);
  float r = length(c * vec2(1., 1.3));
  vec3 col = uBase * .3;
  col = mix(col, vec3(.95, .92, .85), inEye);
  float iris = smoothstep(.17, .15, r) * inEye;
  col = mix(col, yarn(fract(id * .23 + floor(r * 30.) * .1)), iris);
  col = mix(col, uBase * .2, smoothstep(.07, .05, r) * inEye);
  col += vec3(1.) * smoothstep(.03, .0, length(c - vec2(-.04, .04))) * inEye;
  // the lid's outline
  col = mix(col, yarn(fract(id * .31 + .5)), smoothstep(.025, .0, abs(abs(c.y) - lid)) * step(abs(c.x), .44));
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float r = length(uv) + 1e-4;
  float a = atan(uv.y, uv.x) + uTime * .03;
  float W = 6.2831853 / uK;
  float sector = floor(a / W);
  float ax = abs(fract(a / W) - .5) * 2.;          // 0 at the sector's mirror line, 1 at its edges
  // log-polar: every ring looks the same size, the dive never ends
  float L = log(r) * 3.8 - uZoom;
  float ring = floor(L);
  float f = fract(L);
  float h = hash12(vec2(ring, 3.3));
  // the kick: each ring swells a little
  f = clamp((f - .5) * (1. - .12 * uBeat) + .5, 0., 1.);
  vec3 col = uBase * .5;
  float motif = floor(h * 4.);
  if (motif < 1.) {
    // yarn bands: concentric threads of colour
    float b = fract(f * 6.);
    col = yarn(fract(h + floor(f * 6.) * .17)) * smoothstep(.0, .1, b) * (1. - smoothstep(.75, .85, b));
  } else if (motif < 2.) {
    // cactus ribs: radial stripes with tufts of white down
    float rib = abs(fract(ax * 3.) - .5) * 2.;
    col = mix(uBase * .6, yarn(fract(h * 3.)), smoothstep(.6, .8, rib));
    col += vec3(1.) * smoothstep(.12, .0, length(vec2((fract(ax * 3.) - .5) * 1.6, fract(f * 3.) - .5))) * .8;
  } else if (motif < 3.) {
    // scalloped petals
    float pet = f - .35 * sqrt(max(1. - pow(ax * 2. - 1., 2.), 0.));
    col = mix(yarn(fract(h * 5.)), yarn(fract(h * 5. + .5)), step(.0, pet));
    col *= smoothstep(.0, .03, abs(pet));
  } else {
    // eyes, one per sector, looking out of the dark
    col = eye(vec2(ax, f), sector + ring * 7.);
  }
  // the rings' borders: a dark thread and a bright one
  col *= smoothstep(.0, .04, f) * smoothstep(1., .96, f);
  col += yarn(fract(h * 7.)) * smoothstep(.03, .0, abs(f - .02)) * .6;
  // the heart of the vision: a soft glow where everything comes from
  col += mix(uAccent, vec3(1.), .3) * exp(-r * 9.) * (.6 + uBeat);
  col *= smoothstep(.0, .06, r) * .9 + .1;
  col = aces(col * 1.05);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, 1.);
}
`,
});
