import { describe, it, expect } from 'vitest';
import { initialState } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';
import { count } from '../src/sim/journal.js';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../src/sim/calendar.js';
import { diligent, careless, playYears } from '../src/testkit/policies.js';

function journalOf(years: number, seed: number, policy = diligent): string[] {
  const s = initialState(seed);
  playYears(s, years, policy);
  return s.journal.map((e) => e.text);
}

describe('an entry falls due at the end of every season', () => {
  it('four a year, kept for good', () => {
    const s = initialState(1);
    playYears(s, 5, diligent);
    expect(s.journal.length).toBe(20);
    expect(s.journal[0]!.season).toBe('spring');
    expect(s.journal[3]!.season).toBe('winter');
    expect(s.journal[4]!.year).toBe(2);

    // Nothing is ever dropped as the years pile up.
    playYears(s, 5, diligent);
    expect(s.journal.length).toBe(40);
    expect(s.journal[0]!.text).toBe(journalOf(1, 1)[0]);
  });
});

describe('the writing obeys the tone', () => {
  const entries = [
    ...journalOf(8, 1),
    ...journalOf(8, 42, careless),
    ...journalOf(8, 7),
  ];

  it('has no exclamation points anywhere, ever', () => {
    for (const e of entries) expect(e).not.toMatch(/!/);
  });

  it('writes numbers as words, never as digits', () => {
    for (const e of entries) expect(e).not.toMatch(/[0-9]/);
  });

  it('never addresses the player or gives instructions', () => {
    for (const e of entries) {
      expect(e).not.toMatch(/\byou\b/i);
      expect(e).not.toMatch(/\byour\b/i);
      expect(e).not.toMatch(/\bshould\b/i);
      expect(e).not.toMatch(/\btry\b/i);
    }
  });

  it('is first person and terse — three to five sentences', () => {
    for (const e of entries) {
      const sentences = e.split(/[.?]\s+/).filter((x) => x.trim().length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(8);
      expect(e.length).toBeLessThan(420);
    }
  });

  it('does not repeat itself season after season', () => {
    const summers = journalOf(8, 1).filter((_, i) => i % 4 === 1);
    const openings = summers.map((e) => e.split('.')[0]);
    expect(new Set(openings).size).toBeGreaterThan(2);
  });

  it('says something even when nothing happened', () => {
    // A player who does nothing at all still gets a readable season.
    const s = initialState(3);
    for (let i = 0; i < DAYS_PER_YEAR; i++) doAction(s, 'sleep');
    expect(s.journal.length).toBe(4);
    for (const e of s.journal) {
      expect(e.text.length).toBeGreaterThan(30);
      expect(e.text).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

describe('it reports what actually happened', () => {
  it('a harvest shows up in the season it was cut', () => {
    const s = initialState(1);
    playYears(s, 3, diligent);
    const harvestSeasons = s.journal.filter((e) => /bushels|harvest/i.test(e.text));
    expect(harvestSeasons.length).toBeGreaterThan(0);
    for (const e of harvestSeasons) {
      expect(['summer', 'autumn']).toContain(e.season);
    }
  });

  it('empty snares are stated plainly, without complaint', () => {
    const all = journalOf(10, 1).join(' ');
    expect(all).toMatch(/empty snares/);
    expect(all).not.toMatch(/unfortunately|sadly|disappoint/i);
  });

  it('names the neighbours who actually came', () => {
    const s = initialState(1);
    playYears(s, 6, diligent);
    const text = s.journal.map((e) => e.text).join(' ');
    const named = s.neighbours.filter((n) => text.includes(n.name));
    expect(named.length).toBeGreaterThan(0);
  });

  it('a lean winter is recorded without melodrama', () => {
    const s = initialState(9);
    s.dayOfYear = DAYS_PER_SEASON * 3;
    s.store = { grain: 0, firewood: 0, timber: 0, meat: 0, smokedMeat: 0, hides: 0, wool: 0 };
    for (let i = 0; i < DAYS_PER_SEASON + 1; i++) doAction(s, 'sleep');
    const winter = s.journal.find((e) => e.season === 'winter');
    expect(winter).toBeDefined();
    expect(winter!.text).not.toMatch(/!|starv|desperate|terrible/i);
  });
});

describe('numbers become words', () => {
  it('counts in plain English', () => {
    expect(count(0)).toBe('no');
    expect(count(1)).toBe('one');
    expect(count(12)).toBe('twelve');
    expect(count(15)).toBe('a good dozen');
    expect(count(300)).toBe('more than I could carry at once');
    for (let i = 0; i < 200; i++) expect(count(i)).not.toMatch(/[0-9]/);
  });
});
