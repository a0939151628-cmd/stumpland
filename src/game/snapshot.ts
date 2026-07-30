/**
 * The one thing the renderer is allowed to hold.
 *
 * A snapshot is the world as plain, deeply-readonly data. The renderer
 * reads it and draws it. It cannot write back — in development the object
 * is frozen, so an accidental mutation throws instead of quietly corrupting
 * the simulation.
 */

import { GameState } from '../sim/state.js';

export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type Snapshot = DeepReadonly<GameState>;

/**
 * Freeze the whole graph. Cheap enough at 576 tiles and once per turn —
 * this runs when the day changes, not every frame.
 */
export function freezeDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  const obj = value as unknown as object;
  if (seen.has(obj)) return value;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    freezeDeep((obj as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

const DEV = process.env.NODE_ENV !== 'production';

/**
 * Take a snapshot of the world. Structured-cloned so the renderer holds
 * its own copy and the simulation can carry on mutating its own state.
 */
export function snapshot(state: GameState): Snapshot {
  const copy = structuredClone(state) as GameState;
  return (DEV ? freezeDeep(copy) : copy) as Snapshot;
}
