/**
 * Stock, and the two that are not stock.
 *
 * Every animal changes what a day looks like rather than just adding a
 * number. Hens want shutting in. A goat gets out. The ox halves the work
 * of breaking ground, which is the largest single change in the game.
 *
 * Nothing here can die of neglect. An animal that is not fed goes thin
 * and stops giving, and comes back when you start feeding it again.
 */

import { DAYS_PER_YEAR } from './calendar.js';

export type Stock = 'hens' | 'rabbits' | 'goat' | 'sheep' | 'pig' | 'ox';

export interface Herd {
  kind: Stock;
  count: number;
  /** 0 thin, 1 thriving. Drives everything the animal gives. */
  condition: number;
  fedToday: boolean;
  acquiredOn: number;
  /** Only meaningful for sheep: wool grows back after shearing. */
  wool: number;
}

export interface Companion {
  name: string;
  bornOn: number;
  /** Set false in old age, quietly, offscreen. */
  present: boolean;
}

export interface Animals {
  herds: Herd[];
  dog: Companion | null;
  cat: Companion | null;
  /** Shut the hens in at night. Forgetting costs condition, nothing worse. */
  hensShutIn: boolean;
}

export function initialAnimals(): Animals {
  return { herds: [], dog: null, cat: null, hensShutIn: true };
}

export interface StockSpec {
  kind: Stock;
  label: string;
  /** Bushels of grain to take one on from a neighbour. */
  price: number;
  /** Daily feed cost in grain per head. */
  feed: number;
  /** Needs a byre to stand out of the weather. */
  wantsShelter: boolean;
  blurb: string;
}

export const STOCK: Record<Stock, StockSpec> = {
  hens: {
    kind: 'hens',
    label: 'hens',
    price: 8,
    feed: 0.12,
    wantsShelter: false,
    blurb: 'Four hens, in a crate with their legs tied. Loose in the yard by dusk.',
  },
  rabbits: {
    kind: 'rabbits',
    label: 'rabbits',
    price: 6,
    feed: 0.1,
    wantsShelter: false,
    blurb: 'A buck and two does. They will not need encouraging.',
  },
  goat: {
    kind: 'goat',
    label: 'a goat',
    price: 18,
    feed: 0.4,
    wantsShelter: true,
    blurb: 'A goat. She was over the fence before the rope was off her.',
  },
  sheep: {
    kind: 'sheep',
    label: 'sheep',
    price: 22,
    feed: 0.5,
    wantsShelter: true,
    blurb: 'Three ewes, small and hardy, wool like felt.',
  },
  pig: {
    kind: 'pig',
    label: 'a pig',
    price: 20,
    feed: 0.6,
    wantsShelter: true,
    blurb: 'A young pig. It will eat whatever the year does not.',
  },
  ox: {
    kind: 'ox',
    label: 'an ox',
    price: 90,
    feed: 1.2,
    wantsShelter: true,
    blurb: 'An ox. Slow, enormous, and worth every bushel he cost.',
  },
};

export function herd(a: Animals, kind: Stock): Herd | undefined {
  return a.herds.find((h) => h.kind === kind);
}

export function has(a: Animals, kind: Stock): boolean {
  const h = herd(a, kind);
  return !!h && h.count > 0;
}

/** An ox in working condition halves the labour of breaking ground. */
export function oxenHelp(a: Animals): number {
  const ox = herd(a, 'ox');
  if (!ox || ox.count === 0) return 1;
  // A thin ox is not much help.
  return 1 - 0.5 * Math.max(0.3, ox.condition);
}

/** Grain the stock will eat today, at full rations. */
export function dailyFeed(a: Animals): number {
  return a.herds.reduce((sum, h) => sum + STOCK[h.kind].feed * h.count, 0);
}

/**
 * The store loses a little every day to rats and damp. A cat cuts it to
 * almost nothing, which is the whole of the cat's mechanical job — about
 * sixteen per cent of the year's grain without one, three with.
 */
export function spoilageRate(a: Animals): number {
  return a.cat && a.cat.present ? 0.0005 : 0.003;
}

/** Names that belong to this valley and no other. */
export const DOG_NAMES = ['Vakr', 'Byrne', 'Sten', 'Hald', 'Orri'] as const;
export const CAT_NAMES = ['Mus', 'Frey', 'Ronn', 'Ask', 'Vetr'] as const;

/** Companions age. Handled softly, and only if the setting allows it. */
export function ageInYears(c: Companion, absoluteDay: number): number {
  return (absoluteDay - c.bornOn) / DAYS_PER_YEAR;
}
