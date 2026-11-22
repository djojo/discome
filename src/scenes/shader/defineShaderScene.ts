import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Energy, ParamDef, ParamValues, SceneGLDef } from "../types";
import { applyPalette, PALETTE_GLSL, paletteUniforms } from "../palettes";
import { Flight, flightUniforms } from "../art/flight";
import { Cadrage, cameraUniforms, type Framing } from "../art/camera";
import { num } from "../utils";

/** Uniforms every fullscreen shader gets for free. */
const HEADER = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVol;
uniform float uBeat;
uniform float uHat;
uniform float uDrop;
uniform float uBuild;
/** 8 frequency bands, bass (0) to treble (7), 0..1. */
uniform float uBands[8];
/** Random, redrawn each time the scene comes back on screen: vary patterns so it never repeats exactly. */
uniform float uSeed;
/** 0..1: how far the night has drifted (the worlds degrade slowly over the set; see Settings.drift). */
uniform float uDrift;
${PALETTE_GLSL}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

type Uniforms = Record<string, THREE.IUniform>;

interface ShaderSceneOptions {
  id: string;
  name: string;
  description: string;
  energy: Energy;
  tag?: "Shader" | "Visage";
  /** Render at a fraction of the screen resolution (heavy ray-marched scenes). */
  renderScale?: number;
  /** The shader writes its subject's silhouette in alpha (keeps the background behind it). */
  mask?: boolean;
  params: ParamDef[];
  /** Fragment shader body. Has access to the header uniforms above and `pal(t)`. */
  fragment: string;
  uniforms?: () => Uniforms;
  /**
   * Travelling scene: a Flight (speed following the track's structure) drives uTravel, uSpeed, uAccel,
   * uBank, uSway and uDive. `cruise` is the distance per second at cruise speed; the scene's
   * `speed` and `dynamics` params scale it (see flightParams).
   */
  flight?: { cruise: number; pump?: number };
  /**
   * Scene built around a subject: a Cadrage draws a new framing on every phrase and writes
   * uCamPos, uCamTarget and uFocal (include CAMERA_GLSL in the fragment).
   */
  camera?: { framings: Framing[]; glideBars?: number };
  update?: (u: Uniforms, frame: AudioFrame, params: ParamValues, dt: number, ctx: SceneCtx) => void;
}

/** Per-instance helpers handed to a scene's update. */
export interface SceneCtx {
  flight: Flight | null;
  camera: Cadrage | null;
}

/** Fullscreen-quad scene: write a fragment shader, get audio uniforms + palette wired up. */
export function defineShaderScene(opts: ShaderSceneOptions): SceneGLDef {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    tag: opts.tag ?? "Shader",
    kind: "webgl",
    energy: opts.energy,
    renderScale: opts.renderScale,
    mask: opts.mask,
    params: opts.params,
    create({ renderer, target }) {
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const pal = paletteUniforms();
      const uniforms: Uniforms = {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uVol: { value: 0 },
        uBeat: { value: 0 },
        uHat: { value: 0 },
        uDrop: { value: 0 },
        uBuild: { value: 0 },
        uBands: { value: new Array<number>(8).fill(0) },
        ...pal,
        uSeed: { value: Math.random() * 100 },
        ...(opts.flight ? flightUniforms() : {}),
        ...(opts.camera ? cameraUniforms() : {}),
        ...(opts.uniforms?.() ?? {}),
      };
      const flight = opts.flight ? new Flight() : null;
      const cadrage = opts.camera ? new Cadrage(opts.camera.framings, opts.camera.glideBars) : null;
      const ctx: SceneCtx = { flight, camera: cadrage };
      let lastSeen = -1e9;
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: HEADER + opts.fragment,
        depthTest: false,
        depthWrite: false,
      });
      const geometry = new THREE.PlaneGeometry(2, 2);
      scene.add(new THREE.Mesh(geometry, material));

      return {
        render(f, params, dt) {
          (uniforms.uRes.value as THREE.Vector2).set(target.width, target.height);
          uniforms.uTime.value = f.time;
          uniforms.uEnergy.value = f.energy;
          uniforms.uBass.value = f.bass;
          uniforms.uMid.value = f.mid;
          uniforms.uTreble.value = f.treble;
          uniforms.uVol.value = f.volume;
          uniforms.uBeat.value = f.beatPulse;
          uniforms.uHat.value = f.onsetPulse;
          uniforms.uDrop.value = f.dropPulse;
          uniforms.uBuild.value = f.buildProgress;
          uniforms.uDrift.value = f.drift;
          // 64 log bands averaged into 8 (each a bit more than an octave)
          const bands = uniforms.uBands.value as number[];
          const per = f.bands.length / 8;
          for (let i = 0; i < 8; i++) {
            let sum = 0;
            for (let j = 0; j < per; j++) sum += f.bands[i * per + j];
            bands[i] = sum / per;
          }
          applyPalette(pal, params.palette);
          if (flight) {
            flight.update(f, dt, opts.flight!.cruise * num(params.speed, 1), num(params.dynamics, 1), opts.flight!.pump);
            uniforms.uTravel.value = flight.travel;
            uniforms.uSpeed.value = flight.speedNorm;
            uniforms.uAccel.value = flight.accel;
            uniforms.uBank.value = flight.bank;
            uniforms.uSway.value = flight.sway;
            uniforms.uDive.value = flight.dive;
          }
          // Back on screen after a while: new seed, new starting framing
          if (f.time - lastSeen > 1.5) {
            uniforms.uSeed.value = Math.random() * 100;
            cadrage?.reset(uniforms.uSeed.value as number);
          }
          lastSeen = f.time;
          opts.update?.(uniforms, f, params, dt, ctx);
          if (cadrage) {
            cadrage.update(f, dt);
            (uniforms.uCamPos.value as THREE.Vector3).copy(cadrage.pos);
            (uniforms.uCamTarget.value as THREE.Vector3).copy(cadrage.target);
            uniforms.uFocal.value = cadrage.focal;
          }
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
        },
        motion: flight ? () => flight.motion : undefined,
        describe: flight ? () => flight.describe() : undefined,
        dispose() {
          geometry.dispose();
          material.dispose();
        },
      };
    },
  };
}
