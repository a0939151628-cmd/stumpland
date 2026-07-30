/**
 * The journal.
 *
 * At the close of every season, three to five sentences in the first
 * person, built out of what actually happened rather than a template
 * with the numbers dropped in. Every entry is kept.
 *
 * Rules the prose obeys, without exception:
 *   - no exclamation points
 *   - no numbers written as digits
 *   - no second person, no instructions, no encouragement
 *   - short sentences, physical detail, and it is allowed to say nothing
 *     happened, because sometimes nothing did
 */

import { Season } from './calendar.js';

/** What the season did. Gathered as it happens, spent at the season's end. */
export interface SeasonTally {
  year: number;
  season: Season;
  grainHarvested: number;
  tilesSown: number;
  stumpsPulled: number;
  timberFelled: number;
  caught: Record<string, number>;
  emptySnares: number;
  hungryNights: number;
  coldNights: number;
  raisedWorks: string[];
  tookOnStock: string[];
  visitors: string[];
  daysOfRain: number;
  daysOfSnow: number;
  daysStorm: number;
  hardestFrost: number;
  warmest: number;
  /** Set when the season had a genuinely notable animal event. */
  notes: string[];
}

export function newTally(year: number, season: Season): SeasonTally {
  return {
    year,
    season,
    grainHarvested: 0,
    tilesSown: 0,
    stumpsPulled: 0,
    timberFelled: 0,
    caught: {},
    emptySnares: 0,
    hungryNights: 0,
    coldNights: 0,
    raisedWorks: [],
    tookOnStock: [],
    visitors: [],
    daysOfRain: 0,
    daysOfSnow: 0,
    daysStorm: 0,
    hardestFrost: 99,
    warmest: -99,
    notes: [],
  };
}

export interface Entry {
  year: number;
  season: Season;
  text: string;
}

const WORDS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve',
];

/** Numbers as words, because digits look like a spreadsheet. */
export function count(n: number): string {
  const i = Math.round(n);
  if (i < 0) return 'no';
  if (i < WORDS.length) return WORDS[i]!;
  if (i < 20) return 'a good dozen';
  if (i < 40) return 'a couple of score';
  if (i < 80) return 'better than three score';
  return 'more than I could carry at once';
}

/**
 * A stable pick from a set of phrasings. Keyed on the year and season so
 * an entry always reads the same when you look back at it, but two
 * summers in a row do not open with the same sentence.
 */
function pick(t: SeasonTally, variants: readonly string[]): string {
  // Needs a proper avalanche: a single multiply leaves the low bits
  // correlated, and every summer in a row picks the same sentence.
  let k = t.year * 4 + SEASON_INDEX[t.season] + variants.length * 7 + 1;
  k = Math.imul(k ^ (k >>> 15), 0x2c1b3c6d);
  k ^= k >>> 12;
  k = Math.imul(k ^ (k >>> 7), 0x297a2d39);
  k ^= k >>> 15;
  return variants[(k >>> 0) % variants.length]!;
}

const SEASON_INDEX: Record<Season, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };

