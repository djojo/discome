import type * as THREE from "three";

/**
 * The recipes of the heads sculpted in code (sculpt.glsl.ts): what the oven (oven.ts) sets before cooking each one.
 * The heads themselves (their names, their families) are listed in the library, scenes/art/heads.ts.
 */

/** The features of a face, zero being the sculpted human head (sdHead); about -1..1 each. */
const FEATURES = [
  "skullW",
  "skullL",
  "faceLen",
  "jaw",
  "cheek",
  "brow",
  "chin",
  "noseLen",
  "noseW",
  "noseBridge",
  "lips",
  "mouthW",
  "eyesOpen",
  "age",
  "neck",
  "ears",
  "forehead",
  "eyeDepth",
  "adam",
  "hairLen",
  "hairVol",
  "beardLen",
] as const;
type Features = Partial<Record<(typeof FEATURES)[number], number>>;

const HAIR = { rase: 0, courte: 1, longue: 2, chignon: 3, tresses: 4, boucles: 5, locks: 6, afro: 7, queue: 8, foulard: 9, couronne: 10 };
const BEARD = { aucune: 0, moustache: 1, courte: 2, pleine: 3, bouc: 4 };
const KIND = { personne: 0, cobra: 1 };

export interface Recipe {
  /** A taller box (a crown, antlers): the top of the grid, above the usual 1. */
  top?: number;
  apply(u: Record<string, THREE.IUniform>): void;
}

/** The uniforms of a recipe (the oven's shader). */
export function recipeUniforms() {
  return {
    uKind: { value: 0 },
    uP: { value: new Array<number>(24).fill(0) },
    uHair: { value: 0 },
    uBeard: { value: 0 },
    uWear: { value: 0 },
  };
}

function person(f: Features, hair: keyof typeof HAIR, beard: keyof typeof BEARD = "aucune"): Recipe {
  const p = new Array<number>(24).fill(0);
  FEATURES.forEach((k, i) => (p[i] = f[k] ?? 0));
  return {
    apply(u) {
      u.uKind.value = KIND.personne;
      u.uP.value = p;
      u.uHair.value = HAIR[hair];
      u.uBeard.value = BEARD[beard];
      u.uWear.value = 0;
    },
  };
}

function beast(kind: keyof typeof KIND): Recipe {
  return {
    apply(u) {
      u.uKind.value = KIND[kind];
    },
  };
}

export const RECIPES: Record<string, Recipe> = {
  // ---- faces: women and men of varied ages and features
  tresses: person({ skullW: -0.2, brow: -0.6, jaw: -0.5, cheek: 0.4, lips: 0.5, noseW: 0.2, noseBridge: -0.2, chin: -0.2, neck: -0.4, faceLen: -0.1, eyesOpen: 1, hairLen: 0.6 }, "tresses"),
  chignon: person({ skullW: -0.1, brow: -0.5, jaw: -0.3, cheek: 0.8, noseLen: 0.4, noseBridge: 0.6, noseW: -0.3, faceLen: 0.3, eyesOpen: 1, age: 0.35, neck: -0.3, lips: 0.1 }, "chignon"),
  afro: person({ skullW: 0.3, brow: -0.5, jaw: -0.3, cheek: 0.3, lips: 0.8, noseW: 0.7, noseBridge: -0.3, chin: 0.1, neck: -0.4, eyesOpen: 1, hairVol: 0.3 }, "afro"),
  aieule: person({ brow: -0.4, jaw: -0.2, cheek: 0.2, lips: -0.3, noseLen: 0.3, neck: -0.3, age: 1 }, "foulard"),
  jeune: person({ skullW: -0.1, faceLen: 0.2, brow: 0.3, jaw: 0.3, cheek: 0.2, chin: 0.3, noseLen: 0.2, neck: 0.1, adam: 0.6, eyesOpen: 1 }, "courte"),
  locks: person({ skullW: 0.2, brow: 0.4, jaw: 0.5, cheek: 0.4, lips: 0.6, noseW: 0.6, noseBridge: -0.3, neck: 0.3, adam: 0.6, age: 0.2, eyesOpen: 1, hairLen: 0.5 }, "locks", "courte"),
  barbu: person({ skullW: 0.2, brow: 0.6, jaw: 0.4, noseLen: 0.4, noseBridge: 0.5, neck: 0.3, age: 0.5, eyesOpen: 1, beardLen: 0.5 }, "boucles", "pleine"),
  aieul: person({ faceLen: 0.3, brow: 0.5, jaw: 0.2, noseLen: 0.6, noseBridge: 0.4, ears: 0.5, neck: 0.2, age: 1, eyesOpen: 1 }, "couronne", "moustache"),
  // ---- animals
  cobra: beast("cobra"),
};
