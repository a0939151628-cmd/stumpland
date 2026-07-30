import { describe, it, expect } from 'vitest';
import { initialState, GameState } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';
import { DAYS_PER_YEAR } from '../src/sim/calendar.js';
import { countTiles } from '../src/sim/grid.js';
import { isWornPath, PATH_THRESHOLD } from '../src/sim/work.js';
import { WORKS } from '../src/sim/buildings.js';
import { ACTIONS } from '../src/sim/actions.js';
import { diligent, playYears } from '../src/testkit/policies.js';

/** Ten years of steady work, once, shared by the slower assertions. */
function tenYears(): GameState {
  const s = initialState(1);
  playYears(s, 10, diligent);
  return s;
}

describe('the plot changes permanently', () => {
  const s = tenYears();

  it('stumps come out, and none ever come back', () => {
    const start = countTiles(initialState(1).plot, (t) => t.stump);
    const left = countTiles(s.plot, (t) => t.stump);
    // How many get pulled depends on how the decade was spent. That the
    // count only ever falls is the rule being tested.
    expect(start - left).toBeGreaterThanOrEqual(15);

    const before = left;
    for (let i = 0; i < DAYS_PER_YEAR; i++) doAction(s, 'sleep');
    expect(countTiles(s.plot, (t) => t.stump)).toBe(before);
  });

  it('ground that has been worked stays worked', () => {
    const worked = countTiles(s.plot, (t) => t.yearsWorked > 0);
    expect(worked).toBeGreaterThan(35);
    // Years worked only ever climbs.
    expect(Math.max(...s.plot.tiles.map((t) => t.yearsWorked))).toBeGreaterThanOrEqual(6);
  });

  it('the soil on the oldest ground is far better than where it started', () => {
    const old = s.plot.tiles.filter((t) => t.yearsWorked >= 6);
    expect(old.length).toBeGreaterThan(0);
    const mean = old.reduce((a, t) => a + t.soil, 0) / old.length;
    expect(mean).toBeGreaterThan(0.6); // started around 0.25
  });

  it('buildings go up and stay up', () => {
    // Which ones depends on how the years went; that more than one is
    // standing after a decade is the part that matters.
    const standing = (['shed', 'barn', 'hutch', 'byre', 'smokehouse'] as const)
      .filter((k) => s.works[k]);
    expect(standing.length).toBeGreaterThanOrEqual(2);
    expect(s.works.shed || s.works.barn).toBe(true);
  });

  it('a path wears where the walking happens', () => {
    expect(countTiles(s.plot, isWornPath)).toBeGreaterThan(8);
    expect(Math.max(...s.plot.tiles.map((t) => t.treads))).toBeGreaterThan(PATH_THRESHOLD * 5);
  });
});

describe('nothing resets between years', () => {
  it('a year boundary leaves the permanent world alone', () => {
    const s = initialState(4);
    playYears(s, 2, diligent);

    const before = {
      stumps: countTiles(s.plot, (t) => t.stump),
      worked: countTiles(s.plot, (t) => t.yearsWorked > 0),
      treads: s.plot.tiles.reduce((a, t) => a + t.treads, 0),
      works: { ...s.works },
      soil: s.plot.tiles.map((t) => t.soil),
    };

    // Roll straight through a new year doing nothing at all.
    for (let i = 0; i < DAYS_PER_YEAR; i++) doAction(s, 'sleep');

    expect(countTiles(s.plot, (t) => t.stump)).toBe(before.stumps);
    expect(countTiles(s.plot, (t) => t.yearsWorked > 0)).toBe(before.worked);
    expect(s.plot.tiles.reduce((a, t) => a + t.treads, 0)).toBe(before.treads);
    expect(s.works).toEqual(before.works);
    expect(s.plot.tiles.map((t) => t.soil)).toEqual(before.soil);
  });

  it('broken ground does not survive a northern winter, but worked ground does', () => {
    const s = initialState(6);
    playYears(s, 1, diligent);
    const workedBefore = countTiles(s.plot, (t) => t.yearsWorked > 0);
    for (let i = 0; i < DAYS_PER_YEAR; i++) doAction(s, 'sleep');
    // Tilth is lost to the frost; the record of having farmed it is not.
    expect(countTiles(s.plot, (t) => t.tilled)).toBe(0);
    expect(countTiles(s.plot, (t) => t.yearsWorked > 0)).toBe(workedBefore);
  });
});

describe('ploughing erases a path', () => {
  it('treads on a tile are wiped when it is broken', () => {
    const s = initialState(2);
    const t = s.plot.tiles.find((x) => x.terrain === 'clearing' && !x.stump);
    expect(t).toBeDefined();
    t!.treads = 500;
    expect(isWornPath(t!)).toBe(true);

    // Break soil until that tile gets turned.
    for (let i = 0; i < 60 && t!.treads > 0; i++) {
      if (!doAction(s, 'break_soil').ok) doAction(s, 'sleep');
    }
    expect(t!.treads).toBe(0);
  });
});

describe('buildings cost what they say', () => {
  it('the barn only follows a shed, and both need timber', () => {
    const s = initialState(3);
    expect(ACTIONS.build_barn!.available(s).reason).toBe('no shed to build on');

    s.store.timber = 100;
    s.works.shed = true;
    const r = doAction(s, 'build_barn');
    expect(r.ok).toBe(true);
    expect(s.works.barn).toBe(true);
    expect(s.store.timber).toBe(100 - WORKS.barn.timber);
  });

  it('felling timber is the only way to get it', () => {
    const s = initialState(3);
    expect(s.store.timber).toBe(0);
    doAction(s, 'fell_timber');
    expect(s.store.timber).toBeGreaterThan(0);
  });
});
