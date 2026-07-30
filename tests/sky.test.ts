import { describe, it, expect } from 'vitest';
import {
  sunPosition, moonPosition, moonIllumination, lunarPhase, moonName,
  declination, sunrise, sunset, LUNAR_PERIOD_DAYS,
} from '../src/sim/sky.js';
import { DAYS_PER_YEAR, daylightHours } from '../src/sim/calendar.js';
import { initialState, hourOfDay } from '../src/sim/state.js';
import { doAction } from '../src/sim/step.js';

const MIDSUMMER = 22;
const MIDWINTER = 52;

describe('the sun follows a real arc', () => {
  it('rides high at midsummer and barely clears the horizon at midwinter', () => {
    const summerNoon = sunPosition(MIDSUMMER, 12).altitude;
    const winterNoon = sunPosition(MIDWINTER, 12).altitude;

    // At 60 degrees north: 90 - 60 + 23.44, and 90 - 60 - 23.44.
    expect(summerNoon).toBeCloseTo(53.4, 0);
    expect(winterNoon).toBeCloseTo(6.6, 0);
    expect(summerNoon).toBeGreaterThan(winterNoon * 5);
  });

  it('is highest at noon and lowest at midnight, every day of the year', () => {
    for (let d = 0; d < DAYS_PER_YEAR; d += 5) {
      const noon = sunPosition(d, 12).altitude;
      for (const h of [6, 9, 15, 18]) {
        expect(sunPosition(d, h).altitude).toBeLessThanOrEqual(noon + 1e-6);
      }
      expect(sunPosition(d, 0).altitude).toBeLessThan(noon);
    }
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunPosition(MIDSUMMER, 8).azimuth;
    const evening = sunPosition(MIDSUMMER, 16).azimuth;
    expect(morning).toBeGreaterThan(0);
    expect(morning).toBeLessThan(180);   // eastern half
    expect(evening).toBeGreaterThan(180); // western half
  });

  it('is above the horizon through the daylight window and below outside it', () => {
    for (const d of [MIDSUMMER, MIDWINTER, 0, 37]) {
      const up = sunrise(d);
      const down = sunset(d);
      const noon = (up + down) / 2;
      expect(sunPosition(d, noon).altitude).toBeGreaterThan(0);
      // An hour before first light and after last, it is down.
      expect(sunPosition(d, up - 1.5).altitude).toBeLessThan(2);
      expect(sunPosition(d, down + 1.5).altitude).toBeLessThan(2);
    }
  });

  it('declination swings with the seasons', () => {
    expect(declination(MIDSUMMER)).toBeCloseTo(23.44, 1);
    expect(declination(MIDWINTER)).toBeCloseTo(-23.44, 1);
  });
});

describe('the moon runs its own 29-day cycle', () => {
  it('cycles new to full to new', () => {
    expect(lunarPhase(0)).toBeCloseTo(0, 2);
    expect(moonIllumination(0)).toBeCloseTo(0, 2);
    expect(moonIllumination(LUNAR_PERIOD_DAYS / 2)).toBeCloseTo(1, 2);
    expect(moonIllumination(LUNAR_PERIOD_DAYS)).toBeCloseTo(0, 2);
  });

  it('does not sit in step with the sixty-day year', () => {
    // If it did, the phase on a given date would never drift and the
    // whole point of tracking it would be lost.
    const a = lunarPhase(30);
    const b = lunarPhase(30 + DAYS_PER_YEAR);
    expect(Math.abs(a - b)).toBeGreaterThan(0.005);
  });

  it('a full moon transits at midnight, a new moon at noon', () => {
    const full = LUNAR_PERIOD_DAYS / 2;
    const atMidnight = moonPosition(full, 0, MIDWINTER).altitude;
    const atNoon = moonPosition(full, 12, MIDWINTER).altitude;
    expect(atMidnight).toBeGreaterThan(atNoon);

    const newMoon = 0;
    expect(moonPosition(newMoon, 12, MIDWINTER).altitude).toBeGreaterThan(
      moonPosition(newMoon, 0, MIDWINTER).altitude
    );
  });

  it('a full winter moon rides high all night — the light that makes winter workable', () => {
    // Chosen so the phase lands full in deep winter.
    const absDay = 22 * DAYS_PER_YEAR + MIDWINTER;
    expect(moonIllumination(absDay)).toBeGreaterThan(0.9);

    const midnight = moonPosition(absDay, 0, MIDWINTER).altitude;
    expect(midnight).toBeGreaterThan(40);
    // Far higher than the sun manages at noon on the same day.
    expect(midnight).toBeGreaterThan(sunPosition(MIDWINTER, 12).altitude * 5);
  });

  it('a full summer moon skims the horizon and is barely worth having', () => {
    const absDay = 22 * DAYS_PER_YEAR + MIDSUMMER;
    expect(moonIllumination(absDay)).toBeGreaterThan(0.9);
    expect(moonPosition(absDay, 0, MIDSUMMER).altitude).toBeLessThan(15);
  });

  it('has plain words for every phase', () => {
    const names = new Set<string>();
    for (let d = 0; d < 30; d++) names.add(moonName(d));
    expect(names.size).toBeGreaterThan(4);
    for (const n of names) expect(n).not.toMatch(/[!0-9]/);
  });
});

describe('the clock follows the day', () => {
  it('starts at first light and reaches dusk as the daylight is spent', () => {
    const s = initialState(1);
    expect(hourOfDay(s)).toBeCloseTo(sunrise(s.dayOfYear), 5);

    s.hoursLeft = 0;
    expect(hourOfDay(s)).toBeCloseTo(sunset(s.dayOfYear), 5);
  });

  it('runs past sunset when you work past dusk', () => {
    const s = initialState(1);
    s.dayOfYear = MIDWINTER;
    s.hoursLeft = daylightHours(MIDWINTER);
    // Six hours of light, three actions of three hours. Stamina is not
    // what is being measured here, so take the body out of it.
    s.person.maxStamina = 10000;
    s.person.stamina = 10000;
    for (let i = 0; i < 3; i++) doAction(s, 'chop_wood');
    expect(s.hoursLeft).toBeLessThan(0);
    expect(hourOfDay(s)).toBeGreaterThan(sunset(MIDWINTER));
  });
});
