import { GameState, nextRand } from './state.js';
import { seasonOfDay, DAYS_PER_YEAR, MIDSUMMER_DAY, Season } from './calendar.js';

export type FrontType =
  | 'clear'
  | 'rain'
  | 'storm'
  | 'cold'
  | 'heat'
  | 'fog'
  | 'thaw'
  | 'mud'
  | 'snow';

export interface Weather {
  tempC: number;
  cloud: number;      // 0..1
  precip: number;     // 0..1
  wind: number;       // km/h
  soilMoisture: number; // 0..1, rolling
  daysSinceRain: number;
  daysSinceStorm: number;
  frontType: FrontType;
  frontDaysLeft: number;
  todaysLine: string;
}

export function initialWeather(): Weather {
  return {
    tempC: 6,
    cloud: 0.5,
    precip: 0.1,
    wind: 5,
    soilMoisture: 0.55,
    daysSinceRain: 0,
    daysSinceStorm: 99,
    frontType: 'clear',
    frontDaysLeft: 2,
    todaysLine: 'A grey morning.',
  };
}

function seasonalTempMean(day: number): number {
  const phase = (2 * Math.PI * (day - MIDSUMMER_DAY)) / DAYS_PER_YEAR;
  return 10 + 12 * Math.cos(phase);
}

interface FrontProfile {
  cloud: number;
  precip: number;
  wind: number;
  tempBias: number;
  minDays: number;
  maxDays: number;
}

const FRONT_PROFILES: Record<FrontType, FrontProfile> = {
  clear: { cloud: 0.15, precip: 0.0, wind: 5, tempBias: +2, minDays: 2, maxDays: 5 },
  rain:  { cloud: 0.9,  precip: 0.55, wind: 10, tempBias: -1, minDays: 2, maxDays: 5 },
  storm: { cloud: 1.0,  precip: 0.9,  wind: 55, tempBias: -2, minDays: 1, maxDays: 2 },
  cold:  { cloud: 0.4,  precip: 0.1,  wind: 15, tempBias: -7, minDays: 2, maxDays: 5 },
  heat:  { cloud: 0.1,  precip: 0.0,  wind: 3,  tempBias: +7, minDays: 3, maxDays: 6 },
  fog:   { cloud: 1.0,  precip: 0.05, wind: 2,  tempBias: 0,  minDays: 1, maxDays: 3 },
  thaw:  { cloud: 0.7,  precip: 0.3,  wind: 8,  tempBias: +6, minDays: 2, maxDays: 4 },
  mud:   { cloud: 0.7,  precip: 0.3,  wind: 8,  tempBias: 0,  minDays: 3, maxDays: 6 },
  snow:  { cloud: 0.9,  precip: 0.5,  wind: 10, tempBias: -4, minDays: 2, maxDays: 5 },
};

const SEASON_WEIGHTS: Record<Season, Record<FrontType, number>> = {
  spring: { clear: 2, rain: 3, storm: 0.5, cold: 1,   heat: 0, fog: 1,   thaw: 2, mud: 3, snow: 0 },
  summer: { clear: 3, rain: 2, storm: 1,   cold: 0,   heat: 3, fog: 0.5, thaw: 0, mud: 0, snow: 0 },
  autumn: { clear: 2, rain: 3, storm: 1,   cold: 2,   heat: 0, fog: 2,   thaw: 0, mud: 1, snow: 0 },
  winter: { clear: 2, rain: 0, storm: 1,   cold: 3,   heat: 0, fog: 1,   thaw: 1, mud: 0, snow: 3 },
};

function pickFront(state: GameState, season: Season): FrontType {
  const weights = SEASON_WEIGHTS[season];
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = nextRand(state) * total;
  for (const [type, weight] of Object.entries(weights) as [FrontType, number][]) {
    if (weight === 0) continue;
    r -= weight;
    if (r <= 0) return type;
  }
  return 'clear';
}

