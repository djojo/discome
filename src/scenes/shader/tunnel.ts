import { defineShaderScene } from "./defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";

export const tunnel = defineShaderScene({
  id: "tunnel",
  name: "Tunnel",
  description: "Tunnel infini qui accélère avec les basses et se tord avec les médiums.",
  params: [
    paletteParam("neon"),
    { type: "range", key: "speed", label: "Vitesse", min: 0, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "twist", label: "Torsion", min: 0, max: 3, step: 0.05, default: 1 },
    { type: "range", key: "segments", label: "Segments", min: 3, max: 24, step: 1, default: 12 },
    { type: "range", key: "wobble", label: "Ondulation", min: 0, max: 1.5, step: 0.05, default: 0.5 },
  ],
  uniforms: () => ({
    uSpeed: { value: 1 },
    uTwist: { value: 1 },
    uSegments: { value: 12 },
    uWobble: { value: 0.5 },
    uTravel: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uSpeed.value = num(p.speed, 1);
    u.uTwist.value = num(p.twist, 1);
    u.uSegments.value = num(p.segments, 12);
    u.uWobble.value = num(p.wobble, 0.5);
    // Integrate travel on the CPU so the speed can change without the tunnel jumping
    u.uTravel.value = (u.uTravel.value as number) + dt * num(p.speed, 1) * (0.4 + f.bass * 2.2 + f.beatPulse * 1.5);
  },
  fragment: /* glsl */ `
uniform float uSpeed;
uniform float uTwist;
uniform float uSegments;
uniform float uWobble;
uniform float uTravel;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  p += uWobble * 0.12 * vec2(sin(uEnergy * 0.7), cos(uEnergy * 0.53));

  float r = max(length(p), 1e-3);
  float a = atan(p.y, p.x);
  float depth = 1.5 / r;
  float z = depth + uTravel * 1.6;
  float ang = a / 6.2831853 * uSegments + depth * 0.15 * uTwist * (0.4 + uMid * 1.5) + uEnergy * 0.15;

  vec2 g = fract(vec2(ang, z)) - 0.5;
  // Analytic pixel footprint (no seam where atan wraps around)
  vec2 aa = vec2(uSegments / (6.2831853 * r * uRes.y), 1.5 / (r * r * uRes.y));
  vec2 dist = (0.5 - abs(g)) / aa;                       // distance to cell edge, in pixels
  float line = 1.0 - clamp(min(dist.x, dist.y) / 1.6, 0.0, 1.0);
  float glow = exp(-min(0.5 - abs(g.x), 0.5 - abs(g.y)) * 28.0);
  float detail = 1.0 - smoothstep(0.08, 0.45, max(aa.x, aa.y)); // fade where cells shrink below a few pixels
  float checker = step(0.0, g.x * g.y);

  vec3 base = pal(z * 0.05 + uTime * 0.04) * (0.05 + 0.18 * checker);
  vec3 neon = pal(z * 0.05 + 0.5 + uTime * 0.04);
  vec3 col = base + neon * detail * (line * (0.8 + uTreble * 1.2) + glow * (0.2 + 0.8 * uBass));

  // Dark depth at the centre, beat flash, vignette
  col *= smoothstep(0.0, 0.3, r);
  col += pal(uTime * 0.1 + 0.3) * uBeat * 0.3 * (1.0 - smoothstep(0.0, 0.45, r));
  col *= 1.0 - 0.4 * smoothstep(0.55, 1.0, r);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
