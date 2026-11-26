import { PACK_MAX, TRAIL_PTS } from "./circuitTrack";

/**
 * The track scenes of the Circuit world (Le Circuit, La Grille de départ…), drawn the same way: the track in its own
 * frame (deck of black glass, rails of light, hoops, the start / finish gantry), the megacity's towers beside it, the
 * racers and their trails, the city far below. Include after ART_LIB, FLIGHT_GLSL (uSpeed), CIRCUIT_GLSL and
 * TRACK_GLSL; with TITLE_SIGN defined (and HEAD_GLSL included), the gantry carries the night's title.
 * A scene's main computes its ray and calls renderTrack(ro, rd, pa).
 */
export const TRACK_SCENE_GLSL = /* glsl */ `
#define PACK_MAX ${PACK_MAX}
#define TRAIL_PTS ${TRAIL_PTS}
uniform vec4 uRacerP[PACK_MAX];   // a racer: position (world, lap origin), w: its colour (< 0: none)
uniform vec3 uRacerR[PACK_MAX];
uniform vec3 uRacerU[PACK_MAX];
uniform vec3 uRacerF[PACK_MAX];
uniform vec3 uTrailL[PACK_MAX * TRAIL_PTS];
uniform vec3 uTrailR[PACK_MAX * TRAIL_PTS];
uniform vec2 uWave;      // the kick's wave: where along the track, how bright
uniform float uRail;     // the rails' lights' offset (they race ahead through the build)
uniform float uBoost;    // the drop's boost, fading
uniform float uBurn;     // how hard the engines burn
uniform vec3 uGantry;    // x: 0 the lap lights, 1 the start lights; y: how many are lit; z: the start lights' glow
#ifdef CLEAR_ZONE
uniform vec2 uClear;     // no towers between these s (a stadium stands there)
#endif
#ifdef PITS
uniform vec2 uPits;      // the pits: the garages' middle (s), their half-length
/** The pit lane's centre across the track: beside it along the garages, joining it before and after. */
float pitLaneX(float s) {
  float k = 1. - smoothstep(uPits.y, uPits.y + 140., abs(s - uPits.x));
  return mix(TRACK_W + 1.2, TRACK_W + 6.5, k);
}
#endif
#ifdef TUBE
uniform vec3 uTube;     // the tube: from s, to s, its radius
#endif
#ifdef TITLE_SIGN
uniform float uTitle;    // the night's title on the gantry
uniform float uTitleT;   // since when it is lit
#endif

float gMat;     // 0 the deck's glass, 1 a rail, 2 the deck's edge and underside, 3 a hoop, 4 the gantry, 5 a racer, 6 a tower, 7 the title sign
float gRacer;
vec3 gTq;       // the hit in the track's frame

/** Turn a colour's hue (a: 0..1 of a turn) around the grey axis. */
vec3 hueTurn(vec3 c, float a) {
  const vec3 k = vec3(.57735);
  float ca = cos(a * 6.2831853);
  return max(c * ca + cross(k, c) * sin(a * 6.2831853) + k * dot(k, c) * (1. - ca), 0.);
}
/** A racer's colour: the colour of the moment, its opposite, white, a third. */
vec3 racerCol(float k) {
  vec3 t = uTint;
  return k < .5 ? t : k < 1.5 ? hueTurn(t, .5) * .9 + .05 : k < 2.5 ? mix(t, vec3(1.), .7) : hueTurn(t, .25);
}

#ifdef TITLE_SIGN
/** The title sign above the gantry's beam: its half-size and centre height (from the title's proportions). */
vec3 signBox() {
  float k = min(2. * (TRACK_W + 1.15) * .9 / uHeadSize.x, 3.6 / uHeadSize.y);
  return vec3(TRACK_W + 1.15, uHeadSize.y * k * .5 + .45, k);
}
#endif

/** The track and what stands on it, in its frame (deck, rails, the hoops every 100 m, the start / finish gantry). */
float trackD(vec3 p) {
  vec3 q = toTrack(p);
  gTq = q;
#ifdef TUBE
  if (q.z > uTube.x && q.z < uTube.y) {
    // inside the tube's span: no deck, the rings of light round the tube, and a heavier one at its mouth
    vec2 qq = vec2(q.x, q.y - uTube.z);
    float r = length(qq);
    float ds = mod(q.z + 7., 14.) - 7.;
    float ring = length(vec2(r - uTube.z - .08, ds)) - .07;
    float mouth = length(vec2(r - uTube.z - .2, q.z - uTube.y + .3)) - .25;
    gMat = 8.;
    return min(ring, mouth);
  }
#endif
  float deck = max(abs(q.x) - TRACK_W, abs(q.y + .3) - .3);
  float rail = max(abs(abs(q.x) - TRACK_W + .12) - .12, abs(q.y - .09) - .09);
  float d = min(deck, rail);
  float m = deck < rail ? (q.y > -.02 && abs(q.x) < TRACK_W - .2 ? 0. : 2.) : 1.;
  bool hoops = true;
#ifdef PITS
  // the pits, on level ground beside the banked track: the pit lane, the wall, the garages
  float dps = q.z - uPits.x;
  if (abs(dps) < uPits.y + 170.) {
    hoops = abs(dps) > uPits.y + 80.;
    vec3 lv = vec3(p.x - trackX(q.z), p.y - trackY0(q.z), q.z);
    float xp = pitLaneX(q.z);
    float inG = step(abs(dps), uPits.y);
    float deckP = max(max(max(xp - 3.5 - lv.x, lv.x - mix(xp + 3.5, TRACK_W + 22.5, inG)), abs(lv.y + .3) - .3), abs(dps) - uPits.y - 160.);
    float wall = max(max(abs(lv.x - TRACK_W - 1.25) - .35, abs(lv.y + .1) - 1.5), abs(dps) - uPits.y - 70.);
    float gz = mod(dps + 7., 14.) - 7.;
    float back = max(max(abs(lv.x - TRACK_W - 22.25) - .25, abs(lv.y - 3.4) - 3.4), abs(dps) - uPits.y);
    float side = max(max(max(abs(abs(gz) - 7.) - .25, abs(lv.x - TRACK_W - 16.25) - 5.75), abs(lv.y - 3.4) - 3.4), abs(dps) - uPits.y - .25);
    float roof = max(max(abs(lv.y - 7.) - .3, abs(lv.x - TRACK_W - 15.75) - 6.75), abs(dps) - uPits.y - .25);
    float g = min(min(back, side), roof);
    if (deckP < d) { d = deckP; m = 12.; }
    if (wall < d) { d = wall; m = 13.; }
    if (g < d) { d = g; m = 14.; }
  }
#endif
  // hoops of light arching over the track
  float ds = mod(q.z + 50., 100.) - 50.;
  float hoop = max(length(vec2(length(vec2(q.x, q.y + .3)) - 6.6, ds)) - .06, -(q.y + .3));
  if (hoops && hoop < d) { d = hoop; m = 3.; }
  // the gantry, once a lap: two pillars and a beam carrying its lights
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  if (abs(dg) < 12.) {
    vec3 g = vec3(abs(q.x) - TRACK_W - .8, q.y - 3.8, dg);
    float pil = sdBox(g, vec3(.35, 4.1, .35));
    float beam = sdBox(vec3(q.x, q.y - 7.9, dg), vec3(TRACK_W + 1.15, .45, .4));
    float gt = min(pil, beam);
    if (gt < d) { d = gt; m = 4.; }
#ifdef TITLE_SIGN
    if (uTitle > .5) {
      vec3 sb = signBox();
      float panel = sdBox(vec3(q.x, q.y - 8.35 - sb.y, dg), vec3(sb.x, sb.y, .12));
      if (panel < d) { d = panel; m = 7.; }
    }
#endif
  }
  gMat = m;
  return d;
}

/** The pack (world): the nearest racer's body. */
float racersD(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < PACK_MAX; i++) {
    vec4 rp = uRacerP[i];
    if (rp.w < 0.) continue;
    vec3 o = p - rp.xyz;
    float b = length(o) - 1.45;
    if (b > .4) { d = min(d, b); continue; }
    vec3 c = vec3(dot(o, uRacerR[i]), dot(o, uRacerU[i]), dot(o, uRacerF[i]));
    float dc = craftD(c);
    if (dc < d) { d = dc; gRacer = float(i); }
  }
  return d;
}

/*
 * The megacity's towers beside the track: black glass rising from the city far below, some topping out under the
 * track, some above it. One per cell of TC metres on either side (or none), well clear of the track.
 */
const float TC = 90.;
vec4 gTower;     // the hit tower: centre x, z, half-width, top
float towersD(vec3 p) {
  float cz = floor(-p.z / TC + .5);
  float sc = cz * TC;
  float xc = trackX(sc);
  float side = p.x > xc ? 1. : -1.;
  float h1 = hash12(vec2(cz, side)), h2 = hash12(vec2(cz * 1.3, side + 4.)), h3 = hash12(vec2(cz * .7, side - 2.));
  // bounds: the next cell's tower (beyond the cell's edge), the other side's (beyond the track)
  float bound = min(TC * .5 - abs(-p.z - sc) + 30., abs(p.x - xc) + 18.);
  if (h1 < .3) return bound;
#ifdef CLEAR_ZONE
  if (sc > uClear.x && sc < uClear.y) return bound;
#endif
  float w = 5. + 9. * h2;
  float top = -50. + 115. * h3;
  vec3 c = vec3(xc + side * (34. + 90. * fract(h1 * 7.3)), (top + CITY_Y) * .5, -sc);
  gTower = vec4(c.x, c.z, w, top);
  return min(sdBox(p - c, vec3(w, (top - CITY_Y) * .5, w)), bound);
}

float mapD(vec3 p) {
  float dt = trackD(p);
  // the track's frame stretches distances (its slopes, its roll far from its axis): step carefully
  dt /= 1.15 + .04 * length(gTq.xy);
  float m = gMat;
  vec3 tq = gTq;
  float dr = racersD(p);
  if (dr < dt) { dt = dr; m = 5.; }
  float dw = towersD(p);
  if (dw < dt) { dt = dw; m = 6.; }
  gMat = m;
  gTq = tq;
  return dt;
}

vec3 nrmTrack(vec3 p, float e) {
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy * trackD(p + k.xyy * e) + k.yyx * trackD(p + k.yyx * e) + k.yxy * trackD(p + k.yxy * e) + k.xxx * trackD(p + k.xxx * e));
}

/** A segment of light (a to b) seen by the ray, up to tmax: its glow. w: its core's radius; fade0/1 at its ends. */
float segLight(vec3 ro, vec3 rd, vec3 a, vec3 b, float w, float tmax, float pa, float fade0, float fade1) {
  vec3 ba = b - a, wo = ro - a;
  float bb = dot(ba, ba);
  if (bb < 1e-6) return 0.;
  float bd = dot(ba, rd), dw = dot(rd, wo), ew = dot(ba, wo);
  float den = max(bb - bd * bd, 1e-6);
  float h = clamp((ew - bd * dw) / den, 0., 1.);
  float t = max(dot(a + ba * h - ro, rd), 0.);
  if (t > tmax) return 0.;
  vec3 diff = ro + rd * t - a - ba * h;
  float d = length(diff);
  float r = max(w, t * pa * .9);
  float core = (w / r) * exp(-d * d / (r * r));
  return (core * 1.8 + .1 * halo(d, r * 4.)) * mix(fade0, fade1, h);
}

/** Every trail of the pack seen by a ray (reflections: dimmer and wider). */
vec3 trailsLight(vec3 ro, vec3 rd, float tmax, float pa, float wide) {
  vec3 acc = vec3(0.);
  float w = (.025 + .022 * uSpeed) * wide;
  for (int i = 0; i < PACK_MAX; i++) {
    if (uRacerP[i].w < 0.) continue;
    // the whole trail in a sphere (its chord, and room for its curve and its glow): skip it if the ray passes far
    vec3 ta = uTrailL[i * TRAIL_PTS], tb = uTrailL[i * TRAIL_PTS + TRAIL_PTS - 1];
    float hl = length(tb - ta) * .5;
    if (hl < .05) continue;
    vec3 oc = (ta + tb) * .5 - ro;
    float tc = dot(oc, rd);
    float rad = hl + 4.;
    if (tc < -rad || tc - rad > tmax) continue;
    float reach = rad + max(tc, 0.) * pa * 12.;
    if (dot(oc, oc) - tc * tc > reach * reach) continue;
    vec3 col = racerCol(uRacerP[i].w);
    float sum = 0.;
    for (int k = 0; k < TRAIL_PTS - 1; k++) {
      int j = i * TRAIL_PTS + k;
      float f0 = 1. - float(k) / float(TRAIL_PTS - 1), f1 = 1. - float(k + 1) / float(TRAIL_PTS - 1);
      f0 *= f0; f1 *= f1;
      sum += segLight(ro, rd, uTrailL[j], uTrailL[j + 1], w, tmax, pa, f0, f1);
      sum += segLight(ro, rd, uTrailR[j], uTrailR[j + 1], w, tmax, pa, f0, f1);
    }
    acc += col * sum;
  }
  return acc * (.9 + .5 * uBurn);
}

/** The deck's top: black glass reflecting the night and every trail; its markings, pads and the lights' spill. */
vec3 deckColor(vec3 p, vec3 q, vec3 n, vec3 rd, float t, float pa) {
  float fw = t * pa / max(abs(dot(n, rd)), .06);
  float fr = fresnel(n, rd);
  vec3 rr = reflect(rd, n);
  vec3 c = vec3(.005, .006, .01);
  c += glassEnv(rr) * fr;
  c += trailsLight(p + n * .02, rr, 120., pa, 1.6) * (.15 + .85 * fr);
  float ax = abs(q.x);
  // lane lines, dashed, faint
  float lane = neon(abs(abs(q.x) - 1.4), .03, fw) + neon(abs(abs(q.x) - 2.8), .03, fw);
  lane *= step(.45, fract(q.z / 6.));
  c += mix(uTint, vec3(1.), .5) * lane * .12;
  // boost pads every 40 m: three chevrons pointing ahead, lit by the kick's wave and the drop
  float pz = mod(q.z + 20., 40.) - 20.;
  float waveK = exp(-pow((q.z - uWave.x) / 4., 2.)) * uWave.y;
  if (abs(pz) < 2.6 && ax < 1.3) {
    float v = abs(fract((pz + .8 * ax) / 1.7) - .5) * 1.7;
    float ch = neon(v, .18, fw);
    c += uTint * ch * (.12 + 2.5 * waveK + 1.5 * uBoost);
  }
  // the wave itself crossing the deck
  c += uTint * waveK * .35 * (1. - smoothstep(TRACK_W - .5, TRACK_W, ax));
  // the rails' light spilling onto the glass
  c += uTint * exp(-(TRACK_W - .2 - ax) * 1.6) * .14 * (1. + uBoost);
  // the racers' levitation: a pool of their colour under each one
  for (int i = 0; i < PACK_MAX; i++) {
    if (uRacerP[i].w < 0.) continue;
    vec3 o = p - uRacerP[i].xyz;
    float dn = dot(o, n);
    vec3 lat = o - n * dn;
    float fwd = dot(lat, uRacerF[i]);
    float side = dot(lat, uRacerR[i]);
    float pool = exp(-(side * side / .5 + fwd * fwd / 2.2)) * exp(-max(-dn - .2, 0.) * 2.);
    c += racerCol(uRacerP[i].w) * pool * .55 * (.6 + .5 * uBurn);
  }
  // the start / finish line, under the gantry
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  float chk = step(.5, fract(q.x / .7 + step(.5, fract(dg / 1.4)) * .5));
  c += vec3(.9) * (1. - step(1.4, abs(dg))) * mix(.06, .5, chk);
  // the start lights' red on the glass, before the start
  c += vec3(1., .08, .03) * uGantry.z * uGantry.y * .03 * exp(-abs(dg - 3.) * .12) * step(dg, 0.);
  return c;
}

/** The rails: dark kerbs, a strip of light along their inner face, its dashes; sparks on the hats. */
vec3 railColor(vec3 q, vec3 n, vec3 rd, float t, float pa) {
  float fw = t * pa / max(abs(dot(n, rd)), .1);
  vec3 c = vec3(.006) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
  float inner = TRACK_W - .24 - abs(q.x);
  float strip = neon(abs(q.y - .09), .045, fw) * smoothstep(.06, 0., abs(inner));
  float dash = smoothstep(.35, .5, fract((q.z - uRail) / 7.)) * (1. - smoothstep(.85, 1., fract((q.z - uRail) / 7.)));
  float waveK = exp(-pow((q.z - uWave.x) / 6., 2.)) * uWave.y;
  c += uTint * strip * (1.1 + .9 * dash + 3. * waveK + 2. * uBoost);
  // the top edge, a thin line
  c += uTint * neon(abs(q.y - .18), .012, fw) * .8;
  // sparks on the hats
  float cell = floor(q.z * 1.5);
  float spark = step(.93, hash12(vec2(cell, floor(uTime * 12.) + sign(q.x))));
  c += vec3(1.) * spark * uHat * 3. * smoothstep(.05, .0, abs(q.y - .18));
  return c;
}

/** A tower: black glass, its vertical edges drawn in light, faint floors, a crown of light at its top. */
vec3 towerColor(vec3 p, vec3 rd, float t, float pa) {
  vec4 tw = gTower;
  vec3 q = p - vec3(tw.x, 0., tw.y);
  float w = tw.z;
  vec3 n = abs(q.x) > abs(q.z) ? vec3(sign(q.x), 0., 0.) : vec3(0., 0., sign(q.z));
  if (p.y > tw.w - .05) n = vec3(0., 1., 0.);
  float fw = t * pa / max(abs(dot(n, rd)), .08);
  vec3 c = vec3(.004, .005, .008) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
  float e = w - min(abs(q.x), abs(q.z));
  c += uTint * neon(e, .1, fw) * (.9 + 1.5 * uBoost);
  float fl = abs(fract(p.y / 4.) - .5) * 4.;
  c += mix(uTint, vec3(1.), .5) * neon(fl, .03, fw) * .05;
  float u = abs(q.x) > abs(q.z) ? q.z : q.x;
  vec2 wc = floor(vec2(u / 2.5, p.y / 4.));
  float win = step(.9, hash12(wc + tw.xy)) * (1. - smoothstep(.2, .32, length(fract(vec2(u / 2.5, p.y / 4.)) - .5)));
  c += vec3(1., .85, .6) * mix(win, .04, smoothstep(.5, 2., fw / 2.5)) * .25;
  c += mix(uTint, vec3(1.), .4) * neon(tw.w - p.y, .25, fw) * 1.5;
  return c;
}

/** The gantry: dark, its lights along the beam (the laps, or the five start lights), its pillars' edges. */
vec3 gantryColor(vec3 q, vec3 n, vec3 rd, float fw) {
  vec3 c = vec3(.005) + glassEnv(reflect(rd, n)) * fresnel(n, rd);
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  if (q.y > 7.4 && dg < 0.) {
    if (uGantry.x < .5) {
      // the lap lights: one more every lap, then they start again
      float lx = (q.x + TRACK_W) / (2. * TRACK_W) * 10.;
      float li = floor(lx);
      float lamp = 1. - smoothstep(.2, .32, length(vec2(fract(lx) - .5, (q.y - 7.9) * 1.6)));
      float on = step(li, uGantry.y - 1.) * step(0., li) * step(li, 9.);
      c += mix(vec3(.25, .02, .01), mix(uTint, vec3(1.), .6) * 3., on) * lamp * step(abs(q.x), TRACK_W);
    } else {
      // the five start lights: red, one more with every fifth of the build; all out on the drop
      float lx = q.x / 1.25 + 2.5;
      float li = floor(lx);
      float r = length(vec2(fract(lx) - .5, (q.y - 7.9) / 1.25));
      float lamp = 1. - smoothstep(.27, .3, r);
      float on = step(li, uGantry.y - 1.) * step(0., li) * step(li, 4.);
      c += mix(vec3(.05, .006, .004), vec3(1., .07, .03) * 6. * uGantry.z, on) * lamp;
      c += vec3(.2) * neon(abs(r - .34), .02, fw / 1.25) * step(0., li) * step(li, 4.);
    }
  }
  c += uTint * neon(abs(abs(q.x) - TRACK_W - .45), .03, fw) * step(q.y, 7.4);
  return c;
}

#ifdef TITLE_SIGN
/** The night's title on its sign above the gantry: letters of light switching on, a thin frame. */
vec3 signColor(vec3 q, vec3 n, vec3 rd, float fw) {
  vec3 sb = signBox();
  vec3 c = vec3(.004) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .6;
  float dg = mod(q.z + LAP * .5, LAP) - LAP * .5;
  if (dg > -.1) return c;
  vec2 lp = vec2(q.x, q.y - 8.35 - sb.y);
  vec2 xy = uHeadMin.xy + uHeadSize.xy * .5 + lp / sb.z;
  float d2 = titleD2(xy) * sb.z;
  // switching on: a flicker, then steady
  float on = smoothstep(.3, 1.6, uTitleT) * (uTitleT < 1.6 ? step(.35, fract(sin(floor(uTitleT * 14.) * 43.7) * 917.3)) : 1.);
  float inside = 1. - smoothstep(-fw, fw, d2);
  vec3 lc = mix(uTint, vec3(1.), .55);
  c += lc * on * (inside * 1.4 + neon(abs(d2 + .02), .03, fw) * 1.2);
  // the frame
  vec2 e = sb.xy - abs(lp);
  c += uTint * neon(min(e.x, e.y), .03, fw) * .9;
  return c;
}
#endif

/** The light of a hit (gMat, gTq set by the march at p). */
vec3 shadeHit(vec3 p, vec3 rd, float t, float pa) {
  vec3 c;
  if (gMat > 5.5 && gMat < 6.5) {
    towersD(p);
    c = towerColor(p, rd, t, pa);
  } else if (gMat > 4.5 && gMat < 5.5) {
    // a racer
    int i = int(gRacer + .5);
    vec4 rp = uRacerP[i];
    vec3 R = uRacerR[i], U = uRacerU[i], F = uRacerF[i];
    vec3 o = p - rp.xyz;
    vec3 cp = vec3(dot(o, R), dot(o, U), dot(o, F));
    const vec2 k = vec2(1, -1);
    const float e = .004;
    vec3 nl = normalize(k.xyy * craftD(cp + k.xyy * e) + k.yyx * craftD(cp + k.yyx * e) + k.yxy * craftD(cp + k.yxy * e) + k.xxx * craftD(cp + k.xxx * e));
    vec3 rdl = vec3(dot(rd, R), dot(rd, U), dot(rd, F));
    c = craftColor(cp, nl, rdl, racerCol(rp.w), uBurn, t * pa);
  } else {
    float m = gMat;
    vec3 q = gTq;
    vec3 n = nrmTrack(p, max(m < .5 ? .01 : .004, t * pa * 2.));
    float fw = t * pa / max(abs(dot(n, rd)), .1);
    float waveK = exp(-pow((q.z - uWave.x) / 8., 2.)) * uWave.y;
    if (m < .5) c = deckColor(p, q, n, rd, t, pa);
    else if (m < 1.5) c = railColor(q, n, rd, t, pa);
    else if (m < 2.5) {
      // the deck's edge and underside: dark, a line of light under its centre, the levitation's emitters
      c = vec3(.004) + glassEnv(reflect(rd, n)) * fresnel(n, rd) * .5;
      c += uTint * neon(abs(abs(q.x) - TRACK_W), .03, fw) * smoothstep(-.2, -.5, q.y) * .6;
      float em = mod(q.z + 10., 20.) - 10.;
      c += uTint * halo(length(vec2(q.x, em)), .6) * step(q.y, -.55) * (.5 + uBoost);
    } else if (m < 3.5 || m > 7.5) {
      // a hoop, or a ring of the tube: a tube of light, flashing as the wave runs through it
      float face = pow(abs(dot(n, rd)), 1.5);
      c = mix(uTint, vec3(1.), .3 * face) * (.25 + 1.4 * face) * (1. + 3. * waveK + 2. * uBoost);
      // the tube's rings far down it fade, or they tangle into a knot where it curves away
      if (m > 7.5) c *= .12 + .88 * exp(-t / 110.);
    } else if (m < 4.5) c = gantryColor(q, n, rd, fw);
#ifdef TITLE_SIGN
    else c = signColor(q, n, rd, fw);
#else
    else c = vec3(0.);
#endif
  }
  return c;
}

/** Everything a ray sees: the march, the shading, the city, the trails. */
vec3 renderTrack(vec3 ro, vec3 rd, float pa) {
  float t = .05;
  bool hit = false;
  for (int i = 0; i < 150; i++) {
    vec3 p = ro + rd * t;
    float d = mapD(p);
    if (d < .0012 * t) { hit = true; break; }
    t += d;
    if (t > 650.) break;
  }
  vec3 col = nightSky(rd);
  vec4 city = cityBelow(ro, rd, pa);
  col = mix(col, city.rgb, city.a);
  float tEnd = 1e4;
  if (hit) {
    tEnd = t;
    vec3 c = shadeHit(ro + rd * t, rd, t, pa);
    // far off, everything melts into the night
    col = mix(c, col, smoothstep(320., 650., t));
  }
  // the trails of light, the engines' glow
  col += trailsLight(ro, rd, tEnd, pa, 1.);
  return col;
}
`;
