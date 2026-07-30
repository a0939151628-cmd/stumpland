import { describe, it, expect } from 'vitest';
import { initialState, GameState } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';
import { ACTIONS } from '../src/sim/actions.js';
import { DAYS_PER_YEAR, daylightHours, DAYS_PER_SEASON } from '../src/sim/calendar.js';
import { countTiles, forEachTile } from '../src/sim/grid.js';

import { diligent, careless, playDay, playYears } from '../src/testkit/policies.js';

describe('a careless player survives every winter', () => {
  for (const seed of [1, 7, 42, 1009]) {
    it(`seed ${seed}: five years, never destitute`, () => {
      const s = initialState(seed);
      let hungryNights = 0;
      let coldNights = 0;

      for (let i = 0; i < 5 * DAYS_PER_YEAR; i++) {
        playDay(s, careless);
        if (!s.person.ateToday) hungryNights++;
        if (s.person.wasColdLastNight) coldNights++;
        // Never falls through the floor, whatever happens.
        expect(s.person.stamina).toBeGreaterThanOrEqual(20);
        expect(s.store.grain).toBeGreaterThanOrEqual(0);
        expect(s.store.firewood).toBeGreaterThanOrEqual(0);
      }

      // A lean life, not a losing one. Some hunger is allowed; ruin is not.
      expect(hungryNights).toBeLessThan(0.15 * 5 * DAYS_PER_YEAR);
      expect(coldNights).toBeLessThan(0.15 * 5 * DAYS_PER_YEAR);
      expect(s.year).toBe(6);
    });
  }
});

describe('five years of soil work shows in the numbers', () => {
  it('the oldest ground improves year on year', () => {
    const s = initialState(1);
    // Follow the specific tiles worked in year one, not the shifting
    // average — new ground broken later starts poor and drags a mean down.
    playYears(s, 1, diligent);
    const firstFields = s.plot.tiles.filter((t) => t.yearsWorked > 0);
    expect(firstFields.length).toBeGreaterThan(8);

    const meanSoil = (): number =>
      firstFields.reduce((a, t) => a + t.soil, 0) / firstFields.length;

    const byYear = [meanSoil()];
    for (let y = 0; y < 4; y++) {
      playYears(s, 1, diligent);
      byYear.push(meanSoil());
    }

    // Rises every year, never falls back.
    for (let i = 1; i < byYear.length; i++) {
      expect(byYear[i]!).toBeGreaterThan(byYear[i - 1]!);
    }
    // Five years of work is worth substantially more than one.
    expect(byYear[4]!).toBeGreaterThan(byYear[0]! * 1.6);
    // And those tiles have carried a crop several times over.
    expect(Math.max(...firstFields.map((t) => t.yearsWorked))).toBeGreaterThanOrEqual(4);
  });

  it('the harvest grows as the ground comes good', () => {
    const s = initialState(1);
    const grainByYear: number[] = [];
    for (let y = 0; y < 5; y++) {
      playYears(s, 1, diligent);
      grainByYear.push(s.store.grain);
    }
    expect(grainByYear[4]!).toBeGreaterThan(grainByYear[0]! * 3);
    // And it beats doing nothing at all, by a wide margin.
    const idle = initialState(1);
    playYears(idle, 5, careless);
    expect(grainByYear[4]!).toBeGreaterThan(idle.store.grain * 2);
  });

  it('the plot itself changes permanently', () => {
    const s = initialState(1);
    const stumpsAtStart = countTiles(s.plot, (t) => t.stump);
    playYears(s, 5, diligent);
    const stumpsAtEnd = countTiles(s.plot, (t) => t.stump);

    expect(stumpsAtStart).toBeGreaterThan(30);
    expect(stumpsAtEnd).toBeLessThan(stumpsAtStart);
    // Ground that has carried a crop stays marked as worked.
    expect(countTiles(s.plot, (t) => t.yearsWorked > 0)).toBeGreaterThan(8);
  });
});

