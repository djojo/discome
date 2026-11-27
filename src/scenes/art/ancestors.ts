import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { HEAD_GLSL, headsOf, headUniforms, setHead, type HeadId } from "./heads";
import { AURORA_GLSL, auroraGlass } from "./aurora.glsl";
import { Procession } from "./casting";

/**
 * The ancestors met on the way, one after another: animal spirits, faces of old (portraits of Rome and Greece, their
 * archetypes, the sculptures of the world) and now and then a mask of the theatre. Never the same one twice in view,
 * and none comes back before MEMORY others have passed. The first ones load with the world.
 */
const FIRST: HeadId[] = ["loup", "cerf", "faucon", "hibou", "moai", "athena", "tragedie", "panthere", "elephant"];
const POOL: HeadId[] = [
  ...headsOf("animal"),
  ...headsOf("visage").filter((h) => h !== "humain"),
  ...headsOf("archetype").filter((h) => h !== "patron"),
  ...headsOf("sculpture"),
  ...headsOf("masque"),
];
/** Their head slots (the first is HEAD_GLSL's own): the ones on the way, and the next ones loading. */
const SLOTS = ["", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
/** One ancestor every STEP along the way, on alternate sides; AHEAD of them in view beyond the one we are passing. */
const STEP = 4.5;
const AHEAD = 8;
const MEMORY = 16;
const procession = new Procession(POOL, SLOTS.length, MEMORY, FIRST);

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Les Ancêtres: our spirit travels through space and is judged by the ancestors, the animal spirits and faces of old
 * (portraits of Rome and Greece, an emperor, Athena, a Moai…), a mask of the theatre now and then, all of aurora glass
 * like the spirit of the fire: translucent, lit from within, curtains of light rising through them, their necks
 * dissolving into a veil. They come one after another on either side of the way, above us, never the same one twice in
 * view nor back soon after (the procession, casting.ts), every one of them looking at us: their heads follow us as we
 * pass, looking down on us; now and then a great elder hangs high over the way. All round, the aurora's veils on every
 * side (no ground, no horizon), stars, a faint band of the galaxy. The shared flight carries us: slow in the groove,
 * quicker through the build, a surge on the drop. On the kick a wave of light runs up the veils and through the heads;
 * through the build they light up from within; on the drop the aurora blazes and the ancestors close in round us for
 * two bars; in the breakdown a slow drift, the heads paler.
 */
export const ancestors = defineShaderScene({
  id: "canyon-ancestors",
  name: "Les Ancêtres",
  energy: "calm",
  hdr: true,
  renderScale: 0.65,
  flight: { cruise: 1.6 },
  heads: FIRST,
  description:
    "Notre esprit voyage dans l'espace, jugé par les ancêtres (esprits animaux, portraits antiques, Athéna, un empereur, un Moai, parfois un masque de théâtre) en verre d'aurore boréale : ils se succèdent de part et d'autre de la route, au-dessus de nous, jamais deux fois le même en vue, et ne reviennent pas avant longtemps ; ils nous regardent tous et nous suivent des yeux. Au drop, l'aurore s'embrase et ils se resserrent autour de nous.",
  params: [paletteParam("peyote"), ...flightParams()],
  uniforms: () => ({
    ...Object.assign({}, ...SLOTS.map((s) => headUniforms(s))),
    uKickT: { value: 9 },
    uCharge: { value: 0 },
    uBlaze: { value: 0 },
    // the drop: the ancestors close in round us (0..1); the breakdown: paler
    uGather: { value: 0 },
    uPale: { value: 0 },
    // CPU side only: seconds since the drop
    uDropT: { value: 99 },
    // the way: the position we are passing, and the head slot of each one in view (behind us to AHEAD on), -1 nobody
    uM0: { value: 0 },
    uWho: { value: new Array<number>(AHEAD + 2).fill(-1) },
  }),
  update(u, f, _p, dt, ctx) {
    const m0 = Math.floor((ctx.flight?.travel ?? 0) / STEP);
    u.uM0.value = m0;
    const who = procession.view(u, m0 - 1, m0 + AHEAD);
    (u.uWho.value as number[]).splice(0, who.length, ...who);
    procession.heads.forEach((id, i) => setHead(u, id, SLOTS[i]));
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    const charge = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = (u.uCharge.value as number) + (charge - (u.uCharge.value as number)) * (1 - Math.exp(-dt * 2));
    u.uBlaze.value = f.drop ? 1 : (u.uBlaze.value as number) * Math.exp(-dt / (bar * 1.5));
    // they close in round us within half a bar of the drop, hold two bars, draw back over two
    const t = (u.uDropT.value = f.drop ? 0 : (u.uDropT.value as number) + dt);
    u.uGather.value = t < bar * 2.5 ? smooth(t / (bar * 0.5)) : 1 - smooth((t - bar * 2.5) / (bar * 2));
    const pale = f.section === "breakdown" ? 1 : 0;
    u.uPale.value = (u.uPale.value as number) + (pale - (u.uPale.value as number)) * (1 - Math.exp(-dt * 0.6));
  },
  fragment: /* glsl */ `
uniform float uKickT;
uniform float uCharge;
uniform float uBlaze;
uniform float uGather;
uniform float uPale;
uniform float uM0;
uniform float uWho[${AHEAD + 2}];
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
${AURORA_GLSL}

// ---- the ancestor being drawn: its centre, scale, turn (yaw, then pitch: its gaze), slot, the top of its bound
vec3 gC;
float gS;
float gYaw;
float gPitch;
float gSlot;
float gTop;
vec3 ancHead(vec3 p) {
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
float ancD(vec3 p) {
  vec3 h = ancHead(p);
  // (a bound only: from under the neck to the top of its grid, a crest or antlers)
  float b = sdBox(h - vec3(0., .5 * gTop - .575, 0.), vec3(.95, .5 * gTop + .575, .95));
  if (b > .2) return b * gS;
  // under the neck it is cut away, out of sight in the veil it dissolves into
  return max(slotD(h), -.95 - h.y) * gS;
}
${auroraGlass("ancGlass", "ancD", "ancHead")}

const float STEP = ${STEP.toFixed(1)};

void main() {
  gAuroraKick = uKickT;
  gAuroraCharge = uCharge;
  gAuroraBlaze = uBlaze;
  gAuroraCore = .04 + .12 * uBlaze + .06 * uCharge;
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  // the flight: along the way (-z), drifting, banking into its turns, diving on the drop
  vec3 ro = vec3(uSway * 1.2 + .6 * sin(uTravel * .03), .6 * sin(uTravel * .021) + uDive * .8, -uTravel);
  vec3 ta = ro + vec3(.35 * sin(uTravel * .017) + uSway * .4, .15 * sin(uTravel * .013) - uDive * .3, -5.);
  uv *= rot(uBank * .8);
  uv += flightShake();
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, flightFocal(1.5)));
  float dim = 1. - .45 * uPale;
  vec3 col = auroraSpace(rd) * dim;
  // the ancestors, from the farthest to the nearest (and the one just behind us): each lets what lies behind show
  // through it. One every STEP along the way, on alternate sides, above us; now and then a great elder high over the
  // way. Who stands where is the procession's (uWho: a head slot, or nobody).
  float gather = 1. - .35 * uGather;
  for (int k = ${AHEAD}; k >= -1; k--) {
    float slot = uWho[k + 1];
    if (slot < -.5) continue;
    float ci = uM0 + float(k);
    float h1 = hash12(vec2(ci, 1.)), h2 = hash12(vec2(ci, 5.)), h3 = hash12(vec2(ci, 9.));
    float h4 = hash12(vec2(ci, 13.)), h5 = hash12(vec2(ci, 17.));
    if (h3 > .14) {
      float sx = mod(ci, 2.) < .5 ? -1. : 1.;
      gS = 1.3 + 1.2 * h1;
      gC = vec3(sx * (3.1 + 2.2 * h2) * gather, (.5 + 2.6 * h4) * gather + .25 * sin(uTime * .3 + ci), -(ci * STEP + .5 * STEP * h5));
    } else {
      // the elder over the way
      gS = 3. + 1.2 * h1;
      gC = vec3((h2 - .5) * 3., (5.5 + 2. * h4) * gather, -(ci * STEP + .25 * STEP));
    }
    // it comes out of the distance (it comes into view AHEAD steps away)
    float far = 1. - smoothstep(float(${AHEAD - 1}) * STEP - 4., float(${AHEAD}) * STEP, length(gC - ro));
    if (far <= 0.) continue;
    gSlot = slot;
    gTop = max(1.35, slotTop() + .05);
    // every one of them looks at us: the head follows us as we pass, bowed toward us; a slight sway of its own
    // (ancHead turns by multiplying on the right, h.xz *= rot(a): its face points to (sin yaw, cos yaw) on xz, and
    // up by sin pitch)
    vec3 dv = ro - gC;
    gYaw = atan(dv.x, dv.z) + .08 * sin(uTime * .4 + ci * 2.1);
    gPitch = clamp(asin(dv.y / max(length(dv), 1e-3)), -.6, .6) + .04 * sin(uTime * .33 + ci);
    vec3 oc = ro - gC;
    float R = 1.7 * gS;
    float b = dot(oc, rd), hh = b * b - dot(oc, oc) + R * R;
    if (hh < 0.) continue;
    hh = sqrt(hh);
    float t1 = -b + hh;
    if (t1 < 0.) continue;
    float t = max(-b - hh, .02);
    float ts = -1.;
    for (int i = 0; i < 56; i++) {
      float d = ancD(ro + rd * t);
      if (d < .0015 * t) {
        ts = t;
        break;
      }
      t += d;
      if (t > t1) break;
    }
    if (ts < 0.) continue;
    vec3 p = ro + rd * ts;
    const vec2 e = vec2(1, -1);
    float ee = .004 * gS;
    vec3 n = normalize(e.xyy * ancD(p + e.xyy * ee) + e.yyx * ancD(p + e.yyx * ee) + e.yxy * ancD(p + e.yxy * ee) + e.xxx * ancD(p + e.xxx * ee));
    vec3 h = ancHead(p);
    float fre = pow(clamp(1. - abs(dot(n, -rd)), 0., 1.), 2.);
    vec4 g = ancGlass(ro, rd, ts, gS);
    vec3 c = col * g.a + (g.rgb + auroraRim(h, fre)) * dim;
    // it dissolves into a veil below the neck, and into the distance
    col = mix(col, c, smoothstep(-.9, -.15, h.y) * exp(-ts * .02) * far);
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
