import * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { Energy, ParamDef, ParamValues, SceneGLDef } from "../types";
import { applyPalette, PALETTE_GLSL, paletteUniforms } from "../palettes";

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
  params: ParamDef[];
  /** Fragment shader body. Has access to the header uniforms above and `pal(t)`. */
  fragment: string;
  uniforms?: () => Uniforms;
  update?: (u: Uniforms, frame: AudioFrame, params: ParamValues, dt: number) => void;
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
        ...pal,
        ...(opts.uniforms?.() ?? {}),
      };
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
          applyPalette(pal, params.palette);
          opts.update?.(uniforms, f, params, dt);
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
        },
        dispose() {
          geometry.dispose();
          material.dispose();
        },
      };
    },
  };
}
