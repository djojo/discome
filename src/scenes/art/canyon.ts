import { defineShaderScene } from "../shader/defineShaderScene";
import { paletteParam } from "../palettes";
import { num } from "../utils";
import { ART_LIB } from "./lib.glsl";
import { FLIGHT_GLSL, flightParams } from "./flight";

/**
 * Flight through a winding canyon whose sandstone strata are painted with the palette.
 * Two reliefs, published as two shots of the catalogue: a narrow slot ("Gorge", smooth wavy
 * walls and light beams) and an open terraced canyon between mesas ("Mesas", with a mirror river).
 * Skims the floor in the breakdown, climbs out above the plateau on the drop.
 */
function canyonScene(id: string, name: string, relief: "gorge" | "mesas", palette: string, description: string) {
  return defineShaderScene({
    id,
    name,
    energy: "medium",
    renderScale: 0.7,
    mask: true,
    flight: { cruise: 2.2 },
    description,
    params: [
      paletteParam(palette),
      {
        type: "select",
        key: "relief",
        label: "Relief",
        options: [
          { value: "gorge", label: "Gorge" },
          { value: "mesas", label: "Mesas" },
        ],
        default: relief,
      },
      ...flightParams(),
      { type: "range", key: "width", label: "Largeur", min: 0.6, max: 1.6, step: 0.05, default: 1 },
      { type: "range", key: "psy", label: "Psychédélisme", min: 0, max: 2, step: 0.05, default: 1 },
    ],
    uniforms: () => ({
      uRelief: { value: relief === "mesas" ? 1 : 0 },
      uWidth: { value: 1 },
      uPsy: { value: 1 },
      uShift: { value: 0 },
      uShiftTarget: { value: 0 },
    }),
    update(u, f, p, dt) {
      u.uRelief.value = p.relief === "mesas" ? 1 : 0;
      u.uWidth.value = num(p.width, 1);
      u.uPsy.value = num(p.psy, 1);
      // Each drop slides the strata colours along the palette
      if (f.drop) u.uShiftTarget.value = (u.uShiftTarget.value as number) + 0.33;
      const s = u.uShift.value as number;
      u.uShift.value = s + ((u.uShiftTarget.value as number) - s) * (1 - Math.exp(-dt * 2.5));
    },
    fragment: CANYON_FRAG,
  });
}

