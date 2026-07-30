export const DAYS_PER_SEASON = 15;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
export const MIDSUMMER_DAY = DAYS_PER_SEASON + Math.floor(DAYS_PER_SEASON / 2);

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'] as const;

export function seasonOfDay(dayOfYear: number): Season {
  const wrapped = ((dayOfYear % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return SEASONS[Math.floor(wrapped / DAYS_PER_SEASON)] ?? 'spring';
}

export function daylightHours(dayOfYear: number): number {
  const phase = (2 * Math.PI * (dayOfYear - MIDSUMMER_DAY)) / DAYS_PER_YEAR;
  return 12 + 6 * Math.cos(phase);
}

export function dayInSeason(dayOfYear: number): number {
  return (dayOfYear % DAYS_PER_SEASON) + 1;
}
