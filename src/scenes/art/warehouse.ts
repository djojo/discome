import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";

const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt * rate));

/**
 * The warehouse: a flight down the endless aisles of a logistics hall. Pallet racks of cardboard boxes on both
 * sides (blue uprights, beams in the world's ink), a conveyor carrying parcels along the aisle, white neon battens
 * across the aisle whose cold light floods the boxes and the polished concrete. Each kick runs down the battens;
 * through a build the hall dims and the tubes flicker on the hats; on the drop they blaze and parcels rain down
 * into the aisle, tumbling, and pile up. As the night drifts, the racks fill up and more tubes die.
 * Variant « Serveurs »: a cold-aisle corridor of server cabinets under cable trays, on perforated floor tiles;
 * each kick sends a wave of LEDs down the cabinets, the drop turns every LED red (an alert) before they come back.
 */
export const warehouse = defineShaderScene({
  id: "warehouse",
  name: "Entrepôt",
  energy: "medium",
  hdr: true,
  renderScale: 0.8,
  mask: true,
  flight: { cruise: 2, pump: 0.3 },
  description:
    "Vol dans les allées infinies d'un entrepôt : rayonnages de cartons, tapis roulant, rampes de néons blancs qui battent au kick ; au drop les cartons dégringolent. Variante Serveurs : couloir de baies sous les chemins de câbles, une vague de LED à chaque kick, l'alerte rouge au drop.",
  params: [
    paletteParam("mercury"),
    {
      type: "select",
      key: "variant",
      label: "Variante",
      options: [
        { value: "boxes", label: "Cartons" },
        { value: "servers", label: "Serveurs" },
      ],
      default: "boxes",
    },
    ...flightParams(1, 1.2),
  ],
  uniforms: () => ({
    uFall: { value: 99 },
    uServers: { value: 0 },
    uWave: { value: 9 },
    uRise: { value: 0 },
    uAlert: { value: 0 },
    uSafe: { value: 0 },
  }),
  update(u, f, p, dt) {
    u.uServers.value = p.variant === "servers" ? 1 : 0;
    const fall = f.drop ? 0 : (u.uFall.value as number) + dt;
    u.uFall.value = fall;
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
    // the build's tension, smoothed so the hall doesn't snap back when the section changes
    const rise = f.section === "build" ? f.buildProgress : 0;
    u.uRise.value = approach(u.uRise.value as number, rise, rise > (u.uRise.value as number) ? 4 : 1.5, dt);
    // the servers' alert: every LED red for two bars after the drop, then back over a couple of bars
    const bar = f.bpm > 0 ? 240 / f.bpm : 2;
    u.uAlert.value = fall < bar * 2 ? 1 : Math.exp(-(fall - bar * 2) / (bar * 0.9));
    u.uSafe.value = f.safeFlash ? 1 : 0;
  },
  fragment: /* glsl */ `
uniform float uFall;     // seconds since the drop
uniform float uServers;
uniform float uWave;     // seconds since the kick
uniform float uRise;     // 0..1 through a build (smoothed)
uniform float uAlert;    // servers: 1 from the drop (every LED red), back to 0 over a few bars
uniform float uSafe;     // photosensitivity: softer pulses
${ART_LIB}
${FLIGHT_GLSL}
// ---- the warehouse
const float AX = 1.5;    // rack fronts at |x| = AX
const float RD = .9;     // rack depth
const float BAY = 1.2;   // bay length along the aisle
const float LV = 1.;     // level height
const float NL = 6.;     // levels
const float BARY = 5.1;  // underside of the neon battens hung across the aisle, low enough to be seen
const float BARW = 1.38; // their half length
const float BARS = 3.6;  // their spacing along the aisle
const float BD = .16;    // their half depth (three tubes side by side)
const float ROOF = 8.;
const float RG = 1.3;    // the parcels' rain: one cell per side every RG along the aisle
const float FAR = 48.;   // the march stops here: the haze has (nearly) swallowed everything
// ---- the server room
const float SX = 1.05;   // cabinet fronts at |x| = SX
const float SH = 2.3;    // cabinet height
const float CW = .6;     // cabinet width
const float SCEIL = 3.4;
const float UH = .0889;  // one 2U server

const vec3 COLD = vec3(.8, .9, 1.);      // the neon battens
const vec3 BLUEISH = vec3(.55, .74, 1.); // the server room's ceiling strip
const vec3 RED = vec3(1., .06, .03);

// warehouse: 0 rack steel, 1 box, 2 parcel on the conveyor, 3 conveyor, 4 falling parcel;
// server room: 4 cabinet, 5 cable tray, 6 cables, 7 fibre raceway, 8 trapeze
float gMat;
vec3 gId;
vec3 gC;      // a box's centre and half size (tape, label)
vec3 gS;
float gCamZ;
float gConv = 1.;   // 0 while the ray is known to be away from the conveyor
/** The smallest step a cell bound may impose: above the march's hit threshold, or cell edges show from afar. */
float gFloor = .03;

float sq(float x) { return x * x; }
float sdBox2(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }

// ================================================================ the warehouse

/** Is there a box in this half-slot? (more and more as the night drifts) */
float filled(vec3 id) { return step(hash13(id + uSeed), .5 + .42 * uDrift); }

float rack(vec3 p) {
  float side = p.x > 0. ? 1. : -1.;
  vec3 q = vec3(abs(p.x) - AX - RD * .5, p.y, p.z);   // q.x in [-RD/2, RD/2] inside the rack, aisle side first
  float b = sdBox(q - vec3(0., NL * LV * .5, 0.), vec3(RD * .5, NL * LV * .5 + .1, 1e3));
  if (b > .4) return b;
  float bz = floor(p.z / BAY);
  float lz = p.z - (bz + .5) * BAY;
  float lv = clamp(floor(p.y / LV), 0., NL - 1.);
  float ly = p.y - lv * LV;
  // uprights: a post at the front and at the back of every bay boundary
  float up = sdBox(vec3(abs(q.x) - RD * .5 + .04, p.y - NL * LV * .5, abs(lz) - BAY * .5), vec3(.04, NL * LV * .5 + .1, .045));
  // beams and deck at each level, folded so a point sees both its own level's and the next one's
  float sy = ly - LV * step(.5 * LV, ly);
  float deck = sdBox2(vec2(q.x, sy - .05), vec2(RD * .5, .05));
  // the back of the rack: a dark mesh panel (an empty slot shows a shadow, not the void behind)
  float back = RD * .5 - q.x;
  float d = min(min(up, deck), back);
  gMat = 0.;
  // two boxes per bay and level, each in its half-slot
  float hz = floor(p.z / (BAY * .5));
  float hl = p.z - (hz + .5) * BAY * .5;
  vec3 id = vec3(hz, lv, side);
  // (a box never stands in front of q.x = -RD/2 + .04: skip it while the structure is closer)
  if (-RD * .5 + .04 - q.x < d && filled(id) > .5) {
    float h = hash13(id + 3.1);
    vec3 hv = fract(h * vec3(1., 37.1, 91.3));
    vec3 s = vec3(.27 + .1 * hv.x, .16 + .2 * hv.y, .2 + .065 * hv.z);
    vec3 c = vec3(-RD * .5 + .05 + s.x + .07 * fract(h * 13.7), .1 + s.y, (fract(h * 59.3) - .5) * (BAY * .5 - 2. * s.z - .03));
    float bx = sdBox(vec3(q.x, ly, hl) - c, s) - .008;
    if (bx < d) { d = bx; gMat = 1.; gId = id; gC = c + vec3(0., lv * LV, (hz + .5) * BAY * .5); gS = s; }
  }
  // never further than the half-slot's edge (a box may be in the next one), unless still in front of the rack
  // or above the tallest box a level can hold
  float above = lv < NL - 1. ? min(ly - .83, LV + .1 - ly) : ly - .83;
  return min(d, max(max(BAY * .25 - abs(hl), max(-RD * .5 + .04 - q.x, above)), gFloor));
}

/** The conveyor along the aisle, and the parcels riding it. */
float conveyor(vec3 p) {
  // everything here lies in this box: outside, its distance is a safe step
  float zone = sdBox2(vec2(p.x, p.y - .47), vec2(.36, .47));
  gMat = 3.;
  if (zone > .1) return zone;
  float frame = sdBox2(vec2(abs(p.x) - .33, p.y - .3), vec2(.03, .24));
  float belt = sdBox2(vec2(p.x, p.y - .45), vec2(.31, .04));
  float d = min(frame, belt);
  const float GAP = 1.6;
  float z = p.z + uTime * 1.4;
  float cz = floor(z / GAP);
  float lz = z - (cz + .5) * GAP;
  float h = hash12(vec2(cz, 4.4));
  if (h < .7) {
    vec3 hv = fract(h * vec3(31.7, 57.3, 83.9));
    vec3 s = vec3(.2 + .06 * hv.x, .12 + .1 * hv.y, .22 + .07 * hv.z);
    float box = sdBox(vec3(p.x, p.y - .49 - s.y, lz), s) - .008;
    if (box < d) {
      d = box; gMat = 2.; gId = vec3(cz, 7., 0.);
      gC = vec3(0., .49 + s.y, (cz + .5) * GAP - uTime * 1.4); gS = s;
    }
  }
  // a parcel of the next cell is no closer than this cell's edge, nor than the lane they ride in
  float lane = sdBox2(vec2(p.x, p.y - .8), vec2(.27, .32));
  return min(d, max(max(GAP * .5 - abs(lz), lane), gFloor));
}

/**
 * The k-th parcel of a rain cell (k = 0 lands on the floor, k = 1 on top of it): its centre in the folded
 * space (x = |x|), its half size, its yaw and its tumble (whole half-turns, so it lands flat).
 */
void parcel(vec2 cell, float k, out vec3 c, out vec3 s, out float yaw, out float tumble, out float axis) {
  vec2 hc = cell + k * 17.3;
  s = vec3(.24 + .1 * hash12(hc + .1), .17 + .15 * hash12(hc + 3.7), .27 + .12 * hash12(hc + 9.4));
  float s0 = .17 + .15 * hash12(cell + 3.7);   // the bottom parcel's half height
  float land = k < .5 ? s.y : 2. * s0 + s.y;
  float t0 = hash12(cell + 5.5) * 2.4 + k * (1.2 + 1.4 * hash12(cell + 6.6));
  float t = uFall - t0;
  const float G = 7.5;
  const float Y0 = 7.7;
  float ft = sqrt(2. * (Y0 - land) / G);
  float tc = clamp(t, 0., ft);
  float y = t < 0. ? 30. : Y0 - .5 * G * tc * tc;
  y -= max(uFall - 24., 0.) * .3;   // much later, the heap sinks into the concrete
  c = vec3(1.02 + (hash12(hc + 2.2) - .5) * .08, y, (cell.x + .5) * RG + (hash12(hc + 4.8) - .5) * .08);
  yaw = (hash12(hc + 7.1) - .5) * .5;
  axis = step(.5, hash12(hc + 8.3));
  tumble = PI * (1. + floor(hash12(hc + 1.9) * 1.99)) * tc / ft;
  s *= smoothstep(0., .18, t);   // grows in as it appears in the dark under the roof
}

vec3 parcelLocal(vec3 q, vec3 c, float yaw, float tumble, float axis) {
  vec3 l = q - c;
  l.xz *= rot(yaw);
  if (axis > .5) l.yz *= rot(tumble); else l.xy *= rot(tumble);
  return l;
}

/** The drop: parcels rain into both sides of the aisle, tumbling, and pile up two high. */
float rain(vec3 p) {
  if (uFall > 36.) return 1e3;
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float rb = sdBox(q - vec3(1.02, 4., 0.), vec3(.66, 4.2, 1e3));
  if (rb > .3) return rb;
  float side = p.x > 0. ? 1. : -1.;
  float cz = floor(q.z / RG);
  float lz = q.z - (cz + .5) * RG;
  vec2 cell = vec2(cz, side);
  float d = 1e3;
  for (int k = 0; k < 2; k++) {
    vec3 c, s; float yaw, tumble, axis;
    parcel(cell, float(k), c, s, yaw, tumble, axis);
    float bd = sdBox(parcelLocal(q, c, yaw, tumble, axis), s) - .008;
    if (bd < d) { d = bd; gId = vec3(cell, float(k)); }
  }
  return min(d, max(RG * .5 - abs(lz) + .02, gFloor));
}

float mapWarehouse(vec3 p) {
  float r = rack(p);
  float m = gMat; vec3 id = gId, c = gC, s = gS;
  float cv = gConv < .5 ? 1e3 : conveyor(p);
  if (cv < r) { r = cv; m = gMat; id = gId; c = gC; s = gS; }
  float a = rain(p);
  if (a < r) { gMat = 4.; return a; }
  gMat = m; gId = id; gC = c; gS = s;
  return r;
}

// ================================================================ the server room

float mapServers(vec3 p) {
  float side = p.x > 0. ? 1. : -1.;
  float ax = abs(p.x);
  // the cabinets, side by side, doors not quite flush
  float cz = floor(p.z / CW);
  float lz = p.z - (cz + .5) * CW;
  vec3 id = vec3(cz, 0., side);
  float inset = .018 * hash13(id + 2.3);
  float d = sdBox(vec3(ax - SX - .55 - inset, p.y - SH * .5, lz), vec3(.55, SH * .5, CW * .5 - .006)) - .003;
  d = min(d, max(max(CW * .5 - abs(lz) + .004, SX - ax - .002), gFloor));
  gMat = 4.; gId = id;
  if (p.y < 2.35) return min(d, 2.52 - p.y);
  // the trays overhead: a wire basket full of cables on each side of the aisle, the yellow fibre raceway over each row
  vec2 bq = vec2(ax - .58, p.y - 2.9);
  float basket = max(sdBox2(bq, vec2(.21, .055)), -sdBox2(bq - vec2(0., .02), vec2(.195, .055)));
  float cables = sdBox2(bq - vec2(0., -.01), vec2(.18, .032)) - .012;
  vec2 fq = vec2(ax - SX - .16, p.y - 2.62);
  float fibre = max(sdBox2(fq, vec2(.1, .05)), -sdBox2(fq - vec2(0., .02), vec2(.088, .05)));
  // trapezes holding the baskets: a strut under them and two rods up to the ceiling, every 1.5 m
  float sz = mod(p.z, 1.5) - .75;
  float strut = sdBox(vec3(p.x, p.y - 2.83, sz), vec3(.84, .018, .02));
  float rod = sdBox(vec3(ax - .82, p.y - 3.12, sz), vec3(.009, .3, .009));
  float tr = min(strut, rod);
  if (basket < d) { d = basket; gMat = 5.; }
  if (cables < d) { d = cables; gMat = 6.; }
  if (fibre < d) { d = fibre; gMat = 7.; }
  if (tr < d) { d = tr; gMat = 8.; }
  return d;
}

float map(vec3 p) { return uServers > .5 ? mapServers(p) : mapWarehouse(p); }

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .002;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
float ao3(vec3 p, vec3 n) {
  float o = 0., s = 1.;
  for (int i = 0; i < 3; i++) { float h = .04 + .14 * float(i); o += (h - map(p + n * h)) * s; s *= .7; }
  return clamp(1. - 1.6 * o, .2, 1.);
}

// ================================================================ light

/** The hall's light, "ahead" metres down the aisle: each kick runs away from us along the battens. */
float hallLevel(float ahead) {
  float soft = uSafe > .5 ? .45 : 1.;
  float tk = uWave - max(ahead, 0.) / 260.;
  float kick = tk >= 0. ? exp(-tk * 5.) : 0.;
  return mix(.5, .2, uRise) + kick * (1.6 + 1.6 * uRise) * soft + uDrop * 1.6 * soft;
}
/** Batten k's level: through a build some crackle on the hats; a few tubes are dying, more as the night drifts. */
float barLevel(float k, float ahead) {
  float lvl = hallLevel(ahead);
  lvl += uHat * uRise * 1.4 * step(.6, hash12(vec2(k, floor(uTime * 5.) + uSeed))) * (uSafe > .5 ? .3 : 1.);
  float hk = hash12(vec2(k, uSeed + 3.3));
  if (hk < .035 + .1 * uDrift) lvl *= hk < .012 ? .06 : .15 + .85 * step(.45, vnoise(vec3(k * 3.1, uTime * 7., 1.)));
  return lvl;
}

/** Cold light from the two nearest battens. */
float barLight(vec3 p, vec3 n) {
  float k0 = floor(p.z / BARS);
  float e = 0.;
  for (int i = 0; i < 2; i++) {
    float k = k0 + float(i);
    vec3 v = vec3(clamp(p.x, -BARW, BARW), BARY, k * BARS) - p;
    float r2 = dot(v, v);
    float w = clamp((dot(n, v * inversesqrt(r2)) + .35) / 1.35, 0., 1.);
    e += w * barLevel(k, gCamZ - k * BARS) * min(5. / (1. + r2 * .16), 3.2);
  }
  return e;
}

/** A batten seen from below: housing, reflector, three tubes. */
vec3 barSeen(vec3 pb, float lvl, float px) {
  float k = floor(pb.z / BARS + .5);
  float dz = abs(pb.z - k * BARS);
  float w = .02 + px;
  float tubes = (exp(-sq(dz / w)) + exp(-sq((dz - .095) / w))) * min(.02 / w * 1.4, 1.);
  float refl = 1. - smoothstep(BD - .04, BD - .02, dz);
  float ends = 1. - smoothstep(BARW - .12, BARW, abs(pb.x));
  // the tubes themselves saturate: a flash floods the hall, not the lens
  float tl = lvl / (1. + .25 * lvl);
  return COLD * (tubes * 14. * tl * mix(.4, 1., ends) + refl * .9 * lvl) + vec3(.03);
}

/** The racks as the polished floor reflects them: rows of boxes in the cold light, the beams' lines. */
vec3 rackGlance(float y, float blur, float lvl) {
  float ly = fract(y / LV);
  float beam = exp(-sq(min(ly, 1. - ly) * LV / (.05 + blur)));
  float boxes = smoothstep(.1, .2 + blur, ly) * (1. - smoothstep(.6, .75 + blur, ly));
  float light = .25 + .75 * smoothstep(0., 6., y);
  vec3 c = vec3(.5, .38, .25) * boxes * .7 * light * COLD * lvl * 1.4 + uInk * beam * .35 * light * lvl;
  return c * step(y, NL * LV);
}

// ================================================================ the server room's LEDs

/** A 1D blurred spot of half width w, seen through a pixel px, on a period P (its average once unresolved). */
float spot(float d, float w, float px, float P) {
  float s2 = w * w + px * px;
  return mix(exp(-d * d / s2) * w * inversesqrt(s2), 1.772 * w / P, smoothstep(.3, .7, px / P));
}

/** The kick's wave down the cabinets, "ahead" metres in front of us. */
float ledWave(float ahead) {
  float front = uWave * 30. - 1.;
  float w = exp(-sq((ahead - front) / 2.2)) + .4 * step(ahead, front) * exp(-(front - ahead) * .3);
  return w * exp(-uWave * .7) * (uSafe > .5 ? .55 : 1.);
}

/** The LEDs of a cabinet face: cz cabinet, lz across its width, y height; pz / py the pixel footprint there. */
vec3 leds(float cz, float side, float lz, float y, float pz, float py, float ahead) {
  float uy = (y - .14) / UH;
  float row = floor(uy);
  if (row < 0. || row > 22.) return vec3(0.);
  vec3 rid = vec3(cz, row, side);
  float ht = hash13(rid + 4.1);
  if (ht < .16) return vec3(0.);              // a blank panel
  bool sw = ht > .74;                          // a switch: two rows of port lights
  float pitch = sw ? .024 : .042;
  float cx = (lz + .24) / pitch;
  float col = floor(cx);
  float far = smoothstep(.3, .7, pz / pitch);
  float wv = ledWave(ahead);
  float alert = uAlert;
  // which colour, and is it lit (blinking with the hats, faster through a build)
  float hl = hash13(vec3(col, row * 7. + cz, side) + 1.3);
  vec3 c = hl < .68 ? vec3(.25, 1., .42) : hl < .88 ? vec3(.3, .55, 1.) : vec3(1., .55, .12);
  float rate = .8 + 2.5 * hl + 5. * uHat + 6. * uRise;
  float on = step(.45, hash13(vec3(col + cz * 31., row, side) + floor(uTime * rate + hl * 9.)));
  float pOn = .55;
  on = mix(on, pOn, far);
  c = mix(c, vec3(.3, .85, .5), far);
  c = mix(c, vec3(.7, .95, 1.), min(wv, 1.) * .8);
  on = max(on, min(wv * 2., 1.));
  float kick = exp(-uWave * 5.) * (uSafe > .5 ? .4 : 1.);
  c = mix(c, RED * (1. + 1.2 * kick), alert);
  on = mix(on, 1., alert);
  float inRow = step(0., col) * step(col, sw ? 19. : 10.);
  float ly = fract(uy);
  float iz = spot(fract(cx) - .5, .19, pz / pitch, 1.) * inRow;
  float iy = sw ? spot((ly - .3) * UH, .0045, py, UH) + spot((ly - .72) * UH, .0045, py, UH) : spot((ly - .32) * UH, .0045, py, UH);
  // the power / status light at the right end
  float st = spot(lz - .255, .006, pz, CW) * spot((ly - .55) * UH, .006, py, UH);
  vec3 e = c * on * iz * iy * 7. * (1. + 4. * wv) + mix(vec3(.3, .55, 1.), RED, alert) * st * 5.;
  return e;
}

/** What the LED walls throw around: green and calm, red in the alert, brighter in the wave. */
vec3 ledAmbient() {
  return mix(vec3(.2, .8, .45) * .35, RED * 1.1, uAlert) * (1. + .8 * ledWave(6.));
}

float stripLevel() { return mix(1., .45, uRise) * (1. - .7 * uAlert); }

/** The ceiling strip of the server room: a line light along the aisle. */
float stripLight(vec3 p, vec3 n) {
  vec3 v = vec3(-p.x, SCEIL - .02 - p.y, 0.);
  float r = length(v);
  float w = clamp((dot(n, v / r) + .3) / 1.3, 0., 1.);
  return w * 6.5 / (.6 + r) * stripLevel();
}

// ================================================================ materials

/** Cardboard: kraft, white or dark board, tape over the top seam, a label with a barcode on face lf. */
vec3 cardboard(vec3 id, vec3 l, vec3 s, vec3 nl, vec3 lf, float px) {
  float h = hash13(id + 9.1);
  vec3 c = h < .66 ? vec3(.6, .44, .28) * (.82 + .3 * hash13(id + 4.2)) : h < .87 ? vec3(.82, .81, .78) : vec3(.4, .29, .19);
  // tape along the top seam, folding down the two faces it reaches
  float tape = (1. - smoothstep(.026, .026 + px, abs(l.z))) * (nl.y > .5 ? 1. : step(s.y - .09, l.y) * step(.5, abs(nl.x)));
  c = mix(c, vec3(.66, .54, .38), tape * .8);
  if (dot(nl, lf) > .5) {
    vec2 f = abs(lf.x) > .5 ? vec2(l.z, l.y) : vec2(l.x, l.y);
    vec2 fs = abs(lf.x) > .5 ? s.zy : s.xy;
    vec2 lh = min(vec2(.075, .05), fs * .6);
    vec2 lc = vec2((hash13(id + 2.2) - .5) * (fs.x - lh.x) * 1.4, -fs.y * .25);
    vec2 g = abs(f - lc) - lh;
    float label = 1. - smoothstep(-px, px, max(g.x, g.y));
    // the barcode in the label's lower half
    float bars = step(.45, hash12(vec2(floor((f.x - lc.x) * 140.), id.x)));
    bars = mix(bars, .5, clamp(px * 140. - .3, 0., 1.));
    float inBar = step(f.y, lc.y - lh.y * .05) * step(lc.y - lh.y * .8, f.y) * step(abs(f.x - lc.x), lh.x * .8);
    c = mix(c, vec3(.9) * (1. - .85 * bars * inBar), label);
  }
  return c;
}

// ================================================================ main

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank);
  uv += flightShake();
  bool srv = uServers > .5;
  // the take-off stays under the battens (and under the trays in the server room)
  float alt = srv ? clamp(1.5 + uDive * .45, 1.05, 2.1) : 1.6 + (uDive > 0. ? uDive * 1.75 : uDive * .5);
  vec3 ro = vec3(uSway * (srv ? .38 : .5), alt, -uTravel);
  gCamZ = ro.z;
  vec3 ta = ro + vec3(uSway * .3, srv ? -.05 - .12 * max(uDive, 0.) : -.1 - .3 * max(uDive, 0.), -4.);
  float focal = flightFocal(1.5);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, focal));
  float pxk = 1. / (focal * uRes.y);   // a pixel's size at distance 1

  float ceilY = srv ? SCEIL : ROOF;
  float tc = rd.y > 1e-4 ? (ceilY - ro.y) / rd.y : 1e5;
  float tf = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tmax = min(min(tc, tf), FAR);
  float t = .05, tt = -1.;
  const float EPS = .0015;
  // where the ray crosses the conveyor's prism (|x| < .37, y < .95): elsewhere the march ignores it
  float cin = 1e5, cout = -1.;
  if (!srv) {
    vec2 ix = abs(rd.x) > 1e-5 ? vec2((-.37 - ro.x) / rd.x, (.37 - ro.x) / rd.x) : vec2(abs(ro.x) < .37 ? -1e5 : 1e5, 1e5);
    vec2 iy = abs(rd.y) > 1e-5 ? vec2((-.01 - ro.y) / rd.y, (.95 - ro.y) / rd.y) : vec2(ro.y < .95 ? -1e5 : 1e5, 1e5);
    ix = vec2(min(ix.x, ix.y), max(ix.x, ix.y));
    iy = vec2(min(iy.x, iy.y), max(iy.x, iy.y));
    cin = max(max(ix.x, iy.x), 0.);
    cout = min(ix.y, iy.y);
    if (cout < cin) { cin = 1e5; cout = -1.; }
  }
  for (int i = 0; i < 110; i++) {
    gConv = t > cin - .1 && t < cout + .1 ? 1. : 0.;
    gFloor = max(.03, EPS * t * 1.6);
    float d = map(ro + rd * t);
    if (t < cin) d = min(d, max(cin - .05 - t, .02));
    if (d < EPS * t) { tt = t; break; }
    t += d * .95;
    if (t > tmax) break;
  }
  gConv = 1.;
  gFloor = .03;

  vec3 col;
  float hitT;
  vec3 glow = vec3(0.);
  if (!srv) {
    // ---------------------------------------------------------------- the warehouse
    float lvlMid = hallLevel(18.);
    if (tt > 0.) {
      hitT = tt;
      vec3 p = ro + rd * tt;
      map(p);
      float mat = gMat;
      vec3 id = gId, bc = gC, bs = gS;
      vec3 n = calcN(p);
      float ao = tt < 22. ? mix(ao3(p, n), 1., smoothstep(15., 22., tt)) : 1.;
      float px = tt * pxk;
      float side = p.x > 0. ? 1. : -1.;
      vec3 alb;
      float sp = 0.;
      if (mat > 3.5) {
        // a parcel of the rain: back to its own frame
        vec3 c, s; float yaw, tumble, axis;
        parcel(id.xy, id.z, c, s, yaw, tumble, axis);
        vec3 q = vec3(abs(p.x), p.y, p.z);
        vec3 l = parcelLocal(q, c, yaw, tumble, axis);
        vec3 nl = parcelLocal(vec3(n.x * side, n.y, n.z) + c, c, yaw, tumble, axis);
        alb = cardboard(vec3(id.xy, id.z + 40.), l, s, nl, vec3(-1., 0., 0.), px) * 1.1;
      } else if (mat > 2.5) {
        // the conveyor: steel frame, black belt with its rollers' shadows
        bool beltTop = n.y > .5 && abs(p.x) < .31;
        alb = beltTop ? vec3(.035) * (.7 + .3 * smoothstep(.2, .5, abs(fract((p.z + uTime * 1.4) * 4.) - .5) * 2.)) : vec3(.3, .32, .34);
        sp = beltTop ? .02 : .25;
      } else if (mat > 1.5) {
        // a parcel on the conveyor
        alb = cardboard(id, p - bc, bs, n, vec3(0., 0., 1.), px);
      } else if (mat > .5) {
        vec3 l = vec3(abs(p.x) - AX - RD * .5, p.y, p.z) - bc;
        alb = cardboard(id, l, bs, vec3(n.x * side, n.y, n.z), vec3(-1., 0., 0.), px);
      } else {
        // rack steel: blue uprights, beams in the world's ink along the front of each level, a pallet deck
        vec3 q = vec3(abs(p.x) - AX - RD * .5, p.y, p.z);
        float ly = fract(p.y / LV);
        float onDeck = step(min(ly, 1. - ly), .11);
        float front = step(q.x, -RD * .5 + .07);
        alb = mix(vec3(.07, .13, .26), mix(vec3(.42, .3, .18), uInk * .75, front), onDeck);
        alb = mix(alb, vec3(.015, .017, .02), step(RD * .5 - .03, q.x));   // the back panel
        sp = .15;
      }
      float e = barLight(p, n);
      vec3 amb = mix(COLD * .06 * lvlMid, uBase * .5 + COLD * .03, n.y * .5 + .5);
      col = alb * (COLD * e + amb) * ao;
      // a little sheen of the tubes on steel
      vec3 rr = reflect(rd, n);
      col += sp * COLD * lvlMid * .3 * smoothstep(.5, 1., rr.y) * ao;
    } else if (tf < tc && tf < FAR) {
      hitT = tf;
      vec3 p = ro + rd * tf;
      float px = tf * pxk;
      // polished concrete: slabs, saw cuts, yellow lines along the racks
      float mott = .8 + .35 * vnoise(vec3(p.xz * .6, 1.)) + .1 * vnoise(vec3(p.xz * 4., 2.));
      vec3 alb = vec3(.15, .155, .16) * mott;
      float cut = (1. - smoothstep(.005, .005 + px, abs(mod(p.z, 6.) - 3.))) * (1. - smoothstep(.02, .08, px));
      alb *= 1. - .5 * cut;
      float line = (1. - smoothstep(.04, .04 + px, abs(abs(p.x) - 1.36))) * (1. - smoothstep(.02, .1, px));
      alb = mix(alb, mix(vec3(1., .78, .18), uAccent, .25) * .7, line);
      float e = barLight(p, vec3(0., 1., 0.));
      // contact shadows at the foot of the racks and under the conveyor
      float sh = (1. - .55 * exp(-max(1.42 - abs(p.x), 0.) * 9.)) * (1. - .7 * (1. - smoothstep(.25, .55, abs(p.x))));
      col = alb * (COLD * e + uBase * .4) * sh;
      // the reflection: the battens overhead, the racks on either side, smeared by the polish
      vec3 rr = vec3(rd.x, -rd.y, rd.z);
      float fres = .06 + .6 * pow(1. - abs(rd.y), 5.);
      vec3 refl = vec3(0.);
      float tw = abs(rr.x) > 1e-4 ? (sign(rr.x) * AX - p.x) / rr.x : 1e5;
      float tb = (BARY - p.y) / rr.y;
      if (tw < tb) {
        vec3 pw = p + rr * tw;
        refl = rackGlance(pw.y, tw * .06, hallLevel(gCamZ - pw.z));
      } else {
        vec3 pb = p + rr * tb;
        float k = floor(pb.z / BARS + .5);
        float bw = BD + tb * .006 + tb * pxk / max(rr.y, .03);
        float dz = pb.z - k * BARS;
        refl = COLD * barLevel(k, gCamZ - k * BARS) * 9. * exp(-sq(dz / bw)) * min(BD * 1.5 / bw, 1.)
             * (1. - smoothstep(BARW - .2, BARW + bw, abs(pb.x)));
      }
      col += refl * fres * mott * sh;
    } else if (tc < FAR) {
      hitT = tc;
      vec3 p = ro + rd * tc;
      // the roof: dark corrugated sheet, steel trusses across
      float tr = 1. - smoothstep(.05, .12, abs(mod(p.z, 7.2) - 3.6));
      col = vec3(.025, .03, .035) * (.8 + .2 * sin(p.x * 30.)) * (1. - .5 * tr) + COLD * .02 * lvlMid;
    } else {
      hitT = FAR;
      col = uBase * .25 + COLD * .05 * lvlMid;   // the far end, lost in the haze
    }
    // the battens: the ray crosses their underside, or the front of the next one
    if (rd.y > 1e-3) {
      float tb = (BARY - ro.y) / rd.y;
      if (tb > 0. && tb < hitT) {
        vec3 pb = ro + rd * tb;
        float k = floor(pb.z / BARS + .5);
        float dz = pb.z - k * BARS;
        float lvl = barLevel(k, gCamZ - k * BARS);
        if (abs(pb.x) < BARW && abs(dz) < BD) {
          col = barSeen(pb, lvl, tb * pxk / max(rd.y, .05));
          hitT = tb;
        } else {
          // the front face of the batten ahead, if the ray rises into it
          float kf = floor((pb.z - BD) / BARS);
          float tf2 = (kf * BARS + BD - ro.z) / rd.z;
          vec3 pf = ro + rd * tf2;
          if (rd.z < 0. && tf2 > tb && tf2 < hitT && pf.y < BARY + .08 && abs(pf.x) < BARW) {
            col = vec3(.05, .055, .06) + COLD * .05 * barLevel(kf, gCamZ - kf * BARS);
            hitT = tf2;
          }
          // the halo around the tubes
          glow += COLD * lvl * .6 * exp(-(abs(dz) - BD) * 7.) * (1. - smoothstep(BARW - .3, BARW + .5, abs(pb.x)));
        }
      }
    }
    // the dusty air: a veil of light hangs under every batten the ray passes
    if (rd.z < -.05) {
      float k0 = floor(ro.z / BARS);
      for (int i = 0; i < 18; i++) {
        float k = k0 - float(i);
        float tk = (k * BARS - ro.z) / rd.z;
        if (tk > hitT) break;
        if (tk < .3) continue;
        vec3 pk = ro + rd * tk;
        float dy = BARY - pk.y;
        float veil = dy > 0. ? exp(-dy * .55) * .07 + exp(-sq(dy / .2)) * .06 : exp(dy * 6.) * .06;
        float bl = barLevel(k, gCamZ - k * BARS);
        glow += COLD * bl / (1. + .25 * bl) * veil / max(-rd.z, .5) * (1. - smoothstep(BARW - .2, BARW + .8, abs(pk.x)));
      }
    }
    glow /= 1. + .3 * dot(glow, vec3(.33));
    // the haze of the hall, lit by the battens
    float fog = 1. - exp(-hitT * .036);
    col = mix(col, uBase * .25 + COLD * .05 * lvlMid, fog) + glow;
  } else {
    // ---------------------------------------------------------------- the server room
    vec3 lamb = ledAmbient();
    if (tt > 0.) {
      hitT = tt;
      vec3 p = ro + rd * tt;
      map(p);
      float mat = gMat;
      vec3 id = gId;
      vec3 n = calcN(p);
      float ao = ao3(p, n);
      float side = p.x > 0. ? 1. : -1.;
      float px = tt * pxk;
      vec3 alb = vec3(.04);
      vec3 emis = vec3(0.);
      float gloss = 0.;
      if (mat > 7.5) alb = vec3(.25, .26, .27);                                  // trapezes
      else if (mat > 6.5) alb = mix(vec3(1., .74, .08), uAccent, .15) * .75;     // fibre raceway
      else if (mat > 5.5) {
        // bundles of cables: blue, grey, a few yellow and red, running along the aisle
        float strand = hash12(vec2(floor(p.x * 70.), 3.));
        vec3 cc = strand < .5 ? vec3(.1, .2, .45) : strand < .8 ? vec3(.25, .26, .28) : strand < .92 ? vec3(.6, .5, .1) : vec3(.5, .08, .06);
        alb = mix(cc, vec3(.2, .22, .3), clamp(px * 70. - .3, 0., 1.));
      } else if (mat > 4.5) {
        // the wire basket: a grid of galvanised wires
        vec2 g = abs(fract(vec2(p.x * 20., p.z * 10.)) - .5);
        float wire = 1. - smoothstep(.1, .1 + px * 20., min(g.x, g.y * 2.));
        alb = mix(vec3(.05), vec3(.45, .47, .5), mix(wire, .35, clamp(px * 20. - .3, 0., 1.)));
      } else if (n.x * side < -.5) {
        // a cabinet door: frame, handle, the servers behind the perforated mesh
        float cz = floor(p.z / CW);
        float lz = p.z - (cz + .5) * CW;
        float pz = px / max(abs(rd.x), .02);
        float frame = step(CW * .5 - .03, abs(lz)) + step(p.y, .1) + step(SH - .1, p.y);
        float handle = (1. - smoothstep(.007, .007 + pz, abs(lz - CW * .5 + .055))) * step(.95, p.y) * step(p.y, 1.3);
        float uy = fract((p.y - .14) / UH);
        float seam = 1. - smoothstep(.04, .04 + px / UH, min(uy, 1. - uy));
        alb = mix(vec3(.034, .04, .052) * (1. - .5 * seam), vec3(.014), min(frame, 1.));
        alb = mix(alb, vec3(.5, .52, .55), handle);
        gloss = .22 + .25 * handle;
        if (frame < .5) emis = leds(cz, side, lz, p.y, pz, px, gCamZ - p.z) * (.75 + .25 * ao);
      } else alb = vec3(.025, .027, .03);
      float e = stripLight(p, n);
      // what the LED walls throw on the trays, the floor and the opposite cabinets
      vec3 fill = lamb * (.12 + .25 * max(-n.y, 0.)) + BLUEISH * .08;
      col = alb * (BLUEISH * e + fill + uBase * .25) * ao + emis;
      // glossy doors and steel catch the ceiling strip
      vec3 rr = reflect(rd, n);
      if (rr.y > 0.) {
        vec3 pc = p + rr * (SCEIL - p.y) / rr.y;
        col += gloss * BLUEISH * 2.5 * stripLevel() * exp(-sq(pc.x / (.12 + .05 * (SCEIL - p.y)))) * ao;
      }
    } else if (tf < tc && tf < FAR) {
      hitT = tf;
      vec3 p = ro + rd * tf;
      float px = tf * pxk;
      // the raised floor: 60 cm tiles, perforated in the cold aisle
      vec2 tc2 = p.xz / .6;
      vec2 tl = abs(fract(tc2) - .5);
      // (seams and holes fade to their average before they get small enough to shimmer)
      float seam = 1. - (1. - smoothstep(.49, .49 + px / .6 * 1.5, max(tl.x, tl.y))) * (1. - smoothstep(.01, .04, px / .6));
      float perf = step(abs(p.x), SX) * step(.3, hash12(floor(tc2) + 7.));
      vec2 hp = abs(fract(p.xz / .04) - .5);
      float hole = (1. - smoothstep(.22, .22 + px / .04, length(hp))) * step(max(tl.x, tl.y), .44);
      hole = mix(hole, .15, clamp(px / .04 * 2.5 - .4, 0., 1.)) * perf;
      vec3 alb = vec3(.4, .41, .43) * (1. - .85 * hole) * (1. - .6 * (1. - seam));
      float e = stripLight(p, vec3(0., 1., 0.));
      float nearWall = exp(-(SX - abs(p.x)) * 2.);
      // the wave and the alert light the floor along the cabinets
      vec3 wl = mix(vec3(.5, .9, 1.), RED, uAlert) * ledWave(gCamZ - p.z) * .6;
      col = alb * (BLUEISH * e + (lamb + wl) * (.1 + .3 * nearWall) + uBase * .3 + BLUEISH * .05);
      // glossy vinyl: the LED walls and the ceiling strip reflected
      vec3 rr = vec3(rd.x, -rd.y, rd.z);
      float fres = (.04 + .5 * pow(1. - abs(rd.y), 5.)) * (1. - .5 * perf);
      float tw = abs(rr.x) > 1e-4 ? (sign(rr.x) * SX - p.x) / rr.x : 1e5;
      vec3 refl;
      vec3 pw = p + rr * tw;
      if (pw.y < SH) {
        float cz = floor(pw.z / CW);
        float blur = tw * .035;
        float pz = (tf + tw) * pxk / max(abs(rr.x), .02) + blur;
        refl = leds(cz, sign(rr.x), pw.z - (cz + .5) * CW, pw.y, pz, (tf + tw) * pxk + blur, gCamZ - pw.z) * 1.6;
      } else {
        vec3 pc = p + rr * (SCEIL / rr.y);
        refl = BLUEISH * 3. * stripLevel() * exp(-sq(pc.x / (.1 + SCEIL * .05)));
      }
      col += refl * fres * (1. - .6 * (1. - seam));
    } else if (tc < FAR) {
      hitT = tc;
      vec3 p = ro + rd * tc;
      // the ceiling: tiles, and the light strip along the aisle
      vec2 tl = abs(fract(p.xz / .6) - .5);
      col = (vec3(.04, .045, .055) + BLUEISH * .14 * exp(-abs(p.x) * 1.3) * stripLevel()) * (1. - .4 * step(.485, max(tl.x, tl.y)) * (1. - smoothstep(.01, .04, tc * pxk))) + lamb * .04;
      float strip = 1. - smoothstep(.06, .08, abs(p.x));
      col += BLUEISH * strip * 5. * stripLevel() * step(.08, fract(p.z / 2.4));
      glow += BLUEISH * .15 * exp(-abs(p.x) * 6.) * stripLevel();
    } else {
      hitT = FAR;
      col = uBase * .2 + BLUEISH * .11 * stripLevel() + lamb * .06;
    }
    // cold air, tinted by the LEDs
    float fog = 1. - exp(-hitT * .045);
    col = mix(col, uBase * .2 + BLUEISH * .11 * stripLevel() + lamb * .06, fog) + glow;
  }
  gl_FragColor = vec4(hdrOut(col), 1.);
}
`,
});
