import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { HEAD_GLSL, headUniforms, setHead, type HeadId } from "./heads";
import { SKY_GLSL } from "./sky.glsl";
import { TEMPLE_GLSL } from "./temple.glsl";
import { olympeUniforms, olympeWarp } from "./olympe";

/**
 * The gods of the assembly, round the ring: Hera, Athena, Dionysos, Homer (the bearded one, as Zeus), the Emperor
 * (his laurel), the Empress. They load with the world.
 */
const GODS: HeadId[] = ["hera", "athena", "dionysos", "homere", "empereur", "imperatrice"];
const SLOTS = ["", "B", "C", "D", "E", "F"];

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * L'Assemblée des dieux: we stand inside a ring of colossal Olympian heads, each on a column of cloud, every one of
 * them looking down at us; the camera turns slowly, looking up at them. Below, the sea of clouds. On the kick a ring of
 * light runs round under their chins; on the drop a column of light falls from the zenith in the middle of the ring,
 * the clouds of the columns whirl and the gods light up from within.
 */
export const assembly = defineShaderScene({
  id: "olympe-gods",
  name: "L'Assemblée des dieux",
  energy: "intense",
  hdr: true,
  timeWarp: olympeWarp,
  renderScale: 0.75,
  heads: GODS,
  description:
    "Au centre d'un cercle de têtes olympiennes colossales (Héra, Athéna, Dionysos, Homère en Zeus, l'Empereur, l'Impératrice) posées sur des colonnes de nuages, qui baissent les yeux vers nous. Au kick, un anneau de lumière fait le tour ; au drop, une colonne de lumière tombe du zénith, les nuages tourbillonnent et les dieux s'éclairent de l'intérieur.",
  params: [paletteParam("olympe")],
  uniforms: () => ({
    ...olympeUniforms(),
    ...Object.assign({}, ...SLOTS.map((s) => headUniforms(s))),
    uKickT: { value: 9 },
    uKicks: { value: 0 },
    uBeam: { value: 0 },
    uInner: { value: 0 },
    uSwirl: { value: 0 },
    uTurn: { value: 0 },
    uCharge: { value: 0 },
    // CPU side only
    uDropT: { value: 99 },
  }),
  update(u, f, _p, dt, ctx) {
    GODS.forEach((id, i) => setHead(u, id, SLOTS[i]));
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    if (f.beat) u.uKicks.value = (u.uKicks.value as number) + 1;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    if (f.drop) u.uDropT.value = 0;
    const t = (u.uDropT.value as number) + dt;
    u.uDropT.value = t;
    // the column of light: it falls in half a bar, holds two, fades over two
    u.uBeam.value = (t < bar * 2.5 ? smooth(t / (bar * 0.5)) : 1 - smooth((t - bar * 2.5) / (bar * 2))) * (f.safeFlash ? 0.6 : 1);
    const charge = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = (u.uCharge.value as number) + (charge - (u.uCharge.value as number)) * (1 - Math.exp(-dt * 2));
    // the gods light up from within with the column, and a little through the build
    u.uInner.value = Math.max(u.uBeam.value as number, 0.35 * (u.uCharge.value as number));
    // the clouds whirl: slowly, fast while the column of light stands
    u.uSwirl.value = (u.uSwirl.value as number) + ctx.dt * (0.04 + 0.6 * (u.uBeam.value as number));
    // the camera turns slowly round the ring
    u.uTurn.value = (u.uTurn.value as number) + ctx.dt * 0.035;
  },
  fragment: /* glsl */ `
uniform float uKickT;
uniform float uKicks;
uniform float uBeam;
uniform float uInner;
uniform float uSwirl;
uniform float uTurn;
uniform float uCharge;
${SLOTS.slice(1)
  .map(
    (s) => `uniform highp sampler3D uHeadTex${s};
uniform float uHeadOn${s};
uniform vec3 uHeadMin${s};
uniform vec3 uHeadSize${s};
uniform vec2 uHeadRelief${s};`,
  )
  .join("\n")}
${ART_LIB}
${HEAD_GLSL}
${SKY_GLSL}
${TEMPLE_GLSL}
const float N = 6.;
const float SEG = 6.2831853 / 6.;
const float A0 = .3;
const float RR = 13.;   // the ring's radius
const float GY = 6.;    // the gods' height
const float GS = 4.6;   // their scale
const vec3 EYE = vec3(0., 1.5, 0.);  // where they look: the middle of the ring

vec3 godPos(float k) { float a = A0 + k * SEG; return vec3(RR * cos(a), GY, RR * sin(a)); }

float slotD(float s, vec3 h) {
  if (s < .5) return headD(h);
${SLOTS.slice(1)
  .map(
    (s, i) =>
      `  ${i < SLOTS.length - 2 ? `if (s < ${i + 1.5}) ` : ""}return headSlot(uHeadTex${s}, uHeadOn${s}, uHeadMin${s}, uHeadSize${s}, uHeadRelief${s}, h);`,
  )
  .join("\n")}
}
float slotTop(float s) {
  if (s < .5) return uHeadMin.y + uHeadSize.y;
${SLOTS.slice(1)
  .map((s, i) => `  ${i < SLOTS.length - 2 ? `if (s < ${i + 1.5}) ` : ""}return uHeadMin${s}.y + uHeadSize${s}.y;`)
  .join("\n")}
}

/** A god's own frame: facing the middle of the ring, bowed toward it. */
vec3 godFrame(vec3 p, float k) {
  vec3 c = godPos(k);
  vec3 dv = EYE - c;
  vec3 h = (p - c) / GS;
  h.xz *= rot(atan(dv.x, dv.z));
  h.yz *= rot(asin(dv.y / length(dv)) * .8);
  return h;
}
float godD(vec3 p, float k) {
  vec3 h = godFrame(p, k);
  float top = max(1., slotTop(mod(k, N)));
  float b = sdBox(h - vec3(0., .5 * top - .5, 0.), vec3(.85, .5 * top + .5, .92));
  if (b > .2) return b * GS;
  // (cut under the neck: the column of cloud carries it)
  return max(slotD(mod(k, N), h), -.75 - h.y) * GS;
}

/** The column of cloud under god k: heaped, slowly twisting, whirling on the drop, rounded under the chin. */
float pillarD(vec3 p, float k) {
  vec3 c = godPos(k);
  vec3 q = p - vec3(c.x, 0., c.z);
  float b = length(q.xz) - 4.;
  if (b > 1.5) return b;
  q.xz *= rot(uSwirl + q.y * .06);
  float n = vnoise(q * .55 + vec3(0., -uTime * .08, k * 7.)) + .5 * vnoise(q * 1.3 + vec3(k * 3., uSwirl, 0.));
  float d = length(q.xz) - 2.1 - .5 * sin(q.y * .8 + k) - 1.2 * n;
  return smax(d, q.y - (GY - 1.05 * GS), 1.4) * .6;
}

float gMat;  // 0 a god, 1 a column of cloud
float gK;    // which one
float map(vec3 p) {
  float a = atan(p.z, p.x) - A0;
  float f = a / SEG;
  float k = floor(f + .5);
  // the columns of cloud are clouds in volume (cloudsO), unless the noise is still cooking
  float g = godD(p, k), c = uCloudReady > .5 ? 1e3 : pillarD(p, k);
  // the neighbour on that side, as bounds only (the ring is wide: the nearest is all that matters)
  float k2 = f - k > 0. ? k + 1. : k - 1.;
  vec3 c2 = godPos(k2);
  float nb = min(length(p - c2) - 1.4 * GS, length((p - c2).xz) - 4.);
  gK = k;
  gMat = g < c ? 0. : 1.;
  // the tholos round the assembly, far behind the gods: a ring of tall columns under a ring of stone
  float th = tholosD(p - vec3(0., -2., 0.), 24., 30., 14., 1.1, 0.);
  if (th < min(g, c)) gMat = 2.;
  return min(min(min(g, c), th), max(nb, .1));
}
vec3 calcN(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  gSun = normalize(vec3(cos(uSeed), .25 + sunY(), sin(uSeed)));
  gKey = normalize(vec3(0., .75, 0.) + gSun * .35);
  gSeaY = -10.;
  gSeaDrift = vec2(uTime * .003, uSeed * .1);
  // (the tholos is far: its fluting would be finer than a pixel)
  gFlute = .3;
  // the columns of cloud in volume, under each god, churning slowly, fast while the light stands
  gColN = N;
  gColRing = RR;
  gColR = 2.8;
  gColTop = GY - 1.05 * GS;
  gColA0 = A0;
  gCloudBase = -9.;
  gCloudThick = gColTop + 9.5;
  gCover = 0.;
  gWind = vec2(uSwirl * 6., uTime * .3);
  gCloudGlow = .4 * uBeam + .25 * exp(-uKickT * 2.);
  // the camera, near the middle, turning slowly, looking up at the gods across the ring
  float az = uTurn + uSeed;
  vec3 ro = vec3(.8 * cos(az + 3.1416), 2.2 + .3 * sin(uTime * .1), .8 * sin(az + 3.1416));
  vec3 ta = vec3(RR * cos(az), GY - .6 + .6 * sin(uTime * .07), RR * sin(az));
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, 1.35));

  float t = .1, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .0015 * t) { tt = t; break; }
    t += d;
    if (t > 60.) break;
  }
  vec3 col = heavenO(ro, rd, 200.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat, k = gK;
    vec3 n = calcN(p, .004 * tt);
    float ao = 1.;
    for (int i = 0; i < 4; i++) {
      float hd = .06 + .25 * float(i);
      ao -= max(hd - map(p + n * hd), 0.) * (.5 / (hd + .5));
    }
    ao = clamp(ao, 0., 1.);
    if (mat > 1.5) {
      // ---- the tholos: marble, the fluting fading with the distance
      col = lightO(marbleO(p * .2) * .96, n, rd, ao);
    } else if (mat < .5) {
      // ---- a god: marble, a little of the sky in its face, lit from within on the drop
      vec3 q = godFrame(p, k);
      col = lightO(marbleO(q), n, rd, ao);
      float skin = .45 * skinMask(q);
      if (skin > .01) col = mix(col, skinSky(q, 1.25) * (.55 + .32 * dot(col, vec3(.3, .5, .2))) * 1.25, skin);
      float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 2.);
      col += (uAccent * 1.2 + uInk * .3) * uInner * (.25 + .5 * fre) * (.6 + .4 * ao);
    } else {
      // ---- a column of cloud: white where the light falls, blue-grey in its folds, silver at its edges
      float key = clamp(dot(n, gKey) * .6 + .4, 0., 1.);
      vec3 c = mix(uPal1 * .85, uInk * 2.25, smoothstep(.05, .9, key * (.5 + .5 * ao)));
      float rim = pow(1. - clamp(dot(n, -rd), 0., 1.), 3.);
      c += (uAccent * .8 + uInk * .3) * rim * .6;
      col = c;
    }
    col = mix(col, skyO(rd), 1. - exp(-tt * .006));
  }
  // the columns of cloud, before the gods and the far sea
  if (uCloudReady > .5) {
    vec4 cl = cloudsO(ro, rd, tt > 0. ? tt : 90.);
    col = col * cl.a + cl.rgb;
  }
  // ---- the ring of light under their chins: a thread of light, and on every kick a light running once round it
  float yr = GY - .95 * GS;
  if (abs(rd.y) > 1e-3) {
    float tr = (yr - ro.y) / rd.y;
    if (tr > 0. && (tt < 0. || tr < tt)) {
      vec3 pr = ro + rd * tr;
      float dr = abs(length(pr.xz) - RR);
      float ang = atan(pr.z, pr.x);
      float run = mod(uKicks, 2.) < .5 ? 1. : -1.;
      float head = A0 + run * uKickT * 7.;
      float dA = abs(mod(ang - head + 3.1416, 6.2831853) - 3.1416);
      float spot = exp(-dA * dA * 6.) * exp(-uKickT * 1.6);
      col += (uAccent * 1.4 + uInk * .4) * exp(-dr * (6. / (1. + .02 * tr))) * (.12 + .5 * uCharge + 2.5 * spot);
    }
  }
  // ---- the column of light from the zenith, in the ring, before the gods we face
  if (uBeam > .01) {
    // distance from the ray to the column's vertical axis, and where along the ray it passes closest
    vec2 o = ro.xz - 6. * vec2(cos(az), sin(az)), d2 = rd.xz;
    float tc = -dot(o, d2) / max(dot(d2, d2), 1e-5);
    float dc = length(o + d2 * tc);
    if (tc > 0. && (tt < 0. || tc < tt)) {
      float yc = ro.y + rd.y * tc;
      float beam = exp(-dc * dc * 1.1) * smoothstep(-6., 2., yc);
      col += (uAccent * 1.2 + uInk * .6) * beam * uBeam;
    }
  }
  float rays = .3 + .4 * uCharge + .3 * uBeat + .8 * uDrop;
  col = withShafts(col, ro, rd, tt > 0. ? tt : 50., rays);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
