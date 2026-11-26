import * as THREE from "three";
import type { SceneGLDef } from "../types";
import { paletteParam } from "../palettes";
import { TONE_GLSL } from "@/engine/tone";
import { Cadrage, type Framing } from "./camera";

const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const hashF = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Racers at most. */
const RMAX = 8;
/** Points of wall a racer leaves at most (one every STEP metres), and how high the wall stands. */
const NMAX = 1100;
const STEP = 1.1;
const WALL = 1.25;
/** Drops of rain around the camera. */
const DROPS = 900;

/*
 * Framings round the pack (their target follows its centre): low among the walls, higher, from above; "top": straight
 * down on the weave (the Pose longue plan keeps to those).
 */
const FRAMINGS: Framing[] = [
  { az: 0.3, el: 0.05, dist: 38, target: [0, 1, 0], focal: 1.6, weight: 2 },
  { az: 2.2, el: 0.09, dist: 22, target: [12, 1, -8], focal: 1.9 },
  { az: -1.3, el: 0.3, dist: 110, target: [0, 0, 0], focal: 1.7 },
  { az: 0.9, el: 0.65, dist: 190, target: [0, 0, 0], focal: 1.6 },
  { az: 0, el: 1.42, dist: 260, target: [0, 0, 0], focal: 1.7, tag: "top" },
  { az: 1.6, el: 1.2, dist: 220, target: [0, 0, 0], focal: 1.6, tag: "top" },
];

/** Linear light out (the compositor grades it); tone-mapped here only when the GPU has no float targets. */
const OUT_GLSL = /* glsl */ `
${TONE_GLSL}
vec3 outC(vec3 c) {
#ifdef LDR_OUT
  return aces(c);
#else
  return clamp(c, 0., 64.);
#endif
}
`;

const RIBBON_VERT = /* glsl */ `
attribute float aAge;
attribute float aV;
varying float vAge;
varying float vV;
varying float vS;
void main() {
  vAge = aAge;
  vV = aV;
  vS = position.x * .13 + position.z * .17;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const RIBBON_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uKick;
uniform float uHat;
uniform float uTime;
uniform float uRefl;
varying float vAge;
varying float vV;
varying float vS;
${OUT_GLSL}
void main() {
  // a wall of light: its top edge burning, its body a glow fading down; older, dimmer; the head white-hot
  float edge = smoothstep(.86, .97, vV) * (1. - smoothstep(.985, 1., vV) * .4);
  float body = .1 + .32 * vV * vV;
  float fade = 1. - smoothstep(.55, 1., vAge);
  float head = exp(-vAge * 90.);
  float spark = step(.985, fract(sin(floor(vS * 3. + uTime * 9.) * 91.7) * 4371.3)) * uHat * 2.;
  vec3 c = uColor * (edge * (1.8 + 1.6 * uKick) + body * (1. + .6 * uKick) + spark) * fade + mix(uColor, vec3(1.), .6) * head * 3.;
  // the reflection in the black glass: dimmer, fading with depth
  c *= uRefl > 0. ? uRefl * (.35 + .65 * vV) : 1.;
  gl_FragColor = vec4(outC(c), 1.);
}
`;

const FLOOR_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uTime;
uniform vec3 uCam;
varying vec3 vP;
${OUT_GLSL}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  float dist = length(vP.xz - uCam.xz);
  vec3 c = vec3(.002, .0025, .004);
  // rain on the black glass: rings opening here and there (close by only: afar they would shimmer)
  vec2 g = floor(vP.xz / 1.6);
  vec2 o = fract(vP.xz / 1.6) - .5 - (vec2(h12(g), h12(g + 3.7)) - .5) * .5;
  float ph = fract(uTime * .9 + h12(g + 9.1));
  float ring = exp(-pow((length(o) - ph * .45) / .02, 2.)) * (1. - ph) * step(.55, h12(g + 1.3));
  c += mix(uTint, vec3(1.), .6) * ring * .12 * exp(-dist / 35.);
  // the horizon: the floor melts into the night's glow
  c = mix(c, uTint * .025, smoothstep(250., 2200., dist));
  gl_FragColor = vec4(outC(c), 1.);
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uDrift;
varying vec3 vD;
${OUT_GLSL}
void main() {
  vec3 d = normalize(vD);
  vec3 c = mix(vec3(.004, .006, .014), vec3(0., 0., .003), smoothstep(0., .5, d.y));
  vec3 glow = mix(uTint, vec3(1., .55, .25), .3) * (1. - .6 * uDrift);
  c += glow * (.06 * exp(-abs(d.y) * 14.) + .01 * exp(-abs(d.y) * 4.));
  gl_FragColor = vec4(outC(c), 1.);
}
`;

const FLAT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
${OUT_GLSL}
void main() { gl_FragColor = vec4(outC(uColor), 1.); }
`;

