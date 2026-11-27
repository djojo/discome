import * as THREE from "three";

/**
 * The cloud noise: a tileable 3D texture the volumetric clouds of Olympe sample instead of computing noise at every
 * step (sky.glsl.ts, cloudsO). Cooked once on the graphics card, a few layers per frame (like the oven of the heads),
 * the first time a scene asks for it: nothing to download, N³ RGBA8 on the card.
 * - R: Perlin-Worley, the rounded billows of cumulus;
 * - G, B, A: Worley fbm at three frequencies (4, 8, 16), to carve and fray them.
 * Every scene that draws clouds shares the same two uniforms (CLOUD_UNIFORMS): they switch to the texture once it is
 * done, and until then uCloudReady stays 0 (the scenes draw their old, cheap sea of clouds).
 */
const N = 96;
const LAYERS_PER_STEP = 8;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform float uLayer;
uniform float uN;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
/** Worley, periodic over the unit cube: 1 on a feature point, falling away from it. */
float worley(vec3 p, float freq) {
  vec3 q = p * freq;
  vec3 id = floor(q), f = fract(q);
  float d = 1e9;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = o + hash33(mod(id + o, freq)) - f;
        d = min(d, dot(r, r));
      }
  return 1. - sqrt(d);
}
/** Gradient noise, periodic over the unit cube, 0..1. */
float gnoise(vec3 p, float freq) {
  vec3 q = p * freq;
  vec3 i = floor(q), f = fract(q);
  vec3 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float n[8];
  for (int k = 0; k < 8; k++) {
    vec3 c = vec3(float(k & 1), float((k >> 1) & 1), float(k >> 2));
    vec3 g = hash33(mod(i + c, freq)) * 2. - 1.;
    n[k] = dot(g, f - c);
  }
  float x0 = mix(n[0], n[1], u.x), x1 = mix(n[2], n[3], u.x), x2 = mix(n[4], n[5], u.x), x3 = mix(n[6], n[7], u.x);
  return mix(mix(x0, x1, u.y), mix(x2, x3, u.y), u.z) * .9 + .5;
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uLayer + .5) / uN;
  float pf = 0., amp = .5, fr = 4.;
  for (int i = 0; i < 5; i++) { pf += gnoise(p, fr) * amp; fr *= 2.; amp *= .5; }
  pf /= .96875;
  float w4 = worley(p, 4.), w8 = worley(p, 8.), w16 = worley(p, 16.), w32 = worley(p, 32.);
  float wf = w4 * .625 + w8 * .25 + w16 * .125;
  float pw = clamp(remap(pf, wf - 1., 1., 0., 1.), 0., 1.);
  gl_FragColor = vec4(pw, wf, w8 * .625 + w16 * .25 + w32 * .125, w16 * .625 + w32 * .375);
}
`;

let renderer: THREE.WebGLRenderer | null = null;
let rt: THREE.WebGL3DRenderTarget | null = null;
let material: THREE.ShaderMaterial | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.Camera | null = null;
let layer = 0;
let wanted = false;

const placeholder = new THREE.Data3DTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, 1);
placeholder.needsUpdate = true;

/** The uniforms every scene with clouds shares (the same objects: switching the texture once switches them all). */
export const CLOUD_UNIFORMS = {
  uCloudTex: { value: placeholder as THREE.Texture },
  uCloudReady: { value: 0 },
};

/** Hand the cook the renderer (the compositor's). */
export function bindCloudNoise(r: THREE.WebGLRenderer) {
  renderer = r;
}

/** A scene wants clouds: the noise starts cooking (once). */
export function wantCloudNoise() {
  wanted = true;
  return CLOUD_UNIFORMS;
}

/** Write a few layers of the noise, while it cooks (the compositor calls it before drawing each frame). */
export function cloudNoiseStep() {
  const r = renderer;
  if (!r || !wanted || CLOUD_UNIFORMS.uCloudReady.value === 1) return;
  if (!rt) {
    rt = new THREE.WebGL3DRenderTarget(N, N, N, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    const t = rt.texture;
    t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
    material = new THREE.ShaderMaterial({
      uniforms: { uLayer: { value: 0 }, uN: { value: N } },
      vertexShader: "void main() { gl_Position = vec4(position.xy, 0., 1.); }",
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    camera = new THREE.Camera();
  }
  const prev = r.getRenderTarget();
  const prevFace = r.getActiveCubeFace();
  const prevLevel = r.getActiveMipmapLevel();
  const autoClear = r.autoClear;
  r.autoClear = false;
  for (let k = 0; k < LAYERS_PER_STEP && layer < N; k++, layer++) {
    material!.uniforms.uLayer.value = layer;
    material!.uniformsNeedUpdate = true;
    r.setRenderTarget(rt, layer);
    r.render(scene!, camera!);
  }
  r.setRenderTarget(prev, prevFace, prevLevel);
  r.autoClear = autoClear;
  if (layer >= N) {
    CLOUD_UNIFORMS.uCloudTex.value = rt.texture;
    CLOUD_UNIFORMS.uCloudReady.value = 1;
    material!.dispose();
  }
}