function list(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  // Oxford comma left out on purpose; it reads plainer without.
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The weather sentence. Always first: it is what the season was. */
function weatherLine(t: SeasonTally): string {
  const wet = t.daysOfRain;
  const snow = t.daysOfSnow;

  if (t.season === 'winter') {
    if (t.hardestFrost < -14) return pick(t, [
      'A hard winter, and it did not let go early.',
      'The cold got into the walls and stayed there until spring.',
      'Ice on the inside of the door most mornings.',
    ]);
    if (snow > 8) return pick(t, [
      'Snow most of the season, lying deep in the wood long after the field was bare.',
      'It snowed and snowed. The wood held its drifts for weeks.',
      'Deep snow. I walked the same trench to the woodpile a hundred times.',
    ]);
    if (t.hardestFrost > -3) return pick(t, [
      'A soft winter. More mud than ice, and I did not trust it.',
      'Hardly a winter at all. Grey, wet, and over quickly.',
    ]);
    return pick(t, [
      'Cold, and dry with it. The kind of winter a body can work in.',
      'A plain winter. Cold enough, and nothing worse than cold.',
      'Clear and hard. The stream froze at the edges and no further.',
    ]);
  }
  if (t.season === 'spring') {
    if (wet > 8) return pick(t, [
      'A wet spring. The ground would not take the plough for days at a stretch.',
      'Rain and rain. I stood at the door a great deal that season.',
      'The field was a bog until late. Sowed into wet ground and hoped.',
    ]);
    if (wet < 3) return pick(t, [
      'A dry spring, and an early one. The soil came up light in the hand.',
      'Dry, and warm before its time. The dust came off the harrow.',
    ]);
    return pick(t, [
      'Spring came on slowly. Nothing to complain of.',
      'An ordinary spring. The ground opened when it was ready.',
      'Cold mornings, then not. That was the whole of it.',
    ]);
  }
  if (t.season === 'summer') {
    if (t.warmest > 26) return pick(t, [
      'A close summer. The air over the field shook in the afternoons.',
      'Heat, and no wind in it. I worked early and sat out the middle of the day.',
      'Still, heavy weather. The stream dropped and showed its stones.',
    ]);
    if (wet > 8) return pick(t, [
      'It rained through most of the summer. The weeds loved it.',
      'A grey summer. Everything grew, including what I did not want.',
    ]);
    return pick(t, [
      'A steady summer. Long light, and enough of it.',
      'Good working weather, most of it. The light went on and on.',
      'A summer that did nothing remarkable and did it well.',
    ]);
  }
  if (t.daysStorm > 2) return pick(t, [
    'A rough autumn. Wind took a fence section and part of the path.',
    'Storms, one after another. I spent as long mending as working.',
  ]);
  if (wet > 8) return pick(t, [
    'Autumn came in wet and stayed that way.',
    'A sodden autumn. Got the crop in between showers and not gladly.',
  ]);
  return pick(t, [
    'A fair autumn, and the frost held off long enough.',
    'A kind autumn. It gave me the time I needed.',
    'Cool and dry. The best of the year, if I am honest.',
  ]);
}

/** The work sentence. What the hands did. */
function workLine(t: SeasonTally): string | null {
  const bits: string[] = [];
  if (t.stumpsPulled > 0) bits.push(`${count(t.stumpsPulled)} stumps out`);
  if (t.tilesSown > 0) bits.push('the field sown');
  if (t.timberFelled > 0) bits.push(`${count(t.timberFelled)} lengths of timber squared`);
  if (t.raisedWorks.length > 0) bits.push(`${list(t.raisedWorks)} standing`);
  if (bits.length === 0) return null;
  return `${capitalise(list(bits))}.`;
}

/** The harvest sentence, if there was one. */
function harvestLine(t: SeasonTally): string | null {
  if (t.grainHarvested <= 0) return null;
  if (t.grainHarvested < 12) return pick(t, [
    'The harvest was thin. It will have to do.',
    'Little enough came off the field. I have seen worse and will again.',
  ]);
  if (t.grainHarvested < 40) return pick(t, [
    `Got ${count(t.grainHarvested)} bushels in, and the straw besides.`,
    `${capitalise(count(t.grainHarvested))} bushels threshed and stored. Enough.`,
  ]);
  return pick(t, [
    `A good harvest. ${capitalise(count(t.grainHarvested))} bushels, and my back knows it.`,
    `${capitalise(count(t.grainHarvested))} bushels in. The best the ground has given me.`,
  ]);
}

/** The snares. Empty ones stated plainly, without comment. */
function huntLine(t: SeasonTally): string | null {
  const kinds = Object.entries(t.caught).filter(([, n]) => n > 0);
  if (kinds.length === 0) {
    if (t.emptySnares > 4) return 'The snares gave nothing worth the walk.';
    return null;
  }
  const deer = t.caught.roe_deer ?? 0;
  if (deer > 0) {
    return 'A roe deer in the deadfall. That changes the whole of the winter.';
  }
  const total = kinds.reduce((a, [, n]) => a + n, 0);
  const named = kinds
    .map(([k, n]) => `${count(n)} ${k === 'wood_pigeon' ? 'pigeon' : k}${n > 1 ? 's' : ''}`)
    .filter((x) => !x.startsWith('no '));
  if (total <= 2) return `${capitalise(list(named))} off the line, and a good many empty snares.`;
  return `${capitalise(list(named))} off the line.`;
}

/** People. Only if any came. */
function peopleLine(t: SeasonTally): string | null {
  const who = [...new Set(t.visitors)];
  if (who.length === 0) return null;
  if (who.length === 1) return pick(t, [
    `${who[0]} came by. We did not talk much.`,
    `${who[0]} was up here once. Sat, drank, went home.`,
    `Saw ${who[0]} the once. Neither of us had much to say.`,
  ]);
  if (who.length === 2) return `${who[0]} and ${who[1]} were both up here at one point or another.`;
  return `${list(who)} were all up here at one point or another.`;
}

/** How it went, in the body. Only when it went badly. */
function bodyLine(t: SeasonTally): string | null {
  if (t.coldNights > 4) return pick(t, [
    'Ran the woodpile down to nothing and slept cold more nights than I want to count.',
    'Let the fire go out more nights than I care to admit. My own fault.',
  ]);
  if (t.hungryNights > 6) return pick(t, [
    'Went to bed hungry often enough to notice.',
    'Thin eating for weeks. I stopped weighing what was left.',
  ]);
  if (t.hungryNights > 2) return pick(t, [
    'The store got thin toward the end.',
    'Scraped the crock more than once.',
  ]);
  return null;
}

/**
 * Build the entry. Three to five sentences, weather first, and silence
 * is a valid response to a season in which nothing much happened.
 */
export function writeEntry(t: SeasonTally): Entry {
  const candidates = [
    weatherLine(t),
    workLine(t),
    harvestLine(t),
    huntLine(t),
    ...t.notes,
    peopleLine(t),
    bodyLine(t),
  ].filter((x): x is string => !!x);

  // Three to five sentences, counted as sentences — some lines carry two
  // of their own, so taking five lines would run to ten.
  const lines: string[] = [];
  let sentences = 0;
  for (const line of candidates) {
    const n = sentencesIn(line);
    if (sentences + n > 5 && sentences >= 3) break;
    lines.push(line);
    sentences += n;
    if (sentences >= 5) break;
  }
  if (sentences < 3) lines.push(quietLine(t));

  return { year: t.year, season: t.season, text: lines.join(' ') };
}

function sentencesIn(line: string): number {
  return line.split('.').filter((x) => x.trim().length > 0).length;
}

/** For a season where genuinely nothing happened. */
function quietLine(t: SeasonTally): string {
  switch (t.season) {
    case 'winter':
      return 'Mended what wanted mending. Slept a great deal.';
    case 'spring':
      return 'Walked the boundary twice for no reason I could name.';
    case 'summer':
      return 'Long days of very little. I did not mind them.';
    default:
      return 'Put things away for the winter. Counted the woodpile twice.';
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
