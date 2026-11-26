import { headReady, letGo, preloadHeads, type HeadId } from "./heads";

/**
 * The cast of a scene that shows a few heads drawn from a larger pool, a different few on each passage (each time it
 * comes back on screen), without loading the whole pool: the next cast loads while this one plays, and the one before
 * is let go. The first cast is the scene's own (its SceneMeta.heads, loaded with its world): it stands in whenever the
 * next one is not ready yet, so that no head ever pops in late.
 */
export class Casting {
  private current: readonly HeadId[];
  private next: readonly HeadId[] | null = null;

  constructor(
    private readonly first: readonly HeadId[],
    private readonly draw: () => HeadId[],
  ) {
    this.current = first;
  }

  /** A new passage: the cast to show (the next one if it is ready, else the first); the one after starts loading. */
  pass(): readonly HeadId[] {
    const prev = this.current;
    const next = this.next;
    this.current = next && next.every(headReady) ? next : this.first;
    if (!next || this.current === next) this.next = this.draw();
    const coming = this.next!;
    preloadHeads(coming);
    letGo(prev, [...this.current, ...coming, ...this.first]);
    return this.current;
  }
}

/** `k` different heads of `list`, at random. */
export function pick(list: readonly HeadId[], k: number): HeadId[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, k);
}
