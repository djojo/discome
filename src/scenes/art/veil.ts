import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { HEAD_GLSL, headUniforms, setHead, type HeadId } from "./heads";
import { SKY_GLSL } from "./sky.glsl";
import { flockStep, olympeUniforms, olympeWarp } from "./olympe";
import { Casting, pick } from "./casting";

/** The god behind the veil: one of the assembly's (already loaded with the world), another on each passage. */
const GODS: HeadId[] = ["hera", "athena", "dionysos", "homere", "empereur", "imperatrice"];
const casting = new Casting(["athena"], (avoid) => pick(GODS, 1, avoid));
const passes = new WeakMap<object, { seed: number; head: HeadId }>();

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Le Voile: the colossal head of a god floats above the clouds, its back to a low sun; a vast white veil drifts before
 * it in the wind, translucent, the light coming through it, its folds rolling slowly; it hides the face and uncovers
 * it as it drifts. On the kick a ripple runs across it. On the drop the wind carries it off and the face appears in
 * the light; through the breakdown it comes back.
 */
export const veil = defineShaderScene({
  id: "olympe-veil",
  name: "Le Voile",
  energy: "calm",
  hdr: true,
  timeWarp: olympeWarp,
  renderScale: 0.75,
  heads: ["athena"],
  description:
    "La tête colossale d'un dieu au-dessus des nuages ; devant elle, un immense voile blanc translucide dérive dans le vent, la lumière le traverse, il cache puis découvre le visage. Au drop, le vent l'emporte et le visage apparaît dans la lumière ; il revient pendant le break.",
  params: [paletteParam("olympe")],
  uniforms: () => ({
    ...olympeUniforms(),
    ...headUniforms(),
    uWander: { value: 0 },
    uGone: { value: 0 },
    uKickT: { value: 9 },
    uReveal: { value: 0 },
  }),
  update(u, f, _p, dt, ctx) {
    const seed = u.uSeed.value as number;
    let pass = passes.get(u);
    if (!pass || pass.seed !== seed) passes.set(u, (pass = { seed, head: casting.pass()[0] }));
    setHead(u, pass.head);
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uKickT.value = f.beat ? 0 : (u.uKickT.value as number) + dt;
    // the veil drifts back and forth before the face at its own pace
    u.uWander.value = (u.uWander.value as number) + ctx.dt * 0.05;
    flockStep(u, f, ctx.dt, () => {
      const sd = Math.random() < 0.5 ? -1 : 1;
      return { a: [sd * 30, 3, -10], b: [-sd * 30, 5, -16], r: 3.5, size: 1.1, dur: 11 };
    });
    // the drop: the wind carries it off over a bar; it comes back through the breakdown, over four
    const g = u.uGone.value as number;
    const goal = f.section === "drop" ? 1 : f.section === "breakdown" || f.section === "build" ? 0 : g;
    const rate = goal > g ? 1 / bar : 1 / (bar * 4);
    u.uGone.value = goal > g ? Math.min(goal, g + rate * dt) : Math.max(goal, g - rate * dt);
    if (f.drop) u.uGone.value = Math.max(g, 0.01);
    // the face lit as it is uncovered
    u.uReveal.value = smooth(u.uGone.value as number);
  },
  fragment: /* glsl */ `
uniform float uWander;
uniform float uGone;
uniform float uKickT;
uniform float uReveal;
${ART_LIB}
${HEAD_GLSL}
${SKY_GLSL}
const float GS = 6.;            // the god's scale
const vec3 GC = vec3(0., 3., 0.);
const float ZV = 7.;            // the veil's plane, before the face
const vec2 VS = vec2(6.5, 5.);  // its half size

vec3 godFrame(vec3 p) { return (p - GC) / GS; }
float godD(vec3 p) {
  vec3 h = godFrame(p);
  float b = sdBox(h - vec3(0., .1, 0.), vec3(.85, 1., .92));
  if (b > .2) return b * GS;
  return max(headD(h), -.75 - h.y) * GS;
}

/** Where the veil is (its centre in its plane), and how it folds: z off its plane at (x, y), its own coordinates. */
vec2 veilCentre() {
  vec2 c = vec2(7.5 * sin(uWander * 1.9 + uSeed) , 2.5 + 1.2 * sin(uWander * 1.3 + uSeed * 2.));
  // the wind carries it off, up and away
  return c + vec2(uGone * uGone * 34., uGone * uGone * 18.);
}
float veilW(vec2 q) {
  float t = uTime;
  // the edge away from the wind flutters most
  float free = smoothstep(-VS.x, VS.x, q.x) * .7 + .3;
  float w = 1.3 * sin(q.x * .5 + t * .7) * sin(q.y * .42 + t * .45)
    + .7 * sin(q.x * 1.15 - t * 1.1 + q.y * .45)
    + .3 * sin(q.y * 2. + t * 1.6 + q.x * .6);
  // a ripple running across it on the kick
  float r = uKickT * 9. - VS.x;
  w += .5 * exp(-pow(q.x - r, 2.) * .15) * exp(-uKickT * 1.5);
  return w * free * (1. + 1.5 * uGone);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float side = fract(uSeed * .37) < .5 ? -1. : 1.;
  gSun = normalize(vec3(.4 * side, sunY(), -1.));
  gKey = normalize(vec3(.4 * side, .65, .6));
  gSeaY = -14.;
  gCloudBase = -16.;
  gCloudThick = 12.;
  gCover = .55;
  gWind = vec2(uTime * .8 + uSeed * 40., uTime * .25);
  // the camera before the god, drifting a little, the face filling the frame
  vec3 ro = vec3(2.5 * sin(uTime * .03 + uSeed), 3.4 + .8 * sin(uTime * .021), 30.);
  vec3 rd = lookAt(ro, vec3(0., 3.6, 0.)) * normalize(vec3(uv, 1.9));

  // ---- the god
  float t = 1., tt = -1.;
  for (int i = 0; i < 90; i++) {
    float d = godD(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d;
    if (t > 60.) break;
  }
  vec3 col = heavenV(ro, rd, 300.);
  if (tt > 0.) {
    vec3 p = ro + rd * tt;
    const vec2 e = vec2(1, -1);
    float ee = .003 * GS;
    vec3 n = normalize(e.xyy * godD(p + e.xyy * ee) + e.yyx * godD(p + e.yyx * ee) + e.yxy * godD(p + e.yxy * ee) + e.xxx * godD(p + e.xxx * ee));
    float ao = 1.;
    for (int i = 0; i < 4; i++) {
      float hd = (.02 + .08 * float(i)) * GS;
      ao -= max(hd - godD(p + n * hd), 0.) / GS * 2.5;
    }
    ao = clamp(ao, 0., 1.);
    vec3 q = godFrame(p);
    col = lightO(marbleO(q), n, rd, ao);
    float skin = .55 * skinMask(q);
    if (skin > .01) col = mix(col, skinSky(q, 1.25) * (.55 + .32 * dot(col, vec3(.3, .5, .2))) * 1.25, skin);
    // uncovered, the face is in the light
    float fre = pow(1. - clamp(dot(n, -rd), 0., 1.), 2.);
    col += (uAccent * 1.1 + uInk * .3) * uReveal * (.25 + .6 * fre) * exp(-uGone * .2);
    col = mix(col, skyO(rd), 1. - exp(-tt * .004));
  }
  // (the doves fly behind the god, and the veil)
  vec4 dv = dovesO(ro, rd, tt > 0. ? tt : 1e4);
  col = mix(col, dv.rgb, dv.a);
  // ---- the veil: where the ray crosses its folded surface (a height field along z), before the god
  float tEnd = tt > 0. ? tt : 200.;
  vec2 vc = veilCentre();
  if (rd.z < -1e-3) {
    float ta = (ZV + 2.5 - ro.z) / rd.z, tb = (ZV - 2.5 - ro.z) / rd.z;
    float tv = -1.;
    float tp = ta;
    vec3 pp = ro + rd * ta;
    float fp = pp.z - ZV - veilW(pp.xy - vc);
    for (int i = 1; i <= 20; i++) {
      float tc = mix(ta, tb, float(i) / 20.);
      vec3 pc = ro + rd * tc;
      float fc = pc.z - ZV - veilW(pc.xy - vc);
      if (fp > 0. && fc <= 0.) { tv = mix(tp, tc, fp / (fp - fc)); break; }
      tp = tc;
      fp = fc;
    }
    if (tv > 0. && tv < tEnd) {
      vec3 p = ro + rd * tv;
      vec2 q = p.xy - vc;
      // its ragged edges
      vec2 eq = abs(q) - VS + (vnoise(vec3(q * .35, uTime * .1)) - .5) * 2.2;
      float inside = 1. - smoothstep(-.15, .15, max(eq.x, eq.y));
      if (inside > .01) {
        const float e = .05;
        float w0 = veilW(q);
        vec3 n = normalize(vec3(-(veilW(q + vec2(e, 0.)) - w0) / e, -(veilW(q + vec2(0., e)) - w0) / e, 1.));
        if (dot(n, rd) > 0.) n = -n;
        // lit from the front by the white sky, from behind by the sun through the cloth; the folds hold a little shade
        float front = clamp(dot(n, gKey) * .8 + .35, 0., 1.);
        float through = pow(max(dot(rd, gSun), 0.), 3.) * .8 + .2;
        vec3 cloth = uPal1 * .5 + uInk * 1.6 * front + (uAccent * .55 + uInk * .35) * through;
        float fold = clamp(.5 + 3. * (veilW(q + vec2(e * 6., 0.)) + veilW(q - vec2(e * 6., 0.)) - 2. * w0), 0., 1.);
        cloth *= .78 + .3 * fold;
        // the hem: a little denser where the cloth turns on itself
        float hem = 1. - smoothstep(-1.2, -.3, max(eq.x, eq.y));
        float alpha = (.55 + .3 * (1. - front) + .15 * (1. - hem)) * inside * (1. - .6 * uGone);
        col = mix(col, cloth, alpha);
      }
    }
  }
  col = withShafts(col, ro, rd, tEnd, .5 + .4 * exp(-uKickT * 3.) + 1.2 * uDrop);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
