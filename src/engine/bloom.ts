import * as THREE from "three";
import { COMPOSITOR_VERT } from "./compositorShader";
import { TONE_GLSL } from "./tone";

/**
 * The bright parts of the scene on screen (and of the incoming one during a transition).
 * - On screen values: a steep knee above a threshold, so that a merely light surface (white porcelain, pale stone)
 *   hardly glows.
 * - A photographic scene also hands its real light: what rises far above the screen's white (a spark, a glint, the
 *   flash of a drop) glows as much as it rises, in its own colour, where the screen can only show white.
 * Nine bilinear taps spread over the destination pixel: a small highlight (a glint, a spark) is caught wherever it
 * falls, so the glow does not flicker as it moves.
 */
const PREFILTER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uHdrA;
uniform float uHdrB;
uniform float uMixB;
uniform float uHdrThreshold;
uniform float uLdrThreshold;
uniform vec2 uTexel;
varying vec2 vUv;
${TONE_GLSL}
vec3 knee(vec3 d) {
  float w = clamp((max(d.r, max(d.g, d.b)) - uLdrThreshold) / (1.0 - uLdrThreshold), 0.0, 1.0);
  return d * w * w * w;
}
/**
 * e: towards the frame's edges a photographic scene's light glows less (a column of light at the side does not flare,
 * the eye stays inside), as when these scenes darkened their own edges before the glow.
 */
vec3 bright(vec3 c, float hdr, float e) {
  if (hdr < 0.5) return knee(c);
  float l = max(c.r, max(c.g, c.b)) * e;
  // beyond the threshold, up to twice the screen's white more: a spark glows wide, but never into a white disc
  float over = 2.0 * (1.0 - exp(-max(l - uHdrThreshold, 0.0) * 0.5));
  return knee(aces(c) * e) + c * e * over / max(l, 1e-4);
}
float edge(vec2 uv) { vec2 q = (uv * 2.0 - 1.0) * vec2(0.62, 0.85); return 1.0 - dot(q, q) * 0.6; }
vec3 src(vec2 uv) {
  float e = edge(uv);
  vec3 a = bright(texture2D(uA, uv).rgb, uHdrA, e);
  return uMixB > 0.001 ? mix(a, bright(texture2D(uB, uv).rgb, uHdrB, e), uMixB) : a;
}
void main() {
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) c += src(vUv + vec2(float(x), float(y)) * uTexel * 0.66);
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

export interface BloomSource {
  texture: THREE.Texture;
  hdr: boolean;
}

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
        uHdrA: { value: 0 },
        uHdrB: { value: 0 },
        uMixB: { value: 0 },
        // the screen value where the glow starts
        uLdrThreshold: { value: 0.6 },
        // photographic scenes: the light above this glows on top, as much as it rises (2.5 is .94 on screen: the
        // scenes' usual highlights stay below, only sparks, glints and flashes go beyond)
        uHdrThreshold: { value: 2.5 },
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

  /** The halo of the scene a (mixed toward b by mixB during a transition); hdr: the texture holds linear light. */
  render(a: BloomSource, b: BloomSource | null, mixB: number): THREE.Texture {
    if (!this.levels.length) this.allocate();
    const r = this.renderer;
    const autoClear = r.autoClear;
    // every pass covers its whole target; the additive ones must keep what is there
    r.autoClear = false;
    const L = this.levels;
    const pu = this.prefilter.uniforms;
    pu.uA.value = a.texture;
    pu.uHdrA.value = a.hdr ? 1 : 0;
    pu.uB.value = (b ?? a).texture;
    pu.uHdrB.value = (b ?? a).hdr ? 1 : 0;
    pu.uMixB.value = b ? mixB : 0;
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
