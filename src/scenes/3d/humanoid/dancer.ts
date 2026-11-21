import * as THREE from "three";
import type { SceneGLDef } from "../../types";
import { applyPalette, getPalette, PALETTE_GLSL, paletteParam, palRGB, paletteUniforms } from "../../palettes";
import { num } from "../../utils";
import { createBloomComposer } from "../postfx";
import { createDancer, danceRate, type Dancer } from "./dancerAsset";
import {
  BODY_LOOK_OPTIONS,
  createBodyUniforms,
  createChromeBody,
  createEnvironment,
  createGlowBody,
  createPsycheBody,
  createWireBody,
  type BodyLook,
} from "./bodyMaterials";

const FLOOR_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uBeat;
varying vec2 vUv;
${PALETTE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = exp(-pow((r - (0.18 + uBass * 0.08)) * 22.0, 2.0)) * (0.5 + uBeat);
  float waves = (1.0 - smoothstep(0.0, 0.05, abs(fract(r * 6.0 - uTime * 0.6) - 0.5))) * 0.12 * (0.4 + uBass);
  float glow = exp(-r * 6.0) * 0.4 * (0.4 + uBass);
  vec3 c = pal(r * 0.6 + uTime * 0.05) * (ring + waves + glow) * (1.0 - smoothstep(0.6, 1.0, r)) * 0.35;
  gl_FragColor = vec4(c, 1.0);
}
`;

interface Performer {
  group: THREE.Group;
  main: Dancer;
  echoes: Dancer[];
  phase: number;
}

const ECHO_OPACITY = [0.5, 0.32, 0.2, 0.12];

/** A humanoid dancer synced to the tempo: hologram, chrome or psychedelic skin, with time-delayed echo clones. */
export const dancer: SceneGLDef = {
  id: "dancer",
  name: "Danseuse",
  tag: "3D",
  kind: "webgl",
  energy: "medium",
  description: "Danseuse humanoïde calée sur le tempo, avec clones échos. Hologramme, chrome ou peau psychédélique.",
  params: [
    paletteParam("neon"),
    { type: "select", key: "look", label: "Matière", options: BODY_LOOK_OPTIONS, default: "hologram" },
    {
      type: "select",
      key: "formation",
      label: "Formation",
      options: [
        { value: "solo", label: "Solo" },
        { value: "duo", label: "Duo miroir" },
        { value: "circle", label: "Cercle de 6" },
      ],
      default: "solo",
    },
    { type: "range", key: "echoes", label: "Clones échos", min: 0, max: 4, step: 1, default: 3 },
    { type: "range", key: "speed", label: "Vitesse de danse", min: 0.5, max: 1.5, step: 0.05, default: 1 },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 1.1 },
  ],
  create({ renderer, viewport, target }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.05, 100);

    const uniforms = createBodyUniforms();
    const env = createEnvironment(renderer);
    const glow = createGlowBody(uniforms);
    const psyche = createPsycheBody(uniforms);
    const wire = createWireBody();
    const echoMats = ECHO_OPACITY.map((o) => createGlowBody(uniforms, o));
    let chrome: THREE.MeshPhysicalMaterial | null = null;

    // Coloured lights for the chrome look (the environment does the rest)
    const lightA = new THREE.PointLight(0xffffff, 6, 20);
    lightA.position.set(2.5, 3, 2);
    const lightB = new THREE.PointLight(0xffffff, 6, 20);
    lightB.position.set(-2.5, 2, -2);
    scene.add(lightA, lightB, new THREE.AmbientLight(0xffffff, 0.2));

    const floorUniforms = { uTime: { value: 0 }, uBass: { value: 0 }, uBeat: { value: 0 }, ...paletteUniforms() };
    const floorGeo = new THREE.PlaneGeometry(7, 7);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: FLOOR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Mesh(floorGeo, floorMat));

    // ---- performers (built asynchronously: the model may still be downloading)
    let performers: Performer[] = [];
    let layoutKey = "";
    let disposed = false;

    const disposePerformers = (list: Performer[]) => {
      for (const p of list) {
        scene.remove(p.group);
        p.main.dispose();
        p.echoes.forEach((e) => e.dispose());
      }
    };

    const rebuild = async (formation: string, echoCount: number) => {
      const key = `${formation}:${echoCount}`;
      layoutKey = key;
      const count = formation === "circle" ? 6 : formation === "duo" ? 2 : 1;
      const next: Performer[] = [];
      try {
        for (let i = 0; i < count; i++) {
          const main = await createDancer();
          const echoes: Dancer[] = [];
          for (let k = 0; k < echoCount; k++) echoes.push(await createDancer());
          const group = new THREE.Group();
          group.add(main.root, ...echoes.map((e) => e.root));
          if (formation === "duo") {
            group.position.x = i === 0 ? -0.75 : 0.75;
            if (i === 1) group.scale.x = -1; // mirror image
          } else if (formation === "circle") {
            const a = (i / count) * Math.PI * 2;
            group.position.set(Math.sin(a) * 1.8, 0, Math.cos(a) * 1.8);
            group.rotation.y = a;
          }
          next.push({ group, main, echoes, phase: formation === "circle" ? i * 0.35 : 0 });
        }
      } catch (e) {
        console.warn("Danseuse : modèle indisponible", e);
        return;
      }
      if (disposed || layoutKey !== key) {
        disposePerformers(next);
        return;
      }
      disposePerformers(performers);
      performers = next;
      for (const p of performers) scene.add(p.group);
    };

    const fx = createBloomComposer(renderer, scene, camera, viewport, target);
    fx.bloom.threshold = 0.35;
    let danceTime = 0;
    let orbit = 0;
    let spin = 0;
    let echoSpread = 0;
    const tint = new THREE.Color();

    return {
      output: fx.output,
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
        fx.resize(v);
      },
      render(f, p, dt) {
        const formation = String(p.formation ?? "solo");
        const echoCount = Math.round(num(p.echoes, 3));
        if (`${formation}:${echoCount}` !== layoutKey) void rebuild(formation, echoCount);

        const palette = getPalette(p.palette);
        applyPalette(uniforms, p.palette);
        applyPalette(floorUniforms, p.palette);
        uniforms.uTime.value = f.time;
        uniforms.uBeat.value = f.beatPulse;
        uniforms.uBass.value = f.bass;
        floorUniforms.uTime.value = f.time;
        floorUniforms.uBass.value = f.bass;
        floorUniforms.uBeat.value = f.beatPulse;

        // Drop: the camera whips around and the echoes fan out
        if (f.drop) {
          spin = 4;
          echoSpread = 1;
        }
        spin *= Math.exp(-dt * 1.5);
        echoSpread *= Math.exp(-dt * 0.8);

        const look = String(p.look ?? "hologram") as BodyLook;
        fx.bloom.threshold = look === "chrome" ? 0.7 : 0.35;
        const [r, g, b] = palRGB(palette, f.time * 0.05);
        tint.setRGB(r, g, b);
        wire.color.copy(tint);
        lightA.color.copy(tint);
        const [r2, g2, b2] = palRGB(palette, f.time * 0.05 + 0.5);
        lightB.color.setRGB(r2, g2, b2);

        danceTime += dt * danceRate(f.bpm, num(p.speed, 1));
        const delay = 0.09 + f.bass * 0.06 + echoSpread * 0.25;
        for (const perf of performers) {
          if (look === "chrome") {
            chrome ??= createChromeBody(env, perf.main.normalMap);
            chrome.color.setRGB(0.6 + r * 0.3, 0.6 + g * 0.3, 0.6 + b * 0.3);
            perf.main.mesh.material = chrome;
          } else {
            perf.main.mesh.material = look === "wire" ? wire : look === "psyche" ? psyche : glow;
          }
          perf.main.setTime(danceTime + perf.phase);
          perf.echoes.forEach((e, k) => {
            e.mesh.material = echoMats[k];
            e.setTime(danceTime + perf.phase - (k + 1) * delay);
          });
        }

        const wide = formation === "circle";
        orbit += dt * (0.2 + f.mid * 0.35 + spin);
        const radius = (wide ? 6 : 3) - f.beatPulse * 0.15;
        camera.position.set(Math.sin(orbit) * radius, 1.1 + Math.sin(orbit * 0.6) * 0.35, Math.cos(orbit) * radius);
        camera.lookAt(0, 0.9, 0);

        fx.bloom.strength = num(p.bloom, 1.1) * (0.7 + f.beatPulse * 0.5);
        fx.composer.render(dt);
      },
      dispose() {
        disposed = true;
        disposePerformers(performers);
        performers = [];
        fx.dispose();
        glow.dispose();
        psyche.dispose();
        wire.dispose();
        echoMats.forEach((m) => m.dispose());
        chrome?.dispose();
        env.dispose();
        floorGeo.dispose();
        floorMat.dispose();
      },
    };
  },
};
