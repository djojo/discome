import * as THREE from "three";
import type { SceneGLDef } from "../types";
import { applyPalette, getPalette, PALETTE_GLSL, paletteParam, paletteUniforms } from "../palettes";
import { num } from "../utils";
import { Cadrage, type Framing } from "../art/camera";
import { createBloomComposer } from "./postfx";

const STARS = 200000;
const FAR = 4000;
const BULGE = 9000;
const GAS = 1800;
const DUST = 2400;
const BURST = 300;
const SALVOS = 12;

/** Framings round the galaxy (its centre at the origin, its disc in the xz plane, 1.3 units in radius). */
const FRAMINGS: Framing[] = [
  { az: 0.3, el: 0.55, dist: 3.3, target: [0, 0, 0], focal: 1.6, weight: 3 },
  { az: -0.8, el: 1.2, dist: 3.5, target: [0, 0, 0], focal: 1.7, weight: 2 },
  { az: 1.4, el: 0.13, dist: 3, target: [0, 0, 0], focal: 1.7, weight: 2 },
  // close, gliding over an arm
  { az: 2.2, el: 0.38, dist: 1.3, target: [0.5, 0, 0.22], focal: 1.5, weight: 2 },
  { az: -2.0, el: 0.75, dist: 2.4, target: [0, 0, 0], focal: 1.6, weight: 2 },
  // the drop: face on, to see the ring cross the disc
  { az: 0.2, el: 1.05, dist: 3.9, target: [0, 0, 0], focal: 1.7, weight: 3, tag: "drop" },
  { az: -1, el: 0.85, dist: 3.8, target: [0, 0, 0], focal: 1.7, weight: 2, tag: "drop" },
];

/**
 * Orbits in the density-wave model: each star runs along an ellipse whose orientation turns with its radius, and
 * where the ellipses crowd two spiral arms appear. The arms keep their shape while the stars flow through them
 * (faster near the centre); the arm pattern itself turns slowly as a whole.
 */
const ORBIT_GLSL = /* glsl */ `
uniform float uTime;
uniform float uRot;      // the stars' own clock along their orbits
uniform float uPattern;  // the arms' slow turn
uniform float uTwist;    // how far the orbits turn from the centre to the rim
uniform float uPx;       // pixels per world unit at distance 1
uniform float uScreen;   // the image's height over 1080
uniform float uShock;    // seconds since the drop
uniform float uShockOn;  // 0 until a drop
uniform float uHat;
const float RG = 1.3;
/** A star on orbit a (0 centre, 1 rim), at phase t, height h (in disc thicknesses). */
vec3 orbit(float a, float t, float h) {
  float ecc = mix(.95, .6, smoothstep(.04, .3, a));
  float tilt = a * uTwist + uPattern;
  vec2 e = vec2(cos(t), sin(t) * ecc) * a;
  float c = cos(tilt), s = sin(tilt);
  float thick = .018 + .12 * exp(-a * a * 40.);
  return vec3(c * e.x - s * e.y, h * thick, s * e.x + c * e.y) * RG;
}
float angSpeed(float a) { return 1. / (.12 + a); }
/** The drop's ring of light running out through the disc. */
float shockAt(float a) {
  return uShockOn * exp(-pow((a - uShock * .36) / .05, 2.)) * exp(-uShock * .3);
}
float hash1(float n) { return fract(sin(n) * 43758.5453); }
/** A star stays a pinpoint at any distance (a little larger close up): its size in pixels at 1080p. */
float starSize(float px, float depth, inout float lum) {
  px *= uScreen * clamp(2.2 / depth, .75, 1.35);
  lum *= min(1., px * px / 4.);
  return max(px, 2.);
}
/** A cloud's size follows the perspective; under two pixels it keeps its light, not its size. */
float spriteSize(float worldSize, float depth, inout float lum) {
  float px = worldSize * uPx / depth;
  lum *= min(1., px * px / 4.);
  return clamp(px, 2., 320.);
}
`;

