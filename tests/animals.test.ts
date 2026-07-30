import { describe, it, expect } from 'vitest';
import { initialState, GameState } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';
import { ACTIONS } from '../src/sim/actions.js';
import { herd, oxenHelp, spoilageRate } from '../src/sim/animals.js';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../src/sim/calendar.js';

/** A farm that has got somewhere: byre up, grain in the store. */
function established(seed = 1): GameState {
  const s = initialState(seed);
  s.store.grain = 400;
  s.store.timber = 100;
  s.works.byre = true;
  s.works.hutch = true;
  s.works.shed = true;
  return s;
}

describe('neglect makes animals thin, never dead', () => {
  it('an unfed herd loses condition but never disappears', () => {
    const s = established();
    doAction(s, 'get_sheep');
    const sheep = herd(s.animals, 'sheep')!;
    expect(sheep.count).toBe(3);

    // Winter, empty store: nothing to feed them with at all.
    s.dayOfYear = DAYS_PER_SEASON * 3;
    s.store.grain = 0;
    for (let i = 0; i < DAYS_PER_SEASON; i++) doAction(s, 'sleep');

    expect(sheep.condition).toBeLessThan(0.35);
    expect(sheep.count).toBe(3); // thin, not gone
    expect(sheep.condition).toBeGreaterThan(0); // and never zero
  });

  it('feeding brings them back', () => {
    const s = established();
    doAction(s, 'get_goat');
    const goat = herd(s.animals, 'goat')!;
    goat.condition = 0.15;

    s.store.grain = 500;
    for (let i = 0; i < 12; i++) {
      doAction(s, 'tend_animals');
      doAction(s, 'sleep');
    }
    expect(goat.condition).toBeGreaterThan(0.6);
  });
});

describe('each animal changes what a day looks like', () => {
  it('hens and a goat put food in the store', () => {
    const withStock = established(2);
    doAction(withStock, 'get_hens');
    const bare = established(2);

    withStock.store.grain = 200;
    bare.store.grain = 200;
    for (let i = 0; i < 20; i++) {
      doAction(withStock, 'sleep');
      doAction(bare, 'sleep');
    }
    // Hens eat, but they lay more than they cost.
    expect(withStock.store.grain).toBeGreaterThan(bare.store.grain);
  });

  it('the ox halves the labour of breaking ground', () => {
    const without = established(3);
    const withOx = established(3);
    doAction(withOx, 'get_ox');
    expect(oxenHelp(withOx.animals)).toBeLessThan(0.75);
    expect(oxenHelp(without.animals)).toBe(1);

    const cost = (s: GameState): number => {
      const before = s.person.stamina;
      doAction(s, 'break_soil');
      return before - s.person.stamina;
    };
    expect(cost(withOx)).toBeLessThan(cost(without) * 0.7);
  });

  it('the cat cuts what the store loses to rats', () => {
    const s = established(4);
    const withoutCat = spoilageRate(s.animals);
    doAction(s, 'take_in_cat');
    expect(spoilageRate(s.animals)).toBeLessThan(withoutCat / 3);
  });

  it('the dog improves the snares', () => {
    const s = established(5);
    expect(s.hunt.hasDog).toBe(false);
    doAction(s, 'take_in_dog');
    expect(s.hunt.hasDog).toBe(true);
    expect(s.animals.dog?.name).toBeTruthy();
  });

  it('rabbits breed on their own', () => {
    const s = established(6);
    doAction(s, 'get_rabbits');
    const rabbits = herd(s.animals, 'rabbits')!;
    const start = rabbits.count;
    s.store.grain = 900;
    for (let i = 0; i < DAYS_PER_YEAR * 2; i++) doAction(s, 'sleep');
    expect(rabbits.count).toBeGreaterThan(start);
    expect(rabbits.count).toBeLessThanOrEqual(12); // the hutch has limits
  });

  it('sheep grow wool back after shearing', () => {
    const s = established(7);
    doAction(s, 'get_sheep');
    const sheep = herd(s.animals, 'sheep')!;
    sheep.wool = 1;
    s.dayOfYear = DAYS_PER_SEASON + 2; // summer
    expect(ACTIONS.shear_sheep!.available(s).ok).toBe(true);
    doAction(s, 'shear_sheep');
    expect(s.store.wool).toBeGreaterThan(0);
    expect(sheep.wool).toBe(0);
  });
});

describe('stock needs somewhere to live', () => {
  it('the larger animals want a byre first', () => {
    const s = initialState(8);
    s.store.grain = 400;
    expect(ACTIONS.get_ox!.available(s).reason).toBe('nowhere to shelter it');
    s.works.byre = true;
    expect(ACTIONS.get_ox!.available(s).ok).toBe(true);
  });

  it('rabbits want a hutch', () => {
    const s = initialState(9);
    s.store.grain = 400;
    expect(ACTIONS.get_rabbits!.available(s).reason).toBe('no hutch');
  });
});

describe('old age is handled softly, and can be turned off', () => {
  it('a companion eventually goes, in the journal not a popup', () => {
    const s = established(11);
    doAction(s, 'take_in_dog');
    s.animals.dog!.bornOn = -20 * DAYS_PER_YEAR; // an old dog
    s.store.grain = 2000;

    for (let i = 0; i < DAYS_PER_YEAR * 6; i++) doAction(s, 'sleep');
    expect(s.animals.dog!.present).toBe(false);
    // It is recorded, quietly, in prose.
    const mention = s.log.filter((l) => l.includes(s.animals.dog!.name));
    expect(mention.length).toBeGreaterThan(0);
    expect(mention.join(' ')).not.toMatch(/!/);
  });

  it('the setting stops them ageing at all', () => {
    const s = established(11);
    s.animalsAge = false;
    doAction(s, 'take_in_dog');
    s.animals.dog!.bornOn = -40 * DAYS_PER_YEAR;
    s.store.grain = 2000;
    for (let i = 0; i < DAYS_PER_YEAR * 8; i++) doAction(s, 'sleep');
    expect(s.animals.dog!.present).toBe(true);
  });
});
