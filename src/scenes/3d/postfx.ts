import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Viewport } from "../types";

/** Render → bloom → output. The glow is most of the "psychedelic" look in 3D. */
export function createBloomComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  viewport: Viewport,
  target: THREE.WebGLRenderTarget,
) {
  // Uses the compositor's target as its first buffer; the result stays offscreen (readBuffer).
  const composer = new EffectComposer(renderer, target);
  composer.renderToScreen = false;
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(viewport.width, viewport.height), 1, 0.45, 0.22);
  // No OutputPass on purpose: shader colours are authored as display values (like the 2D scenes),
  // so we skip the linear → sRGB conversion that would wash them out.
  composer.addPass(bloom);

  const resize = (v: Viewport) => {
    composer.setPixelRatio(v.dpr);
    composer.setSize(v.width, v.height);
  };
  resize(viewport);

  return {
    composer,
    bloom,
    resize,
    output: () => composer.readBuffer.texture,
    dispose() {
      bloom.dispose();
      composer.dispose();
    },
  };
}
