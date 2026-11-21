import * as THREE from "three";
import type { SceneGLDef } from "../../types";
import { applyPalette, PALETTE_GLSL, paletteParam, paletteUniforms } from "../../palettes";
import { num } from "../../utils";
import { createBloomComposer } from "../postfx";
import { createDancer, danceRate, type Dancer } from "./dancerAsset";

const MAX = 12000;

const POINTS_VERT = /* glsl */ `
attribute float aSeed;
uniform float uSize;
uniform float uScale;
uniform float uBeat;
varying float vT;
varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uScale * (0.6 + aSeed) * (1.0 + uBeat * 0.6) / -mv.z;
  vT = position.y * 0.35 + aSeed * 0.25;
  vSeed = aSeed;
}
`;

const POINTS_FRAG = /* glsl */ `
uniform float uTime;
varying float vT;
varying float vSeed;
${PALETTE_GLSL}
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  vec3 c = pal(vT + uTime * 0.06);
  gl_FragColor = vec4(c * a * a * (0.6 + vSeed * 0.6), 1.0);
}
`;

type Shape = "body" | "sphere" | "spiral" | "ring";
type AltShape = Exclude<Shape, "body">;
const ALT_SHAPES: AltShape[] = ["sphere", "spiral", "ring"];

/** Target positions for the abstract shapes the body can morph into. */
function shapeTargets(shape: Shape, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    let x = 0;
    let y = 0;
    let z = 0;
    if (shape === "sphere") {
      const phi = Math.acos(1 - 2 * u);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      x = Math.sin(phi) * Math.cos(theta) * 0.85;
      y = 1 + Math.cos(phi) * 0.85;
      z = Math.sin(phi) * Math.sin(theta) * 0.85;
    } else if (shape === "spiral") {
      const a = u * Math.PI * 2 * 7;
      const r = 0.25 + 0.55 * u;
      x = Math.cos(a) * r;
      y = 0.1 + u * 1.8;
      z = Math.sin(a) * r;
    } else {
      const a = u * Math.PI * 2 * 40;
      const tube = (i % 17) / 17;
      x = Math.cos(a) * (1.1 + Math.cos(tube * Math.PI * 2) * 0.12);
      y = 1 + Math.sin(tube * Math.PI * 2) * 0.12;
      z = Math.sin(a) * (1.1 + Math.cos(tube * Math.PI * 2) * 0.12);
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

/** The dancer as a cloud of particles: explodes on the drop, reforms, morphs into abstract shapes. */
export const particleBody: SceneGLDef = {
  id: "particle-body",
  name: "Corps de particules",
  tag: "3D",
  kind: "webgl",
  energy: "intense",
  description: "La danseuse en nuage de particules : explose au drop, se reforme, se transforme en formes abstraites.",
  params: [
    paletteParam("acid"),
    { type: "range", key: "count", label: "Particules", min: 2000, max: MAX, step: 500, default: 7000 },
    { type: "range", key: "size", label: "Taille", min: 0.3, max: 3, step: 0.05, default: 1 },
    {
      type: "select",
      key: "shape",
      label: "Forme",
      options: [
        { value: "auto", label: "Auto (morph par phrase)" },
        { value: "body", label: "Corps" },
        { value: "sphere", label: "Sphère" },
        { value: "spiral", label: "Spirale" },
        { value: "ring", label: "Anneau" },
      ],
      default: "auto",
    },
    { type: "toggle", key: "explode", label: "Explosion au drop", default: true },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 1.2 },
  ],
  create({ renderer, viewport, target }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.05, 100);

    const pos = new Float32Array(MAX * 3);
    const vel = new Float32Array(MAX * 3);
    const seeds = new Float32Array(MAX);
    const bodyTarget = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) {
      seeds[i] = Math.random();
      pos.set([(Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4], i * 3);
    }
    const shapes: Record<AltShape, Float32Array> = {
      sphere: shapeTargets("sphere", MAX),
      spiral: shapeTargets("spiral", MAX),
      ring: shapeTargets("ring", MAX),
    };
    bodyTarget.set(shapes.sphere); // until the model is ready

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const uniforms = {
      uSize: { value: 1 },
      uScale: { value: 1 },
      uBeat: { value: 0 },
      uTime: { value: 0 },
      ...paletteUniforms(),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    // The invisible dancer drives the body shape (vertices sampled on the CPU each frame)
    let dancer: Dancer | null = null;
    let indices: Uint32Array | null = null;
    let disposed = false;
    createDancer()
      .then((d) => {
        if (disposed) return d.dispose();
        dancer = d;
        const vcount = d.mesh.geometry.attributes.position.count;
        indices = new Uint32Array(MAX);
        for (let i = 0; i < MAX; i++) indices[i] = Math.floor(Math.random() * vcount);
      })
      .catch((e) => console.warn("Corps de particules : modèle indisponible, forme abstraite", e));

    const fx = createBloomComposer(renderer, scene, camera, viewport, target);
    const v = new THREE.Vector3();
    let danceTime = 0;
    let orbit = 0;
    let alt: AltShape = "sphere";
    let morph = 0;
    let morphTarget = 0;
    let morphUntil = 0;

    return {
      output: fx.output,
      resize(vp) {
        camera.aspect = vp.width / vp.height;
        camera.updateProjectionMatrix();
        fx.resize(vp);
      },
      render(f, p, dt) {
        const n = Math.min(MAX, Math.round(num(p.count, 7000)));
        geo.setDrawRange(0, n);
        applyPalette(uniforms, p.palette);
        uniforms.uTime.value = f.time;
        uniforms.uBeat.value = f.beatPulse;
        uniforms.uSize.value = num(p.size, 1);
        uniforms.uScale.value = target.height * 0.014; // point size in pixels, relative to the image height

        // Pose the hidden dancer and read its skinned vertices
        if (dancer && indices) {
          danceTime += dt * danceRate(f.bpm, 1);
          dancer.setTime(danceTime);
          dancer.root.updateMatrixWorld(true);
          dancer.mesh.skeleton.update();
          const m = dancer.mesh.matrixWorld;
          for (let i = 0; i < n; i++) {
            dancer.mesh.getVertexPosition(indices[i], v).applyMatrix4(m);
            bodyTarget[i * 3] = v.x;
            bodyTarget[i * 3 + 1] = v.y;
            bodyTarget[i * 3 + 2] = v.z;
          }
        }

        // Shape: fixed, or a morph to an abstract shape for half a phrase now and then
        const mode = String(p.shape ?? "auto");
        if (mode === "auto") {
          if (f.downbeat && f.phraseBar === 0 && Math.random() < 0.5) {
            alt = ALT_SHAPES[Math.floor(Math.random() * ALT_SHAPES.length)];
            morphUntil = f.time + (f.bpm > 0 ? (240 / f.bpm) * 4 : 8);
          }
          morphTarget = f.time < morphUntil ? 1 : 0;
        } else if (mode === "body") {
          morphTarget = 0;
        } else {
          alt = mode as AltShape;
          morphTarget = 1;
        }
        morph += (morphTarget - morph) * (1 - Math.exp(-dt * 2.5));
        const altT = shapes[alt];

        // Drop: blast every particle outward
        if (f.drop && p.explode !== false) {
          for (let i = 0; i < n; i++) {
            const k = i * 3;
            const dx = pos[k];
            const dy = pos[k + 1] - 1;
            const dz = pos[k + 2];
            const len = Math.hypot(dx, dy, dz) || 1;
            const force = 4 + Math.random() * 6;
            vel[k] += (dx / len) * force;
            vel[k + 1] += (dy / len) * force;
            vel[k + 2] += (dz / len) * force;
          }
        }

        // Springs toward the target, damping, a shimmer on the highs
        const k = 26;
        const damp = Math.exp(-dt * 5);
        const jitter = f.treble * 0.02;
        for (let i = 0; i < n; i++) {
          const j = i * 3;
          for (let c = 0; c < 3; c++) {
            const t = bodyTarget[j + c] * (1 - morph) + altT[j + c] * morph;
            vel[j + c] = (vel[j + c] + (t - pos[j + c]) * k * dt) * damp;
            pos[j + c] += vel[j + c] * dt + (Math.random() - 0.5) * jitter;
          }
        }
        posAttr.needsUpdate = true;

        orbit += dt * (0.25 + f.mid * 0.4);
        const radius = 3.4 - f.beatPulse * 0.15;
        camera.position.set(Math.sin(orbit) * radius, 1.2 + Math.sin(orbit * 0.5) * 0.4, Math.cos(orbit) * radius);
        camera.lookAt(0, 0.95, 0);

        fx.bloom.strength = num(p.bloom, 1.2) * (0.7 + f.beatPulse * 0.5);
        fx.composer.render(dt);
      },
      dispose() {
        disposed = true;
        dancer?.dispose();
        fx.dispose();
        geo.dispose();
        mat.dispose();
      },
    };
  },
};
