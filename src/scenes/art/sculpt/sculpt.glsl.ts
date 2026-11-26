/**
 * The heads sculpted in code, cooked by the oven (oven.ts) into distance grids: sculpt(p), in the frame of the head
 * library (y up, face towards +z, top of the skull at y ~ .78, chin at ~ -.6), for the recipe set in the uniforms
 * (cast.ts). The style is a sculpture's: clean volumes, the details carved.
 *
 * Needs ART_LIB (sdEllipsoid, sdCapsule, sdBox, smin, smax) and rot().
 */
export const SCULPT_GLSL = /* glsl */ `
// ---- the recipe (cast.ts): which head
uniform int uKind;

float sdSph(vec3 p, float r) { return length(p) - r; }

// ---------------------------------------------------------------- animals

/** The cobra, reared, its hood spread: broad under the head, narrowing into the neck; the head on top, looking ahead. */
float cobra(vec3 p) {
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // the body rising
  float d = sdCapsule(p, vec3(0., .5, -.02), vec3(0., -1.6, -.1), .14);
  // the hood: broad under the head, narrowing down into the neck, thin, its edges swept back round the neck
  vec3 h = p - vec3(0., 0., -.06);
  h.z += .4 * h.x * h.x;
  float hood = sdEllipsoid(h - vec3(0., .24, 0.), vec3(.56, .42, .065));
  hood = smin(hood, sdEllipsoid(h - vec3(0., -.26, .01), vec3(.28, .44, .07)), .18);
  d = smin(d, hood, .08);
  // the broad scales of the throat, across the front of the neck and hood
  d += .005 * abs(sin(p.y * 36.)) * smoothstep(.02, .07, p.z) * smoothstep(.22, .1, q.x);
  // the head, looking ahead and a little down
  vec3 hp = p - vec3(0., .68, .14);
  hp.yz *= rot(.2);
  float head = sdEllipsoid(hp - vec3(0., 0., .05), vec3(.2, .105, .3));
  head = smin(head, sdEllipsoid(hp - vec3(0., .025, -.1), vec3(.225, .12, .19)), .07);
  vec3 hq = vec3(abs(hp.x), hp.yz);
  // the eyes, a ridge over each, the nostrils, the line of the mouth, the plates of the crown
  head = smin(head, sdSph(hq - vec3(.125, .04, .12), .036), .015);
  head = smin(head, sdEllipsoid(hq - vec3(.12, .07, .12), vec3(.055, .016, .045)), .02);
  head = smax(head, -sdSph(hq - vec3(.04, .03, .34), .013), .006);
  head = smax(head, -max(abs(hp.y + .035 - .02 * hp.z) - .003, -hp.z), .006);
  head += .003 * abs(sin(hp.x * 40.)) * smoothstep(.05, .1, hp.y);
  return smin(d, head, .08);
}

/** The head being cooked. */
float sculpt(vec3 p) {
  if (uKind == 0) return cobra(p);
  return 10.;
}
`;
