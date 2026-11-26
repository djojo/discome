import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";
import { HEAD_GLSL, headUniforms, setHead } from "./heads";
import { AURORA_GLSL, auroraGlass } from "./aurora.glsl";

/** The ancestors met on the way: the animal spirits and faces of old, each in its own head slot. */
const ANCESTORS = ["loup", "faucon", "belier", "hibou", "moai", "nefertiti", "humain"] as const;
/** Their slots (the first is HEAD_GLSL's own). */
const SLOTS = ["", "B", "C", "D", "E", "F", "G"];

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Les Ancêtres: a voyage through space among the heads of the ancestors, the animal spirits (wolf, falcon, ram, owl)
 * and faces of old (a Moai, Nefertiti, a human face), all of aurora glass like the spirit of the fire: translucent, lit
 * from within, curtains of light rising through them, their necks dissolving into a veil. They float in a loose
 * tunnel round the way, from a little to very large, some brushing past, others lost in the distance, turning slowly
 * and looking aside. All round, the aurora's veils on every side (no ground, no horizon), stars, a faint band of the
 * galaxy. The shared flight carries us: slow in the groove, quicker through the build, a surge on the drop. On the kick
 * a wave of light runs up the veils and through the heads; through the build they light up from within; on the drop
 * the aurora blazes and the ancestors all turn their heads to us for a moment; in the breakdown a slow drift, the
 * heads paler.
 */
export const ancestors = defineShaderScene({
  id: "canyon-ancestors",
  name: "Les Ancêtres",
  energy: "calm",
  hdr: true,
  renderScale: 0.65,
  flight: { cruise: 1.6 },
  description:
    "Un voyage dans l'espace au milieu des têtes des ancêtres (esprits animaux, Moai, Néfertiti, un visage humain) en verre d'aurore boréale, translucides et lumineuses de l'intérieur, sous des voiles d'aurore tout autour. Au drop, l'aurore s'embrase et les ancêtres tournent la tête vers nous.",
  params: [paletteParam("peyote"), ...flightParams()],
  uniforms: () => ({
    ...Object.assign({}, ...SLOTS.map((s) => headUniforms(s))),
    uKickT: { value: 9 },
    uCharge: { value: 0 },
    uBlaze: { value: 0 },
    // the drop: the ancestors turn to us (0..1); the breakdown: paler
    uTurn: { value: 0 },
    uPale: { value: 0 },
    // CPU side only: seconds since the drop
    uDropT: { value: 99 },
  }),
  update(u, f, _p, dt) {
    ANCESTORS.forEach((id, i) => setHead(u, id, SLOTS[i]));
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    const charge = f.section === "build" ? f.buildProgress : 0;
    u.uCharge.value = (u.uCharge.value as number) + (charge - (u.uCharge.value as number)) * (1 - Math.exp(-dt * 2));
    u.uBlaze.value = f.drop ? 1 : (u.uBlaze.value as number) * Math.exp(-dt / (bar * 1.5));
    // they turn to us within half a bar of the drop, hold two bars, turn away again over two
    const t = (u.uDropT.value = f.drop ? 0 : (u.uDropT.value as number) + dt);
    u.uTurn.value = t < bar * 2.5 ? smooth(t / (bar * 0.5)) : 1 - smooth((t - bar * 2.5) / (bar * 2));
    const pale = f.section === "breakdown" ? 1 : 0;
    u.uPale.value = (u.uPale.value as number) + (pale - (u.uPale.value as number)) * (1 - Math.exp(-dt * 0.6));
  },
  fragment: /* glsl */ `
uniform float uKickT;
uniform float uCharge;
uniform float uBlaze;
uniform float uTurn;
uniform float uPale;
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

// ---- the ancestor being drawn: its centre, scale, turn, slot
vec3 gC;
float gS;
float gYaw;
float gSlot;
vec3 ancHead(vec3 p) {
  vec3 h = (p - gC) / gS;
  h.xz *= rot(gYaw);
  return h;
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
  // (a bound only: tall enough for a crown)
  float b = sdBox(h - vec3(0., .1, 0.), vec3(.95, 1.25, .95));
  if (b > .2) return b * gS;
  // under the neck it is cut away, out of sight in the veil it dissolves into
  return max(slotD(h), -.95 - h.y) * gS;
}
${auroraGlass("ancGlass", "ancD", "ancHead")}

const float CELL = 8.;

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
  // the ancestors, from the farthest to the nearest (and the cell just behind us): each lets what lies behind show
  // through it
  float c0 = floor(-ro.z / CELL);
  for (int k = 9; k >= -1; k--) {
    float ci = c0 + float(k);
    for (int side = 0; side < 2; side++) {
      float fs = float(side);
      float sx = fs < .5 ? -1. : 1.;
      float h1 = hash12(vec2(ci, fs + 1.)), h2 = hash12(vec2(ci, fs + 5.)), h3 = hash12(vec2(ci, fs + 9.));
      float h4 = hash12(vec2(ci, fs + 13.)), h5 = hash12(vec2(ci, fs + 17.));
      if (h3 < .2) continue;
      gS = 1.1 + 1.4 * h1 * h1;
      gC = vec3(sx * (2.4 + 3.4 * h2), -2.6 + 5.2 * h4 + .3 * sin(uTime * .3 + ci), -(ci * CELL + 3.5 * fs + 2. * h5));
      gSlot = floor(hash12(vec2(ci * 1.7, fs + 3.1)) * 6.999);
      // looking aside, turning slowly; on the drop, to us
      float aside = sx * (.35 + .5 * h3) + .25 * sin(uTime * .15 + ci * 1.3);
      float toUs = atan(gC.x - ro.x, ro.z - gC.z);
      gYaw = mix(aside, toUs, uTurn);
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
      col = mix(col, c, smoothstep(-.9, -.15, h.y) * exp(-ts * .02));
    }
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
