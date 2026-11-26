import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { sceneById, type ParamValues, type SceneDef, type SceneInstance, type Viewport } from "@/scenes";
import { COMPOSITOR_FRAG, COMPOSITOR_VERT } from "./compositorShader";
import { blendCode, transitionCode, type LayerSettings, type TransitionSpec } from "./transitions";
import { NEUTRAL_FX, type FxSettings } from "./fx";
import { Bloom } from "./bloom";
import { TONE_GLSL } from "./tone";

/** How the background (fond) sits behind the main scene. */
export interface BackgroundLook {
  /** 0..1 (already modulated by the director). */
  opacity: number;
  /** 0..1: recolour into the world's palette (luminance → ink). */
  tint: number;
  /** 0..1 extra softness. */
  blur: number;
  ink: [number, number, number];
}

const NO_BACKGROUND: BackgroundLook = { opacity: 0, tint: 0, blur: 0, ink: [1, 1, 1] };

export interface PostFx {
  /** 0..1 build-up tension from the director. */
  tension: number;
  fx: FxSettings;
  /** Photosensitivity: dimmer strobe, at most ~3 flashes per second, no inversion. */
  safeFlash: boolean;
  /** 2 on a track's second drop (and the next ones): the accents hit harder. */
  dropLevel?: number;
}

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }
`;

/**
 * Developing a scene, at its own resolution, before it is enlarged to the screen:
 * - a photographic scene's light goes through the tone curve every such scene shares (uHdr);
 * - FXAA (the classic Lottes version) smooths the stair-steps of a shader scene's edges (uAA), on the developed
 *   values, as the eye sees them (a highlight's edge is smoothed like any other).
 * The alpha (the scene's silhouette mask) is kept untouched.
 */
const DEVELOP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;
uniform float uHdr;
uniform float uAA;
varying vec2 vUv;
${TONE_GLSL}
vec3 tone(vec3 c) { return uHdr > 0.5 ? aces(c) : c; }
vec3 tap(vec2 uv) { return tone(texture2D(tMap, uv).rgb); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec4 cM = texture2D(tMap, vUv);
  vec3 m = tone(cM.rgb);
  if (uAA < 0.5) { gl_FragColor = vec4(m, cM.a); return; }
  float lM = lum(m);
  float lNW = lum(tap(vUv + vec2(-1.0, -1.0) * uTexel));
  float lNE = lum(tap(vUv + vec2(1.0, -1.0) * uTexel));
  float lSW = lum(tap(vUv + vec2(-1.0, 1.0) * uTexel));
  float lSE = lum(tap(vUv + vec2(1.0, 1.0) * uTexel));
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(m, cM.a); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (tap(vUv - dir / 6.0) + tap(vUv + dir / 6.0));
  vec3 b = a * 0.5 + 0.25 * (tap(vUv - dir * 0.5) + tap(vUv + dir * 0.5));
  float lB = lum(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, cM.a);
}
`;

/** A live scene instance plus the surface it draws into. */
interface Slot {
  /** What the slot shows: a world plan key ("world:plan") or a plain scene id. */
  key: string;
  def: SceneDef;
  instance: SceneInstance;
  /** 2D scenes: their own canvas, uploaded as a texture each frame. */
  canvas?: HTMLCanvasElement;
  canvasTexture?: THREE.CanvasTexture;
  /** WebGL scenes: an offscreen render target. */
  target?: THREE.WebGLRenderTarget;
  /** The scene's light is in target, linear and unbounded (a photographic scene, float targets): tone-mapped here. */
  hdr: boolean;
  /**
   * Shader scenes on screen and photographic backgrounds: target developed (tone curve, FXAA on screen), what the
   * final pass reads.
   */
  developed?: THREE.WebGLRenderTarget;
  /** Resolution factor: 1 for the main scenes, BG_SCALE for backgrounds (soft and cheap). */
  scale: number;
  lastUsed: number;
}

/** Where the adaptive resolution of each scene is remembered. */
const LEARNT_KEY = "discome.sceneScale";

/** Backgrounds render at a fraction of the screen resolution: naturally soft, and cheap. */
const BG_SCALE = 0.4;

/** Idle instances kept warm, so a scene coming back doesn't recompile its shaders mid-set. */
const POOL_SIZE = 3;

