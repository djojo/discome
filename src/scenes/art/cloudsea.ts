import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { HEAD_GLSL, headsOf, headUniforms, setHead, type HeadId } from "./heads";
import { SKY_GLSL } from "./sky.glsl";
import { Procession } from "./casting";

/**
 * The colossal heads met on the way: the portraits of Rome and Greece and their archetypes, one after another, never
 * the same one twice in view nor back before MEMORY others have passed. The first ones load with the world.
 */
const FIRST: HeadId[] = ["homere", "hera", "antinous"];
const POOL: HeadId[] = [...headsOf("visage"), ...headsOf("archetype")].filter((h) => h !== "humain" && h !== "patron");
/** Their head slots: the ones on the way, and the next ones loading. */
const SLOTS = ["", "B", "C", "D", "E", "F", "G", "H"];
/** One head every STEP along the way, on alternate sides; AHEAD of them in view beyond the one we are passing. */
const STEP = 40;
const AHEAD = 4;
const MEMORY = 8;
const procession = new Procession(POOL, SLOTS.length, MEMORY, FIRST);

/**
 * La Mer de nuages: a very slow flight just above a sea of clouds, toward a low sun. Colossal heads of Antiquity rise
 * out of it like islands, their faces turned up to the sky, one after another on either side of the way, each a
 * different one; the clouds lap round their necks. The sun's rays fan out over the sea. On the kick a wave of light
 * rolls ahead over the clouds' tops; through the build the sun climbs and its rays pierce; on the drop we plunge into
 * the clouds and come out above another sea.
 */
