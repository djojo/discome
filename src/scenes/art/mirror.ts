import * as THREE from "three";
import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { CAMERA_GLSL, type Framing } from "./camera";
import { MYCELIUM_GLSL } from "./mycelium.glsl";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DROPS = 4;
const NT = 9;

// Low and level, over the water itself: the dead forest above, the living one below, the line of the water across the middle
const FRAMINGS: Framing[] = [
  { az: 0, el: 0.02, dist: 8, target: [0, 1.2, -12], focal: 1.3, weight: 3 },
  { az: 0.25, el: 0.005, dist: 6, target: [1, 0.6, -12], focal: 1.6, weight: 2 },
  { az: -0.5, el: 0.04, dist: 8, target: [-3, 2.2, -13], focal: 1.5, weight: 2 },
  // from above the water, looking down into the other side
  { az: 0.1, el: 0.62, dist: 9, target: [0, 0, -9], focal: 1.4, weight: 1, tag: "open" },
];

/**
 * Le Miroir (« De l'autre côté »): a still pond in a dead forest, grey and frosted under a pale moon; its reflection
 * shows the same forest alive: leaves, flowers on the banks, glowing mushrooms on the trunks, fireflies, warm colours.
 * Framed low and level, the water's line across the middle. Each kick drops a drop that troubles both worlds at once;
 * on the drop the surface breaks into waves and, through the hold, the reflection's colour spills over into the real
 * forest, climbing the trunks from the water, then the water calms and it ebbs.
 */