const CANYON_FRAG = /* glsl */ `
uniform float uRelief;
uniform float uWidth;
uniform float uPsy;
uniform float uShift;
${ART_LIB}
${FLIGHT_GLSL}
float gW0;
float gTop;
vec3 gL;

float pathX(float z) { return 2.4 * sin(z * .09) + 1.3 * sin(z * .21 + 1.3); }
float pathDDX(float z) { return -2.4 * .0081 * sin(z * .09) - 1.3 * .0441 * sin(z * .21 + 1.3); }

/** Stepped cliffs: flat ledges and steep risers. */
float terrace(float v) { float f = fract(v); return floor(v) + smoothstep(.5, 1., f); }

/** Height of the plateau: buttes and mesas separated by low plains. */
float plateau(vec2 xz) {
  float m = vnoise(vec3(xz * .07, 3.1));
  float k = terrace(smoothstep(.32, .62, m) * 2.) * .5;
  return uRelief < .5 ? gTop * (.65 + .35 * k) : .25 + (gTop - .25) * k;
}

/** Half-width of the canyon at height y. */
float halfWidth(vec3 p) {
  // The walls stay put: the music lives in the strata colours and the light (a slow drift only)
  float breathe = .04 * uPsy * sin(p.y * 2.3 + uTime * .3);
  if (uRelief < .5) {
    // Gorge: smooth, wavy sandstone (slot canyon), opening slightly toward the top
    return gW0 * (1. + .36 * sin(p.y * 1.9 + p.z * .35) + .17 * sin(p.y * 4.7 - p.z * .8 + 1.) + .3 * smoothstep(1., 6., p.y))
      + (vnoise(p * 2.) - .5) * .06 + breathe;
  }
  // Mesas: terraced walls, eroded
  return gW0 + terrace(p.y * .9) * .85 + (vnoise(p * .8) * .7 + vnoise(p * 1.9) * .3 - .5) * .55 + breathe;
}

float map(vec3 p) {
  float dx = abs(p.x - pathX(p.z));
  float rock = max(halfWidth(p) - dx, p.y - plateau(p.xz));
  float bed = p.y - (uRelief < .5 ? .05 * vnoise(p * vec3(1.3, 0., .6)) : 0.);
  return min(rock, bed) * .6;
}

vec3 nrm(vec3 p) {
  const vec2 k = vec2(1, -1);
  const float h = .003;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

float march(vec3 ro, vec3 rd) {
  float t = .05, d = 1.;
  for (int i = 0; i < 130; i++) {
    d = map(ro + rd * t);
    if (abs(d) < .001 * t) return t;
    t += d;
    if (t > 60.) return -1.;
  }
  // Out of steps while grazing a flat surface: count it as a hit rather than punching a hole to the sky
  return d < .03 * t ? t : -1.;
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1., t = .05;
  for (int i = 0; i < 22; i++) {
    float h = map(ro + rd * t);
    res = min(res, 9. * h / t);
    t += clamp(h, .08, .9);
    if (res < .01 || t > 14.) break;
  }
  return clamp(res, 0., 1.);
}

float ao(vec3 p, vec3 n) {
  float occ = 0., sca = 1.;
  for (int i = 0; i < 3; i++) { float h = .08 + .35 * float(i); occ += (h - map(p + n * h)) * sca; sca *= .6; }
  return clamp(1. - 1.4 * occ, 0., 1.);
}

/** Strata: sandstone shades, or the palette flowing through the layers (uPsy). */
vec3 rockColor(vec3 p, vec3 n) {
  float s = p.y * 1.6 - uTime * .05
    + .1 * sin(p.z * .6 + p.x * .4)
    + uBeat * .08 * sin(p.z * 1.3 - uTime * 4.)
    + (vnoise(p * vec3(.35, 2.2, .35)) - .5) * .45;
  vec3 sand = uInk * (.62 + .38 * vnoise(vec3(s * 2.7, 0., .5))) * mix(vec3(1.), vec3(1.06, .9, .82), smoothstep(.3, .7, fract(s)));
  vec3 psy = pal(s * .35 + uShift) * 1.15;
  vec3 c = mix(sand, psy, clamp(uPsy * .7, 0., 1.));
  // Each layer its own value, with a thin dark seam between layers
  // (seams only on the walls: on flat tops they would turn into noise)
  float seam = 1. - smoothstep(0., .07, fract(s));
  c *= (.85 + .3 * hash12(vec2(floor(s), 7.))) * (1. - .22 * seam * (1. - abs(n.y)));
  // One stratum that geology will remember: studded with fragments of plastic, thicker as the night drifts
  float band = 1. - smoothstep(.06 + .12 * uDrift, .1 + .14 * uDrift, abs(p.y - 1.25 - .15 * sin(p.z * .13)));
  if (band > 0.) {
    vec3 q = p * vec3(7., 16., 7.);
    vec3 id = floor(q);
    float h = hash13(id);
    float frag = step(.74, h) * (1. - smoothstep(.25, .45, length(fract(q) - .5)));
    frag *= 1. - smoothstep(.3, .6, fwidth(q.y));
    vec3 plastic = .5 + .5 * cos(6.2831 * (hash13(id + 4.2) + vec3(0., .33, .67)));
    c = mix(c * .7, mix(plastic, vec3(1.), step(.92, h)) * 1.2, frag * band);
  }
  return c;
}

/** Cracked mud where the river has dried up: plates and dark cracks between them. */
vec3 dryBed(vec3 p) {
  vec2 g = p.xz * 2.2;
  vec2 i = floor(g), f = fract(g);
  float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 r = o + vec2(hash12(i + o), hash12(i + o + 5.3)) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  float e = sqrt(d2) - sqrt(d1);
  float crack = (1. - smoothstep(.03, .07 + fwidth(e), e)) * (1. - smoothstep(.2, .5, fwidth(g.x)));
  return uInk * .5 * (.85 + .2 * hash12(i)) * (1. - .75 * crack);
}

vec3 sky(vec3 rd) {
  vec3 c = mix(pal(uShift + .4) * .75 + uBase, uBase * 1.4, smoothstep(-.02, .55, rd.y));
  // A ringed sun low over the canyon; over the night it grows and burns
  vec3 sd = normalize(vec3(-.25, .16, -1.));
  float a = acos(clamp(dot(rd, sd), -1., 1.));
  float R = .085 * (1. + 1.4 * uDrift);
  c += uAccent * (exp(-pow((a - R) * 70. / (1. + uDrift), 2.)) * 1.6 + exp(-a * 9. / (1. + 1.5 * uDrift)) * (.35 + .5 * uDrift)) * (1. + uDrop);
  c += uAccent * .15 * uDrift * (1. - smoothstep(-.1, .5, rd.y));
  return c;
}

vec3 fogCol(vec3 rd) { return mix(uBase * 1.5, pal(uShift + .55) * .55, .55) + uAccent * .08 * max(rd.y, 0.); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc - .5 * uRes) / uRes.y;
  bool gorge = uRelief < .5;
  gW0 = (gorge ? 1.25 : 2.2) * uWidth;
  gTop = gorge ? 7. : 4.;
  // Slot canyons are lit from above; the open canyon by a lower sun
  gL = gorge ? normalize(vec3(.25, .95, -.2)) : normalize(vec3(.45, .8, -.35));

  // Flight along the bed: skims the river in the breakdown, climbs out above the plateau on the drop
  float z = -uTravel;
  float base = gorge ? 1.1 : 1.4;
  float alt = uDive >= 0. ? mix(base, gTop + 1.8, smoothstep(0., 1.4, uDive)) : mix(base, .3, -uDive);
  float sway = uSway * gW0 * (gorge ? .2 : .35);
  vec3 ro = vec3(pathX(z) + sway, alt, z);
  float zt = z - 5.;
  vec3 ta = vec3(pathX(zt) + sway * .5, alt - .2 - 1.2 * smoothstep(.7, 1.4, uDive), zt);
  // Bank into the turns of the canyon
  uv *= rot(uBank + pathDDX(z - 3.) * 3.);
  uv += flightShake();
  vec3 rd = lookAt(ro, ta) * normalize(vec3(uv, flightFocal(1.5)));

  vec3 col = sky(rd);
  float t = march(ro, rd);
  if (t > 0.) {
    vec3 p = ro + rd * t;
    vec3 n = nrm(p);
    float sh = shadow(p + n * .02, gL);
    float dif = clamp(dot(n, gL), 0., 1.) * sh;
    float occ = ao(p, n);
    bool water = !gorge && p.y < .02;
    // As the night drifts the river shrinks to a thread in the middle of its bed
    bool dry = water && abs(p.x - pathX(p.z)) > gW0 * (1.05 - .97 * smoothstep(.1, 1., uDrift));
    if (dry) {
      col = dryBed(p) * (dif * (vec3(1.) + uAccent * .4) * 1.25 + .25 * occ);
    } else if (water) {
      // Mirror river: the sky and the light, rippled
      // (ripples fade with distance: too fine to resolve far away)
      float rip = exp(-t * .08);
      vec3 wn = normalize(vec3(sin(p.x * 3. + uTime * 1.3) * .04 * rip, 1., (cos(p.z * 2.2 - uTime) * .04 + uBeat * .03 * sin(p.z * 6.)) * rip));
      vec3 r = reflect(rd, wn);
      float fre = .25 + .75 * pow(1. - max(dot(-rd, wn), 0.), 4.);
      col = sky(r) * fre * (.4 + .6 * occ) + uBase * .3;
    } else {
      vec3 alb = rockColor(p, n);
      // Light bouncing between the walls warms the shadows, more so higher up
      vec3 bounce = alb * (gorge ? (.4 + .6 * smoothstep(0., gTop * .8, p.y)) * 1.5 : .2 + .3 * smoothstep(0., gTop, p.y));
      vec3 skyl = sky(vec3(0., 1., 0.)) * .25 * (.5 + .5 * n.y);
      col = alb * (dif * (vec3(1.) + uAccent * .4) * 1.25 + skyl * occ) + bounce * occ;
    }
    col = mix(col, fogCol(rd), 1. - exp(-t * (gorge ? .045 : .03)));
  }

  // Gorge: beams of light falling through the slot, flashing on the kicks
  if (gorge) {
    float tEnd = t > 0. ? min(t, 18.) : 18.;
    float j = hash12(fc + fract(uTime * 2.3) * 51.);
    float beams = 0.;
    for (int i = 0; i < 6; i++) {
      vec3 q = ro + rd * (tEnd * (float(i) + j) / 6.);
      float zc = floor(q.z / 7.) * 7. + 3.5;
      vec2 axis = vec2(pathX(zc) + (hash12(vec2(zc, 1.7)) - .5) * .5, zc);
      vec2 dq = q.xz - axis - gL.xz / gL.y * (q.y - gTop) * .15;
      beams += exp(-dot(dq, dq) * 14.) * smoothstep(0., 3., q.y);
    }
    col += uAccent * beams / 6. * (.35 + 1.2 * uBeat + uDrop) * .6;
  }

  col = aces(col);
  col *= vignette(fc / uRes);
  gl_FragColor = vec4(col, step(0., t));
}
`;

export const canyonGorge = canyonScene(
  "canyon-gorge",
  "Gorge",
  "gorge",
  "desert",
  "Vol dans une gorge étroite aux parois ondulées : les strates colorées ondulent sur les kicks, des rais de lumière tombent dans la fente, on en sort au drop.",
);

export const canyonMesas = canyonScene(
  "canyon-mesas",
  "Mesas",
  "mesas",
  "peyote",
  "Vol au ras d'une rivière miroir entre des falaises en gradins ; au drop, on monte au-dessus des mesas.",
);