export const cloudSea = defineShaderScene({
  id: "olympe-sea",
  name: "La Mer de nuages",
  energy: "calm",
  hdr: true,
  renderScale: 0.75,
  flight: { cruise: 2.4, pump: 0.15 },
  heads: FIRST,
  description:
    "Un vol très lent au ras d'une mer de nuages, vers un soleil bas : des têtes antiques colossales en émergent comme des îles, le visage tourné vers le ciel, toutes différentes. Au kick, une onde de lumière roule sur les nuages ; à la montée, le soleil se lève ; au drop, on plonge dans les nuages et on ressort au-dessus d'une autre mer.",
  params: [paletteParam("olympe"), { type: "range", key: "sky", label: "Ciel dans la pierre", min: 0, max: 1, step: 0.05, default: 0.6 }, ...flightParams()],
  uniforms: () => ({
    ...Object.assign({}, ...SLOTS.map((s) => headUniforms(s))),
    uM0: { value: 0 },
    uWho: { value: new Array<number>(AHEAD + 2).fill(-1) },
    uKickT: { value: 9 },
    uRise: { value: 0 },
    uPlunge: { value: 0 },
    uSeaShift: { value: 0 },
    uAlt: { value: 3 },
    uSky: { value: 0.6 },
    // CPU side only
    uAltGoal: { value: 3 },
    uDropT: { value: 99 },
    uLastPhrase: { value: -1 },
  }),
  update(u, f, p, dt, ctx) {
    const m0 = Math.floor((ctx.flight?.travel ?? 0) / STEP);
    u.uM0.value = m0;
    const who = procession.view(u, m0 - 1, m0 + AHEAD);
    (u.uWho.value as number[]).splice(0, who.length, ...who);
    procession.heads.forEach((id, i) => setHead(u, id, SLOTS[i]));
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // the sun climbs through the build, and sinks back slowly
    const rise = f.section === "build" ? f.buildProgress : f.section === "drop" ? 0.7 : 0;
    const r = u.uRise.value as number;
    u.uRise.value = r + (rise - r) * (1 - Math.exp(-dt * (rise > r ? 1.5 : 0.1)));
    // a new height on every phrase: skimming the tops, or gliding higher
    const phrase = Math.floor(f.bar / 8);
    if (phrase !== u.uLastPhrase.value) {
      u.uLastPhrase.value = phrase;
      u.uAltGoal.value = 1.2 + Math.random() * 4.5;
    }
    u.uAlt.value = (u.uAlt.value as number) + ((u.uAltGoal.value as number) - (u.uAlt.value as number)) * (1 - Math.exp(-dt * 0.2));
    // the drop: down into the clouds over a bar, through the white, out above another sea over the next one
    if (f.drop) u.uDropT.value = 0;
    const t = (u.uDropT.value as number) + dt;
    u.uDropT.value = t;
    u.uPlunge.value = Math.sin(Math.PI * Math.min(1, t / (bar * 2))) * (f.safeFlash ? 0.7 : 1);
    // deep in the white: another sea
    if (t >= bar && t - dt < bar) u.uSeaShift.value = (u.uSeaShift.value as number) + 1;
    u.uSky.value = num(p.sky, 0.6);
  },
  fragment: /* glsl */ `
uniform float uM0;
uniform float uWho[${AHEAD + 2}];
uniform float uKickT;
uniform float uRise;
uniform float uPlunge;
uniform float uSeaShift;
uniform float uAlt;
uniform float uSky;
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
${FLIGHT_GLSL}
${SKY_GLSL}
const float STEP = ${STEP.toFixed(1)};

// ---- the colossus being drawn: its centre, scale, turn (yaw, then pitch: the face up to the sky), slot, top
vec3 gC;
float gS;
float gYaw;
float gPitch;
float gSlot;
float gTop;
vec3 colHead(vec3 p) {
  vec3 h = (p - gC) / gS;
  h.xz *= rot(gYaw);
  h.yz *= rot(gPitch);
  return h;
}
float slotTop() {
  if (gSlot < .5) return uHeadMin.y + uHeadSize.y;
${SLOTS.slice(1)
  .map((s, i) => `  ${i < SLOTS.length - 2 ? `if (gSlot < ${i + 1.5}) ` : ""}return uHeadMin${s}.y + uHeadSize${s}.y;`)
  .join("\n")}
}
float slotD(vec3 h) {
  if (gSlot < .5) return headD(h);
${SLOTS.slice(1)
  .map(
    (s, i) =>
      `  ${i < SLOTS.length - 2 ? `if (gSlot < ${i + 1.5}) ` : ""}return headSlot(uHeadTex${s}, uHeadOn${s}, uHeadMin${s}, uHeadSize${s}, uHeadRelief${s}, h);`,
  )
  .join("\n")}
}
float colD(vec3 p) {
  vec3 h = colHead(p);
  float b = sdBox(h - vec3(0., .5 * gTop - .5, 0.), vec3(.85, .5 * gTop + .5, .92));
  if (b > .2) return b * gS;
  return slotD(h) * gS;
}

/** Place the colossus of position ci (side: alternate; scale, offset, turn: its own). */
void place(float ci) {
  float h1 = hash12(vec2(ci, 1.)), h2 = hash12(vec2(ci, 5.)), h3 = hash12(vec2(ci, 9.)), h4 = hash12(vec2(ci, 13.));
  float side = mod(ci, 2.) < .5 ? -1. : 1.;
  gS = 9. + 4. * h1;
  gC = vec3(side * (15. + 8. * h2), gSeaY + 3. + (.3 + .12 * h4) * gS, -(ci * STEP + .4 * STEP * h3));
  // the face turned toward the way and up to the sky
  gYaw = -side * (.5 + .4 * h3);
  gPitch = .25 + .3 * h2;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  // toward the low sun, which climbs through the build
  float side = fract(uSeed * .37) < .5 ? -1. : 1.;
  gSun = normalize(vec3(.35 * side, .05 + .3 * uRise, -1.));
  gKey = normalize(vec3(.45 * side, .72, .5));
  gSeaY = -4.;
  gSeaDrift = vec2(uTime * .004 + uSeaShift * 3.7, uSeed * .1 + uSeaShift * 1.9);

  // the flight: along the way (-z), swaying, banking; on the drop it plunges into the clouds
  float top = gSeaY + 3.4;
  float alt = mix(top + uAlt + uDive * 1.5, gSeaY + 1., uPlunge);
  vec3 ro = vec3(uSway * 3. + 2.5 * sin(uTravel * .011), alt, -uTravel);
  vec3 ta = ro + vec3(.8 * sin(uTravel * .007) + uSway, -.6 - .8 * uPlunge, -10.);
  uv *= rot(uBank * .5);
  uv += flightShake();
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, flightFocal(1.6)));

  // ---- the colossi: the nearest hit among those in view
  float tBest = 1e4;
  vec3 bC = vec3(0.);
  float bS = 1., bYaw = 0., bPitch = 0., bSlot = 0., bTop = 1., bFar = 1.;
  for (int k = ${AHEAD}; k >= -1; k--) {
    float slot = uWho[k + 1];
    if (slot < -.5) continue;
    float ci = uM0 + float(k);
    place(ci);
    // it comes out of the distance (it comes into view AHEAD steps away)
    float far = 1. - smoothstep(float(${AHEAD}) * STEP - 30., float(${AHEAD}) * STEP + 10., length(gC - ro));
    if (far <= 0.) continue;
    gSlot = slot;
    gTop = max(1., slotTop());
    vec3 oc = ro - gC;
    float R = 1.5 * gS;
    float b = dot(oc, rd), hh = b * b - dot(oc, oc) + R * R;
    if (hh < 0.) continue;
    hh = sqrt(hh);
    float t1 = -b + hh;
    if (t1 < 0.) continue;
    float t = max(-b - hh, .05);
    for (int i = 0; i < 64; i++) {
      float d = colD(ro + rd * t);
      if (d < .002 * t) {
        if (t < tBest) {
          tBest = t;
          bC = gC; bS = gS; bYaw = gYaw; bPitch = gPitch; bSlot = gSlot; bTop = gTop; bFar = far;
        }
        break;
      }
      t += d;
      if (t > min(t1, tBest)) break;
    }
  }
  float tSea = seaHit(ro, rd, min(tBest, 260.));

  vec3 col;
  if (tSea > 0. && tSea < tBest) {
    vec3 p = ro + rd * tSea;
    col = seaShade(p, rd, tSea);
    // the kick: a wave of light rolling ahead over the tops
    float wz = ro.z - 4. - uKickT * 32.;
    float wave = exp(-pow(p.z - wz, 2.) * .02) * exp(-uKickT * 1.3) * smoothstep(.3, .9, (p.y - gSeaY) / SEA_TOP);
    col += (uAccent * 1.2 + uInk * .3) * wave * .7;
  } else if (tBest < 1e3) {
    // ---- the colossus: marble, the sky drifting in its face, the clouds lapping round its neck
    gC = bC; gS = bS; gYaw = bYaw; gPitch = bPitch; gSlot = bSlot; gTop = bTop;
    vec3 p = ro + rd * tBest;
    const vec2 e = vec2(1, -1);
    float ee = .004 * gS;
    vec3 n = normalize(e.xyy * colD(p + e.xyy * ee) + e.yyx * colD(p + e.yyx * ee) + e.yxy * colD(p + e.yxy * ee) + e.xxx * colD(p + e.xxx * ee));
    vec3 q = colHead(p);
    float occ = 0., sca = 1.;
    for (int i = 0; i < 4; i++) {
      float hd = (.02 + .1 * float(i)) * gS;
      occ += (hd - colD(p + n * hd)) / gS * sca;
      sca *= .8;
    }
    float ao = clamp(1. - 2.5 * occ, 0., 1.);
    col = lightO(marbleO(q), n, rd, ao);
    float skin = uSky * skinMask(q);
    if (skin > .01) col = mix(col, skinSky(q, 1.25) * (.55 + .32 * dot(col, vec3(.3, .5, .2))) * 1.25, skin);
    // where it sinks into the clouds, the mist takes it
    float lap = 1. - smoothstep(0., 2.5, p.y - seaH(p.xz));
    col = mix(col, uInk * 2.1, lap * .85);
    float fog = 1. - exp(-tBest * .0032);
    col = mix(col, skyO(rd), fog + (1. - bFar) * (1. - fog));
  } else {
    col = skyO(rd);
  }
  col += uAccent * sunRays(rd, 4.) * (.15 + .4 * uRise + .25 * uBeat);
  // the sun's rays over the sea, swelling as it climbs, pulsing on the kick, blazing on the drop
  float rays = .45 + .8 * uRise + .4 * uBeat + 1. * uDrop;
  col = withShafts(col, ro, rd, min(min(tBest, tSea > 0. ? tSea : 1e4), 60.), rays);
  // inside the clouds: nothing but white
  float inside = smoothstep(.6, -1.2, ro.y - seaH(ro.xz));
  col = mix(col, uInk * 2.4, inside);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