/** Advance weather for the incoming day. Call after dayOfYear increments. */
export function advanceWeather(state: GameState): void {
  const w = state.weather;
  const day = state.dayOfYear;
  const season = seasonOfDay(day);

  w.frontDaysLeft -= 1;
  if (w.frontDaysLeft <= 0) {
    w.frontType = pickFront(state, season);
    const p = FRONT_PROFILES[w.frontType];
    w.frontDaysLeft = p.minDays + Math.floor(nextRand(state) * (p.maxDays - p.minDays + 1));
  }

  const p = FRONT_PROFILES[w.frontType];
  const meanTemp = seasonalTempMean(day) + p.tempBias;
  const noise = (): number => (nextRand(state) - 0.5) * 2;

  const targetTemp = meanTemp + noise() * 2;
  const targetCloud = clamp01(p.cloud + noise() * 0.15);
  const targetPrecip = clamp01(p.precip + noise() * 0.15);
  const targetWind = Math.max(0, p.wind + noise() * 5);

  // Persistence: yesterday drifts toward target.
  w.tempC = 0.55 * w.tempC + 0.45 * targetTemp;
  w.cloud = 0.55 * w.cloud + 0.45 * targetCloud;
  w.precip = 0.4 * w.precip + 0.6 * targetPrecip;
  w.wind = 0.5 * w.wind + 0.5 * targetWind;

  if (w.precip > 0.1) w.daysSinceRain = 0;
  else w.daysSinceRain += 1;

  if (w.frontType === 'storm') w.daysSinceStorm = 0;
  else w.daysSinceStorm += 1;

  const rainSoak = w.precip * (w.tempC > 0 ? 1.0 : 0.3);
  const evapo = Math.max(0, (w.tempC - 5) * 0.012) + 0.03;
  w.soilMoisture = clamp01(w.soilMoisture * 0.9 + rainSoak * 0.4 - evapo);

  w.todaysLine = describeWeather(w, season);
}

function describeWeather(w: Weather, season: Season): string {
  const isFrost = w.tempC < -2;
  const isColdSnap = w.tempC < 0 && season !== 'winter';
  const isSnow = season === 'winter' && w.precip > 0.2 && w.tempC < 1;
  const isRain = w.precip > 0.4 && w.tempC > 0;
  const isDrizzle = w.precip > 0.08 && w.precip <= 0.4 && w.tempC > 0;
  const isStorm = w.frontType === 'storm';
  const isFog = w.frontType === 'fog';
  const isThaw = w.frontType === 'thaw' && season === 'winter';
  const isMud = w.soilMoisture > 0.75 && w.tempC > 0;
  const isHeat = w.tempC > 22 && w.wind < 5;
  const isBright = w.cloud < 0.25 && w.precip < 0.05;

  if (isStorm) return 'Wind up hard. Rain coming across sideways.';
  if (isFog) return 'A grey fog sits low. The wood is a suggestion.';
  if (isSnow) return 'Snow overnight. Everything blue-white and quiet.';
  if (isThaw) return 'Thaw. Water off the eaves all morning.';
  if (isRain) return 'Steady rain. The yard soaks.';
  if (isDrizzle) return 'A soft drizzle comes and goes.';
  if (isFrost) return 'Hard frost. The ground rings.';
  if (isColdSnap) return 'A cold snap. Bit through the wool.';
  if (isMud) return 'Mud everywhere. Boots twice their weight.';
  if (isHeat) return 'Still heat. Air over the field shimmers.';
  if (isBright && season === 'winter') return 'Bright and cold. Snow blinding under a low sun.';
  if (isBright) return 'Clear morning. Good working weather.';
  if (season === 'winter') return 'Grey overhead. Cold, dry, dull.';
  return 'Grey and mild. Nothing much doing overhead.';
}

// —— Effect predicates used by actions and step ——

export function isStormy(w: Weather): boolean {
  return w.frontType === 'storm' && w.wind > 30;
}
export function isTooWetToTill(w: Weather): boolean {
  return w.soilMoisture > 0.78;
}
export function isTooWetToSow(w: Weather): boolean {
  return w.soilMoisture > 0.88;
}
export function isSnowing(w: Weather, season: Season): boolean {
  return season === 'winter' && w.precip > 0.25 && w.tempC < 1;
}
export function isEarlyFrostKill(w: Weather, season: Season): boolean {
  return (season === 'autumn' || season === 'winter') && w.tempC < -3;
}
export function isDroughty(w: Weather): boolean {
  return w.daysSinceRain >= 7 && w.soilMoisture < 0.25;
}
export function isHeatwave(w: Weather): boolean {
  return w.tempC > 25;
}
export function isFoggy(w: Weather): boolean {
  return w.frontType === 'fog';
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
