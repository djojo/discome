import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PALETTE_GLSL, paletteUniforms } from "../../palettes";

/** Skinned vertex shader: world position, normal and view direction for custom body looks. */
const BODY_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uHeadBone;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
varying float vHead;
void main() {
  // how much the vertex follows the head (its hair, crinkled, catches far more rim light than the body)
  #ifdef USE_SKINNING
  vHead = dot(skinWeight, vec4(equal(skinIndex, vec4(uHeadBone))) + vec4(equal(skinIndex, vec4(uHeadBone + 1.0))));
  #else
  vHead = 0.0;
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  vN = normalize(transformedNormal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const BODY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uBass;
uniform float uOpacity;
uniform float uMode;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
varying float vHead;
${PALETTE_GLSL}
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
  vec3 col;
  if (uMode < 0.5) {
    // Hologram: bright rim, fine scanlines, a scan band sweeping up the body
    float scan = 0.55 + 0.45 * sin(vWorld.y * 90.0 - uTime * 8.0);
    float sweep = 1.0 - smoothstep(0.0, 0.06, abs(fract(vWorld.y * 0.45 - uTime * 0.4) - 0.5));
    vec3 c = pal(vWorld.y * 0.35 + uTime * 0.05);
    // (only the front surface lights: see the dancer's depth twin)
    col = c * ((0.12 + fres * 1.5) * scan + sweep * (0.4 + uBeat * 0.7));
    col *= 1.0 - 0.65 * clamp(vHead, 0.0, 1.0);
  } else {
    // Psychedelic skin: interfering waves of colour flowing over the body
    float n = sin(vWorld.x * 9.0 + uTime * 1.3) + sin(vWorld.y * 7.0 - uTime * 1.7)
            + sin(vWorld.z * 8.0 + uTime) + sin(length(vWorld.xz) * 14.0 - uTime * 2.4);
    float stripes = smoothstep(0.25, 0.5, abs(fract(n * 0.7 + uBass * 0.5) - 0.5));
    col = pal(n * 0.12 + vWorld.y * 0.25 + uTime * 0.08) * (0.35 + 0.65 * stripes);
    col += pal(n * 0.1 + 0.5) * fres * (0.8 + uBeat);
  }
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`;

export type BodyLook = "wire" | "hologram" | "chrome" | "psyche";

export const BODY_LOOK_OPTIONS: { value: BodyLook; label: string }[] = [
  { value: "hologram", label: "Hologramme" },
  { value: "psyche", label: "Peau psychédélique" },
  { value: "chrome", label: "Chrome irisé" },
  { value: "wire", label: "Néon filaire" },
];

/** Shared uniforms for every body material of a scene (one update per frame). */
export function createBodyUniforms() {
  return {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uBass: { value: 0 },
    /** The head's bone in the skeleton (the next one is its tip): see BODY_VERT. */
    uHeadBone: { value: -1 },
    ...paletteUniforms(),
  };
}

export type BodyUniforms = ReturnType<typeof createBodyUniforms>;

/** Hologram body: additive, so echoes stack into light trails. */
export function createGlowBody(uniforms: BodyUniforms, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uOpacity: { value: opacity }, uMode: { value: 0 } },
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Psychedelic skin: opaque, so a crowd of dancers doesn't add up to a white blob. */
export function createPsycheBody(uniforms: BodyUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uOpacity: { value: 1 }, uMode: { value: 1 } },
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
  });
}

/** Studio reflections for chrome bodies. */
export function createEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

export function createChromeBody(env: THREE.Texture, normalMap: THREE.Texture | null) {
  return new THREE.MeshPhysicalMaterial({
    metalness: 1,
    roughness: 0.16,
    envMap: env,
    envMapIntensity: 0.45,
    iridescence: 1,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [120, 900],
    normalMap,
    side: THREE.DoubleSide,
  });
}

export function createWireBody() {
  return new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