export const mirror = defineShaderScene({
  id: "myc-mirror",
  name: "Le Miroir",
  energy: "intense",
  hdr: true,
  mask: true,
  renderScale: 0.65,
  camera: { framings: FRAMINGS, glideBars: 3 },
  description:
    "« De l'autre côté » : un étang immobile dans une forêt morte, grise et givrée ; son reflet montre la même forêt vivante, fleurie, lumineuse. Au kick une goutte trouble les deux mondes ; au drop la surface se brise et la couleur du reflet déborde dans la vraie forêt.",
  params: [paletteParam("boismort")],
  uniforms: () => ({
    uDrops: { value: Array.from({ length: DROPS }, () => new THREE.Vector4(0, 0, 99, 0)) },
    uDropI: { value: 0 },
    uBurst: { value: 99 },
    uSpill: { value: 0 },
    uSafe: { value: 0 },
    uLast: { value: -99 },
  }),
  update(u, f, _p, dt, ctx) {
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    if (f.time - (u.uLast.value as number) > 1.5) {
      u.uBurst.value = 99;
      u.uSpill.value = 0;
    }
    u.uLast.value = f.time;
    u.uSafe.value = f.safeFlash ? 1 : 0;
    const drops = u.uDrops.value as THREE.Vector4[];
    for (const d of drops) d.z += dt;
    if (f.beat) {
      const i = (u.uDropI.value as number) % DROPS;
      u.uDropI.value = i + 1;
      drops[i].set(-5 + Math.random() * 10, -15 + Math.random() * 9, 0, 1);
    }
    if (f.drop) {
      u.uBurst.value = 0;
      ctx.camera?.request("open");
    } else u.uBurst.value = Math.min(99, (u.uBurst.value as number) + dt);
    const burst = u.uBurst.value as number;
    // the living colour spills over through the hold, then ebbs
    u.uSpill.value = burst < 99 ? smooth(0.2, bar * 2, burst) * (1 - smooth(bar * 6, bar * 11, burst)) : 0;
  },
  fragment: /* glsl */ `
uniform vec4 uDrops[${DROPS}];
uniform float uBurst;
uniform float uSpill;   // the living colour spilling into the real forest (the drop's hold)
uniform float uSafe;
${ART_LIB}
${CAMERA_GLSL}
${MYCELIUM_GLSL}
const vec2 POND = vec2(0., -10.);
float gAlive;            // 0 the real forest (dead), 1 the one in the water (alive)
float gMat;              // 0 ground, 1 bark, 2 leaves
float gTree;
vec3 gMd;

float pondR(float a) { return 8.5 + 1.3 * sin(a * 3. + 1.) + .7 * sin(a * 5. + 2.); }
float groundH(vec2 xz) {
  vec2 c = xz - POND;
  float r = length(c);
  float R = pondR(atan(c.y, c.x));
  return -.35 + .65 * smoothstep(R - .8, R + 2.5, r) + .25 * vnoise(vec3(xz * .3, 1.)) * smoothstep(R, R + 3., r);
}

/** Tree i round the pond: its base (x, z), height, and a random number. */
vec4 treeAt(int i) {
  float fi = float(i);
  float a = fi / ${NT}. * 6.2832 + .35 * sin(fi * 2.3) + fract(uSeed * .13) * .6;
  float h = fract(sin(fi * 12.9898 + floor(uSeed)) * 43758.5453);
  float r = pondR(a) + 2.2 + 5. * h;
  return vec4(POND.x + cos(a) * r, POND.y + sin(a) * r, 6. + 5. * fract(h * 7.3), h);
}

/** A tree, dead or alive (its leaves: alive only). */
float tree(vec3 p, vec4 t, float alive, out float mat) {
  mat = 1.;
  // (rooted below the bank: its foot is lost in the ground)
  vec3 l = p - vec3(t.x, -.3, t.y);
  float H = t.z;
  vec2 ax = vec2(.25 * sin(l.y * .4 + t.w * 9.), .2 * cos(l.y * .33 + t.w * 5.)) * smoothstep(0., 3., l.y);
  float r = (.32 + .12 * t.w) * (1. - .75 * smoothstep(0., H, l.y)) * (1. + .6 * exp(-l.y * 2.));
  float d = max(length(l.xz - ax) - r, l.y - H);
  d *= .85;
  if (length(l.xz) < 4.5 && l.y > H * .3) {
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float hb = H * (.38 + .15 * fk);
      float az = t.w * 6.28 + fk * 2.3;
      vec3 dir = normalize(vec3(cos(az), .7 + .3 * fract(t.w * 3. + fk * .4), sin(az)));
      float L = (1.6 + .8 * fract(t.w * 5. + fk * .3)) * (1. - .12 * fk);
      vec3 s0 = vec3(.25 * sin(hb * .4 + t.w * 9.), hb, .2 * cos(hb * .33 + t.w * 5.));
      vec3 s1 = s0 + dir * L;
      d = min(d, sdTaper(l, s0, s1, r * .5 + .05, .02));
      d = min(d, sdTaper(l, s1, s1 + normalize(dir + vec3(.4 * sin(fk), .6, .4 * cos(fk))) * L * .5, .03, .008));
      // alive: a loose cloud of leaves round the branch's end (three clumps, ragged)
      if (alive > .01) {
        vec3 lc = s1 + dir * L * .1 + vec3(0., .25, 0.);
        float lv = sdEllipsoid(l - lc, vec3(.9, .65, .9) * alive);
        lv = smin(lv, sdEllipsoid(l - lc - vec3(.6 * cos(az + 1.), .2, .6 * sin(az + 1.)) * alive, vec3(.6, .45, .6) * alive), .3);
        lv = smin(lv, sdEllipsoid(l - lc - vec3(.5 * cos(az - 1.4), -.15, .5 * sin(az - 1.4)) * alive, vec3(.55, .4, .55) * alive), .3);
        lv += .4 * alive * (vnoise(l * 3.3) - .5) + .15 * alive * (vnoise(l * 9.) - .5);
        lv *= .7;
        if (lv < d) { d = lv; mat = 2.; }
      }
    }
  }
  return d;
}

/** The trees (the banks are a height field, met on their own: rays grazing them would crawl). */
float map(vec3 p) {
  float d = 1e3;
  gMat = 1.;
  for (int i = 0; i < ${NT}; i++) {
    vec4 t = treeAt(i);
    vec2 q = p.xz - t.xy;
    float bb = length(q) - 4.2;
    if (bb > d) continue;
    // the real forest wakes where the spill has climbed (from the water up the trunk)
    float alive = gAlive > .5 ? 1. : uSpill * smoothstep(t.z * uSpill + .5, t.z * uSpill - 1., p.y);
    float m;
    float tr = tree(p, t, alive, m);
    if (tr < d) { d = tr; gMat = m; gTree = float(i); }
  }
  return d;
}

vec3 nrm(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

/** Where the ray meets the banks (a gentle height field): from a plane, a few corrections. */
float groundT(vec3 ro, vec3 rd) {
  if (rd.y > -1e-3) return 1e5;
  float t = (ro.y - .2) / -rd.y;
  for (int i = 0; i < 6; i++) {
    vec3 x = ro + rd * t;
    t += (x.y - groundH(x.xz)) / -rd.y * .7;
  }
  return t;
}
vec3 groundN(vec2 xz) {
  float e = .05;
  return normalize(vec3(groundH(xz - vec2(e, 0.)) - groundH(xz + vec2(e, 0.)), 2. * e, groundH(xz - vec2(0., e)) - groundH(xz + vec2(0., e))));
}

float march(vec3 ro, vec3 rd, float tmax, float pa) {
  float t = .02;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < max(.001, t * pa * .7)) return t;
    t += d * .85;
    if (t > tmax) break;
  }
  return -1.;
}

/** The sky: cold and pale above the dead forest; in the water, a deep night with a warm moon and many stars. */
vec3 skyOf(vec3 rd, float alive, float pa) {
  vec3 moonC = mix(uInk, vec3(.85, .9, 1.), .5);
  vec3 cold = mycSky(rd, gMd, moonC, pa) * 1.6 + moonC * .05 * exp(-max(rd.y, 0.) * 4.) + moonC * 2. * mycMoon(rd, gMd, .05, pa);
  vec3 warmC = mix(vec3(1., .72, .45), uTint, .25);
  // the other side's night: amber at the horizon, violet above, many stars, a warm moon
  float up = max(rd.y, 0.);
  vec3 warm = mix(vec3(.16, .07, .04), vec3(.025, .015, .05), smoothstep(0., .5, up)) + uTint * .02 * exp(-up * 4.);
  warm += mycSky(rd, gMd, warmC, pa) * 2.5 + warmC * 2.5 * mycMoon(rd, gMd, .05, pa);
  return mix(cold, warm, alive);
}

/** What a ray meets in the world on this side (alive 0) or the other (alive 1). */
vec3 world(vec3 ro, vec3 rd, float alive, float pa, out float tHit) {
  gAlive = alive;
  float tG = groundT(ro, rd);
  float t = march(ro, rd, min(tG, 70.), pa);
  bool bank = t < 0. && tG < 70.;
  if (bank) t = tG;
  tHit = t > 0. ? t : 70.;
  vec3 col;
  vec3 moonC = mix(uInk, vec3(.85, .9, 1.), .5);
  vec3 warmC = mix(vec3(1., .72, .45), uTint, .25);
  vec3 glowC = uTint * uTint * 1.3;
  if (t > 0.) {
    vec3 p = ro + rd * t;
    float mat = 0.;
    vec3 n;
    if (bank) n = groundN(p.xz);
    else {
      map(p);
      mat = gMat;
      n = nrm(p, max(.002, t * pa));
    }
    float fw = t * pa / max(abs(dot(n, rd)), .15);
    // how alive this point is: the other side wholly; this side where the spill has reached
    float al = alive > .5 ? 1. : uSpill * smoothstep(9. * uSpill + .5, 9. * uSpill - 1.5, p.y + length(p.xz - POND) * .3);
    vec3 lightC = mix(moonC, warmC, al);
    float dif = max(dot(n, gMd), 0.);
    vec3 alb;
    vec3 emit = vec3(0.);
    if (mat < .5) {
      // the bank: frosted, pale (dead); moss, grass and flowers (alive)
      float fr = vnoise(vec3(p.xz * 4., 2.)) * .5 + vnoise(vec3(p.xz * 13., 5.)) * .5;
      vec3 dead = vec3(.16, .16, .17) * (.7 + .5 * fr);
      vec3 live = mix(vec3(.03, .06, .02), vec3(.06, .1, .03), fr);
      alb = mix(dead, live, al);
      // flowers on the living bank
      if (al > .01) {
        vec2 g = floor(p.xz * 3.);
        float hs = hash12(g + 4.4);
        if (hs > .7) {
          vec2 lc = fract(p.xz * 3.) - .5;
          float r = max(.12, fw * 3. * .8);
          emit += pal(fract(hs * 3.7)) * (.0144 / (r * r)) * exp(-dot(lc, lc) / (r * r)) * 1.2 * al;
        }
      }
      // frost glints (dead)
      emit += moonC * smoothstep(.85, .95, vnoise(vec3(p.xz * 40., 9.))) * .25 * (1. - al) * dif;
    } else if (mat < 1.5) {
      // bark: grey and frosted (dead), brown with glowing mushrooms (alive)
      float bk = vnoise(vec3(p.xz * 6., p.y * 1.5));
      alb = mix(vec3(.22, .22, .24) * (.7 + .5 * bk), vec3(.07, .045, .03) * (.7 + .5 * bk), al);
      vec2 g = floor(vec2(atan(n.z, n.x) * 3., p.y * 3.));
      float hs = hash12(g + gTree * 7.1);
      if (hs > .9 && p.y < 4.) emit += glowC * 1.2 * al * (.6 + .6 * uHat);
    } else {
      // leaves: green, the warm light through them, and blossoms of light in the palette's colours
      float lf = vnoise(p * 6.);
      alb = mix(vec3(.03, .07, .02), vec3(.08, .13, .03), lf);
      emit += warmC * (.05 + .35 * pow(max(dot(rd, gMd), 0.), 2.)) * lf;
      vec3 gq = p * 4.;
      vec3 gi = floor(gq);
      float hs = hash13(gi + 3.3);
      if (hs > .45) {
        vec3 lc = gq - gi - .5;
        float r = max(.16, fw * 4. * .8);
        vec3 bc = pal(fract(hs * 5.1 + .3));
        emit += mix(bc, bc * bc * 1.5, .5) * (.0256 / (r * r)) * exp(-dot(lc, lc) / (r * r)) * 2.5 * (.8 + .4 * uHat);
      }
    }
    col = alb * (lightC * (1.6 * dif + .25)) + emit;
  } else {
    col = skyOf(rd, alive, pa);
  }
  // mist: cold on this side, warm and gold on the other
  float fo = mycFog(ro, rd, tHit, .03, .5);
  col = mix(col, mix(moonC * .06, warmC * .07 + glowC * .02, alive), fo);
  // fireflies on the other side
  if (alive > .5) col += mycMotes(ro, rd, tHit, 1.6, .2, .02, pa, .01, warmC, glowC, .8) * 3.;
  return col;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  gMd = normalize(vec3(-.15 + .3 * fract(uSeed * .31), .22, -1.));
  vec3 ro = uCamPos;
  vec3 rd = lookAt(ro, uCamTarget) * normalize(vec3(uv, uFocal));
  float pa = 1. / (uRes.y * uFocal);

  // the water: a plane at 0 inside the pond (the bank rises out of it)
  float tW = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tA;
  vec3 col;
  bool water = false;
  if (tW < 1e4) {
    vec3 pw = ro + rd * tW;
    // the water where the bank is under it, and the bank not met first
    water = groundH(pw.xz) < 0. && groundT(ro, rd) > tW - .05;
  }
  if (water) {
    // does a tree of this side stand between us and the water?
    gAlive = 0.;
    float t = march(ro, rd, tW, pa);
    water = t < 0.;
  }
  if (water) {
    vec3 p = ro + rd * tW;
    // the drops' rings, and on the drop the whole surface breaking into waves, calming through the hold
    vec2 g = vec2(0.);
    for (int i = 0; i < ${DROPS}; i++) {
      vec4 D = uDrops[i];
      if (D.w < .5 || D.z > 4.) continue;
      vec2 dv = p.xz - D.xy;
      float r = length(dv);
      float x = r - D.z * 1.3;
      g += dv / max(r, 1e-3) * cos(x * 22.) * exp(-x * x * 5.) * exp(-D.z * 1.2) * .12;
    }
    if (uBurst < 14.) {
      float br = exp(-uBurst * .35) * (uSafe > .5 ? .5 : 1.);
      vec2 dv = p.xz - POND;
      float r = length(dv);
      float x = r - uBurst * 5.;
      g += dv / max(r, 1e-3) * cos(x * 3.) * br * .3 * smoothstep(1., -2., x);
      g += vec2(sin(p.x * 2.1 + uTime * 3.), cos(p.z * 1.7 - uTime * 2.6)) * br * .08;
    }
    vec3 n = normalize(vec3(-g.x, 1., -g.y));
    vec3 rr = reflect(rd, n);
    // the other side: the same forest, alive
    float t2;
    vec3 refl = world(p + n * .01, rr, 1., pa, t2);
    float F = .05 + .95 * pow(1. - max(dot(-rd, n), 0.), 5.);
    col = refl * mix(.7, 1., F) + uInk * .005;
    tA = tW;
  } else {
    col = world(ro, rd, 0., pa, tA);
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
