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
 * it in the wind, translucent, the light coming through it, its folds rolling slowly, and a lighter one nearer slides
 * over it the other way; they hide the face and uncover it as they drift. On the kick a ripple runs across them. On
 * the drop the wind tears them into ribbons that fly off, and the face appears in the light; through the breakdown
 * the ribbons come back together.
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
    "La tête colossale d'un dieu au-dessus des nuages ; devant elle, un immense voile blanc translucide dérive dans le vent, un second plus léger glisse devant lui en sens inverse, la lumière les traverse, ils cachent puis découvrent le visage. Au drop, le vent les déchire en rubans qui s'envolent et le visage apparaît dans la lumière ; les rubans se rassemblent pendant le break.",
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
    // the drop: the wind tears it into ribbons and carries them off over two bars (in the world's slow motion); they
    // come back together through the breakdown, over four
    const g = u.uGone.value as number;
    const goal = f.section === "drop" ? 1 : f.section === "breakdown" || f.section === "build" ? 0 : g;
    const rate = goal > g ? 1 / (bar * 2) : 1 / (bar * 4);
    u.uGone.value = goal > g ? Math.min(goal, g + rate * ctx.dt) : Math.max(goal, g - rate * ctx.dt);
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

// ---- the veils: two of them, one before the other, sliding over each other in the wind. The one being drawn: its
// plane (z), half size, centre, its own time, how far the wind has torn it (0 whole, 1 its ribbons gone)
float gZV = ZV;
vec2 gVS = VS;
vec2 gVC = vec2(0.);
float gPh = 0.;
float gTear = 0.;
const int NR = 7;  // the ribbons it tears into

/** How it folds: z off its plane at (x, y), its own coordinates. */
float veilW(vec2 q) {
  float t = uTime + gPh;
  // the edge away from the wind flutters most
  float free = smoothstep(-gVS.x, gVS.x, q.x) * .7 + .3;
  float w = 1.3 * sin(q.x * .5 + t * .7) * sin(q.y * .42 + t * .45)
    + .7 * sin(q.x * 1.15 - t * 1.1 + q.y * .45)
    + .3 * sin(q.y * 2. + t * 1.6 + q.x * .6);
  // a ripple running across it on the kick
  float r = uKickT * 9. - gVS.x;
  w += .5 * exp(-pow(q.x - r, 2.) * .15) * exp(-uKickT * 1.5);
  return w * free * (1. + 1.5 * gTear);
}

/** How torn ribbon j is (each in its own turn), and where the wind has taken it: offset (xy), turn, z. */
float ribbonTear(float j) { return clamp((gTear - .3 * hash12(vec2(j, gPh + 1.))) / .7, 0., 1.); }
vec3 ribbonMove(float j, out float ang) {
  float tj = ribbonTear(j);
  vec3 h = vec3(hash12(vec2(j, gPh + 2.)), hash12(vec2(j, gPh + 3.)), hash12(vec2(j, gPh + 4.)));
  ang = tj * (h.z - .5) * 2.2;
  return vec3(tj * tj * (17. + 12. * h.x), tj * tj * (7. + 12. * h.y) + sin(tj * 5. + j) * 1.5 * tj, tj * (h.x - .5) * 5.);
}
/** Which ribbon is at xy (in the plane), and the veil's own coordinates there; -1: none. Whole: one piece. */
float ribbonAt(vec2 xy, out vec2 q, out float zo) {
  zo = 0.;
  q = xy - gVC;
  if (gTear <= 0.) return 0.;
  float w = 2. * gVS.x / float(NR);
  for (int j = 0; j < NR; j++) {
    float fj = float(j), ang;
    vec3 o = ribbonMove(fj, ang);
    float cx = -gVS.x + (fj + .5) * w;
    vec2 r = (xy - gVC - o.xy - vec2(cx, 0.)) * rot(ang);
    if (abs(r.x) < w * .5 + .45) { q = r + vec2(cx, 0.); zo = o.z; return fj; }
  }
  return -1.;
}

/** A veil between the eye and tEnd: its cloth (rgb), how much it hides (a); opacity: the layer's own. */
vec4 veilO(vec3 ro, vec3 rd, float tEnd, float opacity) {
  if (rd.z > -1e-3) return vec4(0.);
  float ta = (gZV + 4. - ro.z) / rd.z, tb = (gZV - 4. - ro.z) / rd.z;
  float tv = -1., tp = ta, zo;
  vec2 q;
  vec3 pp = ro + rd * ta;
  float j = ribbonAt(pp.xy, q, zo);
  float fp = j < 0. ? 1. : pp.z - gZV - zo - veilW(q);
  for (int i = 1; i <= 24; i++) {
    float tc = mix(ta, tb, float(i) / 24.);
    vec3 pc = ro + rd * tc;
    j = ribbonAt(pc.xy, q, zo);
    float fc = j < 0. ? 1. : pc.z - gZV - zo - veilW(q);
    if (fp > 0. && fc <= 0.) { tv = mix(tp, tc, fp / (fp - fc)); break; }
    tp = tc;
    fp = fc;
  }
  if (tv <= 0. || tv >= tEnd) return vec4(0.);
  vec3 p = ro + rd * tv;
  j = ribbonAt(p.xy, q, zo);
  if (j < 0.) return vec4(0.);
  // its ragged edges; torn, the ribbon's own frayed edges
  vec2 eq = abs(q) - gVS + (vnoise(vec3(q * .35, uTime * .1 + gPh)) - .5) * 2.2;
  float edge = max(eq.x, eq.y);
  float tj = ribbonTear(j);
  if (gTear > 0.) {
    float w = 2. * gVS.x / float(NR);
    float rx = abs(q.x - (-gVS.x + (j + .5) * w)) - w * .5 + .35 * tj - .3 * (1. - smoothstep(0., .1, tj));
    edge = max(edge, rx + (vnoise(vec3(q.y * 1.7, j * 3., gPh)) - .5) * .6 * tj);
  }
  float inside = 1. - smoothstep(-.15, .15, edge);
  if (inside <= .01) return vec4(0.);
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
  float hem = 1. - smoothstep(-1.2, -.3, edge);
  float alpha = (.55 + .3 * (1. - front) + .15 * (1. - hem)) * inside * (1. - .5 * tj) * opacity;
  return vec4(cloth, alpha);
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
  // ---- the veils: the great one before the face, and a lighter one nearer, sliding the other way; on the drop the
  // wind tears them into ribbons that fly off, and the ribbons come back together through the breakdown
  float tEnd = tt > 0. ? tt : 200.;
  gZV = ZV;
  gVS = VS;
  gVC = vec2(7.5 * sin(uWander * 1.9 + uSeed), 2.5 + 1.2 * sin(uWander * 1.3 + uSeed * 2.));
  gPh = 0.;
  gTear = uGone;
  vec4 v = veilO(ro, rd, tEnd, 1.);
  col = mix(col, v.rgb, v.a);
  gZV = ZV + 4.5;
  gVS = VS * vec2(.72, .78);
  gVC = vec2(-6.5 * sin(uWander * 1.55 + uSeed * 1.7), 1.6 + 1.1 * sin(uWander * 1.1 + uSeed));
  gPh = 7.3;
  gTear = clamp(uGone * 1.25 - .05, 0., 1.);
  v = veilO(ro, rd, tEnd, .55);
  col = mix(col, v.rgb, v.a);
  col = withShafts(col, ro, rd, tEnd, .5 + .4 * exp(-uKickT * 3.) + 1.2 * uDrop);
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