/**
 * Owns the WebGL renderer. Every scene renders offscreen; a final pass mixes
 * the current scene, the incoming one (during a transition) and the layer.
 */
export class Compositor {
  readonly renderer: THREE.WebGLRenderer;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private current: Slot | null = null;
  private next: Slot | null = null;
  private layer: Slot | null = null;
  private bg: Slot | null = null;
  private bgNext: Slot | null = null;
  private bgElapsed = 0;
  private bgDuration = 0;
  private pool: Slot[] = [];
  private transition: TransitionSpec = { type: "cut", duration: 0 };
  private elapsed = 0;
  private time = 0;
  private strobeEnv = 0;
  /** The gap before a drop: the image goes dark while the music is silent. */
  private gapEnv = 0;
  /** The accents: the kick, the claps, a drop's phrase starts. */
  private kickEnv = 0;
  private snapEnv = 0;
  private phraseEnv = 0;
  /** The big moments, for effects that only flare up then (FxSettings.retroOnHits): the drop (falls off linearly, so the
   *  pixels resolve step by step) and the strong kicks (a short flash). */
  private dropHit = 0;
  private kickHit = 0;
  private lastStrobe = -10;
  /** Ping-pong buffers for the trails effect (allocated on first use). */
  private feedback: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private feedbackIndex = 0;
  /** The glow around the highlights (allocated on first use). */
  private bloom: Bloom | null = null;
  private readonly copyScene = new THREE.Scene();
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly developScene = new THREE.Scene();
  private readonly developMaterial: THREE.ShaderMaterial;
  /**
   * How a scene's resolution is chosen: "fixed" (its own renderScale), "full" (every scene at full resolution) or
   * "adaptive" (learnt per scene: each finds the highest resolution that stays fluid, remembered across sessions).
   */
  private resMode: "fixed" | "full" | "adaptive" = "fixed";
  private readonly learnt = new Map<string, number>();
  /** Offscreen images in half float when the GPU allows: no banding in dark gradients. */
  private readonly targetType: THREE.TextureDataType;

  private readonly black: THREE.DataTexture;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms;
  /** The seal: the night's logo (or title) as it is, crisp, over everything (null: none). */
  private sealArt: THREE.CanvasTexture | null = null;
  private sealHalo: THREE.CanvasTexture | null = null;
  private sealAspect = 1;
  /** In: coming in or held; out: going; off. */
  private sealState: "in" | "out" | "off" = "off";
  /** The night's signature (its title or logo, white on transparent), drawn small in a corner. */
  private signature: THREE.CanvasTexture | null = null;
  private signatureAspect = 1;
  /** Hidden while the title itself is on screen. */
  signatureShown = true;

  /**
   * `resolve` maps a key (a world plan "world:plan", or a plain scene id) to its scene: two plans of the same
   * scene get two instances, each with its own settings, seed and camera.
   */
  constructor(
    canvas: HTMLCanvasElement,
    private readonly resolve: (key: string) => SceneDef = sceneById,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 1);
    // Scene colours are authored as final display values (like the 2D canvas): no sRGB encode at the end.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;

