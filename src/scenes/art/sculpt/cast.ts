import * as THREE from "three";

/**
 * The recipes of the heads sculpted in code (sculpt.glsl.ts): what the oven (oven.ts) sets before cooking each one.
 * The heads themselves (their names, their families) are listed in the library, scenes/art/heads.ts.
 */

const KIND = { cobra: 0, panthere: 1, ours: 2, cerf: 3, elephant: 4, tragedie: 5, comedie: 6, porte: 7 };
/** The headdresses laid on a bust (sculpt.glsl.ts, wornHead). */
const WEAR = { laurier: 0, lierre: 1, diademe: 2, casque: 3, voile: 4 };

/**
 * The ring round a bust a wreath, a diadem or a helmet follows: its height over the brow (in the head's frame), how
 * much lower it runs at the back of the head, how far out of the hair. The oven traces it on the bust's grid.
 */
export interface Ring {
  y: number;
  drop: number;
  out?: number;
}

export interface Recipe {
  /** A taller box (a crown, antlers): the top of the grid, above the usual 1. */
  top?: number;
  /** A headdress laid on this bust of the library (its id): the oven reads the bust's grid. */
  base?: string;
  /** A wreath, a diadem, a helmet: the ring it follows round the bust. */
  ring?: Ring;
  apply(u: Record<string, THREE.IUniform>): void;
}

/** The uniforms of a recipe (the oven's shader). */
export function recipeUniforms() {
  return {
    uKind: { value: 0 },
    uWear: { value: 0 },
  };
}

function shape(kind: keyof typeof KIND, top?: number): Recipe {
  return {
    top,
    apply(u) {
      u.uKind.value = KIND[kind];
    },
  };
}

/** A headdress laid on a bust of the library (a ring for all but the veil; a taller box for a crest). */
function worn(base: string, wear: keyof typeof WEAR, ring?: Ring, top?: number): Recipe {
  return {
    base,
    ring,
    top,
    apply(u) {
      u.uKind.value = KIND.porte;
      u.uWear.value = WEAR[wear];
    },
  };
}

export const RECIPES: Record<string, Recipe> = {
  cobra: shape("cobra"),
  panthere: shape("panthere"),
  ours: shape("ours"),
  // the antlers rise above the usual box
  cerf: shape("cerf", 1.5),
  elephant: shape("elephant"),
  // ---- masks of the Greek theatre
  tragedie: shape("tragedie"),
  comedie: shape("comedie"),
  // ---- the archetypes of Antiquity: a headdress on a portrait of the library
  empereur: worn("marcaurele", "laurier", { y: 0.5, drop: 0.16, out: 0.04 }),
  imperatrice: worn("dame", "diademe", { y: 0.3, drop: 0.1, out: 0.05 }),
  athena: worn("minatia", "casque", { y: 0.55, drop: 0.2 }, 1.15),
  vestale: worn("romaine", "voile"),
  dionysos: worn("memnon", "lierre", { y: 0.5, drop: 0.14, out: 0.015 }),
  silene: worn("socrate", "lierre", { y: 0.5, drop: 0.16, out: 0.015 }),
};
