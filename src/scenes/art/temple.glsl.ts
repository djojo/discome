/**
 * Greek architecture for Olympe, as distance fields: the Doric order, the soberest (a fluted shaft swelling a little
 * at mid-height, a cushion and a square slab for a capital, no base), the peripteral temple (three steps, a colonnade
 * all round, the entablature, the pediments), the tholos (a round temple), and their ruins (columns broken at
 * different heights, drums fallen, the roof gone). Needs ART_LIB (sdBox, hash12, smin).
 *
 * Units: a column R in radius at its foot and H high (about 5.5 diameters, as at Paestum); everything else follows.
 * The fluting is relief: gFlute (0..1) fades it out where it would be smaller than a pixel (the scene sets it).
 */
export const TEMPLE_GLSL = /* glsl */ `
float gFlute = 1.;
/** What the last temple evaluation hit: 0 a column, 1 the steps, 2 the entablature and roof, 3 a fallen drum. */
float gPart = 0.;

float sdCapCyl(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.) + length(max(d, 0.));
}

/** A Doric column standing on y = 0: fluted shaft (20 flutes, entasis, tapering), echinus and abacus. */
float doricColumn(vec3 p, float H, float R) {
  float capH = .09 * H;
  float y = clamp(p.y, 0., H - capH);
  float t = y / H;
  float r = R * (1. - .2 * t + .05 * sin(t * 3.1416));
  float a = atan(p.z, p.x);
  float fl = .045 * R * gFlute * (1. - abs(cos(a * 10.)));
  float shaft = max((length(p.xz) - r + fl) * .8, abs(p.y - (H - capH) * .5) - (H - capH) * .5);
  // the echinus: a cushion flaring under the abacus; the abacus: a square slab
  float e = (p.y - (H - capH)) / (capH * .55);
  float ech = max(length(p.xz) - R * (.82 + .45 * clamp(e, 0., 1.) - .12 * clamp(e, 0., 1.) * clamp(e, 0., 1.)), abs(p.y - (H - capH * .72)) - capH * .28);
  float aba = sdBox(p - vec3(0., H - capH * .22, 0.), vec3(R * 1.2, capH * .22, R * 1.2));
  return min(shaft, min(ech * .9, aba));
}

/** The same, broken off at a height (a jagged top) for the ruins; h >= H: whole. */
float doricRuin(vec3 p, float H, float R, float h) {
  float d = doricColumn(p, H, R);
  if (h >= H) return d;
  float jag = h + .25 * R * (sin(atan(p.z, p.x) * 3. + h * 7.) + .5 * sin(atan(p.z, p.x) * 7. + h));
  return max(d, p.y - jag);
}

/** A rectangular peristyle: nx by nz columns at spacing s round a rectangle centred on the origin (y = 0 at their foot).
 * ruin: 0 whole, 1 every column broken at a height of its own and some missing. */
float peristyle(vec3 p, float nx, float nz, float s, float H, float R, float ruin) {
  float hx = (nx - 1.) * .5, hz = (nz - 1.) * .5;
  // the nearest column of the front or back row, and of the nearest side row
  float ix = clamp(floor(p.x / s + .5), -hx, hx);
  if (fract(hx) > .25) ix = clamp(floor(p.x / s) + .5, -hx, hx);
  float iz = clamp(floor(p.z / s + .5), -hz, hz);
  if (fract(hz) > .25) iz = clamp(floor(p.z / s) + .5, -hz, hz);
  vec2 cf = vec2(ix, sign(p.z) * hz), cs = vec2(sign(p.x) * hx, iz);
  float d = 1e3;
  for (int k = 0; k < 2; k++) {
    vec2 c = k == 0 ? cf : cs;
    float h = H;
    if (ruin > .5) {
      float r1 = hash12(c * 1.37 + 4.1);
      if (r1 < .2) continue;
      h = H * (r1 < .55 ? .15 + .7 * hash12(c * 2.1 + 1.3) : 1.);
    }
    d = min(d, doricRuin(p - vec3(c.x * s, 0., c.y * s), H, R, h));
  }
  return d;
}

/**
 * A Doric temple, its floor (the top of the stylobate) at y = 0: three steps, a peristyle of nx by nz columns, the
 * entablature (architrave, frieze, cornice) and a gabled roof with its pediments. ruin: broken columns, no roof, a
 * few drums fallen on the steps. Sets gPart.
 */
float templeD(vec3 p, float nx, float nz, float s, float H, float R, float ruin) {
  float hx = (nx - 1.) * .5 * s, hz = (nz - 1.) * .5 * s;
  // the crepidoma: three steps
  float st = 1e3;
  for (int i = 0; i < 3; i++) {
    float o = R * (1.1 + .55 * float(i));
    st = min(st, sdBox(p - vec3(0., -.22 * R * (float(i) + .5), 0.), vec3(hx + o, .11 * R, hz + o)));
  }
  float cols = peristyle(p, nx, nz, s, H, R, ruin);
  float d = min(st, cols);
  gPart = cols < st ? 0. : 1.;
  if (ruin < .5) {
    // the entablature: architrave and frieze (its triglyphs grooved), the cornice over them
    float eb = sdBox(p - vec3(0., H + .55 * R, 0.), vec3(hx + R * 1.15, .55 * R, hz + R * 1.15));
    float tri = .04 * R * step(.5, fract(p.x / (s * .5) + .25)) * step(H + .55 * R, p.y);
    eb += tri * gFlute;
    float co = sdBox(p - vec3(0., H + 1.2 * R, 0.), vec3(hx + R * 1.45, .12 * R, hz + R * 1.45));
    // the gabled roof along z, its pediment at each end
    vec3 q = p - vec3(0., H + 1.32 * R, 0.);
    float roofH = (hx + R * 1.45) * .27;
    float gable = max(abs(q.x) * roofH / (hx + R * 1.45) + q.y - roofH, -q.y);
    float roof = max(gable, abs(q.z) - hz - R * 1.45);
    float ent = min(min(eb, co), roof);
    if (ent < d) gPart = 2.;
    d = min(d, ent);
  } else {
    // drums fallen on the steps
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 c = vec3((hash12(vec2(fi, 3.)) - .5) * 2. * (hx + R), -.15 * R + R * .85, (hash12(vec2(fi, 7.)) - .5) * 2. * (hz + R * 2.5));
      vec3 q = p - c;
      q.xz *= rot(hash12(vec2(fi, 9.)) * 6.28);
      float drum = sdCapCyl(q.yxz, R * .9, R * .85);
      if (drum < d) gPart = 3.;
      d = min(d, drum);
    }
  }
  return d;
}

/** A tholos: a ring of n columns of radius rr round a round floor, a ring entablature and a low conical roof. */
float tholosD(vec3 p, float n, float rr, float H, float R) {
  float seg = 6.2831853 / n;
  float a = atan(p.z, p.x);
  float ca = (floor(a / seg) + .5) * seg;
  vec3 q = p - vec3(rr * cos(ca), 0., rr * sin(ca));
  float cols = doricColumn(q, H, R);
  float floorD = sdCapCyl(p - vec3(0., -.3 * R, 0.), .3 * R, rr + R * 1.6);
  float ring = max(abs(length(p.xz) - rr) - R * 1.2, abs(p.y - H - .55 * R) - .55 * R);
  vec3 r = p - vec3(0., H + 1.1 * R, 0.);
  float cone = max(length(r.xz) * .35 + r.y - (rr + R * 1.3) * .35, -r.y);
  float d = min(cols, floorD);
  gPart = cols < floorD ? 0. : 1.;
  float top = min(ring, cone);
  if (top < d) gPart = 2.;
  return min(d, top);
}
`;
