import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { HEAD_GLSL, headsOf, headUniforms, setHead, type HeadId } from "./heads";
import { SKY_GLSL } from "./sky.glsl";
import { wantCloudNoise } from "./cloudnoise";
import { Procession } from "./casting";

/**
 * The statues of the hall: the portraits of Rome and Greece and their archetypes, one after another along the walk,
 * never the same one twice in view nor back before MEMORY others have passed. The first ones load with the world.
 */
// (portraits the Assembly's gods already load: the world downloads nothing more for them)
const FIRST: HeadId[] = ["marcaurele", "minatia", "hera"];
const POOL: HeadId[] = [...headsOf("visage"), ...headsOf("archetype")].filter((h) => h !== "humain" && h !== "patron");
const SLOTS = ["", "B", "C", "D", "E", "F", "G", "H"];
/** One statue every STEP along the walk, on alternate sides, far apart; AHEAD of them in view. */
const STEP = 9;
const AHEAD = 5;
const MEMORY = 8;
const procession = new Procession(POOL, SLOTS.length, MEMORY, FIRST);

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * La Salle du temps: a white floor without end, melting into the white sky with no horizon; busts of Antiquity on tall
 * plinths stand far apart from one another, perfectly still, and we walk slowly among them. Time passes round them as
 * in a time-lapse: their shadows wheel round them with a sun we never see, faster and faster through the build, the
 * shadows of clouds race over the floor, the light sweeps over the marble. On the drop time stops: the shadows freeze,
 * a white flash, two bars of stillness, then it all slowly starts again.
 */
