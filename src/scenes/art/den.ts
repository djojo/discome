import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { MYCELIUM_GLSL } from "./mycelium.glsl";

const EYES = 7;
const WOLVES = 5;

/**
 * La Tanière: from inside the wolf's den, an arch of earth and roots in silhouette frames the forest slope under the
 * moon, in the mist. Through the breakdown pairs of eyes light up one by one in the dark (in the den, under the trees),
 * blink slowly, go out; breath steams at the mouth. On some phrases a wolf rises on the ridge before the moon and howls;
 * on a drop the moon breaks through the clouds and the whole pack howls. The wolves are only ever shadows far away
 * (ombres chinoises) and eyes in the dark: never a figure up close. Drawn in layers (no ray marching): light.
 */
export const den = defineShaderScene({
  id: "myc-den",
  name: "La Tanière",
  energy: "calm",
  hdr: true,
  mask: true,
  description:
    "Depuis le terrier du loup, une arche de terre et de racines encadre la forêt sous la lune, dans la brume. Des paires d'yeux s'allument une à une dans le noir ; sur certaines phrases un loup hurle en silhouette sur la crête ; au drop, la lune perce et toute la meute hurle.",
  params: [paletteParam("boismort")],
  uniforms: () => ({
    // eyes: x, y (screen), seconds since they opened, how long they stay (0: none)
    uEyes: { value: Array.from({ length: EYES }, () => new THREE.Vector4(0, 0, 99, 0)) },
    // wolves on the ridge: x, size, seconds since it rose, how long it howls (0: none)
    uWolves: { value: Array.from({ length: WOLVES }, () => new THREE.Vector4(0, 0, 99, 0)) },
    uMoon: { value: 0 },
    uBreath: { value: 99 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
    uNextEye: { value: 0 },
  }),
  update(u, f, _p, dt) {
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    const eyes = u.uEyes.value as THREE.Vector4[];
    const wolves = u.uWolves.value as THREE.Vector4[];
    if (f.time - (u.uLast.value as number) > 1.5) {
      for (const e of eyes) e.set(0, 0, 99, 0);
      for (const w of wolves) w.set(0, 0, 99, 0);
      u.uMoon.value = 0;
      u.uNextEye.value = 1;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    for (const e of eyes) e.z += dt;
    for (const w of wolves) w.z += dt;
    // a new pair of eyes every couple of bars, somewhere in the dark (in the den, under the trees)
    u.uNextEye.value = (u.uNextEye.value as number) - dt;
    if ((u.uNextEye.value as number) <= 0) {
      u.uNextEye.value = bar * (1 + Math.random() * 2);
      const free = eyes.find((e) => e.w === 0 || e.z > e.w);
      if (free) {
        const inDen = Math.random() < 0.55;
        const side = Math.random() < 0.5 ? -1 : 1;
        if (inDen) free.set(side * (0.55 + Math.random() * 0.25), -0.38 + Math.random() * 0.22, 0, bar * (3 + Math.random() * 4));
        else free.set(-0.4 + Math.random() * 0.8, -0.2 + Math.random() * 0.08, 0, bar * (2 + Math.random() * 3));
      }
    }
    // a wolf howls on the ridge at the start of some phrases
    if (f.downbeat && f.phraseBar === 0 && Math.random() < 0.6) {
      const w = wolves.find((x) => x.w === 0 || x.z > x.w);
      if (w) w.set(-0.5 + Math.random() * 1, 0.8 + Math.random() * 0.4, 0, bar * 2.5);
    }
    // the drop: the moon breaks through, the whole pack howls
    if (f.drop) {
      u.uMoon.value = 1;
      wolves.forEach((w, i) => w.set(-0.62 + i * 0.3 + (Math.random() - 0.5) * 0.08, 0.75 + Math.random() * 0.5, -i * 0.15, bar * 4));
    }
    u.uMoon.value = Math.max(0, (u.uMoon.value as number) - dt / (bar * 8));
    u.uBreath.value = (u.uBreath.value as number) + dt;
    if ((u.uBreath.value as number) > 4 + Math.random() * 3) u.uBreath.value = 0;
  },
  fragment: /* glsl */ `
uniform vec4 uEyes[${EYES}];
uniform vec4 uWolves[${WOLVES}];
uniform float uMoon;     // the drop: the moon breaks through (fades over the hold)
uniform float uBreath;   // seconds since the last breath at the den's mouth
uniform float uSafe;
${ART_LIB}
${MYCELIUM_GLSL}
float sdSeg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float sdEll(vec2 p, vec2 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }

/** A wolf sitting, its head raised, howling (facing right, sitting at the origin, a unit tall); k: how high the head. */
float wolf(vec2 p, float k) {
  float d = length(p - vec2(0., .3)) - .25;                         // haunch
  d = smin(d, sdSeg(p, vec2(.05, .34), vec2(.3, .6), .19), .08);    // back to chest
  d = smin(d, sdSeg(p, vec2(.33, .5), vec2(.35, .02), .05), .04);   // forelegs
  d = smin(d, sdSeg(p, vec2(.25, .48), vec2(.27, .02), .045), .04);
  d = smin(d, sdEll(p - vec2(.08, .04), vec2(.17, .05)), .05);     // hind paw
  d = min(d, sdSeg(p, vec2(-.2, .14), vec2(-.42, .05), .06));       // tail on the ground
  // the neck and head: raised toward the moon (k = 1), lower otherwise
  vec2 nb = vec2(.33, .66);
  vec2 hd = nb + mix(vec2(.16, .14), vec2(.12, .3), k);
  d = smin(d, sdSeg(p, nb, hd, .12), .06);
  vec2 dir = normalize(mix(vec2(1., -.2), vec2(.55, .85), k));
  d = smin(d, sdSeg(p, hd, hd + dir * .13, .085), .03);           // skull
  d = smin(d, sdSeg(p, hd + dir * .1, hd + dir * .26, .04), .02);  // muzzle
  vec2 ear = hd + vec2(-dir.y, dir.x) * .08 - dir * .02;
  d = min(d, sdSeg(p, ear, ear + vec2(-dir.y, dir.x) * .09 - dir * .05, .025));
  // a ruffle of fur along the outline
  d += .012 * (vnoise(vec3(p * 40., 1.)) - .5);
  return d;
}

/** The ridge line across the frame (its height at x), the trees standing on it. */
float ridgeY(float x) { return -.04 + .05 * vnoise(vec3(x * 2.3, 1., 2.)) + .025 * vnoise(vec3(x * 7., 3., 1.)); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  float px = 1. / uRes.y;
  vec3 moonC = mix(uInk, vec3(.82, .88, 1.), .4);
  vec3 eyeC = mix(uTint, vec3(1., .7, .3), .55);
  // a slow drift, so the frame breathes
  vec2 q = uv + vec2(.01 * sin(uTime * .05), .006 * sin(uTime * .07));

  // ---- the sky: the moon behind the clouds (it breaks through on the drop)
  vec3 rd = normalize(vec3(q.x, q.y + .22, 1.25));
  vec3 md = normalize(vec3(.12 + .1 * fract(uSeed * .3), .36, 1.));
  vec3 col = mycSky(rd, md, moonC, px * .8);
  float moon = mycMoon(rd, md, .06, px * .8);
  float veil = (1. - uMoon) * smoothstep(.35, .75, vnoise(vec3(rd.xy * 6. + vec2(uTime * .02, 0.), 4.)));
  col += moonC * 2.4 * moon * (1. - .75 * veil);
  col += moonC * .25 * exp(-length(rd - md) * 6.) * (.4 + .9 * uMoon);

  // ---- the ridge and the trees on it, the wolves on it before the moon
  float ry = ridgeY(q.x);
  float tc = floor(q.x / .025);
  float th = hash12(vec2(tc, 3.));
  float tx = (tc + .5) * .025 + (th - .5) * .012;
  float tH = (.04 + .09 * fract(th * 7.)) * step(.35, th);
  float treeD = max(abs(q.x - tx) - (.0025 + .004 * (1. - (q.y - ry) / max(tH, .001))), q.y - ry - tH);
  float ridge = min(q.y - ry, treeD);
  // the wolves
  float wolfD = 1e3;
  for (int i = 0; i < ${WOLVES}; i++) {
    vec4 W = uWolves[i];
    if (W.w <= 0. || W.z < 0. || W.z > W.w + 1.5) continue;
    float s = .085 * W.y;
    // rising from behind the ridge, howling, sinking back
    float up = smoothstep(0., .9, W.z) * (1. - smoothstep(W.w, W.w + 1.5, W.z));
    float k = smoothstep(.6, 1.6, W.z) * (1. - smoothstep(W.w - .8, W.w, W.z));
    vec2 wp = (q - vec2(W.x, ridgeY(W.x) - s * (1. - up) * 1.1)) / s;
    wp.x *= sign(.3 - W.x) < 0. ? -1. : 1.;
    wolfD = min(wolfD, wolf(wp, k) * s);
  }
  ridge = min(ridge, wolfD);
  float ridgeA = 1. - smoothstep(-px, px, ridge);
  vec3 ridgeC = mix(uBase * .5, moonC * .02, .5);
  // a rim of moonlight on the wolves' and trees' edges near the moon
  float rim = exp(-max(ridge, 0.) / (px * 1.5)) * (1. - ridgeA) * .6 * exp(-length(rd - md) * 3.);
  col = mix(col, ridgeC, ridgeA) + moonC * rim * .5;

  // ---- the slope below: misty forest in layers (dead trees, sparse, leaning, a branch or two), nearer and darker
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float base = ry - .05 - fl * .085 + .03 * vnoise(vec3(q.x * 3. + fl * 4., fl, 1.));
    float sc = .075 + fl * .055;
    float c = floor((q.x + fl * 1.7) / sc);
    float h = hash12(vec2(c, fl * 9.));
    float h2 = fract(h * 7.31), h3 = fract(h * 3.17);
    float layer = q.y - base;
    if (h < .55) {
      float x0 = (c + .5) * sc - fl * 1.7 + (h2 - .5) * sc * .5;
      float yy = q.y - base;
      float lean = (h3 - .5) * .25;
      float xT = x0 + lean * yy;
      float tH = (.22 + .25 * h2) * (1. + fl * .4);
      float w = (.003 + .005 * fl) * (.6 + .8 * h3) * (1. - .6 * clamp(yy / tH, 0., 1.)) * (1. + 1.2 * exp(-yy * 40.));
      float tr = max(abs(q.x - xT) - w, max(-yy, yy - tH));
      // a branch or two, reaching up and out
      for (int b = 0; b < 2; b++) {
        float fb = float(b);
        float hb = tH * (.45 + .25 * fb + .1 * h);
        vec2 s0 = vec2(x0 + lean * hb, base + hb);
        float side = fract(h * (5. + fb * 3.)) < .5 ? -1. : 1.;
        vec2 s1 = s0 + vec2(side * (.04 + .04 * h2) * (1. + fl * .4), (.05 + .04 * h3) * (1. + fl * .4));
        tr = min(tr, sdSeg(q, s0, s1, w * .5));
      }
      layer = min(layer, tr);
    }
    float a = 1. - smoothstep(-px, px, layer);
    vec3 lc = mix(moonC * (.13 - fl * .04), uBase * .3, .3) * (1. + .5 * uMoon);
    col = mix(col, lc, a);
    // mist between the layers, drifting
    float mist = smoothstep(.0, .1, base + .05 - q.y) * (.5 + .5 * vnoise(vec3(q.x * 3. + uTime * .03 * (fl + 1.), q.y * 6., fl)));
    col += moonC * .03 * mist * (1. + .6 * uMoon);
  }

  // ---- eyes in the dark under the trees (before the den's arch covers the sides)
  for (int i = 0; i < ${EYES}; i++) {
    vec4 E = uEyes[i];
    if (E.w <= 0. || E.z > E.w || abs(E.x) > .5) continue;
    float o = smoothstep(0., 1.5, E.z) * (1. - smoothstep(E.w - 1.5, E.w, E.z));
    float blink = smoothstep(.0, .12, abs(fract(E.z * .23 + float(i) * .37) - .5) * 2. - .05);
    float s = .006;
    for (int k = 0; k < 2; k++) {
      vec2 ep = (q - E.xy - vec2((float(k) - .5) * s * 3.2, 0.)) / vec2(s, s * .55 * blink + 1e-4);
      col += eyeC * exp(-dot(ep, ep) * 1.5) * o * 1.2;
    }
  }

  // ---- the den's mouth: an arch of earth round the frame, roots hanging across its top
  vec2 a = (uv - vec2(0., -.04)) / vec2(.78 * uRes.x / uRes.y * .5 + .1, .44);
  float ang = atan(a.y, a.x);
  // a ragged edge: lumps of earth, stones, tufts of grass along the bottom
  float edge = 1. + .14 * vnoise(vec3(cos(ang) * 2., sin(ang) * 2., 3.)) + .06 * vnoise(vec3(cos(ang) * 7., sin(ang) * 7., 5.)) + .025 * vnoise(vec3(cos(ang) * 25., sin(ang) * 25., 7.)) - .14 * smoothstep(-.2, -.9, a.y);
  edge -= .05 * smoothstep(-.3, -.8, a.y) * pow(max(sin(ang * 60.) * .5 + .5, 0.), 6.);
  // (negative in the earth: outside the opening)
  float archD = (edge - length(a)) * .4;
  for (int r = 0; r < 9; r++) {
    float fr = float(r);
    float h = hash12(vec2(fr, 7.7));
    float x0 = -.55 + fr * .14 + (h - .5) * .08;
    float len = .08 + .22 * fract(h * 5.);
    float top = .42 - .06 * abs(x0);
    float yy = clamp(uv.y, top - len, top);
    float sway = .012 * sin(uTime * .4 + fr) * (top - yy) / len;
    float xr = x0 + .02 * sin((top - yy) * 30. + h * 9.) * (top - yy) / len + sway;
    float rw = .009 * (1. - .75 * (top - yy) / len);
    archD = min(archD, length(vec2(uv.x - xr, uv.y - yy)) - rw);
    // a rootlet off it
    vec2 r0 = vec2(x0, top - len * .45);
    archD = min(archD, sdSeg(uv, r0, r0 + vec2((h - .5) * .08, -len * .3), .003));
  }
  float archA = 1. - smoothstep(-px, px * 1.5, archD);
  // the earth: dark, a faint texture, its edge catching the moon
  float tex = vnoise(vec3(uv * 18., 1.)) * .6 + vnoise(vec3(uv * 60., 2.)) * .4;
  vec3 earth = vec3(.012, .01, .008) * (.6 + .8 * tex);
  float lip = exp(-max(-archD, 0.) / .01) * archA;
  earth += moonC * .05 * lip * (.6 + .4 * tex) * (1. + uMoon);
  // the den's own dark: eyes in it too
  for (int i = 0; i < ${EYES}; i++) {
    vec4 E = uEyes[i];
    if (E.w <= 0. || E.z > E.w || abs(E.x) <= .5) continue;
    float o = smoothstep(0., 1.5, E.z) * (1. - smoothstep(E.w - 1.5, E.w, E.z));
    float blink = smoothstep(.0, .12, abs(fract(E.z * .19 + float(i) * .41) - .5) * 2. - .05);
    float s = .011;
    for (int k = 0; k < 2; k++) {
      vec2 ep = (uv - E.xy - vec2((float(k) - .5) * s * 3.2, 0.)) / vec2(s, s * .5 * blink + 1e-4);
      earth += eyeC * exp(-dot(ep, ep) * 1.5) * o * 1.5;
    }
  }
  col = mix(col, earth, archA);

  // ---- breath steaming at the mouth, low in the frame, lit by the moon
  float br = uBreath;
  vec2 bq = uv - vec2(.08, -.42 + br * .05);
  float puff = exp(-dot(bq, bq) / (.02 + br * .03)) * smoothstep(0., .4, br) * exp(-br * .8);
  puff *= .6 + .4 * vnoise(vec3(uv * 9. + vec2(0., -br * .3), br * .5));
  col += moonC * .08 * puff;

  // the drop: a wash of the moon's light
  col += moonC * .04 * uMoon * (uSafe > .5 ? .5 : 1.);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
