import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";

/**
 * The warehouse: a flight down the endless aisles of a logistics hall. Racks of identical boxes on both sides,
 * a conveyor carrying parcels along the aisle, strip lights overhead pulsing on the kick. On the drop parcels
 * rain down into the aisle and pile up on the floor; as the night drifts, the racks fill up.
 * Variant « Serveurs »: the same aisles, made of server racks blinking with tiny lights.
 */
export const warehouse = defineShaderScene({
  id: "warehouse",
  name: "Entrepôt",
  energy: "medium",
  renderScale: 0.8,
  mask: true,
  flight: { cruise: 2, pump: 0.3 },
  description:
    "Vol dans les allées infinies d'un entrepôt : rayonnages de cartons identiques, tapis roulant, néons au kick ; au drop les cartons dégringolent. Variante Serveurs : des baies qui clignotent.",
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
  }),
  update(u, f, p, dt) {
    u.uServers.value = p.variant === "servers" ? 1 : 0;
    u.uFall.value = f.drop ? 0 : (u.uFall.value as number) + dt;
    u.uWave.value = f.beat ? 0 : (u.uWave.value as number) + dt;
  },
  fragment: /* glsl */ `
uniform float uFall;     // seconds since the drop (the avalanche)
uniform float uServers;
uniform float uWave;
${ART_LIB}
${FLIGHT_GLSL}
const float AX = 1.5;    // racks on both sides of the aisle, at |x| = AX
const float BAY = 1.2;   // bay length along the aisle
const float LV = 1.;     // shelf height
const float NL = 6.;     // levels
float gMat;              // 0 structure, 1 box / server, 2 conveyor parcel, 3 floor
vec3 gId;

/** Is there a box in this slot? (more and more as the night drifts) */
float filled(vec3 id) { return step(hash13(id + uSeed), .45 + .5 * uDrift); }


float rack(vec3 p) {
  float side = p.x > 0. ? 1. : -1.;
  vec3 q = vec3(abs(p.x) - AX - .45, p.y, p.z);
  // bound: the rack block, .9 deep, NL levels high
  float b = sdBox(q - vec3(0., NL * LV * .5, 0.), vec3(.5, NL * LV * .5, 1e3));
  if (b > .4) return b;
  float bz = floor(p.z / BAY);
  float lz = p.z - (bz + .5) * BAY;
  float lv = clamp(floor(p.y / LV), 0., NL - 1.);
  float ly = p.y - lv * LV;
  // uprights at the bay boundaries, shelves at each level
  float up = sdBox(vec3(q.x, p.y - NL * LV * .5, abs(lz) - BAY * .5), vec3(.45, NL * LV * .5, .03));
  float shelf = sdBox(vec3(q.x, ly - .02, lz), vec3(.45, .02, BAY * .5));
  float d = min(up, shelf);
  gMat = 0.;
  // the box in this slot (or a server unit)
  vec3 id = vec3(bz, lv, side);
  if (filled(id) > .5) {
    vec3 bq = vec3(q.x + .02 * hash13(id), ly - .32, lz + (hash13(id + 1.7) - .5) * .12);
    float bx = uServers > .5 ? sdBox(bq - vec3(0., .1, 0.), vec3(.42, .4, .55)) : sdBox(bq, vec3(.36, .3, .45)) - .01;
    if (bx < d) { d = bx; gMat = 1.; gId = id; }
  }
  // never more than the distance to the slot's edge (a fallen box may be in another slot)
  return min(d, max(BAY * .5 - abs(lz), .05));
}

/** The conveyor along the aisle, and the parcels riding it. */
float conveyor(vec3 p) {
  if (uServers > .5) return 1e3;
  float belt = sdBox(vec3(p.x, p.y - .45, 0.), vec3(.35, .05, 1e3));
  const float GAP = 1.6;
  float z = p.z + uTime * 1.4;
  float cz = floor(z / GAP);
  float lz = z - (cz + .5) * GAP;
  float box = hash12(vec2(cz, 4.4)) < .7 ? sdBox(vec3(p.x, p.y - .72, lz), vec3(.25, .22, .3)) - .01 : 1e3;
  if (box < belt) { gMat = 2.; return min(box, GAP * .5 - abs(lz) + .1); }
  gMat = 0.;
  return belt;
}

/** The avalanche: after the drop, parcels rain into the aisle and pile up on the floor, then sink away. */
float rain(vec3 p) {
  if (uFall > 18. || p.y > 6.6) return 1e3;
  const float GAP = .9;
  float cz = floor(p.z / GAP);
  float lz = p.z - (cz + .5) * GAP;
  vec3 h = vec3(hash12(vec2(cz, 1.1)), hash12(vec2(cz, 2.3)), hash12(vec2(cz, 5.7)));
  float t = max(uFall - h.y * 1.8, 0.);
  float y = (t > 0. ? max(.25 + h.z * .3, 6.8 - 4.9 * t * t) : 9.) - max(uFall - 14., 0.) * .4;
  vec3 q = vec3(p.x - (h.x - .5) * 2., p.y - y, lz);
  q.xz *= rot(h.z * 6.);
  float d = sdBox(q, vec3(.26, .2, .3)) - .01;
  return min(d, GAP * .5 - abs(lz) + .04);
}

float map(vec3 p) {
  float r = rack(p);
  float m = gMat;
  float c = conveyor(p);
  float a = rain(p);
  if (a < min(c, r)) { gMat = 2.; return a; }
  if (c < r) return c;
  gMat = m;
  return r;
}

vec3 calcN(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .002;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  uv *= rot(uBank);
  uv += flightShake();
  float alt = 1.6 + (uDive > 0. ? uDive * 2.6 : uDive * .5);
  vec3 ro = vec3(uSway * .5, alt, -uTravel);
  vec3 ta = ro + vec3(uSway * .3, -.1 - .3 * max(uDive, 0.), -4.);
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, flightFocal(1.5)));

  // the hall: dark ceiling with strip lights above the aisle, floor below
  vec3 col = uBase * .3;
  float tc = rd.y > 1e-4 ? (6.6 - ro.y) / rd.y : 1e5;
  float tf = rd.y < -1e-4 ? -ro.y / rd.y : 1e5;
  float tmax = min(min(tc, tf), 60.);
  float t = .05, tt = -1.;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < .001 * t) { tt = t; break; }
    t += d * .9;
    if (t > tmax) break;
  }
  float kick = exp(-uWave * 5.);
  vec3 lamp = mix(vec3(1., .93, .8), uInk, .3) * (uServers > .5 ? .6 : 1.);
  float hitT;
  if (tt > 0.) {
    hitT = tt;
    vec3 p = ro + rd * tt;
    map(p);
    float mat = gMat;
    vec3 id = gId;
    vec3 n = calcN(p);
    // light from the strip above the aisle
    vec3 L = normalize(vec3(-p.x * .6, 6.4 - p.y, 0.));
    float dif = clamp(dot(n, L), 0., 1.) * (.4 + .6 * exp(-abs(p.x) * .15));
    vec3 alb = uInk * .25;
    vec3 emis = vec3(0.);
    if (mat > 1.5) alb = vec3(.62, .45, .28);                       // parcels: cardboard
    else if (mat > .5) {
      if (uServers > .5) {
        // a server unit: dark grey faces, rows of lights blinking with the hats
        alb = vec3(.09, .095, .11) * (1. - .4 * step(.92, fract(p.y * 6.)));
        vec2 g = vec2(p.z * 9., p.y * 6.);
        vec2 gi = floor(g);
        float on = step(.55, hash12(gi + floor(uTime * (1.5 + 6. * uHat)) * 3.1));
        float led = (1. - smoothstep(.12, .22, length((fract(g) - .5) * vec2(1., 2.)))) * on * (1. - smoothstep(.2, .45, fwidth(g.x)));
        emis = mix(uAccent, vec3(.3, 1., .5), step(.5, hash12(gi))) * led * 1.8;
      } else {
        alb = vec3(.62, .45, .28) * (.85 + .3 * hash13(id));      // boxes: cardboard, a strip of tape
        alb *= 1. - .25 * (1. - smoothstep(.02, .035, abs(fract(p.y / LV) - .32)));
      }
    }
    col = alb * (dif * lamp * (1.1 + .9 * kick) + uBase * .6) + emis;
  } else if (tf < tc && tf < 60.) {
    hitT = tf;
    vec3 p = ro + rd * tf;
    // polished concrete floor, a lane line along the aisle, the lamps reflected
    col = uBase * .4 + uInk * .06;
    col += lamp * .08 * exp(-abs(p.x) * 2.) * (1. + kick);
    col += uAccent * .5 * (1. - smoothstep(.02, .04, abs(abs(p.x) - .9))) * (1. - smoothstep(.02, .06, fwidth(p.x)));
  } else if (tc < 60.) {
    hitT = tc;
    vec3 p = ro + rd * tc;
    // the ceiling, and the strip lights above the aisle
    col = uBase * .2;
    col += lamp * (1.2 + 1.8 * kick) * (1. - smoothstep(.05, .1, abs(p.x))) * step(.3, fract(p.z / 3.));
  } else hitT = 60.;
  col = mix(col, uBase * .5 + lamp * .04, 1. - exp(-hitT * .04));
  col = aces(col * 1.1);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, 1.);
}
`,
});
