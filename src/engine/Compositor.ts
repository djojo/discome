import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { sceneById, type ParamValues, type SceneDef, type SceneInstance, type Viewport } from "@/scenes";
import { COMPOSITOR_FRAG, COMPOSITOR_VERT } from "./compositorShader";
import { blendCode, transitionCode, type LayerSettings, type TransitionSpec } from "./transitions";
import { NEUTRAL_FX, type FxSettings } from "./fx";

export interface PostFx {
  /** 0..1 build-up tension from the director. */
  tension: number;
  fx: FxSettings;
  /** Photosensitivity: dimmer strobe, at most ~3 flashes per second, no inversion. */
  safeFlash: boolean;
}

const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }
`;

/** A live scene instance plus the surface it draws into. */
interface Slot {
  def: SceneDef;
  instance: SceneInstance;
  /** 2D scenes: their own canvas, uploaded as a texture each frame. */
  canvas?: HTMLCanvasElement;
  canvasTexture?: THREE.CanvasTexture;
  /** WebGL scenes: an offscreen render target. */
  target?: THREE.WebGLRenderTarget;
  lastUsed: number;
}

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
  private pool: Slot[] = [];
  private transition: TransitionSpec = { type: "cut", duration: 0 };
  private elapsed = 0;
  private time = 0;
  private strobeEnv = 0;
  private lastStrobe = -10;
  /** Ping-pong buffers for the trails effect (allocated on first use). */
  private feedback: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private feedbackIndex = 0;
  private readonly copyScene = new THREE.Scene();
  private readonly copyMaterial: THREE.ShaderMaterial;

  private readonly black: THREE.DataTexture;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms;

  constructor(canvas: HTMLCanvasElement) {
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
      uStrobe: { value: 0 },
      uStrobeMode: { value: 1 },
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
  }

  /** Scene shown once the current transition (if any) completes. */
  get sceneId(): string | null {
    return (this.next ?? this.current)?.def.id ?? null;
  }

  get layerId(): string | null {
    return this.layer?.def.id ?? null;
  }

  get inTransition(): boolean {
    return this.next !== null;
  }

  setViewport(v: Viewport) {
    this.viewport = v;
    this.renderer.setPixelRatio(v.dpr);
    this.renderer.setSize(v.width, v.height, false);
    for (const s of this.slots()) this.resizeSlot(s);
    const { w, h } = this.bufferSize();
    this.feedback?.forEach((t) => t.setSize(w, h));
  }

  /** Switch to a scene. A transition already running is completed first. */
  show(id: string, t: TransitionSpec) {
    if (this.next) this.finishTransition();
    if (this.current?.def.id === id) return;
    const slot = this.acquire(id);
    if (!this.current || t.type === "cut" || t.duration <= 0) {
      this.release(this.current);
      this.current = slot;
      return;
    }
    this.next = slot;
    this.transition = t;
    this.elapsed = 0;
  }

  /**
   * Build a scene ahead of time (shader compilation, geometry) and park it in the pool,
   * so a later cut to it lands exactly on the beat without a hitch.
   */
  preload(id: string, frame: AudioFrame, params: ParamValues) {
    if (this.slots().some((s) => s.def.id === id)) return;
    const slot = this.createSlot(sceneById(id));
    this.renderSlot(slot, frame, () => params, 0);
    this.release(slot);
  }

  setLayer(id: string | null) {
    if ((this.layer?.def.id ?? null) === id) return;
    this.release(this.layer);
    this.layer = id ? this.acquire(id) : null;
  }

  render(
    frame: AudioFrame,
    paramsFor: (id: string) => ParamValues,
    dt: number,
    layer: LayerSettings,
    post: PostFx = { tension: 0, fx: NEUTRAL_FX, safeFlash: false },
  ) {
    this.time += dt;
    if (this.next) {
      this.elapsed += dt;
      if (this.elapsed >= this.transition.duration) this.finishTransition();
    }

    const u = this.uniforms;
    u.uA.value = this.current ? this.renderSlot(this.current, frame, paramsFor, dt) : this.black;

    if (this.next) {
      u.uB.value = this.renderSlot(this.next, frame, paramsFor, dt);
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

    u.uTime.value = this.time;
    u.uTension.value = post.tension * (post.safeFlash ? 0.5 : 1);
    u.uBeatPulse.value = frame.beatPulse;
    this.renderer.getDrawingBufferSize(u.uRes.value);
    this.applyFx(post, frame, dt);

    if (post.fx.trails > 0.01) {
      // Render into a feedback buffer (which reads the previous one), then copy to the screen.
      if (!this.feedback) {
        const { w, h } = this.bufferSize();
        this.feedback = [new THREE.WebGLRenderTarget(w, h), new THREE.WebGLRenderTarget(w, h)];
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
    const fx = post.fx;
    u.uTrails.value = fx.trails;
    u.uChroma.value = fx.chroma;
    u.uScan.value = fx.scanlines;
    u.uCrt.value = fx.crt;
    u.uGrain.value = fx.grain;
    u.uVhs.value = fx.vhs;
    u.uVignette.value = fx.vignette;
    u.uHue.value = fx.hue;
    u.uSat.value = fx.saturation;
    u.uContrast.value = fx.contrast;
    u.uBright.value = fx.brightness;
    u.uMirror.value = fx.mirror;
    u.uPoster.value = fx.posterize;

    // Strobe: fires on the kicks of the first seconds of a drop
    const armed = fx.strobe !== "off" && frame.section === "drop" && frame.sectionTime < 16;
    const minGap = post.safeFlash ? 0.34 : 0.1;
    if (armed && frame.beat && this.time - this.lastStrobe >= minGap) {
      this.strobeEnv = 1;
      this.lastStrobe = this.time;
    }
    this.strobeEnv *= Math.exp(-dt * 18);
    u.uStrobe.value = this.strobeEnv * (post.safeFlash ? 0.35 : 0.85);
    u.uStrobeMode.value = fx.strobe === "invert" && !post.safeFlash ? 2 : 1;
  }

  dispose() {
    for (const s of this.slots()) this.destroySlot(s);
    this.pool = [];
    this.current = this.next = this.layer = null;
    this.material.dispose();
    this.copyMaterial.dispose();
    this.feedback?.forEach((t) => t.dispose());
    this.black.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ internals

  private slots(): Slot[] {
    return [this.current, this.next, this.layer, ...this.pool].filter((s): s is Slot => s !== null);
  }

  private bufferSize() {
    return {
      w: Math.max(1, Math.floor(this.viewport.width * this.viewport.dpr)),
      h: Math.max(1, Math.floor(this.viewport.height * this.viewport.dpr)),
    };
  }

  private finishTransition() {
    this.release(this.current);
    this.current = this.next;
    this.next = null;
  }

  private acquire(id: string): Slot {
    const i = this.pool.findIndex((s) => s.def.id === id);
    if (i >= 0) return this.pool.splice(i, 1)[0];
    return this.createSlot(sceneById(id));
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

  private createSlot(def: SceneDef): Slot {
    const { w, h } = this.bufferSize();
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
      const instance = def.create({ canvas, ctx, viewport: this.viewport });
      return { def, instance, canvas, canvasTexture, lastUsed: 0 };
    }
    // 3D scenes get MSAA (rendering offscreen loses the canvas antialiasing); fullscreen shaders don't need it.
    const is3D = def.tag === "3D";
    const target = new THREE.WebGLRenderTarget(w, h, { samples: is3D ? 4 : 0, depthBuffer: is3D });
    const instance = def.create({ renderer: this.renderer, viewport: this.viewport, target });
    return { def, instance, target, lastUsed: 0 };
  }

  private resizeSlot(s: Slot) {
    const { w, h } = this.bufferSize();
    if (s.canvas && (s.canvas.width !== w || s.canvas.height !== h)) {
      s.canvas.width = w;
      s.canvas.height = h;
      s.canvasTexture!.dispose(); // reallocate the GPU texture at the new size
    }
    s.target?.setSize(w, h);
    s.instance.resize?.(this.viewport);
  }

  private renderSlot(s: Slot, frame: AudioFrame, paramsFor: (id: string) => ParamValues, dt: number) {
    const params = paramsFor(s.def.id);
    if (s.canvas) {
      s.instance.render(frame, params, dt);
      s.canvasTexture!.needsUpdate = true;
      return s.canvasTexture!;
    }
    this.renderer.setRenderTarget(s.target!);
    s.instance.render(frame, params, dt);
    return s.instance.output?.() ?? s.target!.texture;
  }

  private destroySlot(s: Slot) {
    s.instance.dispose?.();
    s.canvasTexture?.dispose();
    s.target?.dispose();
  }
}