const STAR_VERT = /* glsl */ `
attribute vec4 aOrbit;   // a, phase, height, seed (a far star: its position, seed)
attribute float aKind;   // 0 the disc, 1 the bulge, 2 far away, 3 the arms' young stars
varying vec3 vCol;
varying float vLum;
${PALETTE_GLSL}
${ORBIT_GLSL}
void main() {
  float a = aOrbit.x, seed = aOrbit.w;
  vec3 pos;
  float sh = 0.;
  if (aKind > 1.5 && aKind < 2.5) pos = aOrbit.xyz;
  else {
    // the young stars ride the arms (like the gas); the others flow along their orbits, through the arms
    pos = orbit(a, aOrbit.y + (aKind > 2.5 ? 0. : uRot * angSpeed(a)), aOrbit.z);
    // (a shift along the phase runs along the arm: the arm's width comes from a shift in radius)
    if (aKind > 2.5) pos.xz *= 1. + (hash1(seed * 13.1) - .5) * .16;
    sh = shockAt(a);
    pos.y += sh * .05;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.);
  gl_Position = projectionMatrix * mv;
  // most stars faint, a few giants; the hats make some twinkle
  // (each one faint: thousands of them add up toward the centre)
  float giant = pow(hash1(seed * 91.7), 18.);
  float size = 1.7 + 3.2 * giant;
  float lum = .27 + 1.8 * giant;
  lum *= 1. + 2.5 * step(.994, hash1(seed * 31.3 + floor(uTime * 9.))) * uHat;
  lum += 2.6 * sh;
  // a warm centre, cooler arms
  vec3 c = mix(pal(.05 + .1 * seed), pal(.45 + .35 * seed), smoothstep(.05, .5, a));
  c = mix(c, vec3(1.), .3 * giant);
  if (aKind > .5 && aKind < 1.5) { c = mix(uInk, pal(.1), .4); lum *= .18; }
  // young stars: bluer, brighter, in the arms
  if (aKind > 2.5) { c = mix(uAccent, vec3(1.), .35 + .4 * seed); lum = .25 + 1.6 * pow(seed, 6.); size = 1.8 + 1.8 * pow(seed, 6.); }
  if (aKind > 1.5 && aKind < 2.5) {
    size = 1.4 + 2.5 * giant;
    lum = .2 + .9 * giant;
    c = mix(vec3(.85), pal(seed), .3);
  }
  gl_PointSize = starSize(size, -mv.z, lum);
  vCol = c;
  vLum = lum;
}
`;

