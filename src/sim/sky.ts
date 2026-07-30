/**
 * Where the sun and moon actually are.
 *
 * Pure geometry — no THREE, no colours, no opinions about rendering.
 * The renderer asks for an altitude and an azimuth and decides what to
 * do with them. Tested in plain Node like everything else in here.
 *
 * The farm sits at about 60 degrees north: Trondheim, Uppsala, the top
 * of the Baltic. That latitude is what gives an eighteen-hour midsummer
 * day and a sun that barely clears the trees at midwinter.
 */

import { DAYS_PER_YEAR, MIDSUMMER_DAY, daylightHours } from './calendar.js';

export const LATITUDE_DEG = 60;

/** Earth's tilt. The reason there are seasons at all. */
const AXIAL_TILT_DEG = 23.44;

/** A synodic month, to two places. The moon does not care about our calendar. */
export const LUNAR_PERIOD_DAYS = 29.53;

const RAD = Math.PI / 180;

export interface SkyPosition {
  /** Degrees above the horizon. Negative means it has set. */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

/**
 * Where the sun sits on the ecliptic, in degrees. 90 at midsummer, so
 * declination is simply the tilt times its sine.
 */
export function solarLongitude(dayOfYear: number): number {
  return 90 + (360 * (dayOfYear - MIDSUMMER_DAY)) / DAYS_PER_YEAR;
}

/** The sun's declination for a day of the year, in degrees. */
export function declination(dayOfYear: number): number {
  return AXIAL_TILT_DEG * Math.sin(solarLongitude(dayOfYear) * RAD);
}

/**
 * The moon's declination. It runs a whole ecliptic circuit each month,
 * so a full moon sits opposite the sun — which is why a midwinter full
 * moon rides high all night while the midwinter sun barely clears the
 * trees, and why that night is genuinely workable.
 */
export function moonDeclination(dayOfYear: number, phase: number): number {
  const lambda = solarLongitude(dayOfYear) + 360 * phase;
  return AXIAL_TILT_DEG * Math.sin(lambda * RAD);
}

/** Altitude and azimuth from a declination and an hour angle in hours. */
export function positionFor(declinationDeg: number, hourAngleHours: number): SkyPosition {
  const dec = declinationDeg * RAD;
  const lat = LATITUDE_DEG * RAD;
  const hourAngle = hourAngleHours * 15 * RAD;

  const sinAlt =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));

  const cosAz =
    (Math.sin(dec) - Math.sin(altitude) * Math.sin(lat)) /
    (Math.cos(altitude) * Math.cos(lat) || 1e-6);
  let azimuth = Math.acos(clamp(cosAz, -1, 1));
  if (Math.sin(hourAngle) > 0) azimuth = 2 * Math.PI - azimuth;

  return { altitude: altitude / RAD, azimuth: azimuth / RAD };
}

/** When the sun comes up and goes down, in hours, solar noon at 12. */
export function sunrise(dayOfYear: number): number {
  return 12 - daylightHours(dayOfYear) / 2;
}
export function sunset(dayOfYear: number): number {
  return 12 + daylightHours(dayOfYear) / 2;
}

/**
 * Sun altitude and azimuth for a day and an hour.
 * Standard solar position, simplified to a circular orbit.
 */
export function sunPosition(dayOfYear: number, hour: number): SkyPosition {
  return positionFor(declination(dayOfYear), hour - 12);
}

/**
 * Where the moon is.
 *
 * It transits later each night as the month goes on: a new moon crosses
 * the meridian at noon, a full moon at midnight. Combined with its own
 * declination that gives the real behaviour — the full moon of midwinter
 * is up all night and high, and the full moon of midsummer skims the
 * horizon and is barely worth having.
 */
export function moonPosition(absoluteDay: number, hour: number, dayOfYear: number): SkyPosition {
  const phase = lunarPhase(absoluteDay);
  const hourAngle = hour - 12 - 24 * phase;
  return positionFor(moonDeclination(dayOfYear, phase), hourAngle);
}

/**
 * 0 is new, 0.5 is full, back to 1 at new again.
 * Derived from the absolute day, so it persists for free in a save.
 */
export function lunarPhase(absoluteDay: number): number {
  const d = absoluteDay % LUNAR_PERIOD_DAYS;
  return (d < 0 ? d + LUNAR_PERIOD_DAYS : d) / LUNAR_PERIOD_DAYS;
}

/** How much of the disc is lit, 0 at new moon, 1 at full. */
export function moonIllumination(absoluteDay: number): number {
  return (1 - Math.cos(2 * Math.PI * lunarPhase(absoluteDay))) / 2;
}

/** Plain words for the phase, for the journal. */
export function moonName(absoluteDay: number): string {
  const p = lunarPhase(absoluteDay);
  if (p < 0.03 || p > 0.97) return 'no moon';
  if (p < 0.22) return 'a thin moon, waxing';
  if (p < 0.28) return 'a half moon, waxing';
  if (p < 0.47) return 'a fat moon, waxing';
  if (p < 0.53) return 'a full moon';
  if (p < 0.72) return 'a fat moon, waning';
  if (p < 0.78) return 'a half moon, waning';
  return 'a thin moon, waning';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
