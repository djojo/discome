import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { STUDIO_GLSL } from "./studio.glsl";

/**
 * Coulée: a wall of liquid metal, seen flat. Mercury and a second metal (the world's leading colour) run down it very slowly and mix as they go: broad
 * separate streams at the top, curling round each other lower down, finer and finer, until near the bottom they
 * melt into one alloy. Heavy drips slide down at their own pace. The kick catches the crests of the streams; on the
 * drop a pour of molten gold (its own metal, brighter than the world's colour, its front glowing) comes down from the
 * top over the mercury, then melts into it; the wall runs a little faster for a few bars.
 */
export const flow = defineShaderScene({
  id: "mercury-flow",
  name: "Coulée",
  energy: "calm",
  hdr: true,
  renderScale: 0.85,
  description:
    "Un mur de métal liquide vu de face : le mercure et un second métal (la couleur du monde) y coulent très lentement et se mélangent en descendant, en filets qui s'enroulent jusqu'à se fondre ; au drop, une coulée d'or descend du haut.",
  params: [paletteParam("mercury")],
  uniforms: () => ({
    uFlow: { value: 0 },
    uGush: { value: 99 },
    uGlint: { value: 0 },
    // CPU side only
    uRush: { value: 0 },
  }),
  update(u, f, _p, dt) {
    const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
    // the drop: a gush from the top, and the wall runs faster for a while
    if (f.drop) {
      u.uGush.value = 0;
      u.uRush.value = 1;
    } else u.uGush.value = (u.uGush.value as number) + dt;
    u.uRush.value = (u.uRush.value as number) * Math.exp(-dt / (bar * 2));
    // very slow and heavy: a stream takes well over a minute to cross the wall
    u.uFlow.value = (u.uFlow.value as number) + dt * 0.008 * (1 + (u.uRush.value as number));
    u.uGlint.value = f.beat ? 1 : (u.uGlint.value as number) * Math.exp(-dt * 3);
  },
  fragment: /* glsl */ `
uniform float uFlow;     // how far the wall has run
uniform float uGush;     // seconds since the drop's gush
uniform float uGlint;    // the kick on the crests
${ART_LIB}
${STUDIO_GLSL}

/** The drop's pour of gold: how far down its front has come (screen y), with fingers. */
float pourFront(vec2 p) {
  // (from the top of the frame at once, down to the bottom in about ten seconds)
  return .62 - uGush * .11 + .22 * (vnoise(vec3(p.x * 7., 1.7, uGush * .1)) - .5) + .08 * sin(p.x * 23. + 1.3);
}

/**
 * The fields of the wall at p (screen units): height of the liquid (x), share of the second metal (y), the drop's
 * molten gold (z).
 * The metals mix as they run down: the lower, the stronger the folding, the finer the streams, the softer their
 * edges, until they blend.
 */
vec3 wall(vec2 p) {
  float down = smoothstep(.55, -.6, p.y);
  // everything runs down (sample higher up as the wall flows); the folds keep turning slowly on top of that
  vec2 q = vec2(p.x * 2., p.y * .8 + uFlow);
  float tm = uTime * .01;
  vec2 w = vec2(fbm3(vec3(q * vec2(1., .45), 1.3 + tm)), fbm3(vec3(q * vec2(1., .45) + 4.1, 2.7 - tm)));
  vec2 s = q + (w - .5) * vec2(1.6, .7) * mix(.5, 2.1, down);
  // lower down, the streams are pulled round each other
  s += down * .35 * vec2(sin(s.y * 2.1 + tm * 3.), cos(s.x * 1.7 - tm * 2.));
  float f = vnoise(vec3(s * vec2(1.3, .7), 7. + tm)) + .4 * vnoise(vec3(s * vec2(2.7, 1.3), 3.));
  // streams of the second metal: broad at the top, finer and finer as they mix
  float m = .5 + .5 * sin(f * mix(8., 26., down) + s.x * 2.);
  float soft = mix(.03, .24, down * down);
  float g = smoothstep(.58 - soft, .58 + soft, m);
  // the drop's pour: molten gold coming down from the top, its front in fingers, melting in after a while
  float pour = 0.;
  if (uGush < 18.) {
    float gy = pourFront(p);
    float band = 1. - smoothstep(.4, .6, abs(p.x + .15 * sin(p.y * 4. + uTime * .1)) - .2 * vnoise(vec3(p * 3., uTime * .06)));
    pour = smoothstep(gy - .03, gy + .03, p.y) * band * (1. - smoothstep(12., 18., uGush));
  }
  // the relief: ridges where the streams meet (fading as they blend), a slow swell, the gold a little proud
  float seam = exp(-pow((m - .58) / (.06 + soft), 2.)) * (1. - .6 * down);
  float h = .5 * f + .25 * g + .35 * seam + .2 * pour;
  return vec3(h, g, pour);
}

/** Heavy drips sliding down, each in its own column at its own pace. */
float drips(vec2 p) {
  const float C = .16;
  float col = floor(p.x / C);
  float h = hash12(vec2(col, 4.4));
  if (h < .55) return 0.;
  float x = p.x - (col + .5) * C - (h - .7) * .05;
  float speed = .012 + .02 * hash12(vec2(col, 9.1));
  float y = 1.2 - fract(uTime * speed + h) * 2.6;
  float dy = p.y - y;
  // a head and a thin trail above it
  float head = exp(-(x * x) / .0012 - (dy * dy) / .0025);
  float trail = exp(-(x * x) / .0003) * smoothstep(.0, .02, dy) * exp(-dy * 2.);
  return head + .5 * trail;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - .5 * uRes) / uRes.y;
  float e = 2.5 / uRes.y;
  vec3 c0 = wall(p);
  float h0 = c0.x + .35 * drips(p);
  float hx = wall(p + vec2(e, 0.)).x + .35 * drips(p + vec2(e, 0.));
  float hy = wall(p + vec2(0., e)).x + .35 * drips(p + vec2(0., e));
  // the wall faces us: its normal leans with the slopes of the liquid
  vec3 n = normalize(vec3(-(hx - h0) / e * .03, -(hy - h0) / e * .03, 1.));
  // seen from straight in front; the room behind us, reflected (y is up)
  vec3 rd = normalize(vec3(p * .35, -1.));
  vec3 r = reflect(rd, n);
  vec3 env = studio(vec3(r.x, r.y, -r.z));
  float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 5.);
  // the second metal: the world's leading colour
  vec3 other = uTint;
  vec3 silver = env * mix(uInk * .9, vec3(1.), fre);
  vec3 metal2 = env * mix(other, vec3(1.), fre);
  vec3 col = mix(silver, metal2, c0.y);
  // the molten gold over it all: brighter than any metal of the wall, its front glowing hot
  vec3 gold = env * mix(vec3(1., .74, .3), vec3(1.), fre) * 1.25 + vec3(1., .55, .18) * .3;
  float front = uGush < 18. ? exp(-pow((p.y - pourFront(p)) / .035, 2.)) * c0.z : 0.;
  col = mix(col, gold, c0.z) + vec3(1., .62, .25) * front * 1.4 * (1. - smoothstep(6., 12., uGush));
  // the kick: the crests catch the light
  col += mix(vec3(1.), other, c0.y * .5) * uGlint * .35 * smoothstep(.6, .95, h0);
  gl_FragColor = vec4(hdrOut(col * 1.05), 1.);
}
`,
});