export const timeHall = defineShaderScene({
  id: "olympe-time",
  name: "La Salle du temps",
  energy: "medium",
  hdr: true,
  renderScale: 0.75,
  heads: FIRST,
  description:
    "Un sol blanc infini qui se fond dans le ciel ; des bustes antiques sur de hauts socles, immobiles, très loin les uns des autres. Le temps passe en accéléré : leurs ombres tournent, de plus en plus vite à la montée, celles des nuages filent. Au drop, le temps s'arrête : les ombres se figent, un flash blanc, puis tout repart lentement.",
  params: [paletteParam("olympe")],
  uniforms: () => ({
    ...wantCloudNoise(),
    ...Object.assign({}, ...SLOTS.map((s) => headUniforms(s))),
    uM0: { value: 0 },
    uWho: { value: new Array<number>(AHEAD + 2).fill(-1) },
    uWalk: { value: 0 },
    uClock: { value: 1.3 },
    uFlash: { value: 0 },
    uKickT: { value: 9 },
    // CPU side only
    uDropT: { value: 99 },
  }),
  update(u, f, _p, dt) {
    // the walk: slow, its own pace
    u.uWalk.value = (u.uWalk.value as number) + dt * 0.55;
    const m0 = Math.floor((u.uWalk.value as number) / STEP);
    u.uM0.value = m0;
    const who = procession.view(u, m0 - 1, m0 + AHEAD);
    (u.uWho.value as number[]).splice(0, who.length, ...who);
    procession.heads.forEach((id, i) => setHead(u, id, SLOTS[i]));
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // the time-lapse: the sun wheels slowly, faster and faster through the build; the drop stops it for two bars,
    // then it starts again over four
    if (f.drop) u.uDropT.value = 0;
    const t = (u.uDropT.value as number) + dt;
    u.uDropT.value = t;
    const speed = 0.07 + (f.section === "build" ? 2.2 * f.buildProgress * f.buildProgress : 0);
    const held = t < bar * 2 ? 0 : smooth((t - bar * 2) / (bar * 4));
    u.uClock.value = (u.uClock.value as number) + dt * speed * held;
    u.uFlash.value = t < bar * 2 ? Math.exp(-t / (bar * 0.35)) * (f.safeFlash ? 0.4 : 1) : 0;
  },
  fragment: /* glsl */ `
uniform float uM0;
uniform float uWho[${AHEAD + 2}];
uniform float uWalk;
uniform float uClock;
uniform float uFlash;
uniform float uKickT;
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
const float STEP = ${STEP.toFixed(1)};
const float S = .8;       // the busts' scale
const float CUT = -.82;   // cut flat under the neck, on the plinth

// ---- the statue being drawn: its plinth's foot (x, z), the plinth's height, its turn, slot
vec2 gP;
float gH;
float gYaw;
float gSlot;
float slotD(vec3 h) {
  if (gSlot < .5) return headD(h);
${SLOTS.slice(1)
  .map(
    (s, i) =>
      `  ${i < SLOTS.length - 2 ? `if (gSlot < ${i + 1.5}) ` : ""}return headSlot(uHeadTex${s}, uHeadOn${s}, uHeadMin${s}, uHeadSize${s}, uHeadRelief${s}, h);`,
  )
  .join("\n")}
}
/** The bust's own frame. */
vec3 bustFrame(vec3 p) {
  vec3 h = (p - vec3(gP.x, gH - CUT * S, gP.y)) / S;
  h.xz *= rot(gYaw);
  return h;
}
/** The plinth: a tall square shaft with a cap and a base. */
float plinthD(vec3 p) {
  vec3 q = p - vec3(gP.x, 0., gP.y);
  float shaft = sdBox(q - vec3(0., gH * .5, 0.), vec3(.32, gH * .5, .32));
  float cap = sdBox(q - vec3(0., gH - .05, 0.), vec3(.4, .05, .4)) - .01;
  float base = sdBox(q - vec3(0., .07, 0.), vec3(.42, .07, .42)) - .01;
  return min(shaft, min(cap, base));
}
float statueD(vec3 p, out float mat) {
  float pl = plinthD(p);
  vec3 h = bustFrame(p);
  float b = sdBox(h - vec3(0., .1, 0.), vec3(.85, .95, .92));
  float bu = b > .15 ? b * S : max(slotD(h), CUT - h.y) * S;
  // a short rod holds the busts cut higher than the others (it hides inside a neck)
  bu = min(bu, sdCapsule(h, vec3(0., CUT, -.05), vec3(0., -.3, -.05), .05) * S);
  mat = bu < pl ? 0. : 1.;
  return min(pl, bu);
}

/** Place the statue of position ci: alternate sides, far apart, a height and a turn of its own. */
void place(float ci) {
  float h1 = hash12(vec2(ci, 1.)), h2 = hash12(vec2(ci, 5.)), h3 = hash12(vec2(ci, 9.));
  float side = mod(ci, 2.) < .5 ? -1. : 1.;
  gP = vec2(side * (2.6 + 7. * h1 * h1), -(ci * STEP + .5 * STEP * h2));
  gH = 1.7 + .8 * h3;
  // it looks over the way, toward where we come from
  gYaw = -side * (.35 + .5 * h2);
}

/** For the shadows on the floor: every statue in view, as boxes and an ellipsoid (cheap, soft enough). */
float shadowD(vec3 p) {
  float d = 1e3;
  for (int k = ${AHEAD}; k >= -1; k--) {
    if (uWho[k + 1] < -.5) continue;
    place(uM0 + float(k));
    vec3 q = p - vec3(gP.x, 0., gP.y);
    d = min(d, sdBox(q - vec3(0., gH * .5, 0.), vec3(.36, gH * .5, .36)));
    d = min(d, sdEllipsoid(q - vec3(0., gH + .62, 0.), vec3(.55, .7, .55)));
  }
  return d;
}

float floorShadow(vec3 p) {
  float res = 1., t = .05;
  for (int i = 0; i < 26; i++) {
    float d = shadowD(p + gSun * t);
    res = min(res, 10. * d / t);
    if (res < .02) break;
    t += clamp(d, .08, 1.2);
    if (t > 30.) break;
  }
  return clamp(res, 0., 1.);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  // the sun we never see: it wheels round, low, with the time-lapse
  gSun = normalize(vec3(cos(uClock), .32 + .08 * sin(uClock * .37), sin(uClock)));
  gKey = normalize(gSun + vec3(0., .5, 0.));
  // the walk: slowly forward, a little sway, the gaze lifting toward the statues
  vec3 ro = vec3(1.2 * sin(uWalk * .045 + uSeed), 1.6, -uWalk);
  vec3 ta = ro + vec3(2.2 * sin(uWalk * .03 + uSeed * 2.), .9 + .4 * sin(uWalk * .021), -8.);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, 1.7));

  // ---- the statues: the nearest hit among those in view
  float tBest = 1e4, mBest = 0.;
  vec2 bP = vec2(0.);
  float bH = 2., bYaw = 0., bSlot = 0.;
  for (int k = ${AHEAD}; k >= -1; k--) {
    float slot = uWho[k + 1];
    if (slot < -.5) continue;
    place(uM0 + float(k));
    gSlot = slot;
    // a bound round plinth and bust
    vec3 c = vec3(gP.x, (gH + 1.4) * .5, gP.y);
    vec3 oc = ro - c;
    float R = (gH + 1.4) * .5 + .3;
    float b = dot(oc, rd), hh = b * b - dot(oc, oc) + R * R;
    if (hh < 0.) continue;
    hh = sqrt(hh);
    float t1 = -b + hh;
    if (t1 < 0.) continue;
    float t = max(-b - hh, .05);
    for (int i = 0; i < 72; i++) {
      float m;
      float d = statueD(ro + rd * t, m);
      if (d < .0012 * t) {
        if (t < tBest) { tBest = t; mBest = m; bP = gP; bH = gH; bYaw = gYaw; bSlot = gSlot; }
        break;
      }
      t += d;
      if (t > min(t1, tBest)) break;
    }
  }
  float tFloor = rd.y < -1e-4 ? -ro.y / rd.y : 1e4;

  // high clouds racing over the hall with the time-lapse; their shadows run over the floor
  gCloudBase = 26.;
  gCloudThick = 7.;
  gCover = .34;
  gCloudUnder = 1.25;
  gWind = vec2(uClock * 70. + uSeed * 30., uClock * 28.);
  vec3 col = heavenV(ro, rd, 500.);
  if (tFloor < tBest && tFloor < 1e3) {
    vec3 p = ro + rd * tFloor;
    float sh = floorShadow(p);
    float lit = sh * mix(.25, 1., cloudShadow(p));
    vec3 shade = uPal1 * .62;
    vec3 c = mix(shade, uInk * (2.15 + .18 * exp(-uKickT * 3.)), lit);
    // far away, and toward the horizon, the floor melts into the sky: no line where they meet
    col = mix(c, col, max(1. - exp(-tFloor * .011), smoothstep(-.09, -.01, rd.y)));
  } else if (tBest < 1e3) {
    gP = bP; gH = bH; gYaw = bYaw; gSlot = bSlot;
    vec3 p = ro + rd * tBest;
    const vec2 e = vec2(1, -1);
    float m;
    const float ee = .0025;
    vec3 n = normalize(e.xyy * statueD(p + e.xyy * ee, m) + e.yyx * statueD(p + e.yyx * ee, m) + e.yxy * statueD(p + e.yxy * ee, m) + e.xxx * statueD(p + e.xxx * ee, m));
    float occ = 0., sca = 1.;
    for (int i = 0; i < 4; i++) {
      float hd = .02 + .08 * float(i);
      occ += (hd - statueD(p + n * hd, m)) * sca;
      sca *= .8;
    }
    float ao = clamp(1. - 3. * occ, 0., 1.);
    // the sun's own light on it, cut where its body hides it (a cheap self-shadow: the floor's caster test)
    vec3 q = bustFrame(p);
    col = lightO(mBest < .5 ? marbleO(q) : marbleO(p * .7) * .96, n, rd, ao);
    col *= mix(.78, 1., cloudShadow(p));
    col = mix(col, skyO(rd), 1. - exp(-tBest * .011));
  }
  // rays wheeling with the sun
  col = withShafts(col, ro, rd, min(min(tBest, tFloor), 40.), .45 + .3 * exp(-uKickT * 3.));
  // the drop: time stops in a white flash
  col = mix(col, uInk * 3., uFlash);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
