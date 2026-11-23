import * as THREE from "three";
import { COMPOSITOR_VERT } from "./compositorShader";

/**
 * The bright parts of the scene on screen (and of the incoming one during a transition), above a soft threshold.
 * Nine bilinear taps spread over the destination pixel: a small highlight (a glint, a spark) is caught wherever it
 * falls, so the glow does not flicker as it moves.
 */
const PREFILTER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMixB;
uniform float uThreshold;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 src(vec2 uv) {
  vec3 a = texture2D(uA, uv).rgb;
  return uMixB > 0.001 ? mix(a, texture2D(uB, uv).rgb, uMixB) : a;
}
vec3 bright(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  // a steep knee: the highlights glow, a merely light surface (white porcelain, pale stone) hardly does
  float w = clamp((l - uThreshold) / (1.0 - uThreshold), 0.0, 1.0);
  return c * w * w * w;
}
void main() {
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) c += bright(src(vUv + vec2(float(x), float(y)) * uTexel * 0.66));
  gl_FragColor = vec4(c / 9.0, 1.0);
}
`;

/** Halving: five taps (dual filtering). */
const DOWN_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb * 4.0;
  c += texture2D(tMap, vUv - uTexel).rgb + texture2D(tMap, vUv + uTexel).rgb;
  c += texture2D(tMap, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tMap, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

/** Doubling: a tent of eight taps, added onto the level above (dual filtering). */
const UP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tMap, vUv + vec2(-2.0 * o.x, 0.0)).rgb + texture2D(tMap, vUv + vec2(2.0 * o.x, 0.0)).rgb
         + texture2D(tMap, vUv + vec2(0.0, -2.0 * o.y)).rgb + texture2D(tMap, vUv + vec2(0.0, 2.0 * o.y)).rgb;
  c += 2.0 * (texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb + texture2D(tMap, vUv + o).rgb
            + texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb + texture2D(tMap, vUv - o).rgb);
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`;

/** Levels of the chain: from half the screen (at most 540 px high) down to a thirty-second. */
const LEVELS = 5;
const MAX_FIRST_HEIGHT = 540;

/**
 * Bloom: the glow of light around the highlights (the reflections of mercury, the neons, the embers), what makes an
 * image read as lit rather than drawn. The bright parts are kept above a threshold, halved again and again and summed
 * back up, each level a wider halo; the final pass adds the result. Allocated on first use.
 */
export class Bloom {
  private levels: THREE.WebGLRenderTarget[] = [];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private width = 0;
  private height = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly type: THREE.TextureDataType,
    blank: THREE.Texture,
  ) {
    const common = { vertexShader: COMPOSITOR_VERT, depthTest: false, depthWrite: false };
    this.prefilter = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: PREFILTER_FRAG,
      blending: THREE.NoBlending,
      uniforms: {
        uA: { value: blank },
        uB: { value: blank },
        uMixB: { value: 0 },
        uThreshold: { value: 0.6 },
        uTexel: { value: new THREE.Vector2() },
      },
    });
    this.down = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: DOWN_FRAG,
      blending: THREE.NoBlending,
      uniforms: { tMap: { value: blank }, uTexel: { value: new THREE.Vector2() } },
    });
    // the levels add up: each one keeps its own halo and gains the wider ones
    this.up = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: UP_FRAG,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      uniforms: { tMap: { value: blank }, uTexel: { value: new THREE.Vector2() } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.prefilter);
    this.scene.add(this.quad);
  }

  /** Follows the drawing buffer (w × h). */
  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    if (this.levels.length) this.allocate();
  }

  private allocate() {
    const k = Math.min(0.5, MAX_FIRST_HEIGHT / Math.max(1, this.height));
    let w = Math.max(1, Math.round(this.width * k));
    let h = Math.max(1, Math.round(this.height * k));
    for (let i = 0; i < LEVELS; i++) {
      if (!this.levels[i]) this.levels[i] = new THREE.WebGLRenderTarget(w, h, { type: this.type, depthBuffer: false });
      else this.levels[i].setSize(w, h);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** The halo of the scene a (mixed toward b by mixB during a transition). */
  render(a: THREE.Texture, b: THREE.Texture | null, mixB: number, threshold: number): THREE.Texture {
    if (!this.levels.length) this.allocate();
    const r = this.renderer;
    const autoClear = r.autoClear;
    // every pass covers its whole target; the additive ones must keep what is there
    r.autoClear = false;
    const L = this.levels;
    const pu = this.prefilter.uniforms;
    pu.uA.value = a;
    pu.uB.value = b ?? a;
    pu.uMixB.value = b ? mixB : 0;
    pu.uThreshold.value = threshold;
    pu.uTexel.value.set(1 / L[0].width, 1 / L[0].height);
    this.pass(this.prefilter, L[0]);
    for (let i = 1; i < L.length; i++) {
      this.down.uniforms.tMap.value = L[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height);
      this.pass(this.down, L[i]);
    }
    for (let i = L.length - 2; i >= 0; i--) {
      this.up.uniforms.tMap.value = L[i + 1].texture;
      this.up.uniforms.uTexel.value.set(0.5 / L[i + 1].width, 0.5 / L[i + 1].height);
      this.pass(this.up, L[i]);
    }
    r.autoClear = autoClear;
    return L[0].texture;
  }

  dispose() {
    this.levels.forEach((t) => t.dispose());
    this.prefilter.dispose();
    this.down.dispose();
    this.up.dispose();
    this.quad.geometry.dispose();
  }
}
