import * as THREE from "three";

/**
 * The recipes of the heads sculpted in code (sculpt.glsl.ts): what the oven (oven.ts) sets before cooking each one.
 * The heads themselves (their names, their families) are listed in the library, scenes/art/heads.ts.
 */

const KIND = { cobra: 0, panthere: 1, ours: 2, cerf: 3, elephant: 4, tragedie: 5, comedie: 6, porte: 7 };
/** The headdresses laid on a bust (sculpt.glsl.ts, wornHead). */
const WEAR = { laurier: 0, lierre: 1, diademe: 2, casque: 3, voile: 4 };

export interface Recipe {
  /** A taller box (a crown, antlers): the top of the grid, above the usual 1. */
  top?: number;
  /** A headdress laid on this bust of the library (its id): the oven reads the bust's grid. */
  base?: string;
  apply(u: Record<string, THREE.IUniform>): void;
}

/** The uniforms of a recipe (the oven's shader). */
export function recipeUniforms() {
  return {
    uKind: { value: 0 },
    uWear: { value: 0 },
    // the headdress fitted to its bust: scale, raised by, moved forward by, tilted back by (radians)
    uFit: { value: new THREE.Vector4(1, 0, 0, 0) },
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

/** A headdress laid on a bust of the library, fitted to it (scale, raised by, forward by, tilted back by). */
export function worn(base: string, wear: keyof typeof WEAR, fit: [number, number, number, number] = [1, 0, 0, 0], top?: number): Recipe {
  return {
    base,
    top,
    apply(u) {
      u.uKind.value = KIND.porte;
      u.uWear.value = WEAR[wear];
      (u.uFit.value as THREE.Vector4).set(...fit);
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
};
