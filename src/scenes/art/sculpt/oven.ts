import * as THREE from "three";
import { ART_LIB } from "../lib.glsl";
import type { HeadGrid } from "../heads";
import { SCULPT_GLSL } from "./sculpt.glsl";
import { RECIPES, recipeUniforms } from "./cast";

/**
 * The oven: the heads sculpted in code (sculpt.glsl.ts, set by cast.ts) are cooked on the graphics card into the same
 * signed distance grid as the baked busts (scripts/bake-heads.mjs): same box, same voxel, cut flat at the bottom the
 * same way, so every scene draws them at the cost of any bust and every head effect works with them. Evaluated live,
 * a field of hundreds of operations would be far too slow in the scenes that sample it thousands of times a pixel.
 *
 * One shader, compiled once (in the background where the browser can); a head is a set of its uniforms. A grid is
 * written a few layers per frame (ovenStep, called by the compositor before it draws), so that no frame stalls.
 */

/** The box and voxel of the baked heads (assets/heads.config.json). */
const BOX_MIN = new THREE.Vector3(-0.8, -0.95, -0.88);
const BOX_MAX = new THREE.Vector3(0.8, 1, 0.88);
const VOXEL = 0.0125;
/** Layers of a grid written per frame (a layer is ~20 000 texels). */
const LAYERS_PER_STEP = 12;

interface Job {
  id: string;
  /** The bust a headdress is laid on (cast.ts: worn), its grid; null: a head of its own. */
  base: HeadGrid | null;
  min: THREE.Vector3;
  size: THREE.Vector3;
  n: [number, number, number];
  layer: number;
  rt: THREE.WebGL3DRenderTarget | null;
  resolve: (g: HeadGrid | null) => void;
}

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec3 uMin;
uniform vec3 uCell;
uniform float uLayer;
uniform float uCut;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
${ART_LIB}
${SCULPT_GLSL}
void main() {
  // the centre of texel (i, j, k): min + (i + .5, j + .5, k + .5) * cell, as in the baked files
  vec3 p = uMin + vec3(gl_FragCoord.xy, uLayer + .5) * uCell;
  // cut flat at the bottom of the box, like the baked busts: the scenes add the column below
  gl_FragColor = vec4(max(sculpt(p), uCut - p.y), 0., 0., 1.);
}
`;

let renderer: THREE.WebGLRenderer | null = null;
let material: THREE.ShaderMaterial | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.Camera | null = null;
let state: "idle" | "compiling" | "ready" | "failed" = "idle";
/** Bound in place of a bust when there is none (a sampler must always have a texture). */
let noBase: THREE.Data3DTexture | null = null;
const queue: Job[] = [];

/** Hand the oven the renderer (the compositor's): the heads asked for so far start cooking. */
export function bindOven(r: THREE.WebGLRenderer) {
  renderer = r;
}

/** Build the shader and compile it in the background, once. */
function start(r: THREE.WebGLRenderer) {
  if (state !== "idle") return;
  const ext = r.extensions;
  if (!ext.has("EXT_color_buffer_float") && !ext.has("EXT_color_buffer_half_float")) {
    console.warn("[têtes] pas de cible de rendu flottante : les têtes sculptées en code ne peuvent pas cuire");
    state = "failed";
    return;
  }
  material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uMin: { value: new THREE.Vector3() },
      uCell: { value: new THREE.Vector3() },
      uLayer: { value: 0 },
      uCut: { value: -10 },
      uBaseOn: { value: 0 },
      uBaseTex: { value: null },
      uBaseMin: { value: new THREE.Vector3() },
      uBaseSize: { value: new THREE.Vector3(1, 1, 1) },
      ...recipeUniforms(),
    },
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0., 1.); }",
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  noBase = new THREE.Data3DTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(1)]), 1, 1, 1);
  noBase.format = THREE.RedFormat;
  noBase.type = THREE.HalfFloatType;
  noBase.needsUpdate = true;
  material.uniforms.uBaseTex.value = noBase;
  scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  camera = new THREE.Camera();
  state = "compiling";
  r.compileAsync(scene, camera)
    .then(() => (state = "ready"))
    .catch((e) => {
      console.warn("[têtes] le four ne compile pas", e);
      state = "failed";
    });
}

/**
 * Cook a head sculpted in code (an id of cast.ts): its grid, once written. A headdress laid on a bust (recipe.base)
 * waits for that bust's grid, asked of loadBase.
 */
export async function cook(id: string, loadBase: (id: string) => Promise<HeadGrid | null>): Promise<HeadGrid | null> {
  const recipe = RECIPES[id];
  if (!recipe) return null;
  const base = recipe.base ? await loadBase(recipe.base) : null;
  if (recipe.base && !base) return null;
  return new Promise((resolve) => {
    const min = BOX_MIN.clone();
    const max = BOX_MAX.clone();
    // a crown, antlers, a headdress: a taller box (the same voxel)
    if (recipe.top) max.y = recipe.top;
    const size = max.clone().sub(min);
    const n = [size.x, size.y, size.z].map((s) => 2 * Math.round(s / VOXEL / 2)) as [number, number, number];
    queue.push({ id, base, min, size, n, layer: 0, rt: null, resolve });
  });
}

/** Write a few layers of the head being cooked (the compositor calls it before drawing each frame). */
export function ovenStep() {
  const r = renderer;
  if (!r || !queue.length) return;
  start(r);
  if (state === "failed") {
    while (queue.length) queue.shift()!.resolve(null);
    return;
  }
  if (state !== "ready" || !material) return;
  const job = queue[0];
  const [nx, ny, nz] = job.n;
  if (!job.rt) {
    job.rt = new THREE.WebGL3DRenderTarget(nx, ny, nz, {
      format: THREE.RedFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    const t = job.rt.texture;
    t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  }
  const u = material.uniforms;
  const cell = new THREE.Vector3(job.size.x / nx, job.size.y / ny, job.size.z / nz);
  (u.uMin.value as THREE.Vector3).copy(job.min);
  (u.uCell.value as THREE.Vector3).copy(cell);
  u.uCut.value = job.min.y + 1.5 * cell.y;
  u.uBaseOn.value = job.base ? 1 : 0;
  u.uBaseTex.value = job.base?.tex ?? noBase;
  if (job.base) {
    (u.uBaseMin.value as THREE.Vector3).copy(job.base.min);
    (u.uBaseSize.value as THREE.Vector3).copy(job.base.size);
  }
  RECIPES[job.id].apply(u);
  const prev = r.getRenderTarget();
  const prevFace = r.getActiveCubeFace();
  const prevLevel = r.getActiveMipmapLevel();
  const autoClear = r.autoClear;
  r.autoClear = false;
  for (let k = 0; k < LAYERS_PER_STEP && job.layer < nz; k++, job.layer++) {
    u.uLayer.value = job.layer;
    // the same material drawn again: its uniforms are only sent again when asked
    material.uniformsNeedUpdate = true;
    r.setRenderTarget(job.rt, job.layer);
    r.render(scene!, camera!);
  }
  r.setRenderTarget(prev, prevFace, prevLevel);
  r.autoClear = autoClear;
  if (job.layer >= nz) {
    queue.shift();
    const rt = job.rt;
    job.resolve({ tex: rt.texture, min: job.min, size: job.size, dispose: () => rt.dispose() });
  }
}
