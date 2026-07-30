/**
 * Owns the simulation. Everything that wants to change the world goes
 * through here; everything that wants to look at it gets a snapshot.
 *
 * This is the only place the two halves meet.
 */

import { GameState, initialState } from '../sim/state.js';
import { doAction, ActionResult } from '../sim/step.js';
import { Snapshot, snapshot } from './snapshot.js';

export type Listener = (s: Snapshot) => void;

export class GameHost {
  private state: GameState;
  private current: Snapshot;
  private listeners = new Set<Listener>();

  constructor(state: GameState = initialState(1)) {
    this.state = state;
    this.current = snapshot(state);
  }

  /** The world as it stands. Safe to hold; replaced, never mutated. */
  get view(): Snapshot {
    return this.current;
  }

  perform(id: string): ActionResult {
    const result = doAction(this.state, id);
    if (result.ok) this.publish();
    return result;
  }

  /** For the debug panel: reach in, change something, republish. */
  mutate(fn: (s: GameState) => void): void {
    fn(this.state);
    this.publish();
  }

  load(state: GameState): void {
    this.state = state;
    this.publish();
  }

  /** Plain data, for writing to disk. */
  serialise(): string {
    return JSON.stringify(this.state);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  private publish(): void {
    this.current = snapshot(this.state);
    for (const fn of this.listeners) fn(this.current);
  }
}
