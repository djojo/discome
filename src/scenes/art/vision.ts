import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { NIGHT_GLSL } from "./night.glsl";

/**
 * La Vision: the trance of the breakdown. A slow, endless dive into a mandala of yarn that folds back on itself:
 * rings of threads, cactus ribs with their white tufts, scalloped petals, eyes, zigzag snakes, suns and peyote
 * flowers, each ring a motif, mirrored in an eight-fold kaleidoscope, every ring made of fine threads and bound by a
 * black one. At its heart an eye opens. The kick makes the rings breathe and turns the crowns, one way and the other;
 * the eyes blink at their own pace.
 */
export const vision = defineShaderScene({
  id: "canyon-vision",
  name: "La Vision",
  energy: "calm",
  hdr: true,
  description:
    "La transe du breakdown : une plongée lente et sans fin dans un mandala de fils (côtes de cactus, pétales, yeux, serpents, soleils, fleurs de peyotl), replié en kaléidoscope, un œil qui s'ouvre au cœur ; au kick les anneaux respirent et les couronnes tournent en sens alternés.",
  params: [paletteParam("huichol"), { type: "range", key: "symmetry", label: "Symétrie", min: 5, max: 12, step: 1, default: 8 }],
  uniforms: () => ({
    uZoom: { value: 0 },
    uK: { value: 8 },
    uSpin: { value: 0 },
    uSpinTarget: { value: 0 },
    uOpen: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uK.value = Number(p.symmetry ?? 8);
    // the dive: its own slow, steady pace (a trance does not hurry)
    u.uZoom.value = (u.uZoom.value as number) + dt * 0.3;
    // each kick turns the crowns a notch (alternate rings the other way), smoothly
    if (f.beat) u.uSpinTarget.value = (u.uSpinTarget.value as number) + 0.06;
    const sp = u.uSpin.value as number;
    u.uSpin.value = sp + ((u.uSpinTarget.value as number) - sp) * (1 - Math.exp(-dt * 4));
    // the eye at the heart opens slowly once the vision is on screen
    u.uOpen.value = Math.min(1, (u.uOpen.value as number) + dt / 6);
  },
  fragment: /* glsl */ `
uniform float uZoom;
uniform float uK;
uniform float uSpin;
uniform float uOpen;
${ART_LIB}
${NIGHT_GLSL}

/** 1 - smoothstep(a, b, x): a soft "below". */
float below(float a, float b, float x) { return 1. - smoothstep(a, b, x); }

/** An eye: almond, iris of yarn rings, a dark pupil; it blinks now and then. x, y in [0,1] across the tile. */
vec3 eye(vec2 q, float id, float open, vec3 bg) {
  // open, closing for a moment now and then (about one time in eight)
  float blink = below(.0, .06, abs(fract(uTime * .07 + id * .37) - .5) - .44);
  vec2 c = q - .5;
  float lid = .3 * (1. - c.x * c.x / .2) * (1. - .9 * (1. - blink)) * open;
  float inEye = below(-.01, .01, abs(c.y) - lid);
  float r = length(c * vec2(1., 1.3));
  vec3 col = mix(bg, vec3(.95, .92, .85), inEye);
  float iris = below(.15, .17, r) * inEye;
  col = mix(col, yarn(fract(id * .23 + floor(r * 30.) * .1)), iris);
  col = mix(col, uBase * .2, below(.05, .07, r) * inEye);
  col += vec3(1.) * below(.0, .03, length(c - vec2(-.04, .04))) * inEye;
  // the lid's outline
  col = mix(col, yarn(fract(id * .31 + .5)), below(.0, .025, abs(abs(c.y) - lid)) * step(abs(c.x), .44));
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float r = length(uv) + 1e-4;
  // log-polar: every ring looks the same size, the dive never ends
  float L = log(r) * 3.8 - uZoom;
  float ring = floor(L);
  float f = fract(L);
  float h = hash12(vec2(ring, 3.3));
  // the crowns turn with the kicks, alternate rings the other way
  float dir = mod(ring, 2.) < .5 ? 1. : -1.;
  float a = atan(uv.y, uv.x) + uTime * .03 + dir * uSpin;
  float W = 6.2831853 / uK;
  float sector = floor(a / W);
  float ax = abs(fract(a / W) - .5) * 2.;          // 0 at the sector's mirror line, 1 at its edges
  // the kick: each ring swells a little
  f = clamp((f - .5) * (1. - .12 * uBeat) + .5, 0., 1.);
  vec3 col = uBase * .5;
  vec3 c1 = yarn(fract(h * 3.)), c2 = yarn(fract(h * 3. + .5));
  float motif = floor(h * 7.);
  if (motif < 1.) {
    // yarn bands: concentric threads of colour
    float b = fract(f * 6.);
    col = yarn(fract(h + floor(f * 6.) * .17)) * smoothstep(.0, .1, b) * below(.75, .85, b);
  } else if (motif < 2.) {
    // cactus ribs: radial stripes with tufts of white down
    float rib = abs(fract(ax * 3.) - .5) * 2.;
    col = mix(uBase * .6, c1, smoothstep(.6, .8, rib));
    col += vec3(1.) * below(.0, .12, length(vec2((fract(ax * 3.) - .5) * 1.6, fract(f * 3.) - .5))) * .8;
  } else if (motif < 3.) {
    // scalloped petals
    float pet = f - .35 * sqrt(max(1. - pow(ax * 2. - 1., 2.), 0.));
    col = mix(c1, c2, step(.0, pet));
    col *= smoothstep(.0, .03, abs(pet));
  } else if (motif < 4.) {
    // eyes, one per sector, looking out of the dark
    col = eye(vec2(ax, f), sector + ring * 7., 1., uBase * .3);
  } else if (motif < 5.) {
    // a zigzag snake round the ring, its back in diamonds
    float z = abs(f - .5 - .28 * (abs(fract(ax * 2.) - .5) * 4. - 1.));
    col = mix(uBase * .4, c1, below(.1, .13, z));
    col = mix(col, c2, below(.03, .05, z) * step(.5, fract(ax * 8.)));
  } else if (motif < 6.) {
    // a sun in each sector: a disc, rays of thread
    vec2 q = vec2(ax - .5, f - .5) * vec2(1.6, 1.);
    float d = length(q);
    float ra = atan(q.y, q.x);
    col = uBase * .4;
    col = mix(col, c2, below(.0, .03, d - .2 - .12 * pow(abs(sin(ra * 6.)), 6.)) * step(.13, d));
    col = mix(col, vec3(1., .82, .25), below(.12, .14, d));
    col = mix(col, uBase * .3, below(.0, .02, abs(d - .13)));
  } else {
    // a peyote flower in each sector: six petals, magenta to a golden heart
    vec2 q = vec2(ax - .5, f - .5) * vec2(1.6, 1.);
    float d = length(q);
    float R = .36 * (.55 + .45 * abs(cos(atan(q.y, q.x) * 3.)));
    col = mix(uBase * .4, mix(vec3(1., .85, .3), vec3(1., .18, .55), smoothstep(.06, .2, d)), below(R - .02, R, d));
    col = mix(col, uBase * .3, below(.0, .02, abs(d - R)) * step(.05, d));
  }
  // each ring woven of fine threads along it (their average once finer than a pixel)
  float th = f * 40.;
  col *= mix(.72 + .28 * sin(th * 3.1416), .86, smoothstep(.3, .8, fwidth(th)));
  // the rings' borders: a black thread and a bright one
  col *= smoothstep(.0, .06, f) * below(.94, 1., f);
  col += yarn(fract(h * 7.)) * below(.0, .03, abs(f - .03)) * .6;
  // the heart of the vision: an eye opening, ringed with light
  float er = .16;
  if (r < er * 1.25) {
    vec3 c = eye(vec2(uv.x / (er * 2.) + .5, uv.y / (er * 2.) + .5), 99., uOpen, uBase * .25);
    col = mix(col, c, below(er * .95, er * 1.05, r));
  }
  col += mix(uAccent, vec3(1.), .3) * exp(-max(r - er, 0.) * 14.) * (.15 + .4 * uBeat) * smoothstep(er * .9, er, r);
  gl_FragColor = vec4(hdrOut(col * 1.05), 1.);
}
`,
});
