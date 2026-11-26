/**
 * The ancestors' aurora, shared by the Canyon's spirit scenes: the aurora borealis (green below, violet above, always
 * those colours) and the matter of the spirits, a glass of aurora: translucent, lit from within, curtains of light
 * rising through it, a glowing skin and a bright contour, the sky showing through.
 *
 * The scene sets the music before using them: gAuroraKick (seconds since the kick: a wave of light rises through the
 * curtains), gAuroraCharge (the build, 0..1: the curtains quicken and brighten), gAuroraBlaze (the drop, 0..1: all of
 * it ablaze from within); and gAuroraCurtains, how strong the curtains inside a form are, gAuroraCore how much its
 * inside glows (letters: fainter curtains, a fuller core, so that they read). Needs ART_LIB (fbm3, hash13, rot).
 */
export const AURORA_GLSL = /* glsl */ `
float gAuroraKick = 9.;
float gAuroraCharge = 0.;
float gAuroraBlaze = 0.;
float gAuroraCurtains = 1.;
float gAuroraCore = .04;

const vec3 AURORA_GREEN = vec3(.12, 1., .45);
const vec3 AURORA_VIOLET = vec3(.55, .25, 1.);

/**
 * One veil of the aurora, round the direction r (its folds along the azimuth, its curtains rising from its foot);
 * rays: how marked its fine vertical rays are.
 */
vec3 auroraVeil(vec3 r, float k, float rays) {
  float az = atan(r.x, -r.z);
  float el = asin(clamp(r.y, -1., 1.));
  float base = .12 + .1 * sin(az * (1.5 + k) + k * 3. + uTime * .04);
  float above = el - base;
  float speed = .12 * (1. + 2. * gAuroraCharge);
  float fold = .5 + .5 * sin(az * (14. + 6. * k) + fbm3(vec3(az * 3., uTime * speed, k)) * 7.);
  // its fine vertical rays, as in a real aurora
  float ray = 1. - rays + rays * pow(.5 + .5 * sin(az * 90. + 4. * fbm3(vec3(az * 12., uTime * .2, k))), 3.);
  float curtain = smoothstep(-.04, .03, above) * exp(-max(above, 0.) * 5.) * (.25 + .75 * pow(fold, 4.)) * ray;
  // the kick: a wave of light climbing the curtains
  float wave = exp(-pow((above - gAuroraKick * .5) * 9., 2.)) * exp(-gAuroraKick * 1.2);
  vec3 c = mix(AURORA_GREEN, AURORA_VIOLET, smoothstep(0., .3, above + .08 * k));
  return c * curtain * (1. + .8 * gAuroraCharge + 2.5 * gAuroraBlaze + 2. * wave);
}

/** Stars, and a faint band of the galaxy. */
vec3 auroraStars(vec3 rd) {
  vec3 c = vec3(.003, .005, .014) + vec3(.012, .008, .03) * (1. - abs(rd.y));
  vec3 q = rd * 170.;
  float h = hash13(floor(q));
  if (h > .984) c += vec3(.9, .95, 1.) * (1. - smoothstep(.05, .32, length(fract(q) - .5))) * (.5 + .5 * sin(uTime * 2. + h * 40.));
  c += vec3(.25, .2, .45) * exp(-pow(dot(rd, normalize(vec3(.3, 1., .2))) * 3., 2.)) * .05 * (.6 + .4 * fbm3(rd * 6.));
  return c;
}

/**
 * Space all round: the aurora's veils on every side (no ground, no horizon), soft ribbons that do not cross in a
 * plaid, the ones under us fainter; stars between them.
 */
vec3 auroraSpace(vec3 rd) {
  vec3 c = auroraStars(rd);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec3 r = rd;
    r.xy *= rot(fk * 2.1 + .3);
    r.xz *= rot(fk * 1.3);
    c += auroraVeil(r, fk, .2) * (fk < .5 ? .34 : fk < 1.5 ? .2 : .12);
  }
  return c;
}

/** The aurora rising over a horizon (for a scene with a ground and its own sky): its light alone, to add. */
vec3 auroraOverHorizon(vec3 rd) {
  return auroraVeil(rd, 0., .45) * smoothstep(-.02, .12, rd.y);
}

/** The colour of the aurora glass at a point of the form (h: its frame, y up, about -1..1). */
vec3 auroraSkin(vec3 h) {
  float a = fbm3(vec3(h.x * 2., h.y * .6 - uTime * .25, h.z * 2.));
  return mix(vec3(.2, 1., .55), vec3(.6, .35, 1.), smoothstep(.3, .8, h.y * .5 + .5 + .4 * (a - .5)));
}

/** The bright contour of a form of aurora glass (fre: how much it turns away from us). */
vec3 auroraRim(vec3 h, float fre) {
  return auroraSkin(h) * fre * 1.1 + vec3(.85, 1., .95) * fre * fre * fre * .35;
}
`;

/**
 * The aurora glass through a form: \`name\`(ro, rd, ts, sc) marches through the form from where the ray enters it (ts),
 * \`sdf\`(p) being its distance (world units) and \`frame\`(p) the point in its own frame (y up, about -1..1), sc its
 * scale (world units per frame unit); it gathers a glowing skin, curtains of light rising inside, a few filaments
 * and a faint core, and returns that light (rgb) and what still shows through it (a). GLSL has no function pointers:
 * the code is written for each form. Needs AURORA_GLSL.
 */
export const auroraGlass = (name: string, sdf: string, frame: string) => /* glsl */ `
vec4 ${name}(vec3 ro, vec3 rd, float ts, float sc) {
  vec3 acc = vec3(0.);
  float tr = 1.;
  float t = ts;
  float stepL = .07 * sc;
  float speed = .15 * (1. + 2. * gAuroraCharge);
  for (int i = 0; i < 40; i++) {
    vec3 p = ro + rd * t;
    float d = ${sdf}(p) / sc;
    if (d > .04) {
      t += d * sc;
      if (t > ts + 5. * sc) break;
      continue;
    }
    vec3 h = ${frame}(p);
    float skin = exp(-abs(d) * 30.);
    float inside = smoothstep(0., -.18, d);
    // a few filaments of light, drifting up
    float n = fbm3(h * 3.2 + vec3(0., -uTime * .25, 0.));
    float vein = exp(-pow((n - .5) * 12., 2.)) * inside;
    // the curtains rising through it, in folds that sway
    float cur = sin(h.x * 11. + 3. * fbm3(h * 1.5 + vec3(0., uTime * speed, 0.))) * .5 + .5;
    float curtains = pow(cur, 10.) * inside * smoothstep(-.7, .5, h.y);
    vec3 sk = auroraSkin(h);
    vec3 vn = mix(vec3(.3, 1., .7), vec3(.9, .5, 1.), n);
    vec3 e = sk * skin * .7 + vn * vein * .35 + vn * curtains * .55 * gAuroraCurtains + mix(vec3(.15, .5, .45), sk, .5) * inside * gAuroraCore;
    // the kick: a wave of light rising through it; the build: brighter; the drop: ablaze from within
    float wave = exp(-pow((h.y + 1. - gAuroraKick * 2.4) * 2.6, 2.)) * exp(-gAuroraKick * 1.3);
    e *= 1. + .8 * gAuroraCharge + 1.6 * wave;
    e += sk * inside * gAuroraBlaze * .5;
    acc += tr * e * stepL / sc;
    // (the far side gives less: a thick form, seen through its length, does not burn white)
    tr *= exp(-stepL / sc * (inside * .5 + skin * .4));
    t += stepL;
  }
  return vec4(acc, tr);
}
`;
