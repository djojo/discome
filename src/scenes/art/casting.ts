import { headReady, letGo, preloadHeads, type HeadId } from "./heads";
import { RECIPES } from "./sculpt/cast";

/**
 * Who a head is: an archetype is the portrait it was cooked on (Athena is Minatia Polla under a helmet), so the two
 * never stand side by side, nor one right after the other.
 */
export const who = (id: HeadId): string => RECIPES[id]?.base ?? id;

/**
 * The cast of a scene that shows a few heads drawn from a larger pool, a different few on each passage (each time it
 * comes back on screen), without loading the whole pool: the next cast loads while this one plays, and the one before
 * is let go. The first cast is the scene's own (its SceneMeta.heads, loaded with its world): it stands in whenever the
 * next one is not ready yet, so that no head ever pops in late. `draw` is handed the cast on show: the next one keeps
 * clear of it. `linger`: how many casts already played stay loaded (several scenes sharing a casting: the one leaving
 * the screen through a transition still shows its own).
 */
export class Casting {
  private current: readonly HeadId[];
  private next: readonly HeadId[] | null = null;
  private past: (readonly HeadId[])[] = [];

  constructor(
    private readonly first: readonly HeadId[],
    private readonly draw: (avoid: readonly HeadId[]) => HeadId[],
    private readonly linger = 0,
  ) {
    this.current = first;
  }

  /** A new passage: the cast to show (the next one if it is ready, else the first); the one after starts loading. */
  pass(): readonly HeadId[] {
    this.past.push(this.current);
    const next = this.next;
    this.current = next && next.every(headReady) ? next : this.first;
    if (!next || this.current === next) this.next = this.draw(this.current);
    const coming = this.next!;
    preloadHeads(coming);
    while (this.past.length > this.linger)
      letGo(this.past.shift()!, [...this.current, ...coming, ...this.first, ...this.past.flat()]);
    return this.current;
  }
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `k` heads of `list` at random, each a different character (see `who`), none of them one of `avoid` if the list
 * holds enough others.
 */
export function pick(list: readonly HeadId[], k: number, avoid: readonly HeadId[] = []): HeadId[] {
  const away = new Set(avoid.map(who));
  const out: HeadId[] = [];
  const taken = new Set<string>();
  for (const strict of [true, false])
    for (const h of shuffle(list)) {
      if (out.length >= k) return out;
      if (taken.has(who(h)) || (strict && away.has(who(h)))) continue;
      out.push(h);
      taken.add(who(h));
    }
  return out;
}

/**
 * A procession: heads that pass by one after another along a way (Les Ancêtres), each position taking a head of the
 * pool that is neither on show nor among the last `memory` characters seen. Its head slots hold the heads on show and
 * the next ones, loading: a position coming into view takes a slot whose head is ready, or stays empty (no head ever
 * pops in late); once it has been passed, its slot lets the head go and loads another. A single procession serves
 * the scene's instances: the one that asks starts its own way, with the heads already loaded.
 */
export class Procession {
  /** Each slot's head (the scene points its head slots at them). */
  readonly heads: (HeadId | null)[];
  /** The position each slot shows its head at, or null: free, its head is one of the next to come. */
  private at: (number | null)[];
  /** When each free slot's head was drawn (the oldest comes first). */
  private drawn: number[];
  /** The slot of each position in view, -1 for nobody. */
  private pos = new Map<number, number>();
  private deck: HeadId[] = [];
  private recent: string[] = [];
  private owner: object | null = null;
  private clock = 0;

  constructor(
    private readonly pool: readonly HeadId[],
    slots: number,
    private readonly memory: number,
    first: readonly HeadId[] = [],
  ) {
    this.heads = new Array(slots).fill(null);
    this.at = new Array(slots).fill(null);
    this.drawn = new Array(slots).fill(0);
    // the heads that load with the world come first
    this.deck = shuffle(first);
  }

  /** The slot of every position from `from` to `to` (-1: nobody), on the way of the scene instance `owner`. */
  view(owner: object, from: number, to: number): number[] {
    if (owner !== this.owner) {
      this.owner = owner;
      this.pos.clear();
      this.at.fill(null);
    }
    // the positions passed: their slots load the next heads
    for (const [m, s] of this.pos)
      if (m < from || m > to) {
        this.pos.delete(m);
        if (s >= 0) this.retire(s);
      }
    // a head on show that has been let go of (the worlds changed): its position empties rather than show another
    for (const [m, s] of this.pos)
      if (s >= 0 && !headReady(this.heads[s])) {
        this.pos.set(m, -1);
        this.at[s] = null;
      }
    for (let s = 0; s < this.heads.length; s++) if (!this.heads[s]) this.prepare(s);
    // the positions coming into view, the farthest first: each takes the ready head drawn the longest ago
    const seen: [number, string][] = [];
    for (let m = to; m >= from; m--) {
      if (this.pos.has(m)) continue;
      let best = -1;
      for (let s = 0; s < this.heads.length; s++)
        if (this.at[s] === null && headReady(this.heads[s]) && (best < 0 || this.drawn[s] < this.drawn[best])) best = s;
      this.pos.set(m, best);
      if (best >= 0) {
        this.at[best] = m;
        seen.push([m, who(this.heads[best]!)]);
      }
    }
    // remembered in the order of the way (several come into view at once only where the way starts)
    for (const [, w] of seen.sort((a, b) => a[0] - b[0])) this.recent.push(w);
    this.recent.splice(0, Math.max(0, this.recent.length - this.memory));
    preloadHeads(this.heads);
    const out: number[] = [];
    for (let m = from; m <= to; m++) out.push(this.pos.get(m) ?? -1);
    return out;
  }

  /** A slot whose head has been seen: it lets it go and loads the next one. */
  private retire(s: number) {
    const old = this.heads[s];
    this.at[s] = null;
    this.prepare(s);
    if (old) letGo([old], this.heads.filter((h): h is HeadId => !!h));
  }

  private prepare(s: number) {
    this.heads[s] = null;
    this.heads[s] = this.draw();
    this.drawn[s] = ++this.clock;
  }

  /** The next head of the deck that is not on show or coming, and not seen lately (if the pool allows). */
  private draw(): HeadId {
    const busy = new Set(this.heads.flatMap((h) => (h ? [who(h)] : [])));
    const tests = [(h: HeadId) => !busy.has(who(h)) && !this.recent.includes(who(h)), (h: HeadId) => !busy.has(who(h))];
    for (const ok of tests) {
      let i = this.deck.findIndex(ok);
      if (i < 0) {
        this.deck.push(...shuffle(this.pool));
        i = this.deck.findIndex(ok);
      }
      if (i >= 0) return this.deck.splice(i, 1)[0];
    }
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }
}
