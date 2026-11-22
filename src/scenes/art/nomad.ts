import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { ARCANE_GLSL, arcaneParams, arcaneUniforms, updateArcane } from "./arcane.glsl";

/**
 * The Nomad: a figure in a conical hat holding a glowing orb, alone in a red desert with mesas on the horizon,
 * a very long shadow, a neon outline. The orb breathes with the bass and crackles on the kicks;
 * on the drop it bursts and lights the whole desert while the sun swings round.
 */
export const arcaneNomad = defineShaderScene({
  id: "arcane-nomad",
  name: "Le Nomade",
  energy: "calm",
  renderScale: 0.75,
  mask: true,
  description:
    "Silhouette au chapeau conique dans un désert martien, un orbe dans la main : il respire sur les basses, crépite sur les kicks et embrase le désert au drop.",
  params: [paletteParam("mars"), ...arcaneParams(14, 0.35)],
  uniforms: () => ({
    ...arcaneUniforms(),
    uYaw: { value: 0.3 },
    uSunAz: { value: 0 },
    uSunTarget: { value: 0 },
    uOrb: { value: 0 },
    uLift: { value: 0.3 },
  }),
  update(u, f, p, dt) {
    updateArcane(u, f, p, dt);
    u.uYaw.value = 0.32 + 0.12 * Math.sin(f.time * 0.04);
    // The sun swings round on every drop, and the long shadow with it
    if (f.drop) u.uSunTarget.value = (u.uSunTarget.value as number) + 1.1;
    const az = u.uSunAz.value as number;
    u.uSunAz.value = az + ((u.uSunTarget.value as number) - az) * (1 - Math.exp(-dt * 0.8));
    const o = u.uOrb.value as number;
    u.uOrb.value = o + (f.bass - o) * (1 - Math.exp(-dt * (f.bass > o ? 18 : 4)));
    const lift = f.section === "build" ? 0.3 + 0.7 * f.buildProgress : f.section === "drop" ? 0.6 : 0.3;
    const l = u.uLift.value as number;
    u.uLift.value = l + (lift - l) * (1 - Math.exp(-dt * 1.5));
  },
  fragment: /* glsl */ `
uniform float uYaw;
uniform float uSunAz;
uniform float uOrb;
uniform float uLift;
${ART_LIB}
${ARCANE_GLSL}

const vec3 MIRROR = vec3(-1., 1., 1.);
vec3 gSun;
vec3 gOrb;

/** Dunes near the figure, mesas far away. */
float desertH(vec2 xz) {
  float h = FEET + .14 * vnoise(vec3(xz * .32, 1.)) + .05 * vnoise(vec3(xz * 1.3, 4.)) - .05;
  float far = smoothstep(16., 24., length(xz));
  float m = vnoise(vec3(xz * .045, 7.3));
  float k = smoothstep(.52, .56, m) + .55 * smoothstep(.64, .67, m);
  return h + far * k * 3.4;
}

float marchDesert(vec3 ro, vec3 rd) {
  float t = .1;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - desertH(p.xz);
    if (d < .002 * t) return t;
    t += max(d * .5, .02 + t * .004);
    if (t > 70.) break;
  }
  return -1.;
}

vec3 desertNormal(vec2 xz) {
  vec2 e = vec2(.06, 0.);
  return normalize(vec3(desertH(xz - e.xy) - desertH(xz + e.xy), 2. * e.x, desertH(xz - e.yx) - desertH(xz + e.yx)));
}

/** The figure's shadow toward the sun (figure space is mirrored so the orb sits on the left). */
float figShadow(vec3 p) {
  vec3 q = p * MIRROR, L = gSun * MIRROR;
  // Skip pixels whose sun ray never comes near the figure
  vec2 o = q.xz;
  vec2 dl = normalize(L.xz);
  float along = -dot(o, dl);
  if (along < -1.5 || length(o + dl * along) > 1.3) return 1.;
  float res = 1., t = .05;
  for (int i = 0; i < 40; i++) {
    float h = figMap(q + L * t);
    res = min(res, 10. * h / t);
    t += clamp(h, .04, .6);
    if (res < .01 || t > 30. || q.y + L.y * t > 1.6) break;
  }
  return clamp(res, 0., 1.);
}

vec3 sky(vec3 rd) {
  vec3 c = mix(uPal1 * .32 + uBase, uBase * .9, smoothstep(-.02, .35, rd.y));
  c += starfield(rd, .12) * .7 * smoothstep(.05, .4, rd.y);
  float s = pow(max(dot(rd, gSun), 0.), 12.);
  return c + uPal1 * s * .6;
}

/** Light of the orb on the desert. */
vec3 orbLight(vec3 p) {
  float d = length(p - gOrb);
  float k = (.5 + 1.5 * uOrb) * (1. + 7. * uDrop);
  return vec3(.45, .75, 1.) * k / (1. + d * d * (1.6 - 1.3 * uDrop));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  setupFigure(2., 1., uLift);
  gOrb = (gHand + vec3(0., .24, 0.)) * MIRROR;
  gSun = normalize(vec3(-cos(uSunAz + 2.4), .13, -sin(uSunAz + 2.4)));

  vec3 ro = vec3(sin(uYaw) * 6.6, -.35, cos(uYaw) * 6.6);
  vec3 rd = lookAt(ro, vec3(-.3, .05, 0.)) * normalize(vec3(uv, 1.5));

  vec3 col = sky(rd);
  float solid = 0.;
  float dmin;
  float tf = figMarch(ro * MIRROR, rd * MIRROR, dmin);
  float tg = marchDesert(ro, rd);
  if (tf > 0. && (tg < 0. || tf < tg)) {
    col = shadeFigure((ro + rd * tf) * MIRROR, rd * MIRROR, 0.);
    // the orb lights the robe
    col += robeColor((ro + rd * tf) * MIRROR, 0.) * orbLight(ro + rd * tf) * .25;
    solid = 1.;
  } else {
    if (tg > 0.) {
      vec3 p = ro + rd * tg;
      vec3 n = desertNormal(p.xz);
      vec3 sand = mix(uInk, uPal1 * .8, smoothstep(FEET + .4, FEET + 3., p.y)) * (.75 + .3 * vnoise(vec3(p.xz * 2.1, 2.)));
      // scattered rocks
      vec2 cell = floor(p.xz * 1.6);
      vec2 o = (vec2(hash12(cell), hash12(cell + 7.)) - .5) * .7;
      float rock = (1. - smoothstep(.06, .11, length(fract(p.xz * 1.6) - .5 - o))) * step(.86, hash12(cell + 3.));
      sand *= 1. - .55 * rock;
      float sh = figShadow(p);
      float dif = clamp(dot(n, gSun), 0., 1.);
      // Graphic light: the low sun dominates, so the long shadow reads as a black band
      col = sand * (.22 + 1.05 * sh * (.55 + .45 * smoothstep(-.1, .4, dif * 3.))) + sand * orbLight(p);
      // the orb bursting on the drop floods the whole desert with blue light
      col += sand * vec3(.45, .75, 1.) * uDrop * 1.2;
      float fog = 1. - exp(-tg * .022);
      col = mix(col, sky(rd), fog);
      solid = 1. - smoothstep(25., 60., tg);
    }
    col += figHalo(dmin);
  }

  // The orb: a white core, a blue corona, sparks on the kicks
  vec3 oc = gOrb - ro;
  float s = dot(oc, rd);
  float r = length(oc - rd * s);
  float R = .14 + .04 * uOrb + .1 * uDrop;
  if (s > 0. && (tf < 0. || s < tf + .3)) {
    float core = 1. - smoothstep(R * .7, R, r);
    vec3 right = normalize(cross(rd, vec3(0., 1., 0.)));
    vec3 diff = rd * s - oc;
    float ang = atan(dot(diff, cross(right, rd)), dot(diff, right));
    float spikes = pow(vnoise(vec3(ang * 3.5, uTime * 18., 0.)), 3.) * uBeat * 1.2;
    float corona = exp(-max(r - R, 0.) * (9. - 6. * spikes)) * (.5 + 1.2 * uOrb);
    col = mix(col, vec3(2.4), core);
    col += vec3(.35, .7, 1.) * corona + vec3(.6, .85, 1.) * exp(-r * 2.) * uDrop * 1.5;
    solid = max(solid, core);
  }

  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, solid);
}
`,
});
