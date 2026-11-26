import type * as THREE from "three";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

/** The trip's uniforms of a Mycélium scene (declared in MYCELIUM_GLSL): its depth, the enchanted colours, the breath. */
export const tripUniforms = () => ({
  uTrip: { value: 0 },
  uTripHue: { value: Math.random() },
  uTripHueTo: { value: 0 },
  uBreath: { value: 0 },
});

/**
 * Each frame: the trip's depth (AudioFrame.trip, the track's moment dosed by the world), the enchanted colours drifting
 * (faster as the trip deepens, a leap ahead on every drop), the breath swelling over two bars.
 */
export function updateTrip(u: Record<string, THREE.IUniform>, f: AudioFrame, dt: number) {
  u.uTrip.value = f.trip;
  let to = (u.uTripHueTo.value as number) + dt * (0.004 + 0.025 * f.trip);
  if (f.drop) to += 0.25;
  u.uTripHueTo.value = to;
  const hue = u.uTripHue.value as number;
  u.uTripHue.value = hue + (to - hue) * (1 - Math.exp(-dt * 0.8));
  u.uBreath.value =
    f.bpm > 0 ? Math.sin(Math.PI * ((f.bar % 2) + (f.beatInBar + f.beatPhase) / 4)) : Math.sin(f.time * 0.5);
}