/** A star: a crisp round core and a faint halo. */
const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vLum;
void main() {
  float d = length(gl_PointCoord - .5) * 2.;
  float a = (1. - smoothstep(.3, .55, d)) + exp(-d * d * 6.) * .15;
  a *= 1. - smoothstep(.85, 1., d);
  gl_FragColor = vec4(vCol * vLum * a, 1.);
}
`;

const CLOUD_VERT = /* glsl */ `
attribute vec4 aOrbit;   // a, phase (on an arm), height, seed
uniform float uDust;     // 1 for the dust lanes
uniform float uGlow;
varying vec3 vCol;
varying float vLum;
varying float vSeed;
${PALETTE_GLSL}
${ORBIT_GLSL}
void main() {
  float a = aOrbit.x;
  float knot = step(1., aOrbit.w), seed = fract(aOrbit.w);
  // the clouds ride the arms: they turn with the pattern, not along the orbits
  vec3 pos = orbit(a, aOrbit.y, aOrbit.z);
  // (a shift along the phase runs along the arm: the arm's width comes from a shift in radius)
  pos.xz *= 1. + (hash1(seed * 13.1 + knot) - .5) * (uDust > .5 ? .05 : mix(.2, .04, knot));
  vec4 mv = modelViewMatrix * vec4(pos, 1.);
  gl_Position = projectionMatrix * mv;
  float lum = uDust > .5 ? .45 : mix(.052, .2, knot) * uGlow * (1. + 10. * shockAt(a));
  float size = (uDust > .5 ? .04 + .06 * seed : mix(.12 + .2 * seed, .03 + .05 * seed, knot)) * mix(.6, 1., smoothstep(.1, .5, a));
  gl_PointSize = spriteSize(size, -mv.z, lum);
  // the knots each their own colour across the palette, some nearly white-hot
  vCol = knot > .5 ? mix(pal(seed), vec3(1.), .25 * step(.8, seed)) : mix(pal(.3 + .45 * seed), uAccent, .25 * step(.7, seed));
  vLum = lum;
  vSeed = seed;
}
`;

/** A cloud: a soft blob broken into wisps (the dust's darkening uses the same shape). */
const CLOUD_FRAG = /* glsl */ `
uniform float uDust;
varying vec3 vCol;
varying float vLum;
varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - .5;
  float d = length(q) * 2.;
  float w = .6 + .4 * sin(q.x * 9. + vSeed * 40.) * sin(q.y * 7. - vSeed * 25.);
  float a = exp(-d * d * 3.5) * w * (1. - smoothstep(.8, 1., d)) * vLum;
  gl_FragColor = vec4(uDust > .5 ? vec3(a) : vCol * a, 1.);
}
`;

const BURST_VERT = /* glsl */ `
attribute vec4 aOrbit;   // speed, phase (on an arm), height, seed
attribute float aBirth;
varying vec3 vCol;
varying float vLum;
${PALETTE_GLSL}
${ORBIT_GLSL}
void main() {
  float age = uTime - aBirth;
  if (age < 0. || age > 7.) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; return; }
  // born at the centre, running out along an arm
  float a = min(1.05, .02 + age * aOrbit.x);
  vec4 mv = modelViewMatrix * vec4(orbit(a, aOrbit.y, aOrbit.z), 1.);
  gl_Position = projectionMatrix * mv;
  float lum = 3.5 * exp(-age * .5) * smoothstep(0., .08, age);
  gl_PointSize = starSize(2.6 + 2.4 * aOrbit.w, -mv.z, lum);
  vCol = mix(uAccent, vec3(1.), .35);
  vLum = lum;
}
`;

const CORE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2. - 1.;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const CORE_FRAG = /* glsl */ `
uniform float uCore;
varying vec2 vUv;
${PALETTE_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  vec3 c = mix(uInk, vec3(1.), .45) * exp(-r2 * 9.) * uCore + pal(.1) * exp(-r2 * 3.) * .3 * uCore;
  gl_FragColor = vec4(c * (1. - smoothstep(.8, 1., r2)), 1.);
}
`;

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random());
/**
 * A phase on one of the two arms' crests (where the ellipses crowd), a little spread, the arms broadening outward;
 * now and then on a spur branching off an arm.
 */
const onArm = (spread: number, a = 0.5) => {
  const spur = Math.random() < 0.18 ? (Math.random() < 0.5 ? -1 : 1) * (0.35 + 0.25 * Math.random()) * a : 0;
  return (Math.random() < 0.5 ? 0 : Math.PI) + spur + gauss() * spread * (0.6 + 0.8 * a);
};

function starAttributes() {
  const orbit = new Float32Array(STARS * 4);
  const kind = new Float32Array(STARS);
  for (let i = 0; i < STARS; i++) {
    const seed = Math.random();
    if (i < FAR) {
      // far away, all round
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 10;
      const s = Math.sqrt(1 - u * u);
      orbit.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r, seed], i * 4);
      kind[i] = 2;
    } else if (i < FAR + BULGE) {
      orbit.set([Math.min(0.2, Math.abs(gauss()) * 0.07 + 0.005), Math.random() * Math.PI * 2, gauss() * 1.2, seed], i * 4);
      kind[i] = 1;
    } else if (Math.random() < 0.22) {
      // young stars strung along the arms
      const a = 0.08 + 0.9 * Math.random();
      orbit.set([a, onArm(0.22, a), gauss() * 0.6, seed], i * 4);
      kind[i] = 3;
    } else {
      // the disc, thin
      const a = 0.03 + 0.97 * Math.pow(Math.random(), 0.85);
      orbit.set([a, Math.random() * Math.PI * 2, gauss(), seed], i * 4);
    }
  }
  return { orbit, kind };
}

/**
 * The gas in knots strung along the arms (a few hundred clouds round each knot's centre, a faint band between them);
 * the dust in long lanes on the arms' inner edge, cutting into the gas.
 */
function cloudAttributes(n: number, dust: boolean) {
  const orbit = new Float32Array(n * 4);
  let knotA = 0;
  let knotT = 0;
  let knotSeed = 0;
  for (let i = 0; i < n; i++) {
    if (dust) {
      const a = 0.1 + 0.85 * Math.random();
      orbit.set([a * 0.985, onArm(0.04, a) + 0.24, gauss() * 0.35, Math.random()], i * 4);
      continue;
    }
    if (i % 8 === 0) {
      knotA = 0.12 + 0.83 * Math.random();
      knotT = onArm(0.1, knotA);
      knotSeed = Math.random();
    }
    // half the gas spread thin along the arm, the rest in bright knots (their seed says so: above 1)
    if (i % 2 === 1) {
      const a = 0.1 + 0.85 * Math.random();
      orbit.set([a, onArm(0.38, a), gauss() * 0.7, Math.random()], i * 4);
    } else orbit.set([knotA + gauss() * 0.01, knotT + gauss() * 0.03, gauss() * 0.4, 1 + ((knotSeed + Math.random() * 0.15) % 1)], i * 4);
  }
  return orbit;
}

function burstAttributes() {
  const orbit = new Float32Array(BURST * SALVOS * 4);
  const birth = new Float32Array(BURST * SALVOS).fill(-99);
  // each salvo runs out as one packet along an arm (close speeds, close phases)
  for (let i = 0; i < BURST * SALVOS; i++) {
    const arm = Math.floor(i / (BURST / 2)) % 2 ? Math.PI : 0;
    orbit.set([0.26 + Math.random() * 0.1, arm + gauss() * 0.07, gauss() * 0.8, Math.random()], i * 4);
  }
  return { orbit, birth };
}

/**
 * The nebula: a spiral galaxy in 3D, its stars crisp round points. Two arms of stars, clouds of glowing gas and dark
 * dust lanes along them, a warm bulge. On the kick a salvo of new stars springs from the core and runs out along the
 * arms; the hats make stars twinkle; the build speeds the galaxy up and brings the camera close; on the drop the core
 * flares and a ring of light runs out through the disc.
 */
export const galaxy: SceneGLDef = {
  id: "nebula",
  name: "Nébuleuse",
  tag: "3D",
  kind: "webgl",
  energy: "calm",
  description:
    "Une galaxie spirale en 3D aux étoiles nettes, bras de gaz et bandes de poussière ; au kick, une salve d'étoiles jaillit du cœur le long des bras ; au drop, le cœur s'embrase et un anneau de lumière traverse le disque.",
  params: [
    paletteParam("sunset"),
    { type: "range", key: "count", label: "Étoiles", min: 40000, max: STARS, step: 10000, default: 140000 },
    { type: "range", key: "twist", label: "Enroulement des bras", min: 0.4, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "speed", label: "Vitesse", min: 0.2, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 2, step: 0.05, default: 0.45 },
  ],
  create({ renderer, viewport, target }) {
    const scene = new THREE.Scene();
    const bg = new THREE.Color();
    scene.background = bg;
    const camera = new THREE.PerspectiveCamera(35, viewport.width / viewport.height, 0.05, 200);

    const shared = {
      uTime: { value: 0 },
      uRot: { value: Math.random() * 100 },
      uPattern: { value: Math.random() * Math.PI * 2 },
      uTwist: { value: 4.2 },
      uPx: { value: 1000 },
      uScreen: { value: 1 },
      uShock: { value: 99 },
      uShockOn: { value: 0 },
      uHat: { value: 0 },
      ...paletteUniforms(),
    };
    const additive = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending };
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    const points = (geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, order: number) => {
      geos.push(geo);
      mats.push(mat);
      const p = new THREE.Points(geo, mat);
      p.frustumCulled = false;
      p.renderOrder = order;
      scene.add(p);
      return p;
    };
    // every point's position is computed in its shader: the geometry only carries a dummy position
    const geometry = (n: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      return g;
    };

    // the gas, then the dust darkening it, then the stars on top
    const gasGeo = geometry(GAS);
    gasGeo.setAttribute("aOrbit", new THREE.BufferAttribute(cloudAttributes(GAS, false), 4));
    const gasU = { ...shared, uDust: { value: 0 }, uGlow: { value: 1 } };
    points(gasGeo, new THREE.ShaderMaterial({ uniforms: gasU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, ...additive }), 0);

    const dustGeo = geometry(DUST);
    dustGeo.setAttribute("aOrbit", new THREE.BufferAttribute(cloudAttributes(DUST, true), 4));
    points(
      dustGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uDust: { value: 1 }, uGlow: { value: 1 } },
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        // dst * (1 - src): darkens what is already there
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.OneMinusSrcColorFactor,
      }),
      1,
    );

    const starGeo = geometry(STARS);
    const stars = starAttributes();
    starGeo.setAttribute("aOrbit", new THREE.BufferAttribute(stars.orbit, 4));
    starGeo.setAttribute("aKind", new THREE.BufferAttribute(stars.kind, 1));
    points(starGeo, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, ...additive }), 2);

    const burstGeo = geometry(BURST * SALVOS);
    const burst = burstAttributes();
    burstGeo.setAttribute("aOrbit", new THREE.BufferAttribute(burst.orbit, 4));
    const birthAttr = new THREE.BufferAttribute(burst.birth, 1);
    birthAttr.setUsage(THREE.DynamicDrawUsage);
    burstGeo.setAttribute("aBirth", birthAttr);
    points(burstGeo, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: BURST_VERT, fragmentShader: STAR_FRAG, ...additive }), 3);

    // the core's glow: a quad turned to the camera
    const coreU = { ...shared, uCore: { value: 0.6 } };
    const coreGeo = new THREE.PlaneGeometry(0.9, 0.9);
    const coreMat = new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, ...additive });
    geos.push(coreGeo);
    mats.push(coreMat);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.renderOrder = 4;
    scene.add(core);

    const fx = createBloomComposer(renderer, scene, camera, viewport, target);
    fx.bloom.threshold = 0.6;
    const cadrage = new Cadrage(FRAMINGS, 3);
    const look = new THREE.Vector3();
    let salvo = 0;
    let dropT = 99;
    let flash = 0;
    let lastSeen = -1e9;
    let shown = 0;

    return {
      output: fx.output,
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
        fx.resize(v);
      },
      render(f, p, dt) {
        applyPalette(shared, p.palette);
        const base = getPalette(p.palette).base;
        bg.setRGB(base[0] * 0.6, base[1] * 0.6, base[2] * 0.6);
        const bar = f.bpm > 0 ? 240 / f.bpm : 2;
        const build = f.section === "build" ? f.buildProgress : 0;
        // back on screen: a new framing, no glide
        if (f.time - lastSeen > 1.5) cadrage.reset(Math.random() * 100);
        lastSeen = f.time;

        // the galaxy's own pace, a little quicker through the build
        const speed = num(p.speed, 1);
        shared.uRot.value += dt * speed * (0.05 + 0.1 * build);
        shared.uPattern.value += dt * speed * (0.012 + 0.02 * build);
        shared.uTwist.value = 4.2 * num(p.twist, 1);
        shared.uTime.value = f.time;
        shared.uHat.value = f.onsetPulse;

        // the kick: a salvo of new stars from the core
        if (f.beat) {
          const k = salvo++ % SALVOS;
          burst.birth.fill(f.time, k * BURST, (k + 1) * BURST);
          birthAttr.clearUpdateRanges();
          birthAttr.addUpdateRange(k * BURST, BURST);
          birthAttr.needsUpdate = true;
        }
        // the drop: the core flares, a ring runs out through the disc
        if (f.drop) {
          dropT = 0;
          shared.uShockOn.value = 1;
          cadrage.request("drop");
        }
        dropT += dt;
        shared.uShock.value = dropT;
        const rise = f.safeFlash ? Math.min(1, dropT / 0.6) : 1;
        flash = dropT < 6 ? rise * Math.exp(-dropT * 0.9) : 0;
        coreU.uCore.value = 0.25 + 0.5 * build + 0.15 * f.beatPulse + (f.safeFlash ? 0.8 : 1.3) * flash;
        gasU.uGlow.value = 1 + 0.6 * build;

        // the camera: a framing per phrase; the build draws it in
        cadrage.allow = (fr) => fr.tag !== "drop" || dropT < bar * 4;
        cadrage.update(f, dt);
        look.set(cadrage.target.x, cadrage.target.y, cadrage.target.z);
        camera.position.copy(cadrage.pos).sub(look).multiplyScalar(1 - 0.25 * build).add(look);
        camera.lookAt(look);
        const fov = 2 * Math.atan(0.5 / cadrage.focal);
        if (Math.abs(camera.fov - THREE.MathUtils.radToDeg(fov)) > 0.01) {
          camera.fov = THREE.MathUtils.radToDeg(fov);
          camera.updateProjectionMatrix();
        }
        shared.uPx.value = target.height / (2 * Math.tan(fov / 2));
        shared.uScreen.value = target.height / 1080;
        core.quaternion.copy(camera.quaternion);

        // the stars drawn: the far ones and the bulge always, the disc as many as asked
        const n = Math.round(num(p.count, 140000));
        if (n !== shown) {
          shown = n;
          starGeo.setDrawRange(0, Math.min(STARS, Math.max(FAR + BULGE, n)));
        }

        fx.bloom.strength = num(p.bloom, 0.45) * (0.8 + 0.3 * f.beatPulse);
        fx.composer.render(dt);
      },
      dispose() {
        fx.dispose();
        geos.forEach((g) => g.dispose());
        mats.forEach((m) => m.dispose());
      },
    };
  },
};
