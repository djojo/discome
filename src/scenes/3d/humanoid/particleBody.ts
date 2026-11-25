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
varying float vNear;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, uSize * uScale * (0.6 + aSeed) * (1.0 + uBeat * 0.4) / -mv.z);
  vT = position.y * 0.35 + aSeed * 0.25;
  vSeed = aSeed;
  // the near side of the body brighter than its far side: the volume reads
  vNear = smoothstep(3.3, 2.3, -mv.z);
}
`;

const POINTS_FRAG = /* glsl */ `
uniform float uTime;
varying float vT;
varying float vSeed;
varying float vNear;
${PALETTE_GLSL}
void main() {
  // a crisp dot, not a blur: thousands of them add up, so each one stays faint
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.25, 0.5, d);
  vec3 c = pal(vT + uTime * 0.06);
  gl_FragColor = vec4(c * a * (0.3 + vSeed * 0.3) * (0.3 + 0.7 * vNear), 1.0);
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

interface SurfaceSample {
  /** The vertices of each particle's triangle (3 per particle). */
  tri: Uint32Array;
  /** Its barycentric weights (3 per particle). */
  bary: Float32Array;
  /** Every vertex used, to pose once per frame. */
  used: Uint32Array;
}

/**
 * Points drawn evenly over the body's surface: a triangle in proportion to its area, a random point inside it. The
 * head (hair cards stacked on it) counts for less, or it burns into a white ball.
 */
function sampleSurface(mesh: THREE.SkinnedMesh, n: number): SurfaceSample {
  const geo = mesh.geometry;
  const p = geo.attributes.position;
  const idx = geo.index;
  const tris = idx ? idx.count / 3 : p.count / 3;
  const vert = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  // the head's bones: a vertex mostly bound to one of them belongs to the head
  const headBones = new Set<number>();
  mesh.skeleton.bones.forEach((b, i) => {
    if (/head/i.test(b.name)) headBones.add(i);
  });
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const onHead = (i: number) => {
    if (!si || !sw) return false;
    let best = 0;
    let bone = -1;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w > best) {
        best = w;
        bone = si.getComponent(i, k);
      }
    }
    return headBones.has(bone);
  };
  const cdf = new Float64Array(tris);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let sum = 0;
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(p, vert(t, 0));
    b.fromBufferAttribute(p, vert(t, 1));
    c.fromBufferAttribute(p, vert(t, 2));
    const area = b.sub(a).cross(c.sub(a)).length();
    cdf[t] = sum += area * (onHead(vert(t, 0)) ? 0.3 : 1);
  }
  const tri = new Uint32Array(n * 3);
  const bary = new Float32Array(n * 3);
  const used = new Set<number>();
  for (let k = 0; k < n; k++) {
    const r = Math.random() * sum;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    for (let j = 0; j < 3; j++) {
      tri[k * 3 + j] = vert(lo, j);
      used.add(vert(lo, j));
    }
    bary.set([1 - u - v, u, v], k * 3);
  }
  return { tri, bary, used: Uint32Array.from(used) };
}

/**
 * The dancer as a cloud of fine particles spread evenly over her body: the near side brighter than the far side so
 * the body reads in volume. She explodes on the drop and reforms; in the breakdowns (and now and then elsewhere) she
 * morphs into an abstract shape for half a phrase.
 */
export const particleBody: SceneGLDef = {
  id: "particle-body",
  name: "Corps de particules",
  tag: "3D",
  kind: "webgl",
  energy: "intense",
  description:
    "La danseuse en nuage de particules fines : explose au drop, se reforme ; se transforme parfois en formes abstraites, surtout dans les breaks.",
  params: [
    paletteParam("acid"),
    { type: "range", key: "count", label: "Particules", min: 2000, max: MAX, step: 500, default: 10000 },
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
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 0.5 },
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
    let surface: SurfaceSample | null = null;
    let posed: Float32Array | null = null;
    let disposed = false;
    createDancer()
      .then((d) => {
        if (disposed) return d.dispose();
        dancer = d;
        surface = sampleSurface(d.mesh, MAX);
        posed = new Float32Array(d.mesh.geometry.attributes.position.count * 3);
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
        uniforms.uScale.value = target.height * 0.0075; // point size in pixels, relative to the image height

        // Pose the hidden dancer and read its skinned vertices
        if (dancer && surface && posed) {
          danceTime += dt * danceRate(f.bpm, 1);
          dancer.setTime(danceTime);
          dancer.root.updateMatrixWorld(true);
          dancer.mesh.skeleton.update();
          const m = dancer.mesh.matrixWorld;
          // pose every vertex in use once, then place each particle inside its triangle
          for (const i of surface.used) {
            dancer.mesh.getVertexPosition(i, v).applyMatrix4(m);
            posed[i * 3] = v.x;
            posed[i * 3 + 1] = v.y;
            posed[i * 3 + 2] = v.z;
          }
          const { tri, bary } = surface;
          for (let i = 0; i < n; i++) {
            const j = i * 3;
            const a = tri[j] * 3;
            const b = tri[j + 1] * 3;
            const c = tri[j + 2] * 3;
            for (let k = 0; k < 3; k++) bodyTarget[j + k] = posed[a + k] * bary[j] + posed[b + k] * bary[j + 1] + posed[c + k] * bary[j + 2];
          }
        }

        // Shape: fixed, or the body, morphing into an abstract shape for half a phrase in the breakdowns (now and then
        // elsewhere)
        const mode = String(p.shape ?? "auto");
        if (mode === "auto") {
          if (f.downbeat && f.phraseBar === 0 && Math.random() < (f.section === "breakdown" ? 0.7 : 0.12)) {
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
        const shimmer = f.treble * 0.012;
        for (let i = 0; i < n; i++) {
          const j = i * 3;
          for (let c = 0; c < 3; c++) {
            const t = bodyTarget[j + c] * (1 - morph) + altT[j + c] * morph;
            vel[j + c] = (vel[j + c] + (t - pos[j + c]) * k * dt) * damp;
            pos[j + c] += vel[j + c] * dt + (Math.random() - 0.5) * shimmer;
          }
        }
        posAttr.needsUpdate = true;

        orbit += dt * (0.25 + f.mid * 0.4);
        const radius = 2.95 - f.beatPulse * 0.12;
        camera.position.set(Math.sin(orbit) * radius, 1.1 + Math.sin(orbit * 0.5) * 0.35, Math.cos(orbit) * radius);
        camera.lookAt(0, 0.98, 0);

        fx.bloom.strength = num(p.bloom, 0.5) * (0.7 + f.beatPulse * 0.5);
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
