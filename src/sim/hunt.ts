import { GameState, nextRand } from './state.js';
import { Season, seasonOfDay } from './calendar.js';
import { Weather, isStormy, isSnowing, isFoggy } from './weather.js';

export type Placement = 'forest' | 'water-edge';
export type SnareType = 'snare' | 'deadfall';
export type Species = 'hare' | 'wood_pigeon' | 'duck' | 'roe_deer' | 'nothing';

export interface Snare {
  placement: Placement;
  type: SnareType;
  setOnDay: number;    // absolute day (year*DAYS + dayOfYear)
  daysActive: number;  // increments each endDay while set
}

export interface HuntState {
  snares: Snare[]; // max 3
  hasDog: boolean; // false until later
}

export function initialHuntState(): HuntState {
  return { snares: [], hasDog: false };
}

export const MAX_SNARES = 3;
export const MAX_WATER_SNARES = 1;
export const MAX_DEADFALLS = 1;

export interface CatchResult {
  species: Species;
  meat: number;
  hides: number;
  line: string;
}

const EMPTY_LINES_FOREST: string[] = [
  'The snare in the pines: nothing.',
  'The forest snare, empty. String slack.',
  'Some prints crossed but did not stop.',
];
const EMPTY_LINES_WATER: string[] = [
  'The water snare: only wet leaves.',
  'The reed snare empty. A feather caught.',
];
const EMPTY_LINES_DEADFALL: string[] = [
  'The deadfall untouched.',
  'Deadfall still set. Bait gone though.',
];

function pick<T>(arr: readonly T[], state: GameState): T {
  const i = Math.floor(nextRand(state) * arr.length);
  return arr[Math.min(i, arr.length - 1)] as T;
}

function emptyLine(snare: Snare, state: GameState): string {
  if (snare.type === 'deadfall') return pick(EMPTY_LINES_DEADFALL, state);
  if (snare.placement === 'water-edge') return pick(EMPTY_LINES_WATER, state);
  return pick(EMPTY_LINES_FOREST, state);
}

/** Roll one snare. Returns catch (or nothing). Advances state RNG. */
export function rollSnare(
  snare: Snare,
  state: GameState,
  weather: Weather,
  season: Season
): CatchResult {
  const hunt = state.hunt;

  // Base chance rises with time, capped. Deadfalls are slower to trigger.
  const base = snare.type === 'deadfall'
    ? Math.min(0.28, 0.04 + snare.daysActive * 0.04)
    : Math.min(0.40, 0.10 + snare.daysActive * 0.06);
  let chance = base;

  if (isStormy(weather)) chance *= 0.5;
  if (isSnowing(weather, season)) chance *= 1.2; // tracks help
  if (isFoggy(weather)) chance *= 0.85;
  if (season === 'winter') chance *= 0.75;
  if (season === 'spring' && snare.placement === 'water-edge') chance *= 1.1; // ducks north
  if (hunt.hasDog) chance *= 1.25;

  const roll = nextRand(state);
  if (roll > chance) {
    return { species: 'nothing', meat: 0, hides: 0, line: emptyLine(snare, state) };
  }

  // Species selection
  const s = nextRand(state);
  if (snare.type === 'deadfall' && snare.placement === 'forest' && s < 0.08) {
    return {
      species: 'roe_deer',
      meat: 20,
      hides: 1,
      line: 'Roe deer in the deadfall. All afternoon dressing it.',
    };
  }
  if (snare.placement === 'water-edge') {
    if (s < 0.65) return { species: 'duck', meat: 2, hides: 0, line: 'A duck in the water-edge snare.' };
    return { species: 'hare', meat: 2, hides: 1, line: 'A hare, come down to drink.' };
  }
  // Forest snare
  if (s < 0.55) return { species: 'hare', meat: 2, hides: 1, line: 'A hare in the snare.' };
  if (s < 0.95) return { species: 'wood_pigeon', meat: 1, hides: 0, line: 'A wood pigeon, caught by the neck.' };
  return { species: 'hare', meat: 2, hides: 1, line: 'A hare in the snare, larger than most.' };
}

/** Ice fishing outcome — always winter. */
export function rollIceFish(state: GameState, weather: Weather): { meat: number; line: string } {
  let base = 0.5;
  if (isStormy(weather)) base *= 0.4;
  if (weather.tempC < -10) base *= 0.7;
  const r = nextRand(state);
  if (r > base) return { meat: 0, line: 'The line stayed dead. Wind moved the hole ice around.' };
  const size = nextRand(state);
  if (size < 0.15) return { meat: 2, line: 'Two pike through the ice.' };
  return { meat: 1, line: 'A perch through the ice.' };
}