describe('meat plus grain carries a winter grain alone cannot', () => {
  it('a store of meat buys nights that grain alone would not', () => {
    const winterStart = DAYS_PER_SEASON * 3;

    const withGrainOnly = initialState(3);
    withGrainOnly.dayOfYear = winterStart;
    withGrainOnly.store = { grain: 10, firewood: 40, timber: 0, meat: 0, smokedMeat: 0, hides: 0, wool: 0 };

    const withBoth = initialState(3);
    withBoth.dayOfYear = winterStart;
    withBoth.store = { grain: 10, firewood: 40, timber: 0, meat: 0, smokedMeat: 8, hides: 0, wool: 0 };

    const fedNights = (s: GameState): number => {
      let fed = 0;
      for (let i = 0; i < DAYS_PER_SEASON; i++) {
        doAction(s, 'sleep');
        if (s.person.ateToday) fed++;
      }
      return fed;
    };

    const grainOnly = fedNights(withGrainOnly);
    const both = fedNights(withBoth);

    expect(grainOnly).toBeLessThan(DAYS_PER_SEASON);
    expect(both).toBe(DAYS_PER_SEASON);
    expect(both).toBeGreaterThan(grainOnly);
  });

  it('smoked meat keeps through winter, fresh meat does not keep in summer', () => {
    const summer = initialState(5);
    summer.dayOfYear = DAYS_PER_SEASON; // summer day 1
    summer.store.meat = 10;
    summer.store.grain = 50;
    const before = summer.store.meat;
    for (let i = 0; i < 5; i++) doAction(summer, 'sleep');
    expect(summer.store.meat).toBeLessThan(before);

    const winter = initialState(5);
    winter.dayOfYear = DAYS_PER_SEASON * 3;
    winter.store.smokedMeat = 10;
    winter.store.firewood = 40;
    for (let i = 0; i < 5; i++) doAction(winter, 'sleep');
    // Eaten one a night, but none lost to spoilage.
    expect(winter.store.smokedMeat).toBe(5);
  });
});

describe('daylight allows a sane number of actions in every season', () => {
  it('winter days physically fit fewer actions than summer days', () => {
    // Take the body out of it, so this measures daylight alone.
    const countActions = (dayOfYear: number): number => {
      const s = initialState(11);
      s.dayOfYear = dayOfYear;
      s.hoursLeft = daylightHours(dayOfYear);
      s.person.maxStamina = 100000;
      s.person.stamina = 100000;
      let n = 0;
      // Chopping wood is available in every season. Stop at dusk.
      while (s.hoursLeft >= ACTIONS.chop_wood!.hours) {
        if (!doAction(s, 'chop_wood').ok) break;
        n++;
      }
      return n;
    };

    const midsummer = countActions(15);
    const midwinter = countActions(45);

    // Roughly three times the working day, which is the whole point.
    expect(midwinter).toBeLessThan(midsummer);
    expect(midsummer / midwinter).toBeGreaterThanOrEqual(2.5);
    // Neither season is unplayable.
    expect(midwinter).toBeGreaterThanOrEqual(2);
    expect(midsummer).toBeLessThanOrEqual(6);
  });

  it('daylight follows the stated curve', () => {
    expect(daylightHours(15)).toBeCloseTo(18, 1); // solstice, first day of summer
    expect(daylightHours(45)).toBeCloseTo(6, 1);  // first day of winter
    for (let d = 0; d < DAYS_PER_YEAR; d++) {
      expect(daylightHours(d)).toBeGreaterThanOrEqual(6);
      expect(daylightHours(d)).toBeLessThanOrEqual(18);
    }
  });

  it('stamina binds the summer, daylight binds the winter', () => {
    const summer = initialState(2);
    summer.dayOfYear = 15;
    summer.hoursLeft = daylightHours(15);
    while (doAction(summer, 'chop_wood').ok) { /* until something stops us */ }
    // Ran out of body before light.
    expect(summer.hoursLeft).toBeGreaterThan(0);

    const winter = initialState(2);
    winter.dayOfYear = 45;
    winter.hoursLeft = daylightHours(45);
    let acted = 0;
    while (winter.hoursLeft >= ACTIONS.chop_wood!.hours) {
      if (!doAction(winter, 'chop_wood').ok) break;
      acted++;
    }
    // Ran out of light with body to spare.
    expect(winter.person.stamina).toBeGreaterThan(0);
    expect(acted).toBeLessThanOrEqual(2);
  });
});
