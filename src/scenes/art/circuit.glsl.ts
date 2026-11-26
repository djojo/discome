/**
 * Shared GLSL of the Circuit world (include after ART_LIB): its night, the megacity far below, the racer (one shape
 * for every scene), lines and segments of light. Black glass drawn in light: every surface is dark and glossy, the
 * light comes from its edges, the racers and their trails.
 */
export const CIRCUIT_GLSL = /* glsl */ `
/** The megacity's plane, far under the track. */
const float CITY_Y = -260.;

/** A line of light: d from its centre, w its half-width, fw a pixel. Thinner than a pixel, it dims instead of shimmering. */
float neon(float d, float w, float fw) {
  float W = max(w, fw);
  return (1. - smoothstep(W * .6, W * 1.6, d)) * w / W;
}

/** The soft halo of a light at distance d (r: its core). */
float halo(float d, float r) { return r * r / (d * d + r * r); }

/**
 * The night above the megacity: blue-black, its light glowing on the horizon in the colour of the moment, a few
 * stars high up. Dimmer as the night drifts (the city goes out).
 */
vec3 nightSky(vec3 rd) {
  float y = rd.y;
  vec3 c = mix(vec3(.004, .006, .016), vec3(.0, .0, .004), smoothstep(0., .6, y));
  vec3 glow = mix(uTint, vec3(1., .55, .25), .35) * (1. - .7 * uDrift);
  c += glow * .2 * exp(-abs(y + .005) * 22.) + glow * .02 * exp(-abs(y) * 5.);
  // stars, fixed in the sky (by direction)
  vec2 sp = vec2(atan(rd.x, rd.z) * 60., y * 60.);
  vec2 g = floor(sp);
  float h = hash12(g);
  vec2 o = fract(sp) - .5 - (vec2(hash12(g + 3.1), hash12(g + 7.7)) - .5) * .6;
  c += vec3(.6, .7, 1.) * step(.985, h) * smoothstep(.12, 0., length(o)) * smoothstep(.05, .4, y) * .5;
  return c;
}

/**
 * The megacity's lights at a point of its plane (xz), seen with a pixel of fw metres: streets of lamps, blocks of lit
 * windows, highways streaming with car lights, here and there a neon sign. Whole districts go dark as the night drifts:
 * the race consumes the city.
 */
/** A point of light of radius r seen with a pixel fw: its average once smaller than a pixel (no lines from afar). */
float dotL(float d, float r, float fw) {
  float W = max(r, fw);
  return (1. - smoothstep(W * .5, W * 1.5, d)) * (r / W) * (r / W);
}

vec3 cityLights(vec2 xz, float fw) {
  const float D = 512.;    // a district, between two highways
  vec2 dc = floor(xz / D);
  float dh = hash12(dc + 17.3);
  float on = step(uDrift * .92, dh) * (.5 + .5 * hash12(dc + 5.1));
  vec3 lamp = mix(vec3(1., .58, .24), vec3(.75, .88, 1.), step(.65, hash12(dc + 9.9)));
  vec3 c = vec3(0.);
  // each district has its own streets, turned its own way (no grid running across the whole city)
  float ang = (hash12(dc + 2.7) - .5) * 1.4;
  float B = 40. + 40. * hash12(dc + 6.1);
  vec2 lc = (xz - (dc + .5) * D) * mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 g = abs(fract(lc / B + .5) - .5) * B;
  float street = min(g.x, g.y);
  float along = g.x < g.y ? lc.y : lc.x;
  // lamps in two rows along the streets (points: from afar, a faint dust)
  float lampD = length(vec2(abs(street - 3.), (fract(along / 14.) - .5) * 14.));
  c += lamp * dotL(lampD, 1.3, fw) * 2.5 * on;
  // the streets' own glow under their lamps
  c += lamp * .05 * (1. - smoothstep(2., 6., street)) * on;
  // the blocks: buildings with lit windows, a few warm, a few cold (their average once finer than a pixel)
  if (street > 5.) {
    vec2 bc = floor(lc / 14.) + dc * 37.;
    float bh = hash12(bc);
    float lit = step(.45, bh) * on;
    vec2 wg = fract(lc / 3.) - .5;
    float win = (1. - smoothstep(.15, .28, max(abs(wg.x), abs(wg.y)))) * step(.55, hash12(floor(lc / 3.) + bc));
    win = mix(win, .18, smoothstep(.6, 2.5, fw));
    vec3 wc = mix(vec3(1., .8, .52), vec3(.62, .82, 1.), step(.72, bh));
    c += wc * win * lit * (.3 + .7 * hash12(bc + 1.7));
    // a neon sign, rarely: a bright stroke on a roof
    float signOn = step(.97, hash12(bc + 2.2));
    vec2 so = fract(lc / 14.) - .5;
    c += mix(uTint, vec3(1., .2, .6), step(.5, hash12(bc + 4.4))) * signOn * neon(abs(so.y), .05, fw / 14.) * step(abs(so.x), .3) * 1.2 * on;
  }
  // the highways between the districts: rivers of car lights, white one way, red the other
  // (only some district borders carry one, and from afar they are a thin dust of light, not lines)
  vec2 hw = abs(fract(xz / D + .5) - .5) * D;
  float hd = min(hw.x, hw.y);
  vec2 border = floor(xz / D + .5);
  float isHw = step(.45, hash12(hw.x < hw.y ? vec2(border.x, 3.3) : vec2(7.7, border.y)));
  if (hd < 14. && isHw > 0.) {
    float side = hw.x < hw.y ? sign(fract(xz.x / D + .5) - .5) : sign(fract(xz.y / D + .5) - .5);
    float run = hw.x < hw.y ? xz.y : xz.x;
    float flow = fract(run / 9. + uTime * (side > 0. ? 2.6 : -2.2));
    float car = smoothstep(.0, .2, flow) * (1. - smoothstep(.35, .5, flow)) * step(.4, hash12(vec2(floor(run / 9.), side)));
    car *= dotL(abs(hd - 3.5 - side), 1.2, fw) * 1.6;
    vec3 cc = side > 0. ? vec3(1., .95, .85) : vec3(1., .15, .08);
    c += cc * car * .9 * (.4 + .6 * on);
  }
  return c;
}

/** The megacity seen by a ray going down (rgb, and whether it is there); hazed with distance. */
vec4 cityBelow(vec3 ro, vec3 rd, float pa) {
  if (rd.y > -.002) return vec4(0.);
  float t = (CITY_Y - ro.y) / rd.y;
  vec3 p = ro + rd * t;
  float fw = t * pa / max(-rd.y, .04);
  vec3 c = cityLights(p.xz, fw) * 2.;
  // the haze of its own light over the distance, the same as the sky's on the horizon (no seam)
  float far = 1. - exp(-t / 5000.);
  return vec4(mix(c, nightSky(vec3(rd.x, 0., rd.z)), far), 1.);
}

/** What black glass reflects: the night, the city's glow (its own lights are added by each scene). */
vec3 glassEnv(vec3 rd) { return nightSky(rd); }

/** Schlick's Fresnel for glass. */
float fresnel(vec3 n, vec3 rd) { return .04 + .96 * pow(1. - clamp(dot(n, -rd), 0., 1.), 5.); }

/**
 * The racer, in its own frame (x right, y up, z forward; its belly at y = 0): a flat arrowhead of black glass with a
 * raised spine, a canopy, two pods at the back with their engines, two small fins. About 2.3 m long.
 */
float craftD(vec3 c) {
  float u = clamp((c.z + 1.1) / 2.35, 0., 1.);
  float hw = mix(.56, .06, u);
  vec3 q = vec3(abs(c.x), c.y - .1, c.z);
  float plan = max(q.x - hw, abs(c.z - .075) - 1.175);
  float th = mix(.12, .045, u) * (1. - .6 * clamp(q.x / hw, 0., 1.));
  float hull = max(plan, abs(q.y) - th) * .75;
  float can = sdEllipsoid(c - vec3(0., .2, -.05), vec3(.17, .1, .5));
  float pod = sdCapsule(vec3(q.x, c.y, c.z), vec3(.44, .1, -1.12), vec3(.44, .1, -.38), .11);
  float fin = sdBox(vec3(q.x - .44, c.y - .25, c.z + .92), vec3(.015, .1, .13));
  return min(min(hull, can), min(pod, fin));
}

/**
 * The racer's light at a point of its body (c: its frame, n: the normal in its frame, rd: the view in its frame):
 * black glass reflecting the night, a neon line round its edges, the canopy's rim, the engines burning at the back,
 * the glow of its levitation underneath. col: its colour; burn: how hard its engines burn.
 */
vec3 craftColor(vec3 c, vec3 n, vec3 rd, vec3 col, float burn, float fw) {
  float fr = fresnel(n, rd);
  vec3 cc = vec3(.008, .009, .012) + glassEnv(reflect(rd, n)) * fr * 1.2;
  float u = clamp((c.z + 1.1) / 2.35, 0., 1.);
  float hw = mix(.56, .06, u);
  float ax = abs(c.x);
  // the edge line of the hull, and the spine
  float edge = neon(abs(ax - hw + .02), .012, fw) * step(c.y, .2) * step(-1.1, c.z) * step(c.z, 1.25);
  float spine = neon(ax, .01, fw) * step(.16, c.y) * step(.2, c.z);
  cc += col * (edge * 2.2 + spine * 1.2);
  // the canopy: dark, its rim lit
  float can = length((c - vec3(0., .2, -.05)) / vec3(.17, .1, .5));
  cc += col * neon(abs(can - 1.), .03, fw * 4.) * step(.18, c.y) * .8;
  // the pods: a ring of light, the engine burning white-hot at their back
  float pod = length(vec2(ax - .44, c.y - .1));
  if (pod < .14 && c.z < -.3) {
    cc += col * neon(abs(c.z + .5), .02, fw) * 1.5;
    float back = smoothstep(-1.05, -1.2, c.z);
    cc += mix(col, vec3(1.), .55) * back * (1.5 + 2.5 * burn);
  }
  // underneath: the levitation's glow
  cc += col * smoothstep(.0, -.6, n.y) * .5 * (.6 + .4 * burn);
  return cc;
}
`;
