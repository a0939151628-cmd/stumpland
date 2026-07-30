/**
 * Automated players. Not part of the game — these exist to prove the
 * economy without a human sitting at the terminal for three hundred days.
 * Shared by the vitest suite and the balance scripts so both measure
 * the same thing.
 */

import { GameState } from '../sim/state.js';
import { doAction } from '../sim/step.js';
import { ACTIONS } from '../sim/actions.js';
import { seasonOfDay, DAYS_PER_YEAR } from '../sim/calendar.js';
import { countTiles } from '../sim/grid.js';
import { has } from '../sim/animals.js';

export type Policy = (s: GameState) => string;

export const can = (s: GameState, id: string): boolean =>
  ACTIONS[id]?.available(s).ok ?? false;

/** Works the ground. Sows first, keeps a woodpile, runs a snare line. */
export const diligent: Policy = (s) => {
  const season = seasonOfDay(s.dayOfYear);
  const WINTER_WOOD = 22;
  const growing = season === 'summer' || season === 'autumn';

  // 1. Standing crop. It rots or freezes if you dawdle.
  if (can(s, 'harvest')) return 'harvest';

  // 2. Spring is short. Seed in the ground ahead of anything else.
  if (season === 'spring') {
    if (can(s, 'clear_ruined')) return 'clear_ruined';
    if (can(s, 'sow_barley')) return 'sow_barley';
    if (can(s, 'break_soil')) return 'break_soil';
  }
  // 3. Keep a woodpile, in every season including the one that burns it.
  //    Smoking meat eats into it too. This sits above the discretionary
  //    work because a cold night costs more than a third pass down the rows.
  if (s.store.firewood < WINTER_WOOD && can(s, 'chop_wood')) return 'chop_wood';

  // 4. Raise the works out of genuine surplus. This sits above weeding
  //    on purpose: a third pass down the rows is worth ten per cent of a
  //    yield, and a barn is worth more than that for the rest of your life.
  const worked = countTiles(s.plot, (t) => t.yearsWorked > 0);
  const fieldBigEnough = worked >= 34;
  if (s.store.grain > 60 && fieldBigEnough) {
    for (const kind of ['shed', 'smokehouse', 'hutch', 'byre', 'barn'] as const) {
      if (s.works[kind]) continue;
      if (can(s, `build_${kind}`)) return `build_${kind}`;
      if (can(s, 'fell_timber')) return 'fell_timber';
      break;
    }
  }

  if (can(s, 'weed')) return 'weed';


  // 4. The cat pays for herself in a season; the dog pays at the snares.
  if (!s.animals.cat && can(s, 'take_in_cat')) return 'take_in_cat';
  if (!s.animals.dog && s.store.grain > 25 && can(s, 'take_in_dog')) return 'take_in_dog';

  // 5. Stock, once there is somewhere to keep them and grain to spare.
  if (s.animals.herds.some((h) => h.condition < 0.6) && can(s, 'tend_animals')) {
    return 'tend_animals';
  }
  if (can(s, 'shear_sheep')) return 'shear_sheep';
  if (can(s, 'slaughter_pig')) return 'slaughter_pig';
  if (s.store.grain > 120) {
    for (const kind of ['hens', 'rabbits', 'goat', 'sheep', 'pig', 'ox'] as const) {
      if (can(s, `get_${kind}`)) return `get_${kind}`;
    }
  }

  // 6. Traps are cheap and keep working while you do other things.
  const snareAge = Math.max(0, ...s.hunt.snares.map((x) => x.daysActive));
  if (snareAge >= 3 && can(s, 'check_snares')) return 'check_snares';
  if (s.hunt.snares.length < 3) {
    if (!s.hunt.snares.some((x) => x.placement === 'water-edge') && can(s, 'set_snare_water')) {
      return 'set_snare_water';
    }
    if (can(s, 'set_snare_forest')) return 'set_snare_forest';
  }
  if (s.store.meat >= 4 && can(s, 'smoke_meat')) return 'smoke_meat';

  // 7. Ground work.
  if (can(s, 'clear_ruined')) return 'clear_ruined';
  if (can(s, 'clear_stump')) return 'clear_stump';

  // 9. Whatever is left of the day.
  // Do not break more ground than one pair of hands can keep up with.
  // The ox tempts you into over-extending; this is where that is resisted.
  const fieldCap = has(s.animals, 'ox') ? 76 : 48;
  if (worked < fieldCap && can(s, 'break_soil')) return 'break_soil';
  if (can(s, 'ice_fish')) return 'ice_fish';
  if (s.store.firewood < WINTER_WOOD && can(s, 'chop_wood')) return 'chop_wood';
  if (can(s, 'forage')) return 'forage';
  return 'sleep';
};

/** Does the minimum. Never farms. This one still has to get through. */
export const careless: Policy = (s) => {
  if (s.store.firewood < 8 && can(s, 'chop_wood')) return 'chop_wood';
  if (can(s, 'forage')) return 'forage';
  if (s.person.stamina > 60) return 'rest';
  return 'sleep';
};

/** Run one day: act until the policy says sleep or something stops it. */
export function playDay(s: GameState, policy: Policy): void {
  for (let i = 0; i < 12; i++) {
    const id = policy(s);
    if (id === 'sleep') break;
    if (!doAction(s, id).ok) break;
  }
  doAction(s, 'sleep');
}

export function playYears(s: GameState, years: number, policy: Policy): void {
  for (let i = 0; i < years * DAYS_PER_YEAR; i++) playDay(s, policy);
}
