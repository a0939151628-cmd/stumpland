import { describe, it, expect } from 'vitest';
import { initialState, GameState } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';
import { FrontType } from '../src/sim/weather.js';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../src/sim/calendar.js';

function hold(s: GameState, front: FrontType, days: number): void {
  for (let i = 0; i < days; i++) {
    s.weather.frontType = front;
    s.weather.frontDaysLeft = 99;
    doAction(s, 'sleep');
  }
}

const meanSnow = (s: GameState): number =>
  s.plot.tiles.reduce((a, t) => a + t.snow, 0) / s.plot.tiles.length;
const meanPuddle = (s: GameState): number =>
  s.plot.tiles.reduce((a, t) => a + t.puddle, 0) / s.plot.tiles.length;
const snowyTiles = (s: GameState): number => s.plot.tiles.filter((t) => t.snow > 0.08).length;

describe('snow lies and melts', () => {
  it('accumulates when it is freezing and falling', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 3 + 5; // deep winter
    expect(meanSnow(s)).toBe(0);
    hold(s, 'snow', 6);
    expect(meanSnow(s)).toBeGreaterThan(0.3);
    expect(s.weather.tempC).toBeLessThan(0);
  });

  it('melts unevenly — the ground does not all clear on the same day', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 3 + 5;
    hold(s, 'snow', 6);
    const covered = snowyTiles(s);
    expect(covered).toBeGreaterThan(400);

    // Thaw, watching how many tiles still hold snow.
    const counts: number[] = [];
    for (let i = 0; i < 18; i++) {
      hold(s, 'thaw', 1);
      counts.push(snowyTiles(s));
    }

    // It comes off gradually, not all at once: there is at least one day
    // where some ground is bare and some is still white.
    const patchy = counts.filter((c) => c > 0 && c < covered * 0.9);
    expect(patchy.length).toBeGreaterThanOrEqual(3);
    expect(counts[counts.length - 1]).toBe(0);
  });

  it('the wood holds its snow longer than the open ground', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 3 + 5;
    hold(s, 'snow', 6);
    hold(s, 'thaw', 5);

    const forest = s.plot.tiles.filter((t) => t.terrain === 'forest');
    const open = s.plot.tiles.filter((t) => t.terrain === 'clearing');
    const mean = (ts: typeof forest): number => ts.reduce((a, t) => a + t.snow, 0) / ts.length;

    expect(mean(forest)).toBeGreaterThan(mean(open));
  });

  it('never lies on the stream', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 3 + 5;
    hold(s, 'snow', 8);
    for (const t of s.plot.tiles) {
      if (t.terrain === 'water') expect(t.snow).toBe(0);
    }
  });
});

describe('water stands and dries', () => {
  it('a wet week leaves standing water', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 2 + 5; // autumn
    hold(s, 'rain', 6);
    expect(meanPuddle(s)).toBeGreaterThan(0.15);
  });

  it('takes days to dry, not hours', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 2 + 5;
    hold(s, 'rain', 6);
    const wet = meanPuddle(s);

    hold(s, 'clear', 1);
    // Still visibly wet the day after the rain stops.
    expect(meanPuddle(s)).toBeGreaterThan(wet * 0.5);

    hold(s, 'clear', 6);
    expect(meanPuddle(s)).toBeLessThan(0.02);
  });

  it('frozen ground has no standing water', () => {
    const s = initialState(1);
    s.dayOfYear = DAYS_PER_SEASON * 3 + 5;
    hold(s, 'snow', 6);
    for (const t of s.plot.tiles) {
      if (t.snow > 0) expect(t.puddle).toBe(0);
    }
  });
});

describe('weather stays a simulated state, not a daily dice roll', () => {
  it('a wet week feels like a wet week', () => {
    const s = initialState(7);
    let runs = 0;
    let longest = 0;
    let current = 0;
    for (let i = 0; i < DAYS_PER_YEAR * 3; i++) {
      doAction(s, 'sleep');
      if (s.weather.precip > 0.3) {
        current++;
        longest = Math.max(longest, current);
      } else {
        if (current >= 3) runs++;
        current = 0;
      }
    }
    // Fronts persist, so multi-day wet spells happen repeatedly.
    expect(longest).toBeGreaterThanOrEqual(3);
    expect(runs).toBeGreaterThan(2);
  });

  it('temperature follows the seasons', () => {
    const s = initialState(3);
    const byDay: number[] = [];
    for (let i = 0; i < DAYS_PER_YEAR * 2; i++) {
      doAction(s, 'sleep');
      byDay.push(s.weather.tempC);
    }
    const summer = byDay.filter((_, i) => i % DAYS_PER_YEAR >= 15 && i % DAYS_PER_YEAR < 30);
    const winter = byDay.filter((_, i) => i % DAYS_PER_YEAR >= 45);
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(summer)).toBeGreaterThan(mean(winter) + 10);
  });

  it('describes itself in prose, never in numbers', () => {
    const s = initialState(5);
    for (let i = 0; i < DAYS_PER_YEAR; i++) {
      doAction(s, 'sleep');
      const line = s.weather.todaysLine;
      expect(line).not.toMatch(/[0-9]/);
      expect(line).not.toMatch(/!/);
      expect(line.length).toBeGreaterThan(8);
    }
  });
});