interface Racer {
  x: number;
  z: number;
  heading: number;
  phase: number;
  colour: THREE.Color;
  /** Distance since the last wall point. */
  since: number;
  count: number;
  pos: Float32Array;
  age: Float32Array;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  refl: THREE.ShaderMaterial;
  meshes: THREE.Object3D[];
  body: THREE.Mesh;
}

/**
 * Les Traînées: an endless plain of black glass under the rain, and racers of light that leave solid walls behind
 * them, coiling and crossing like a long exposure; the walls mirrored in the glass. They pulse with the kick and spark
 * with the hats; through the build the racers speed up and their loops tighten; on the drop they all break away in a
 * star. The walls stay: as the night drifts they grow longer and the plain fills up, the racers shut in by their own
 * light. « Pose longue »: straight down on the weave, growing slowly.
 */
export const trails: SceneGLDef = {
  id: "circuit-trails",
  name: "Les Traînées",
  tag: "3D",
  energy: "intense",
  kind: "webgl",
  hdr: true,
  mask: true,
  description:
    "Une plaine infinie de verre noir sous la pluie : des bolides de lumière laissent derrière eux des murs de lumière qui s'enroulent et se croisent comme une photo en pose longue, reflétés dans le verre. Au kick les murs pulsent ; pendant la montée les bolides accélèrent et leurs boucles se resserrent ; au drop ils s'écartent tous en étoile. « Pose longue » : vu de haut, le tissage grandit lentement.",
  params: [paletteParam("piste"), { type: "toggle", key: "top", label: "Pose longue (vu de haut)", default: false }],
  create({ renderer, viewport, target }) {
    const ldr = target.texture.type === THREE.UnsignedByteType;
    const defines = ldr ? { LDR_OUT: "" } : {};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0, 0, 0);
    const camera = new THREE.PerspectiveCamera(40, viewport.width / viewport.height, 0.1, 6000);
    const tint = new THREE.Vector3(0.25, 0.9, 1);
    const shared = { uKick: { value: 0 }, uHat: { value: 0 }, uTime: { value: 0 } };

    // the sky, the glass floor
    const skyGeo = new THREE.SphereGeometry(5000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint }, uDrift: { value: 0 } },
      vertexShader: "varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      defines,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -2;
    scene.add(sky);
    const floorGeo = new THREE.PlaneGeometry(8000, 8000);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: tint }, uTime: shared.uTime, uCam: { value: new THREE.Vector3() } },
      vertexShader: "varying vec3 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FLOOR_FRAG,
      depthWrite: false,
      defines,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.renderOrder = -1;
    scene.add(floor);

    // the racers and their walls (each wall drawn twice: itself, and mirrored in the glass)
    const index: number[] = [];
    for (let i = 0; i < NMAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const bodyGeo = new THREE.BufferGeometry();
    // a flat arrowhead, nose ahead (+x)
    bodyGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([1.3, 0.25, 0, -1, 0.35, 0.55, -1, 0.35, -0.55, -0.8, 0.6, 0, 1.3, 0.25, 0, -1, 0.35, -0.55, -1, 0.35, 0.55, -0.8, 0.6, 0]), 3),
    );
    bodyGeo.setIndex([0, 1, 3, 0, 3, 2, 1, 2, 3, 4, 5, 6]);
    const racers: Racer[] = [];
    for (let i = 0; i < RMAX; i++) {
      const pos = new Float32Array(NMAX * 2 * 3);
      const age = new Float32Array(NMAX * 2);
      const vv = new Float32Array(NMAX * 2);
      for (let k = 0; k < NMAX; k++) vv[k * 2 + 1] = 1;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("aAge", new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("aV", new THREE.BufferAttribute(vv, 1));
      geo.setIndex(index);
      geo.setDrawRange(0, 0);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const colour = new THREE.Color();
      const mk = (refl: number) =>
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Vector3() }, uRefl: { value: refl }, ...shared },
          vertexShader: RIBBON_VERT,
          fragmentShader: RIBBON_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          defines,
        });
      const mat = mk(0);
      const refl = mk(0.38);
      const wall = new THREE.Mesh(geo, mat);
      const mirror = new THREE.Mesh(geo, refl);
      mirror.scale.y = -1;
      wall.renderOrder = 2;
      mirror.renderOrder = 1;
      wall.frustumCulled = false;
      mirror.frustumCulled = false;
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Vector3(0.004, 0.005, 0.008) } }, vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }", fragmentShader: FLAT_FRAG, side: THREE.DoubleSide, defines }),
      );
      body.renderOrder = 3;
      scene.add(mirror, wall, body);
      racers.push({ x: 0, z: 0, heading: 0, phase: 0, colour, since: 0, count: 0, pos, age, geo, mat, refl, meshes: [wall, mirror, body], body });
    }

    // the rain round the camera
    const rainPos = new Float32Array(DROPS * 2 * 3);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    const rainCol = new THREE.Vector3();
    const rainMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: rainCol } },
      vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: FLAT_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      defines,
    });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 4;
    scene.add(rain);
    const drops = Array.from({ length: DROPS }, () => new THREE.Vector3(Math.random() * 80 - 40, Math.random() * 40, Math.random() * 80 - 40));

    const cad = new Cadrage(FRAMINGS, 3);
    const centre = new THREE.Vector3();
    const look = new THREE.Vector3();
    let last = -99;
    let kick = 0;
    let star = 99;
    let boost = 0;

    const reset = (seed: number) => {
      racers.forEach((r, i) => {
        const a = (i / RMAX) * Math.PI * 2 + hashF(seed + i) * 0.6;
        r.x = Math.cos(a) * (20 + 30 * hashF(seed + i * 2.1));
        r.z = Math.sin(a) * (20 + 30 * hashF(seed + i * 2.1));
        r.heading = a + Math.PI / 2;
        r.phase = hashF(seed + i * 3.7) * 100;
        r.count = 0;
        r.since = 0;
        r.geo.setDrawRange(0, 0);
      });
      cad.reset(seed);
      star = 99;
      boost = 0;
    };

    /** Push a new wall point at the racer's position (the head point always follows it). */
    const advance = (r: Racer, dist: number, nmax: number) => {
      r.since += dist;
      if (r.count === 0 || r.since >= STEP) {
        r.since = 0;
        r.pos.copyWithin(6, 0, (NMAX - 1) * 6);
        r.count = Math.min(nmax, r.count + 1);
      }
      r.pos[0] = r.x;
      r.pos[1] = 0;
      r.pos[2] = r.z;
      r.pos[3] = r.x;
      r.pos[4] = WALL;
      r.pos[5] = r.z;
      for (let k = 0; k < r.count; k++) {
        const a = k / Math.max(1, nmax - 1);
        r.age[k * 2] = a;
        r.age[k * 2 + 1] = a;
      }
      r.geo.setDrawRange(0, Math.max(0, r.count - 1) * 6);
      (r.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
    };

    return {
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
      },
      render(f, p, dt) {
        const bar = f.bpm > 0 ? (60 / f.bpm) * 4 : 2;
        if (f.time - last > 1.5) reset(Math.random() * 100);
        last = f.time;
        const top = p.top === true;
        if (f.tint) tint.set(f.tint[0], f.tint[1], f.tint[2]);
        shared.uTime.value = f.time;
        kick = f.beat ? 1 : kick * Math.exp(-dt * 6);
        shared.uKick.value = kick;
        shared.uHat.value = f.onsetPulse;
        skyMat.uniforms.uDrift.value = f.drift;
        // the walls grow longer as the night drifts: the plain fills up
        const nmax = Math.round(NMAX * (0.5 + 0.5 * f.drift));
        const count = Math.min(RMAX, Math.round(5 + 3 * f.drift));
        const build = f.section === "build" ? f.buildProgress : 0;
        if (f.drop) {
          star = 0;
          boost = 1;
        }
        star += dt;
        boost *= Math.exp(-dt / (bar * 1.2));
        const speed = (top ? 13 : 17) * (1 + 1.2 * build + 1.4 * boost) * (f.section === "breakdown" ? 0.5 : 1);

        // the pack: each racer steers its own curves, drawn back toward the middle; tighter through the build; on the
        // drop they all break away from the centre in a star, straight, for two bars
        let cx = 0;
        let cz = 0;
        let n = 0;
        for (const r of racers) {
          if (n < count) {
            cx += r.x;
            cz += r.z;
          }
          n++;
        }
        cx /= Math.max(1, count);
        cz /= Math.max(1, count);
        racers.forEach((r, i) => {
          const on = i < count;
          for (const m of r.meshes) m.visible = on;
          if (!on) return;
          const c = r.colour;
          c.setRGB(tint.x, tint.y, tint.z);
          if (i % 4 === 1) c.offsetHSL(0.5, 0, 0);
          else if (i % 4 === 2) c.lerp(new THREE.Color(1, 1, 1), 0.65);
          else if (i % 4 === 3) c.offsetHSL(0.25, 0, 0);
          (r.mat.uniforms.uColor.value as THREE.Vector3).set(c.r, c.g, c.b);
          (r.refl.uniforms.uColor.value as THREE.Vector3).set(c.r, c.g, c.b);
          r.phase += dt;
          let k = (Math.sin(r.phase * 0.35 + i) + 0.6 * Math.sin(r.phase * 0.83 + i * 2.3)) * 0.035 * (1 + 2.2 * build);
          const dx = -r.x;
          const dz = -r.z;
          const d = Math.hypot(dx, dz);
          k += wrap(Math.atan2(dz, dx) - r.heading) * 0.0009 * Math.max(0, d - 40);
          if (star < bar * 2) {
            if (star < dt * 1.5) r.heading = Math.atan2(r.z - cz, r.x - cx);
            k = 0;
          }
          r.heading += k * speed * dt;
          r.x += Math.cos(r.heading) * speed * dt;
          r.z += Math.sin(r.heading) * speed * dt;
          advance(r, speed * dt, nmax);
          r.body.position.set(r.x, 0, r.z);
          r.body.rotation.set(0, -r.heading, 0);
        });

        // the camera: a framing round the pack's centre (straight down in Pose longue)
        centre.set(approach(centre.x, cx, 0.5, dt), 0, approach(centre.z, cz, 0.5, dt));
        cad.allow = (fr) => (top ? fr.tag === "top" : fr.tag !== "top");
        cad.update(f, dt);
        camera.position.copy(cad.pos).add(centre);
        look.copy(cad.target).add(centre);
        camera.up.set(0, 1, 0);
        if (camera.position.y > 150 && Math.abs(camera.position.x - look.x) + Math.abs(camera.position.z - look.z) < 20) camera.up.set(0, 0, -1);
        camera.lookAt(look);
        camera.fov = (2 * Math.atan(0.5 / cad.focal) * 180) / Math.PI;
        camera.updateProjectionMatrix();
        (floorMat.uniforms.uCam.value as THREE.Vector3).copy(camera.position);
        sky.position.copy(camera.position);

        // the rain falls round the camera
        rainCol.set(tint.x, tint.y, tint.z).lerp(new THREE.Vector3(1, 1, 1), 0.6).multiplyScalar(0.12);
        for (let i = 0; i < DROPS; i++) {
          const dr = drops[i];
          dr.y -= dt * 28;
          if (dr.y < 0) {
            dr.y += 40;
            dr.x = Math.random() * 80 - 40;
            dr.z = Math.random() * 80 - 40;
          }
          const x = camera.position.x + dr.x;
          const z = camera.position.z + dr.z;
          const y = Math.max(0, camera.position.y - 20) + dr.y;
          rainPos.set([x, y, z, x, y + 0.6, z], i * 6);
        }
        (rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      },
      dispose() {
        skyGeo.dispose();
        skyMat.dispose();
        floorGeo.dispose();
        floorMat.dispose();
        bodyGeo.dispose();
        rainGeo.dispose();
        rainMat.dispose();
        for (const r of racers) {
          r.geo.dispose();
          r.mat.dispose();
          r.refl.dispose();
          (r.body.material as THREE.Material).dispose();
        }
      },
    };
  },
};
