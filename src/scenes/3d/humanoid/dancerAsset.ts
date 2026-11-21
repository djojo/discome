import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/** Animated humanoid (Mixamo "Michelle", samba), shipped in public/models. Any rigged .glb with a dance clip works. */
const MODEL_URL = "/models/Michelle.glb";
const CLIP_NAME = "SambaDance";
/** Rough tempo of the clip: the dance is time-stretched so its steps follow the music's BPM. */
export const CLIP_BPM = 100;

let gltfPromise: Promise<GLTF> | null = null;

/** Start (or reuse) the model download. Safe to call early to warm the cache. */
export function preloadDancer(): Promise<GLTF> {
  if (!gltfPromise) {
    gltfPromise = new GLTFLoader().loadAsync(MODEL_URL);
    gltfPromise.catch(() => {
      gltfPromise = null; // allow a retry later
    });
  }
  return gltfPromise;
}

export interface Dancer {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  duration: number;
  normalMap: THREE.Texture | null;
  /** Pose the dancer at a given time of the clip (wraps around). */
  setTime(t: number): void;
  dispose(): void;
}

/** An independent copy of the dancer (own skeleton + mixer), sharing geometry with the cached model. */
export async function createDancer(): Promise<Dancer> {
  const gltf = await preloadDancer();
  const root = cloneSkinned(gltf.scene);
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) throw new Error("Le modèle ne contient pas de personnage animé.");
  const skinned = mesh as THREE.SkinnedMesh;
  skinned.frustumCulled = false; // the bind-pose bounds don't follow the dance

  const clip = gltf.animations.find((a) => a.name === CLIP_NAME) ?? gltf.animations[0];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const original = skinned.material as THREE.MeshStandardMaterial;

  return {
    root,
    mesh: skinned,
    mixer,
    duration: clip.duration,
    normalMap: original.normalMap ?? null,
    setTime(t) {
      const d = clip.duration;
      mixer.setTime(((t % d) + d) % d);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}

/** Dance speed that follows the music (clamped so it never looks absurd). */
export function danceRate(bpm: number, speed: number) {
  const sync = bpm > 0 ? Math.min(1.6, Math.max(0.6, bpm / CLIP_BPM)) : 1;
  return sync * speed;
}
