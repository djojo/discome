import type * as THREE from "three";

/**
 * The recipes of the heads sculpted in code (sculpt.glsl.ts): what the oven (oven.ts) sets before cooking each one.
 * The heads themselves (their names, their families) are listed in the library, scenes/art/heads.ts.
 */

const KIND = { cobra: 0 };

export interface Recipe {
  /** A taller box (a crown, antlers): the top of the grid, above the usual 1. */
  top?: number;
  apply(u: Record<string, THREE.IUniform>): void;
}

/** The uniforms of a recipe (the oven's shader). */
export function recipeUniforms() {
  return {
    uKind: { value: 0 },
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
  cobra: beast("cobra"),
};
