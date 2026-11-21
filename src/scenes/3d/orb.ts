import * as THREE from "three";
import type { SceneGLDef } from "../types";
import { applyPalette, getPalette, PALETTE_GLSL, paletteParam, palRGB, paletteUniforms } from "../palettes";
import { mirror01, num, sampleBands } from "../utils";
import { SIMPLEX_3D } from "./noise.glsl";
import { createBloomComposer } from "./postfx";

const VERT = /* glsl */ `
uniform float uEnergy;
uniform float uBass;
uniform float uTreble;
uniform float uBeat;
uniform float uAmp;
uniform float uScale;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
${SIMPLEX_3D}
void main() {
  vec3 n = normalize(position);
  float t = uEnergy * 0.35;
  float d = snoise(n * uScale + vec3(t, t * 0.7, -t * 0.5));
  float spikes = snoise(n * uScale * 3.5 - vec3(t * 1.3)) * uTreble;
  float disp = d * (0.1 + uBass * 0.5 * uAmp) + spikes * 0.2 * uAmp + uBeat * 0.08 * uAmp;
  vec3 pos = position + n * disp;
  vDisp = disp;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * n);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uBeat;
varying float vDisp;
varying vec3 vNormal;
varying vec3 vView;
${PALETTE_GLSL}
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
  vec3 col = pal(vDisp * 1.8 + uTime * 0.05);
#ifdef WIRE
  gl_FragColor = vec4(col * (0.4 + fres), 0.12 + uBeat * 0.3);
#else
  // Dark core, colour on the bumps, bright rim: keeps contrast once bloom is added
  float bump = smoothstep(-0.15, 0.5, vDisp);
  col = col * (0.03 + 0.55 * bump * bump) + pal(vDisp + 0.5 + uTime * 0.05) * fres * 0.7;
  gl_FragColor = vec4(col, 1.0);
#endif
}
`;

const RING = 160;

export const orb: SceneGLDef = {
  id: "orb",
  name: "Orbe",
  tag: "3D",
  energy: "medium",
  kind: "webgl",
  description: "Sphère de bruit qui respire avec les basses, anneaux spectraux et étoiles.",
  params: [
    paletteParam("neon"),
    { type: "range", key: "amp", label: "Déformation", min: 0, max: 2.5, step: 0.05, default: 1 },
    { type: "range", key: "scale", label: "Grain du bruit", min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { type: "range", key: "spin", label: "Rotation", min: 0, max: 2, step: 0.05, default: 0.5 },
    { type: "range", key: "bloom", label: "Lueur", min: 0, max: 3, step: 0.05, default: 1 },
    { type: "toggle", key: "wire", label: "Maillage filaire", default: true },
  ],
  create({ renderer, viewport, target }) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(55, viewport.width / viewport.height, 0.1, 200);
    camera.position.set(0, 0, 5);

    const pal = paletteUniforms();
    const uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uAmp: { value: 1 },
      uScale: { value: 1.6 },
      ...pal,
    };

    const group = new THREE.Group();
    scene.add(group);

    const solidGeo = new THREE.IcosahedronGeometry(1.3, 48);
    const solidMat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
    group.add(new THREE.Mesh(solidGeo, solidMat));

    const wireGeo = new THREE.IcosahedronGeometry(1.34, 10);
    const wireMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { WIRE: 1 },
      wireframe: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    group.add(wire);

    // Star field
    const STARS = 2500;
    const starPos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 40);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.14,
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Two spectral rings orbiting the orb
    const rings = [0, 1].map((i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((RING + 1) * 3), 3));
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.rotation.x = i === 0 ? Math.PI / 2.4 : -Math.PI / 3;
      line.rotation.y = i * 0.8;
      scene.add(line);
      return { geo, mat, line };
    });

    const fx = createBloomComposer(renderer, scene, camera, viewport, target);
    let orbit = 0;

    return {
      output: fx.output,
      resize(v) {
        camera.aspect = v.width / v.height;
        camera.updateProjectionMatrix();
        fx.resize(v);
      },
      render(f, p, dt) {
        uniforms.uTime.value = f.time;
        uniforms.uEnergy.value = f.energy;
        uniforms.uBass.value = f.bass;
        uniforms.uTreble.value = f.treble;
        uniforms.uBeat.value = f.beatPulse;
        uniforms.uAmp.value = num(p.amp, 1);
        uniforms.uScale.value = num(p.scale, 1.6);
        applyPalette(pal, p.palette);
        const palette = getPalette(p.palette);

        const spin = num(p.spin, 0.5);
        group.rotation.y += dt * spin * (0.3 + f.mid);
        group.rotation.x += dt * spin * 0.15;
        group.scale.setScalar(1 + f.beatPulse * 0.07);
        wire.visible = p.wire !== false;
        stars.rotation.y += dt * 0.02 * (1 + f.volume * 4);
        starMat.size = 0.12 + f.beatPulse * 0.12;

        rings.forEach((r, ri) => {
          const pos = r.geo.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i <= RING; i++) {
            const u = i / RING;
            const v = sampleBands(f.bands, mirror01(u) * 0.8 + ri * 0.1);
            const a = u * Math.PI * 2;
            const rad = 2.1 + ri * 0.35 + v * 0.6;
            pos.setXYZ(i, Math.cos(a) * rad, Math.sin(a) * rad, (v - 0.5) * 0.15);
          }
          pos.needsUpdate = true;
          const [cr, cg, cb] = palRGB(palette, f.time * 0.05 + 0.3 + ri * 0.35);
          r.mat.color.setRGB(cr, cg, cb);
          r.line.rotation.z += dt * (ri ? -0.2 : 0.25) * (0.5 + f.mid);
        });

        orbit += dt * (0.08 + f.volume * 0.15);
        camera.position.set(Math.sin(orbit) * 5, Math.sin(orbit * 0.7) * 1.4, Math.cos(orbit) * 5);
        camera.lookAt(0, 0, 0);

        fx.bloom.strength = num(p.bloom, 1) * (0.7 + f.beatPulse * 0.6);
        fx.composer.render(dt);
      },
      dispose() {
        fx.dispose();
        solidGeo.dispose();
        solidMat.dispose();
        wireGeo.dispose();
        wireMat.dispose();
        starGeo.dispose();
        starMat.dispose();
        rings.forEach((r) => {
          r.geo.dispose();
          r.mat.dispose();
        });
      },
    };
  },
};
