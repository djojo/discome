import * as THREE from "three";
import { BAND_COUNT } from "@/lib/audio/AudioEngine";
import type { SceneGLDef } from "../types";
import { applyPalette, getPalette, PALETTE_GLSL, paletteParam, palRGB, paletteUniforms } from "../palettes";
import { num } from "../utils";
import { createBloomComposer } from "./postfx";

const ROWS = 96; // history length (texture height)
const ROWS_PER_SEC = 30;

const VERT = /* glsl */ `
uniform sampler2D uHist;
uniform float uHeight;
uniform float uFrac;
varying float vH;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec3 pos = position;
  float x = uv.x * 2.0 - 1.0;
  // Bass on the sides (mountains), treble in the middle (a valley you fly through)
  float band = (1.0 - abs(x)) * 0.8;
  float u = (band * ${BAND_COUNT - 1}.0 + 0.5) / ${BAND_COUNT}.0;
  float v = uv.y - uFrac / ${ROWS}.0;
  float h = texture2D(uHist, vec2(u, v)).r;
  h *= step(0.0, v);
  pos.y += h * uHeight * (0.2 + 0.8 * abs(x));
  vH = h;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uScroll;
uniform float uGrid;
uniform vec3 uFog;
varying float vH;
varying vec2 vUv;
varying float vDepth;
${PALETTE_GLSL}
float gridLine(vec2 g) {
  vec2 w = fwidth(g);
  vec2 l = abs(fract(g - 0.5) - 0.5) / max(w, 1e-4);
  return 1.0 - min(min(l.x, l.y), 1.0);
}
void main() {
  // Grid lines move with the terrain (row coordinate minus scroll)
  vec2 g = vec2(vUv.x * 40.0, (vUv.y * ${ROWS}.0 - uScroll) * 0.5);
  float line = gridLine(g) * uGrid;
  vec3 base = mix(vec3(0.015, 0.0, 0.04), pal(vH * 0.8 + uTime * 0.03) * 0.45, smoothstep(0.0, 0.9, vH));
  vec3 lineCol = pal(vH * 0.6 + vUv.y * 0.4 + uTime * 0.05) * (1.1 + uBeat * 1.2);
  vec3 col = base + lineCol * line;
  float fog = smoothstep(6.0, 34.0, vDepth);
  gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
}
`;

const SUN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uBeat;
varying vec2 vUv;
${PALETTE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float R = 0.62 + uBass * 0.12 + uBeat * 0.05;
  float disc = 1.0 - smoothstep(R - 0.015, R, r);
  // Horizontal cut-outs scrolling down through the lower half
  float stripes = step(0.5, fract(p.y * 9.0 + uTime * 0.6));
  float cut = mix(1.0, stripes, 1.0 - smoothstep(-0.6, 0.15, p.y));
  vec3 col = mix(pal(0.05 + uTime * 0.02), pal(0.55 + uTime * 0.02), 1.0 - smoothstep(-0.7, 0.7, p.y));
  float halo = exp(-max(r - R, 0.0) * 5.0) * 0.35 * (1.0 - smoothstep(0.8, 1.0, r)); // fades to 0 before the quad edge
  // alpha 0 + premultiplied additive: adds light without touching the alpha channel
  gl_FragColor = vec4(max(col * (disc * cut * 0.5 + halo), 0.0), 0.0);
}
`;

export const terrain: SceneGLDef = {
  id: "terrain",
  name: "Spectro-terrain",
  tag: "3D",
  kind: "webgl",
  description: "Paysage néon sculpté par l'historique du spectre, soleil rétro.",
  params: [
    paletteParam("neon"),
    { type: "range", key: "height", label: "Hauteur des reliefs", min: 0, max: 8, step: 0.1, default: 4 },
    { type: "range", key: "speed", label: "Vitesse", min: 0.2, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 1 },
    { type: "toggle", key: "grid", label: "Grille néon", default: true },
    { type: "toggle", key: "sun", label: "Soleil", default: true },
  ],
  create({ renderer, viewport }) {
    const scene = new THREE.Scene();
    const fogColor = new THREE.Color();
    scene.background = fogColor;
    const camera = new THREE.PerspectiveCamera(62, viewport.width / viewport.height, 0.1, 200);

    // Spectrogram history: one row per tick, row 0 = newest
    const data = new Uint8Array(BAND_COUNT * ROWS);
    const hist = new THREE.DataTexture(data, BAND_COUNT, ROWS, THREE.RedFormat, THREE.UnsignedByteType);
    hist.magFilter = THREE.LinearFilter;
    hist.minFilter = THREE.LinearFilter;
    hist.needsUpdate = true;

    const pal = paletteUniforms();
    const uniforms = {
      uHist: { value: hist },
      uHeight: { value: 4 },
      uFrac: { value: 0 },
      uScroll: { value: 0 },
      uGrid: { value: 1 },
      uFog: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uBeat: { value: 0 },
      ...pal,
    };

    const geo = new THREE.PlaneGeometry(26, 40, 180, 220);
    geo.rotateX(-Math.PI / 2); // uv.y = 1 at the far end
    geo.translate(0, 0, -12);
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
    scene.add(new THREE.Mesh(geo, mat));

    const sunGeo = new THREE.PlaneGeometry(22, 22);
    const sunMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: SUN_FRAG,
      depthWrite: false,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending, // adds light to the sky, so the quad itself never shows
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(0, 5, -60);
    sun.renderOrder = -1;
    scene.add(sun);

    const fx = createBloomComposer(renderer, scene, camera, viewport);
    let acc = 0;
    let scrolled = 0;

    return {
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
        fx.resize(v);
      },
      render(f, p, dt) {
        acc += dt * ROWS_PER_SEC * num(p.speed, 1);
        let shifted = false;
        while (acc >= 1) {
          acc -= 1;
          scrolled = (scrolled + 1) % 1920; // even, so the grid wraps seamlessly
          data.copyWithin(BAND_COUNT, 0, BAND_COUNT * (ROWS - 1));
          for (let c = 0; c < BAND_COUNT; c++) data[c] = Math.min(255, f.bands[c] * 255);
          shifted = true;
        }
        if (shifted) hist.needsUpdate = true;

        applyPalette(pal, p.palette);
        const [fr, fg, fb] = palRGB(getPalette(p.palette), 0.75 + f.time * 0.01);
        fogColor.setRGB(fr * 0.12, fg * 0.07, fb * 0.16);
        uniforms.uFog.value.set(fogColor.r, fogColor.g, fogColor.b);
        uniforms.uHeight.value = num(p.height, 4);
        uniforms.uFrac.value = acc;
        uniforms.uScroll.value = scrolled + acc;
        uniforms.uGrid.value = p.grid === false ? 0 : 1;
        uniforms.uTime.value = f.time;
        uniforms.uBass.value = f.bass;
        uniforms.uBeat.value = f.beatPulse;
        sun.visible = p.sun !== false;

        const sway = f.energy * 0.12;
        camera.position.set(Math.sin(sway) * 1.3, 2.3 + f.bass * 0.3, 7.5);
        camera.lookAt(Math.sin(sway * 0.7) * 2, 1.2, -30);
        camera.rotateZ(Math.sin(sway * 1.3) * 0.05 * (0.5 + f.mid));

        fx.bloom.strength = num(p.bloom, 1) * (0.7 + f.beatPulse * 0.6);
        fx.composer.render(dt);
      },
      dispose() {
        fx.dispose();
        geo.dispose();
        mat.dispose();
        sunGeo.dispose();
        sunMat.dispose();
        hist.dispose();
      },
    };
  },
};