    this.uniforms = {
      uA: { value: this.black as THREE.Texture },
      uB: { value: this.black as THREE.Texture },
      uL: { value: this.black as THREE.Texture },
      uHasB: { value: 0 },
      uHasL: { value: 0 },
      uProgress: { value: 0 },
      uTransition: { value: 0 },
      uLayerMode: { value: 0 },
      uLayerOpacity: { value: 1 },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTension: { value: 0 },
      uBeatPulse: { value: 0 },
      uPrev: { value: this.black as THREE.Texture },
      uHasPrev: { value: 0 },
      uTrails: { value: 0 },
      uChroma: { value: 0 },
      uScan: { value: 0 },
      uCrt: { value: 0 },
      uGrain: { value: 0 },
      uVhs: { value: 0 },
      uVignette: { value: 0 },
      uHue: { value: 0 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uBright: { value: 0 },
      uMirror: { value: 0 },
      uPoster: { value: 0 },
      uPixel: { value: 0 },
      uStrobe: { value: 0 },
      uGap: { value: 0 },
      uAccentZoom: { value: 0 },
      uAccentGain: { value: 0 },
      uBreathe: { value: 0 },
      uBreathPhase: { value: 0 },
      uTrailHue: { value: 0 },
      uStrobeMode: { value: 1 },
      uBg: { value: this.black as THREE.Texture },
      uBg2: { value: this.black as THREE.Texture },
      uHasBg: { value: 0 },
      uBgMix: { value: 0 },
      uBgOpacity: { value: 0 },
      uBgTint: { value: 1 },
      uBgBlur: { value: 0 },
      uBgInk: { value: new THREE.Vector3(1, 1, 1) },
      uMaskA: { value: 0 },
      uMaskB: { value: 0 },
      uMotionA: { value: 0 },
      uMotionB: { value: 0 },
      uSizeA: { value: new THREE.Vector2(1, 1) },
      uSizeB: { value: new THREE.Vector2(1, 1) },
      uBloomTex: { value: this.black as THREE.Texture },
      uBloomAmt: { value: 0 },
      uSig: { value: this.black as THREE.Texture },
      uSigOn: { value: 0 },
      uSigRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSealArt: { value: this.black as THREE.Texture },
      uSealHalo: { value: this.black as THREE.Texture },
      uSealOn: { value: 0 },
      uSealT: { value: 0 },
      uSealStyle: { value: 0 },
      uSealRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSealDark: { value: 0 },
      uSealTint: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: COMPOSITOR_VERT,
      fragmentShader: COMPOSITOR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.black as THREE.Texture } },
      vertexShader: COMPOSITOR_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial));
    this.developMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: this.black as THREE.Texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uHdr: { value: 0 },
        uAA: { value: 1 },
      },
      vertexShader: COMPOSITOR_VERT,
      fragmentShader: DEVELOP_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.developScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.developMaterial));
    this.targetType = this.renderer.extensions.has("EXT_color_buffer_float") ? THREE.HalfFloatType : THREE.UnsignedByteType;
    try {
      const saved = JSON.parse(localStorage.getItem(LEARNT_KEY) ?? "{}") as Record<string, number>;
      for (const [id, k] of Object.entries(saved)) if (typeof k === "number" && k >= 0.4 && k <= 1) this.learnt.set(id, k);
    } catch {
      // nothing learnt yet
    }
  }

  setResolutionMode(mode: "fixed" | "full" | "adaptive") {
    if (mode === this.resMode) return;
    this.resMode = mode;
    for (const s of this.slots()) this.resizeSlot(s);
  }

  /**
   * Adaptive resolution: nudge the scene on screen down (too slow) or up (headroom). Returns false when it can't go
   * further (then the caller lowers the screen density instead). Ignored during transitions (two scenes render).
   */
  adaptCurrent(dir: -1 | 1): boolean {
    const s = this.current;
    if (this.resMode !== "adaptive" || !s || this.next || !s.target) return false;
    const id = s.def.id;
    const k = this.scaleOf(s.def, 1);
    const nk = dir < 0 ? Math.max(0.4, k * 0.85) : Math.min(1, k * 1.06);
    if (Math.abs(nk - k) < 1e-3) return false;
    this.learnt.set(id, nk);
    this.resizeSlot(s);
    this.saveLearnt();
    return true;
  }

  /** A scene's resolution factor now. Backgrounds keep their own (they are soft and small anyway). */
  private scaleOf(def: SceneDef, slotScale: number) {
    const k = def.renderScale ?? 1;
    if (slotScale !== 1 || this.resMode === "fixed") return k;
    if (this.resMode === "full") return 1;
    return this.learnt.get(def.id) ?? k;
  }

  private saveTimer = 0;
  private saveLearnt() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(LEARNT_KEY, JSON.stringify(Object.fromEntries(this.learnt)));
      } catch {
        // private mode or full storage: the scales are simply learnt again next time
      }
    }, 2000);
  }

  /** Scene shown once the current transition (if any) completes. */
  get sceneId(): string | null {
    return (this.next ?? this.current)?.key ?? null;
  }

  get layerId(): string | null {
    return this.layer?.key ?? null;
  }

  get inTransition(): boolean {
    return this.next !== null;
  }

  /** Debug line of the scene on screen (travelling scenes describe their flight). */
  get sceneInfo(): string | null {
    return (this.next ?? this.current)?.instance.describe?.() ?? null;
  }

  /** Background shown once its cross-fade (if any) completes. */
  get backgroundId(): string | null {
    return (this.bgNext ?? this.bg)?.key ?? null;
  }

  /** Change the background with a slow cross-fade (null removes it at once). */
  setBackground(id: string | null, fade: number) {
    if (this.bgNext) this.finishBg();
    if ((this.bg?.key ?? null) === id) return;
    if (!id) {
      this.release(this.bg);
      this.bg = null;
      return;
    }
    const slot = this.acquire(id, BG_SCALE);
    if (!this.bg || fade <= 0) {
      this.release(this.bg);
      this.bg = slot;
      return;
    }
    this.bgNext = slot;
    this.bgElapsed = 0;
    this.bgDuration = fade;
  }

  setViewport(v: Viewport) {
    this.viewport = v;
    this.renderer.setPixelRatio(v.dpr);
    this.renderer.setSize(v.width, v.height, false);
    for (const s of this.slots()) this.resizeSlot(s);
    const { w, h } = this.bufferSize();
    this.feedback?.forEach((t) => t.setSize(w, h));
    this.bloom?.setSize(w, h);
  }

  /** Switch to a scene. A transition already running is completed first. */
  show(id: string, t: TransitionSpec) {
    if (this.next) this.finishTransition();
    if (this.current?.key === id) return;
    const slot = this.acquire(id);
    if (!this.current || t.type === "cut" || t.duration <= 0) {
      this.release(this.current);
      this.current = slot;
      return;
    }
    this.next = slot;
    this.transition = t;
    this.elapsed = (t.from ?? 0) * t.duration;
  }

  /**
   * Build a scene ahead of time (shader compilation, geometry) and park it in the pool,
   * so a later cut to it lands exactly on the beat without a hitch.
   */
  preload(id: string, frame: AudioFrame, params: ParamValues) {
    if (this.slots().some((s) => s.key === id)) return;
    const slot = this.createSlot(id);
    this.renderSlot(slot, frame, () => params, 0);
    this.release(slot);
  }

  setLayer(id: string | null) {
    if ((this.layer?.key ?? null) === id) return;
    this.release(this.layer);
    this.layer = id ? this.acquire(id) : null;
  }

  render(
    frame: AudioFrame,
    paramsFor: (id: string) => ParamValues,
    dt: number,
    layer: LayerSettings,
    post: PostFx = { tension: 0, fx: NEUTRAL_FX, safeFlash: false },
    background: BackgroundLook = NO_BACKGROUND,
  ) {
    this.time += dt;
    if (this.next) {
      this.elapsed += dt;
      if (this.elapsed >= this.transition.duration) this.finishTransition();
    }
    if (this.bgNext) {
      this.bgElapsed += dt;
      if (this.bgElapsed >= this.bgDuration) this.finishBg();
    }

    const u = this.uniforms;
    if (this.bg && background.opacity > 0.002) {
      u.uBg.value = this.renderSlot(this.bg, frame, paramsFor, dt);
      if (this.bgNext) {
        u.uBg2.value = this.renderSlot(this.bgNext, frame, paramsFor, dt);
        const x = this.bgElapsed / this.bgDuration;
        u.uBgMix.value = x * x * (3 - 2 * x);
      } else {
        u.uBgMix.value = 0;
      }
      u.uHasBg.value = 1;
      u.uBgOpacity.value = background.opacity;
      u.uBgTint.value = background.tint;
      u.uBgBlur.value = background.blur * 14 * this.viewport.dpr;
      u.uBgInk.value.fromArray(background.ink);
    } else {
      u.uHasBg.value = 0;
    }

    u.uA.value = this.current ? this.renderSlot(this.current, frame, paramsFor, dt) : this.black;
    if (this.current) this.sizeOf(this.current, u.uSizeA.value);
    u.uMaskA.value = this.current?.def.mask ? 1 : 0;
    u.uMaskB.value = this.next?.def.mask ? 1 : 0;

    if (this.next) {
      u.uB.value = this.renderSlot(this.next, frame, paramsFor, dt);
      this.sizeOf(this.next, u.uSizeB.value);
      u.uHasB.value = 1;
      u.uProgress.value = this.elapsed / this.transition.duration;
      u.uTransition.value = transitionCode(this.transition.type);
    } else {
      u.uHasB.value = 0;
    }

    if (this.layer) {
      u.uL.value = this.renderSlot(this.layer, frame, paramsFor, dt);
      u.uHasL.value = 1;
      u.uLayerMode.value = blendCode(layer.mode);
      u.uLayerOpacity.value = layer.opacity * (layer.pulse ? 0.2 + 0.8 * frame.beatPulse : 1);
    } else {
      u.uHasL.value = 0;
    }

    // Bloom: the glow around the highlights of the scene on screen (and of the incoming one), from their real light
    // when they are photographic
    const bloom = post.fx?.bloom ?? 0;
    if (bloom > 0.005 && this.current) {
      if (!this.bloom) {
        this.bloom = new Bloom(this.renderer, this.targetType, this.black);
        const { w, h } = this.bufferSize();
        this.bloom.setSize(w, h);
      }
      const x = this.next ? Math.min(1, this.elapsed / Math.max(1e-3, this.transition.duration)) : 0;
      const a = { texture: this.lightOf(this.current, u.uA.value), hdr: this.current.hdr };
      const b = this.next ? { texture: this.lightOf(this.next, u.uB.value), hdr: this.next.hdr } : null;
      u.uBloomTex.value = this.bloom.render(a, b, x * x * (3 - 2 * x));
      u.uBloomAmt.value = bloom;
    } else {
      u.uBloomAmt.value = 0;
    }

    // Travelling scenes report their speed: radial blur, at full resolution
    const blur = (post.fx?.speedBlur ?? NEUTRAL_FX.speedBlur) * 0.1;
    u.uMotionA.value = (this.current?.instance.motion?.() ?? 0) * blur;
    u.uMotionB.value = this.next ? (this.next.instance.motion?.() ?? 0) * blur : 0;

    u.uTime.value = this.time;
    u.uTension.value = post.tension * (post.safeFlash ? 0.5 : 1);
    u.uBeatPulse.value = frame.beatPulse;
    this.renderer.getDrawingBufferSize(u.uRes.value);
    this.applyFx(post, frame, dt);

    if ((post.fx?.trails ?? 0) > 0.01) {
      // Render into a feedback buffer (which reads the previous one), then copy to the screen.
      if (!this.feedback) {
        const { w, h } = this.bufferSize();
        this.feedback = [new THREE.WebGLRenderTarget(w, h, { type: this.targetType }), new THREE.WebGLRenderTarget(w, h, { type: this.targetType })];
      }
      const prev = this.feedback[this.feedbackIndex];
      const next = this.feedback[1 - this.feedbackIndex];
      u.uPrev.value = prev.texture;
      u.uHasPrev.value = 1;
      this.renderer.setRenderTarget(next);
      this.renderer.render(this.quadScene, this.quadCamera);
      this.copyMaterial.uniforms.tMap.value = next.texture;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.copyScene, this.quadCamera);
      this.feedbackIndex = 1 - this.feedbackIndex;
    } else {
      u.uHasPrev.value = 0;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.quadScene, this.quadCamera);
    }
  }

  private applyFx(post: PostFx, frame: AudioFrame, dt: number) {
    const u = this.uniforms;
    const fx = post.fx ?? NEUTRAL_FX;
    // The seal comes in (its entrance is the shader's, timed by uSealT), holds, goes in a fade
    if (this.sealState === "in") {
      u.uSealT.value += dt;
      u.uSealOn.value += (1 - u.uSealOn.value) * (1 - Math.exp(-dt * 8));
    } else if (this.sealState === "out") {
      u.uSealOn.value *= Math.exp(-dt * 3);
      if (u.uSealOn.value < 0.002) {
        u.uSealOn.value = 0;
        this.sealState = "off";
      }
    }
    if (this.sealArt) {
      // centred, about half the height, at most two thirds of the width
      const res = this.uniforms.uRes.value;
      let h = 0.5;
      let w = (h * this.sealAspect * res.y) / res.x;
      if (w > 0.66) {
        h *= 0.66 / w;
        w = 0.66;
      }
      u.uSealRect.value.set(0.5 - w / 2, 0.5 - h / 2, w, h);
      const tint = frame.tint;
      if (tint) u.uSealTint.value.set(tint[0], tint[1], tint[2]);
    }
    // The night's signature fades in and out (hidden while the title itself, or the seal, is on screen)
    const sigTarget = this.signature && this.signatureShown && this.sealState === "off" ? 1 : 0;
    u.uSigOn.value += (sigTarget - u.uSigOn.value) * (1 - Math.exp(-dt * 1.5));
    if (this.signature) {
      const h = 0.045;
      const w = (h * this.signatureAspect * this.uniforms.uRes.value.y) / this.uniforms.uRes.value.x;
      u.uSigRect.value.set(1 - 0.028 - w, 0.04, w, h);
    }
    // the trip (AudioFrame.trip): the picture breathes deeper, the trails grow longer and turn through the colours
    const trip = frame.trip;
    u.uBreathe.value = (fx.breathe ?? 0) * (0.003 + 0.012 * trip);
    u.uBreathPhase.value =
      frame.bpm > 0 ? Math.PI * ((frame.bar % 2) + (frame.beatInBar + frame.beatPhase) / 4) : this.time * 0.5;
    u.uTrailHue.value = (fx.trailHue ?? 0) * (6 + 14 * trip);
    u.uTrails.value = (fx.trailHue ?? 0) > 0.01 ? Math.min(0.92, fx.trails * (0.6 + 0.9 * trip)) : fx.trails;
    u.uChroma.value = fx.chroma;
    u.uScan.value = fx.scanlines;
    u.uCrt.value = fx.crt;
    u.uGrain.value = fx.grain;
    // Pixel and VHS: all the time, or only on the big moments, and stronger then since they are brief: on the drop the
    // image breaks into big blocks that resolve step by step (4, 3, 2 pixels) in a little over a second; the strong
    // kicks of the drop give a short flash of small blocks.
    this.dropHit = frame.drop ? 1 : Math.max(0, this.dropHit - dt / 1.3);
    this.kickHit = frame.beat && (frame.section === "drop" || frame.bass > 0.85) ? 0.5 : this.kickHit * Math.exp(-dt * 6);
    const hit = Math.max(this.dropHit, this.kickHit);
    const pixel = fx.retroOnHits ? (hit > 0.02 ? Math.min(1, fx.pixel * 4) * hit : 0) : fx.pixel;
    const vhs = fx.retroOnHits ? (hit > 0.02 ? Math.min(1, fx.vhs * 3) * hit : 0) : fx.vhs;
    u.uVhs.value = vhs;
    u.uVignette.value = fx.vignette;
    u.uHue.value = fx.hue;
    u.uSat.value = fx.saturation;
    u.uContrast.value = fx.contrast;
    u.uBright.value = fx.brightness;
    u.uMirror.value = fx.mirror;
    u.uPoster.value = fx.posterize;
    u.uPixel.value = pixel;

    // Strobe: fires on the kicks of the first seconds of a drop
    const armed = fx.strobe !== "off" && frame.section === "drop" && frame.sectionTime < 16;
    const minGap = post.safeFlash ? 0.34 : 0.1;
    if (armed && frame.beat && this.time - this.lastStrobe >= minGap) {
      this.strobeEnv = 1;
      this.lastStrobe = this.time;
    }
    this.strobeEnv *= Math.exp(-dt * 18);
    u.uStrobe.value = this.strobeEnv * (post.safeFlash ? 0.35 : 0.85);
    // The gap before the drop: black while the music holds its breath (only dimmed with flashes tamed), the drop's
    // impact comes out of it
    this.gapEnv = frame.gap ? Math.min(1, this.gapEnv + dt * 30) : Math.max(0, this.gapEnv - dt * 14);
    u.uGap.value = this.gapEnv * (post.safeFlash ? 0.6 : 0.97);

    // The accents, the rhythm on every scene (FxSettings.accents): the frame punches in a little on the kick and
    // lifts, the claps flicker, the first beat of a drop's phrase hits harder. Full in a drop, light in a groove,
    // none in a breakdown (and the build has its own push); a second drop harder still.
    const sectionDose = frame.section === "drop" ? 1 : frame.section === "calm" ? 0.4 : 0;
    const dose = (fx.accents ?? 0) * sectionDose * ((post.dropLevel ?? 1) >= 2 && frame.section === "drop" ? 1.3 : 1);
    this.kickEnv = frame.beat ? 1 : this.kickEnv * Math.exp(-dt * 9);
    this.snapEnv = frame.onset && !frame.beat && frame.mid > 0.5 ? 1 : this.snapEnv * Math.exp(-dt * 16);
    this.phraseEnv = frame.downbeat && frame.phraseBar === 0 && frame.section === "drop" ? 1 : this.phraseEnv * Math.exp(-dt * 4);
    const tame = post.safeFlash ? 0.4 : 1;
    u.uAccentZoom.value = dose * (0.018 * this.kickEnv + 0.03 * this.phraseEnv);
    u.uAccentGain.value = dose * tame * (0.08 * this.kickEnv + (post.safeFlash ? 0 : 0.06) * this.snapEnv + 0.12 * this.phraseEnv);
    u.uStrobeMode.value = fx.strobe === "invert" && !post.safeFlash ? 2 : 1;
  }

  /** The seal's content: the logo (or title) as it is, its halo, whether it is dark (null: none). */
  setSeal(seal: { art: HTMLCanvasElement; halo: HTMLCanvasElement; dark: boolean } | null) {
    this.sealArt?.dispose();
    this.sealHalo?.dispose();
    this.sealArt = seal ? new THREE.CanvasTexture(seal.art) : null;
    this.sealHalo = seal ? new THREE.CanvasTexture(seal.halo) : null;
    this.sealAspect = seal ? seal.art.width / seal.art.height : 1;
    this.uniforms.uSealArt.value = this.sealArt ?? this.black;
    this.uniforms.uSealHalo.value = this.sealHalo ?? this.black;
    this.uniforms.uSealDark.value = seal?.dark ? 1 : 0;
    if (!seal) {
      this.sealState = "off";
      this.uniforms.uSealOn.value = 0;
    }
  }

  /** The seal comes in, in a world's style (0 fade, 1 sheen, 2 neon, 3 pixels, 4 smoke). */
  showSeal(style: number) {
    if (!this.sealArt || this.sealState === "in") return;
    this.sealState = "in";
    this.uniforms.uSealT.value = 0;
    this.uniforms.uSealStyle.value = style;
  }

  /** The seal goes, in a fade. */
  hideSeal() {
    if (this.sealState === "in") this.sealState = "out";
  }

  /** The seal is on screen (coming in or held). */
  get sealShown() {
    return this.sealState === "in";
  }

  /** The night's signature: a canvas with its title or logo in the alpha (null: none). */
  setSignature(canvas: HTMLCanvasElement | null) {
    this.signature?.dispose();
    this.signature = canvas ? new THREE.CanvasTexture(canvas) : null;
    this.signatureAspect = canvas ? canvas.width / canvas.height : 1;
    this.uniforms.uSig.value = this.signature ?? this.black;
    if (!this.signature) this.uniforms.uSigOn.value = 0;
  }

  dispose() {
    this.signature?.dispose();
    this.sealArt?.dispose();
    this.sealHalo?.dispose();
    for (const s of this.slots()) this.destroySlot(s);
    this.pool = [];
    this.current = this.next = this.layer = this.bg = this.bgNext = null;
    this.material.dispose();
    this.copyMaterial.dispose();
    this.developMaterial.dispose();
    this.feedback?.forEach((t) => t.dispose());
    this.bloom?.dispose();
    this.black.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ internals

  private slots(): Slot[] {
    return [this.current, this.next, this.layer, this.bg, this.bgNext, ...this.pool].filter(
      (s): s is Slot => s !== null,
    );
  }

  private bufferSize(scale = 1) {
    return {
      w: Math.max(1, Math.floor(this.viewport.width * scale * this.viewport.dpr)),
      h: Math.max(1, Math.floor(this.viewport.height * scale * this.viewport.dpr)),
    };
  }

  /** What a scaled slot believes the screen is (3D composers size themselves from it). */
  private viewportFor(scale: number): Viewport {
    if (scale === 1) return this.viewport;
    return { width: this.viewport.width * scale, height: this.viewport.height * scale, dpr: this.viewport.dpr };
  }

  private finishBg() {
    this.release(this.bg);
    this.bg = this.bgNext;
    this.bgNext = null;
  }

  private finishTransition() {
    this.release(this.current);
    this.current = this.next;
    this.next = null;
  }

  private acquire(id: string, scale = 1): Slot {
    const i = this.pool.findIndex((s) => s.key === id && s.scale === scale);
    if (i >= 0) return this.pool.splice(i, 1)[0];
    return this.createSlot(id, scale);
  }

  private release(s: Slot | null) {
    if (!s) return;
    s.lastUsed = performance.now();
    this.pool.push(s);
    if (this.pool.length > POOL_SIZE) {
      this.pool.sort((a, b) => a.lastUsed - b.lastUsed);
      this.destroySlot(this.pool.shift()!);
    }
  }

  private createSlot(key: string, scale = 1): Slot {
    const def = this.resolve(key);
    const { w, h } = this.bufferSize(scale);
    const viewport = this.viewportFor(scale);
    if (def.kind === "2d") {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const canvasTexture = new THREE.CanvasTexture(canvas);
      canvasTexture.generateMipmaps = false;
      canvasTexture.minFilter = THREE.LinearFilter;
      const instance = def.create({ canvas, ctx, viewport });
      return { key, def, instance, canvas, canvasTexture, hdr: false, scale, lastUsed: 0 };
    }
    // 3D scenes get MSAA (rendering offscreen loses the canvas antialiasing); fullscreen shaders get FXAA instead
    // (main scenes only: backgrounds are soft anyway). Photographic scenes are developed even as backgrounds.
    const is3D = def.tag === "3D";
    const hdr = def.hdr === true && this.targetType !== THREE.UnsignedByteType;
    const k = this.scaleOf(def, scale);
    const tw = Math.max(1, Math.floor(w * k)), th = Math.max(1, Math.floor(h * k));
    const target = new THREE.WebGLRenderTarget(tw, th, { samples: is3D ? 4 : 0, depthBuffer: is3D, type: this.targetType });
    const developed =
      !is3D && (scale === 1 || hdr) ? new THREE.WebGLRenderTarget(tw, th, { depthBuffer: false, type: this.targetType }) : undefined;
    const instance = def.create({ renderer: this.renderer, viewport, target });
    return { key, def, instance, target, hdr, developed, scale, lastUsed: 0 };
  }

  private resizeSlot(s: Slot) {
    const { w, h } = this.bufferSize(s.scale);
    if (s.canvas && (s.canvas.width !== w || s.canvas.height !== h)) {
      s.canvas.width = w;
      s.canvas.height = h;
      s.canvasTexture!.dispose(); // reallocate the GPU texture at the new size
    }
    const k = this.scaleOf(s.def, s.scale);
    s.target?.setSize(Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k)));
    s.developed?.setSize(Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k)));
    s.instance.resize?.(this.viewportFor(s.scale));
  }

  private renderSlot(s: Slot, frame: AudioFrame, paramsFor: (id: string) => ParamValues, dt: number) {
    const params = paramsFor(s.key);
    if (s.canvas) {
      s.instance.render(frame, params, dt);
      s.canvasTexture!.needsUpdate = true;
      return s.canvasTexture!;
    }
    this.renderer.setRenderTarget(s.target!);
    s.instance.render(frame, params, dt);
    const out = s.instance.output?.() ?? s.target!.texture;
    if (!s.developed || s.instance.output) return out;
    // tone curve and FXAA at the scene's own resolution
    const m = this.developMaterial.uniforms;
    m.tMap.value = out;
    (m.uTexel.value as THREE.Vector2).set(1 / s.developed.width, 1 / s.developed.height);
    m.uHdr.value = s.hdr ? 1 : 0;
    m.uAA.value = s.scale === 1 ? 1 : 0;
    this.renderer.setRenderTarget(s.developed);
    this.renderer.render(this.developScene, this.quadCamera);
    return s.developed.texture;
  }

  /** What the bloom reads: a photographic scene's light before the tone curve, else what the final pass reads. */
  private lightOf(s: Slot, shown: THREE.Texture) {
    return s.hdr && !s.instance.output ? s.target!.texture : shown;
  }

  /** The texel size of what a slot hands to the final pass. */
  private sizeOf(s: Slot, out: THREE.Vector2) {
    if (s.canvas) out.set(s.canvas.width, s.canvas.height);
    else if (s.target) out.set(s.target.width, s.target.height);
  }

  private destroySlot(s: Slot) {
    s.instance.dispose?.();
    s.canvasTexture?.dispose();
    s.target?.dispose();
    s.developed?.dispose();
  }
}
