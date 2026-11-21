import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BAND_COUNT } from "@/lib/audio/AudioEngine";
import type { SceneGLDef } from "../../types";
import { applyPalette, getPalette, PALETTE_GLSL, paletteParam, palRGB, paletteUniforms } from "../../palettes";
import { mirror01, num, sampleBands } from "../../utils";
import { createBloomComposer } from "../postfx";
import { createEnvironment } from "./bodyMaterials";

const WAVE_SAMPLES = 128;

/** LED matrix on the visor: spectrum bars, waveform or scrolling text. */
const VISOR_FRAG = /* glsl */ `
uniform sampler2D uBands;
uniform sampler2D uWave;
uniform sampler2D uText;
uniform float uMode;
uniform float uTime;
uniform float uBeat;
uniform float uFlash;
uniform float uScroll;
varying vec2 vUv;
${PALETTE_GLSL}
void main() {
  vec2 grid = vec2(56.0, 11.0);
  vec2 cell = floor(vUv * grid);
  vec2 local = fract(vUv * grid) - 0.5;
  float dotMask = 1.0 - smoothstep(0.22, 0.42, length(local));
  vec2 c = (cell + 0.5) / grid;

  float lit;
  if (uMode < 0.5) {
    float level = texture2D(uBands, vec2(1.0 - abs(c.x * 2.0 - 1.0), 0.5)).r;
    lit = step(c.y, level * 1.05);
  } else if (uMode < 1.5) {
    float w = texture2D(uWave, vec2(c.x, 0.5)).r;
    lit = 1.0 - step(1.3 / grid.y, abs(c.y - w));
  } else {
    lit = step(0.5, texture2D(uText, vec2(fract(c.x * 0.5 + uScroll), c.y)).r);
  }
  lit = max(lit, uFlash);

  vec3 led = pal(c.x * 0.4 + c.y * 0.2 + uTime * 0.05) * (1.3 + uBeat * 0.8);
  vec3 col = mix(vec3(0.015, 0.02, 0.03), led, lit * dotMask);
  col += vec3(0.02) * dotMask; // unlit LEDs faintly visible
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Android {
  group: THREE.Group;
  head: THREE.Group;
  ears: THREE.Mesh[];
  phase: number;
}

/** Retro-futuristic chrome android (original design) with an LED visor that displays the music. */
export const android: SceneGLDef = {
  id: "android",
  name: "Androïde",
  tag: "3D",
  kind: "webgl",
  energy: "medium",
  description: "Buste d'androïde chrome dont la visière LED affiche le spectre, l'onde ou un texte.",
  params: [
    paletteParam("ice"),
    {
      type: "select",
      key: "visor",
      label: "Visière",
      options: [
        { value: "spectrum", label: "Spectre" },
        { value: "wave", label: "Onde" },
        { value: "text", label: "Texte DISCOME" },
      ],
      default: "spectrum",
    },
    {
      type: "select",
      key: "formation",
      label: "Formation",
      options: [
        { value: "solo", label: "Solo" },
        { value: "trio", label: "Trio" },
      ],
      default: "solo",
    },
    { type: "range", key: "nod", label: "Hochement au beat", min: 0, max: 2, step: 0.05, default: 1 },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 1 },
  ],
  create({ renderer, viewport, target }) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, viewport.width / viewport.height, 0.05, 100);
    const env = createEnvironment(renderer);

    const chrome = new THREE.MeshPhysicalMaterial({
      metalness: 1,
      roughness: 0.12,
      color: 0xb8c0cc,
      envMap: env,
      envMapIntensity: 0.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x0b0c14, metalness: 0.7, roughness: 0.3, envMap: env });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Data textures fed from the audio frame
    const bandData = new Uint8Array(BAND_COUNT);
    const bandTex = new THREE.DataTexture(bandData, BAND_COUNT, 1, THREE.RedFormat, THREE.UnsignedByteType);
    bandTex.magFilter = bandTex.minFilter = THREE.LinearFilter;
    const waveData = new Uint8Array(WAVE_SAMPLES);
    const waveTex = new THREE.DataTexture(waveData, WAVE_SAMPLES, 1, THREE.RedFormat, THREE.UnsignedByteType);
    waveTex.magFilter = waveTex.minFilter = THREE.LinearFilter;

    const textCanvas = document.createElement("canvas");
    textCanvas.width = 512;
    textCanvas.height = 64;
    const tctx = textCanvas.getContext("2d")!;
    tctx.fillStyle = "#000";
    tctx.fillRect(0, 0, 512, 64);
    tctx.fillStyle = "#fff";
    tctx.font = "bold 52px sans-serif";
    tctx.textBaseline = "middle";
    tctx.fillText("DISCOME  ✦  ", 8, 34);
    const textTex = new THREE.CanvasTexture(textCanvas);

    const visorUniforms = {
      uBands: { value: bandTex },
      uWave: { value: waveTex },
      uText: { value: textTex },
      uMode: { value: 0 },
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uFlash: { value: 0 },
      uScroll: { value: 0 },
      ...paletteUniforms(),
    };
    const visorMat = new THREE.ShaderMaterial({
      uniforms: visorUniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: VISOR_FRAG,
    });

    // ---- geometry shared by every android
    const geos = {
      head: new THREE.SphereGeometry(0.5, 64, 48),
      visor: new THREE.SphereGeometry(0.508, 96, 24, Math.PI / 2 - 1.05, 2.1, 1.28, 0.46),
      ear: new THREE.CylinderGeometry(0.15, 0.15, 0.1, 48),
      earRing: new THREE.TorusGeometry(0.12, 0.012, 12, 64),
      crest: new THREE.TorusGeometry(0.52, 0.018, 12, 96, Math.PI),
      neck: new THREE.CylinderGeometry(0.15, 0.2, 0.4, 32),
      torso: new RoundedBoxGeometry(1.5, 0.6, 0.62, 6, 0.26),
      chestLight: new THREE.BoxGeometry(0.9, 0.035, 0.02),
    };

    const ringMats: THREE.MeshBasicMaterial[] = [];
    const buildAndroid = (phase: number): Android => {
      const group = new THREE.Group();
      const head = new THREE.Group();
      head.position.y = 1.62;
      const skull = new THREE.Mesh(geos.head, chrome);
      skull.scale.set(0.92, 1.12, 1);
      const visor = new THREE.Mesh(geos.visor, visorMat);
      visor.scale.copy(skull.scale);
      const crest = new THREE.Mesh(geos.crest, dark);
      crest.rotation.y = Math.PI / 2;
      crest.scale.set(1, 1.12, 0.92);
      head.add(skull, visor, crest);

      const ears: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(geos.ear, dark);
        ear.rotation.z = Math.PI / 2;
        ear.position.set(side * 0.45, 0, 0);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        ringMats.push(ringMat);
        const ring = new THREE.Mesh(geos.earRing, ringMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(side * 0.51, 0, 0);
        head.add(ear, ring);
        ears.push(ring);
      }

      const neck = new THREE.Mesh(geos.neck, dark);
      neck.position.y = 1.08;
      const torso = new THREE.Mesh(geos.torso, chrome);
      torso.position.y = 0.62;
      const chest = new THREE.Mesh(geos.chestLight, glowMat);
      chest.position.set(0, 0.72, 0.315);
      group.add(head, neck, torso, chest);
      return { group, head, ears, phase };
    };

    let androids: Android[] = [];
    let formation = "";
    const layout = (mode: string) => {
      formation = mode;
      androids.forEach((a) => scene.remove(a.group));
      ringMats.forEach((m) => m.dispose());
      ringMats.length = 0;
      const xs = mode === "trio" ? [-2.1, 0, 2.1] : [0];
      androids = xs.map((x, i) => {
        const a = buildAndroid(i * 0.7);
        a.group.position.x = x;
        if (mode === "trio") a.group.rotation.y = -x * 0.12;
        scene.add(a.group);
        return a;
      });
    };

    // Halo behind the head(s) and coloured rim lights
    const haloGeo = new THREE.TorusGeometry(1.05, 0.022, 16, 160);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(0, 1.62, -0.7);
    scene.add(halo);
    const rimA = new THREE.PointLight(0xffffff, 6, 25);
    rimA.position.set(-3, 2.5, 1.5);
    const rimB = new THREE.PointLight(0xffffff, 6, 25);
    rimB.position.set(3, 1.5, -1);
    scene.add(rimA, rimB);

    const fx = createBloomComposer(renderer, scene, camera, viewport, target);
    fx.bloom.threshold = 0.6; // only the LEDs and rings glow, not the chrome
    const bg = new THREE.Color();
    scene.background = bg;
    let flash = 0;
    let scroll = 0;

    return {
      output: fx.output,
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
        fx.resize(v);
      },
      render(f, p, dt) {
        const mode = String(p.formation ?? "solo");
        if (mode !== formation) layout(mode);

        // Feed the visor
        for (let i = 0; i < BAND_COUNT; i++) bandData[i] = Math.min(255, sampleBands(f.bands, (i / BAND_COUNT) * 0.85) * 255);
        bandTex.needsUpdate = true;
        const wave = f.waveform;
        for (let i = 0; i < WAVE_SAMPLES; i++) {
          const v = wave[Math.floor(mirror01(i / WAVE_SAMPLES) * (wave.length / 2))];
          waveData[i] = Math.max(0, Math.min(255, (0.5 + v * 1.6) * 255));
        }
        waveTex.needsUpdate = true;
        if (f.drop) flash = 1;
        flash *= Math.exp(-dt * 4);
        scroll += dt * 0.12 * (1 + f.volume);

        const palette = getPalette(p.palette);
        applyPalette(visorUniforms, p.palette);
        const visorMode = String(p.visor ?? "spectrum");
        visorUniforms.uMode.value = visorMode === "wave" ? 1 : visorMode === "text" ? 2 : 0;
        visorUniforms.uTime.value = f.time;
        visorUniforms.uBeat.value = f.beatPulse;
        visorUniforms.uFlash.value = flash > 0.5 ? 1 : 0;
        visorUniforms.uScroll.value = scroll;

        const [r, g, b] = palRGB(palette, f.time * 0.04);
        const [r2, g2, b2] = palRGB(palette, f.time * 0.04 + 0.5);
        rimA.color.setRGB(r, g, b);
        rimB.color.setRGB(r2, g2, b2);
        glowMat.color.setRGB(r * (0.5 + f.mid * 1.5), g * (0.5 + f.mid * 1.5), b * (0.5 + f.mid * 1.5));
        ringMats.forEach((m) => m.color.setRGB(r2 * (0.4 + f.bass * 1.6), g2 * (0.4 + f.bass * 1.6), b2 * (0.4 + f.bass * 1.6)));
        haloMat.color.setRGB(r * (0.3 + f.beatPulse), g * (0.3 + f.beatPulse), b * (0.3 + f.beatPulse));
        halo.scale.setScalar((mode === "trio" ? 2.4 : 1) * (1 + f.bass * 0.12 + flash * 0.3));
        halo.rotation.z += dt * 0.2;
        bg.setRGB(r * 0.03, g * 0.03, b * 0.05);

        const nod = num(p.nod, 1);
        for (const a of androids) {
          const t = f.energy * 0.3 + a.phase;
          a.head.rotation.x = -0.18 * nod * f.beatPulse + Math.sin(t * 1.7) * 0.04;
          a.head.rotation.y = Math.sin(t) * 0.45 * (0.4 + f.mid);
          a.head.rotation.z = Math.sin(t * 0.8) * 0.06;
          a.group.position.y = -f.beatPulse * 0.02 * nod;
          a.ears.forEach((e) => e.scale.setScalar(1 + f.bass * 0.25));
        }

        const wide = mode === "trio";
        const angle = Math.sin(f.energy * 0.05) * 0.6;
        const dist = wide ? 7 : 3.3;
        camera.position.set(Math.sin(angle) * dist, 1.55 + Math.sin(f.energy * 0.07) * 0.15, Math.cos(angle) * dist);
        camera.lookAt(0, wide ? 1.2 : 1.35, 0);

        fx.bloom.strength = num(p.bloom, 1) * (0.7 + f.beatPulse * 0.5);
        fx.composer.render(dt);
      },
      dispose() {
        fx.dispose();
        Object.values(geos).forEach((g) => g.dispose());
        [chrome, dark, glowMat, visorMat, haloMat, ...ringMats].forEach((m) => m.dispose());
        haloGeo.dispose();
        bandTex.dispose();
        waveTex.dispose();
        textTex.dispose();
        env.dispose();
      },
    };
  },
};
