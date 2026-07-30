import { describe, it, expect } from 'vitest';
import { GameHost } from '../src/game/host.js';
import { initialState } from '../src/sim/state.js';
import { snapshot } from '../src/game/snapshot.js';

describe('the renderer cannot write to the world', () => {
  it('a snapshot is frozen all the way down', () => {
    const s = snapshot(initialState(1));
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.plot)).toBe(true);
    expect(Object.isFrozen(s.plot.tiles)).toBe(true);
    expect(Object.isFrozen(s.plot.tiles[0])).toBe(true);
    expect(Object.isFrozen(s.store)).toBe(true);
    expect(Object.isFrozen(s.weather)).toBe(true);
  });

  it('mutating a snapshot throws rather than corrupting the simulation', () => {
    'use strict';
    const host = new GameHost();
    const view = host.view;
    expect(() => {
      (view as unknown as { year: number }).year = 99;
    }).toThrow();
    expect(host.view.year).toBe(1);
  });

  it('a snapshot is a copy, not a live window onto the state', () => {
    const host = new GameHost();
    const before = host.view;
    host.perform('sleep');
    const after = host.view;

    expect(after).not.toBe(before);
    expect(after.dayOfYear).toBe(before.dayOfYear + 1);
    // The old snapshot still reads as the day it was taken.
    expect(before.dayOfYear).toBe(0);
  });
});

describe('the host is the only way in', () => {
  it('actions go through it and republish', () => {
    const host = new GameHost();
    let published = 0;
    const stop = host.subscribe(() => published++);
    expect(published).toBe(1); // current state on subscribe

    const ok = host.perform('chop_wood');
    expect(ok.ok).toBe(true);
    expect(published).toBe(2);
    expect(host.view.store.firewood).toBeGreaterThan(6);

    const bad = host.perform('harvest');
    expect(bad.ok).toBe(false);
    expect(published).toBe(2); // a refused action changes nothing

    stop();
  });

  it('serialises to plain JSON for the save file', () => {
    const host = new GameHost();
    host.perform('sleep');
    const json = host.serialise();
    const parsed = JSON.parse(json);
    expect(parsed.plot.tiles.length).toBe(576);
    expect(parsed.dayOfYear).toBe(1);
  });
});
