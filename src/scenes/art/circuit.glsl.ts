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
    win = mix(win, .18, smoothstep(.25, 1.1, fw));
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

/*
 * The racer, in its own frame (x right, y up, z forward; its belly at y = 0): a long arrowhead of black glass, a raised
 * spine running to the nose, two nacelles blended into its flanks with their engines at the back, a low canopy of
 * smoked glass. About 2.4 m long, 1.1 m wide at the back.
 */
float craftHalfW(float z) { float u = clamp((z + 1.15) / 2.4, 0., 1.); return mix(.52, .05, u * (.6 + .4 * u)); }
float craftD(vec3 c) {
  float u = clamp((c.z + 1.15) / 2.4, 0., 1.);
  float hw = craftHalfW(c.z);
  float ax = abs(c.x);
  float plan = max(ax - hw, abs(c.z - .05) - 1.2);
  // the top rises to a spine in the middle, lower toward the nose
  float k = clamp(1. - ax / max(hw, .01), 0., 1.);
  float top = .07 + .15 * sqrt(k) * (1. - .65 * u);
  float hull = max(plan, max(c.y - top, .03 - c.y)) * .6;
  float nac = sdCapsule(vec3(ax, c.y, c.z), vec3(.46, .12, -1.12), vec3(.42, .11, -.25), .1);
  float can = sdEllipsoid(c - vec3(0., .2, -.02), vec3(.14, .08, .4));
  return min(smin(hull, nac, .06), can);
}

/**
 * The racer's light at a point of its body (c: its frame, n: the normal in its frame, rd: the view in its frame):
 * black glass reflecting the night, neon along its edges and spine, the canopy's smoked glass and its lit base, the
 * engines' rings burning at the back, the glow of its levitation underneath. col: its colour; burn: how hard its
 * engines burn.
 */
vec3 craftColor(vec3 c, vec3 n, vec3 rd, vec3 col, float burn, float fw) {
  float fr = fresnel(n, rd);
  vec3 cc = vec3(.006, .007, .01) + glassEnv(reflect(rd, n)) * fr * 1.4;
  float hw = craftHalfW(c.z);
  float ax = abs(c.x);
  // the hull's rim and the spine to the nose
  float rim = neon(abs(hw - ax), .014, fw) * step(c.y, .14) * step(-1.15, c.z);
  float spine = neon(ax, .012, fw) * step(.12, c.y) * step(.35, c.z);
  cc += col * (rim * 2.4 + spine * 1.6);
  // the canopy: smoked glass, a thin line where it meets the hull
  float can = length((c - vec3(0., .2, -.02)) / vec3(.14, .08, .4));
  if (can < 1.08) {
    cc = vec3(.01, .012, .02) + glassEnv(reflect(rd, n)) * fr * 2.;
    cc += col * neon(abs(c.y - .145), .008, fw) * 1.5;
  }
  // the nacelles: a stripe along them; at the back the engine, a ring of light round a burning core
  float r = length(vec2(ax - .46 + .04 * clamp((c.z + 1.12) / .9, 0., 1.), c.y - .12));
  if (r < .13 && c.z < -.2) {
    cc += col * neon(abs(c.y - .16), .006, fw) * step(-1.05, c.z) * step(.47, ax) * .9;
    float back = smoothstep(-1.1, -1.18, c.z);
    float ring = neon(abs(r - .075), .012, fw);
    float core = 1. - smoothstep(.03, .065, r);
    cc += back * (col * ring * (2. + 2. * burn) + mix(col, vec3(1.), .35) * core * (.6 + 1.6 * burn));
  }
  // underneath: the levitation's glow
  cc += col * smoothstep(-.2, -.8, n.y) * step(c.y, .06) * step(abs(c.x), .38) * .5 * (.6 + .4 * burn);
  return cc;
}
`;
