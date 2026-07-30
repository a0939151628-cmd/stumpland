import { DAYS_PER_YEAR, daylightHours } from './calendar.js';
import { sunrise } from './sky.js';
import { Weather, initialWeather } from './weather.js';
import { HuntState, initialHuntState } from './hunt.js';
import { Plot, makePlot } from './grid.js';
import { Works, initialWorks } from './buildings.js';
import { Animals, initialAnimals } from './animals.js';
import { Neighbour, initialNeighbours } from './neighbours.js';
import { Entry, SeasonTally, newTally } from './journal.js';
import { seasonOfDay } from './calendar.js';

export interface Store {
  grain: number;
  firewood: number;
  timber: number;     // felled and dressed. for building, not burning
  meat: number;       // fresh. goes off in warm months
  smokedMeat: number; // hung in the rafters. keeps
  hides: number;
  wool: number;
}

export interface Person {
  stamina: number;
  maxStamina: number;
  ateToday: boolean;
  wasColdLastNight: boolean;
}

export interface GameState {
  year: number;
  dayOfYear: number;
  hoursLeft: number;
  plot: Plot;
  store: Store;
  works: Works;
  animals: Animals;
  neighbours: Neighbour[];
  person: Person;
  /** Every season's entry, kept for good. */
  journal: Entry[];
  /** What this season has done so far. Spent at the season's close. */
  tally: SeasonTally;
  weather: Weather;
  hunt: HuntState;
  /** Times the wood has been picked over this season. It runs thin. */
  foragedThisSeason: number;
  /** Sitting down helps once. The fourth time it does nothing. */
  restsToday: number;
  /** Settings. Off by default because some people would rather not. */
  animalsAge: boolean;
  seed: number;
  log: string[];
}

export function initialState(seed = 1): GameState {
  return {
    year: 1,
    dayOfYear: 0,
    hoursLeft: daylightHours(0),
    plot: makePlot(seed),
    store: { grain: 20, firewood: 6, timber: 0, meat: 0, smokedMeat: 0, hides: 0, wool: 0 },
    works: initialWorks(),
    animals: initialAnimals(),
    neighbours: initialNeighbours(),
    journal: [],
    tally: newTally(1, seasonOfDay(0)),
    person: {
      stamina: 100,
      maxStamina: 100,
      ateToday: true,
      wasColdLastNight: false,
    },
    weather: initialWeather(),
    hunt: initialHuntState(),
    foragedThisSeason: 0,
    restsToday: 0,
    animalsAge: true,
    seed,
    log: [],
  };
}

export function absoluteDay(state: GameState): number {
  return (state.year - 1) * DAYS_PER_YEAR + state.dayOfYear;
}

/**
 * The time of day, as a clock hour. The day starts at first light and
 * every action spends daylight, so the clock is simply how much of the
 * day has been used. Past dusk this runs on beyond sunset.
 */
export function hourOfDay(state: GameState): number {
  const light = daylightHours(state.dayOfYear);
  return sunrise(state.dayOfYear) + (light - state.hoursLeft);
}

/** Working by lamplight: the sun is down but the day is not over. */
export function isAfterDark(state: GameState): boolean {
  return state.hoursLeft <= 0;
}

// mulberry32, threaded through the state so a seed replays exactly.
export function nextRand(state: GameState): number {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
