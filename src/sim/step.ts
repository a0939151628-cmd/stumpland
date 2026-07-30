import { GameState, nextRand, absoluteDay } from './state.js';
import { ACTIONS } from './actions.js';
import { daylightHours, seasonOfDay, DAYS_PER_YEAR, Season } from './calendar.js';
import { CROPS } from './crops.js';
import { forEachTile } from './grid.js';
import { STOCK, herd, spoilageRate, ageInYears, oxenHelp } from './animals.js';
import { isStormy } from './weather.js';
import { callLine } from './neighbours.js';
import { writeEntry, newTally } from './journal.js';
import {
  advanceWeather,
  isSnowing,
  isHeatwave,
  isDroughty,
  isEarlyFrostKill,
} from './weather.js';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const UNDERFED_PENALTY = 40;
const COLD_PENALTY = 30;
const FLOOR_STAMINA = 20;
const NIGHT_STAMINA_MULT = 1.5;
const NIGHT_FUMBLE_CHANCE = 0.3;

export function doAction(state: GameState, id: string): ActionResult {
  const a = ACTIONS[id];
  if (!a) return { ok: false, message: `unknown action: ${id}` };

  if (id === 'sleep') {
    endDay(state);
    return { ok: true };
  }

  const avail = a.available(state);
  if (!avail.ok) return { ok: false, message: avail.reason };

  const season = seasonOfDay(state.dayOfYear);
  const heavyOutdoor =
    id === 'clear_stump' || id === 'break_soil' || id === 'chop_wood' || id === 'harvest';
  let hoursCost = a.hours;
  let baseStamina = a.stamina;
  if (isSnowing(state.weather, season) && (id === 'chop_wood' || id === 'forage')) {
    hoursCost += 1;
  }
  if (isHeatwave(state.weather) && heavyOutdoor) {
    baseStamina = Math.round(baseStamina * 1.25);
  }
  // The ox. The single largest change in the game: he halves the labour
  // of breaking ground, and the ground is most of the work.
  if (id === 'break_soil') {
    const help = oxenHelp(state.animals);
    baseStamina = Math.round(baseStamina * help);
    hoursCost = Math.max(1, Math.round(hoursCost * help * 10) / 10);
  }

  // Past dusk the work gets steadily dearer, not just dearer once.
  const workedPastDusk = state.hoursLeft < hoursCost;
  const hoursAfterDark = Math.max(0, hoursCost - Math.max(0, state.hoursLeft));
  const nightMult = 1 + (NIGHT_STAMINA_MULT - 1) * (hoursAfterDark / Math.max(1, hoursCost))
    + Math.max(0, -state.hoursLeft) * 0.12;
  const staminaCost = Math.round(baseStamina * (workedPastDusk ? nightMult : 1));

  if (staminaCost > 0 && state.person.stamina < staminaCost) {
    return { ok: false, message: 'too tired' };
  }

  state.person.stamina = clamp(
    state.person.stamina - staminaCost,
    0,
    state.person.maxStamina
  );
  state.hoursLeft -= hoursCost;
  a.apply(state);

  if (workedPastDusk && hoursCost > 0) {
    state.log.push(
      nextRand(state) < NIGHT_FUMBLE_CHANCE
        ? 'Worked past dusk. Fumbled some of it in the dark.'
        : 'Worked past dusk.'
    );
  }

  return { ok: true };
}

export function endDay(state: GameState): void {
  eatSupper(state);

  const season = seasonOfDay(state.dayOfYear);
  if (season === 'winter') {
    if (state.store.firewood > 0) {
      state.store.firewood -= 1;
      state.person.wasColdLastNight = false;
    } else {
      state.person.wasColdLastNight = true;
      state.log.push('No fire tonight. The cottage is cold.');
    }
  } else {
    state.person.wasColdLastNight = false;
  }

  recordWeather(state);
  neighbourCalls(state);
  advanceCrops(state);
  spoilFreshMeat(state, season);
  spoilGrain(state);
  tendStock(state, season);
  for (const snare of state.hunt.snares) snare.daysActive += 1;

  const seasonBefore = seasonOfDay(state.dayOfYear);

  state.dayOfYear += 1;
  if (state.dayOfYear >= DAYS_PER_YEAR) {
    state.dayOfYear = 0;
    state.year += 1;
    ageCompanions(state);
    // Frost breaks up whatever was turned last year. Broken ground
    // does not stay broken through a northern winter.
    forEachTile(state.plot, (t) => {
      if (t.crop === null) t.tilled = false;
    });
  }

  // New season, new ground to walk over, and the journal entry falls due.
  if (seasonOfDay(state.dayOfYear) !== seasonBefore) {
    state.foragedThisSeason = 0;
    closeSeason(state, seasonBefore);
  }

  advanceWeather(state);
  applyWeatherToCrops(state);
  settleSnowAndWater(state);

  let cap = state.person.maxStamina;
  if (!state.person.ateToday) cap -= UNDERFED_PENALTY;
  if (state.person.wasColdLastNight) cap -= COLD_PENALTY;
  state.person.stamina = Math.max(FLOOR_STAMINA, cap);
  state.hoursLeft = daylightHours(state.dayOfYear);
  state.restsToday = 0;
}

/** Note what the day's weather was, for the season's entry. */
function recordWeather(state: GameState): void {
  const t = state.tally;
  const w = state.weather;
  if (w.precip > 0.3 && w.tempC >= 1) t.daysOfRain += 1;
  if (w.precip > 0.2 && w.tempC < 1) t.daysOfSnow += 1;
  if (isStormy(w)) t.daysStorm += 1;
  t.hardestFrost = Math.min(t.hardestFrost, w.tempC);
  t.warmest = Math.max(t.warmest, w.tempC);
  if (!state.person.ateToday) t.hungryNights += 1;
  if (state.person.wasColdLastNight) t.coldNights += 1;
}

/** Write the season up and start a fresh page. */
function closeSeason(state: GameState, closing: Season): void {
  state.tally.season = closing;
  state.journal.push(writeEntry(state.tally));
  state.tally = newTally(state.year, seasonOfDay(state.dayOfYear));
}

function eatSupper(state: GameState): void {
  // Fresh first, because it will not keep. Then smoked. Then grain.
  if (state.store.meat > 0) {
    state.store.meat -= 1;
    state.person.ateToday = true;
    state.log.push('Meat and greens for supper.');
    return;
  }
  if (state.store.smokedMeat > 0) {
    state.store.smokedMeat -= 1;
    state.person.ateToday = true;
    state.log.push('Smoked meat, softened in broth.');
    return;
  }
  if (state.store.grain > 0) {
    // Eggs and milk make the store fractional, so take what is there
    // rather than a whole bushel. A part portion is not a full supper.
    const portion = Math.min(1, state.store.grain);
    state.store.grain -= portion;
    state.person.ateToday = portion >= 0.7;
    if (!state.person.ateToday) state.log.push('Scraped the bottom of the crock.');
    return;
  }
  state.person.ateToday = false;
  state.log.push('No supper.');
}

/**
 * The store loses a little every day to rats and damp. A cat cuts that
 * to almost nothing, which is the whole of the cat's mechanical job.
 */
/**
 * Somebody comes by now and then. Rarely, quietly, and never with a
 * marker over their head. Debts run both ways and neither is enforced.
 */
function neighbourCalls(state: GameState): void {
  if (nextRand(state) > 0.05) return;
  const list = state.neighbours;
  const n = list[Math.floor(nextRand(state) * list.length)];
  if (!n) return;

  const today = absoluteDay(state);
  if (today - n.lastSeen < 6) return;
  n.lastSeen = today;

  const season = seasonOfDay(state.dayOfYear);
  const roll = nextRand(state);

  // If they owe you a day, they turn up when there is most to do.
  if (n.owed > 0 && (season === 'autumn' || season === 'spring')) {
    n.owed -= 1;
    state.person.stamina = Math.min(state.person.maxStamina, state.person.stamina + 30);
    state.log.push(callLine('repay', n, 'Went home before dark.'));
    state.tally.visitors.push(n.name);
    return;
  }

  state.tally.visitors.push(n.name);
  if (roll < 0.2 && season === 'autumn') {
    // They ask; taking it up is the player's business, in the action list.
    n.owing += 1;
    state.log.push(callLine('ask_help', n));
  } else if (roll < 0.4) {
    state.log.push(callLine('borrow', n));
  } else if (roll < 0.6) {
    const gift = nextRand(state) < 0.5 ? 'a crock of honey' : 'two fleeces';
    if (gift.includes('fleece')) state.store.wool += 2;
    else state.store.grain += 3;
    state.log.push(callLine('gift', n, gift));
  } else {
    state.log.push(callLine('passing', n));
  }
}

function spoilGrain(state: GameState): void {
  const lost = state.store.grain * spoilageRate(state.animals);
  if (lost < 0.01) return;
  state.store.grain = Math.max(0, state.store.grain - lost);
}

/**
 * Feed the stock, let them give what they are going to give, and let
 * their condition drift with how they have been kept.
 *
 * Nothing dies. An animal that is not fed goes thin and stops producing,
 * and recovers when the feeding starts again.
 */
function tendStock(state: GameState, season: Season): void {
  const a = state.animals;
  if (a.herds.length === 0) return;

  const sheltered = state.works.byre;
  const harsh = state.weather.tempC < -5 || isStormy(state.weather);

  for (const h of a.herds) {
    const spec = STOCK[h.kind];
    const want = spec.feed * h.count;

    // They eat from the store first; in the growing seasons they also
    // find their own, so summer keeps them on less grain.
    const forageShare = season === 'winter' ? 0 : 0.5;
    const needed = want * (1 - forageShare);
    const got = Math.min(state.store.grain, needed);
    state.store.grain -= got;
    const ration = needed > 0 ? got / needed : 1;

    let drift = (ration - 0.6) * 0.09;
    if (spec.wantsShelter && harsh && !sheltered) drift -= 0.05;
    h.condition = clamp(h.condition + drift, 0.08, 1);
    h.fedToday = ration > 0.9;
  }

  produce(state, season);
}

/** What the stock gives, if it is in any condition to give it. */
function produce(state: GameState, season: Season): void {
  const a = state.animals;

  const hens = herd(a, 'hens');
  if (hens && hens.count > 0 && hens.condition > 0.35) {
    // Eggs are eaten the day they are laid; they read as grain in the pot.
    const eggs = hens.count * 0.35 * hens.condition * (season === 'winter' ? 0.4 : 1);
    state.store.grain += eggs;
  }

  const goat = herd(a, 'goat');
  if (goat && goat.count > 0 && goat.condition > 0.4) {
    state.store.grain += 0.9 * goat.condition;
  }

  const rabbits = herd(a, 'rabbits');
  if (rabbits && rabbits.count > 0 && rabbits.condition > 0.5) {
    // They breed on their own. Whether they are meat or company is not
    // the game's business.
    if (nextRand(state) < 0.045 * rabbits.condition && rabbits.count < 12) {
      rabbits.count += 1;
      state.log.push('A new litter in the hutch.');
      state.tally.notes.push('Another litter in the hutch. They need no help from me.');
    }
  }

  const sheep = herd(a, 'sheep');
  if (sheep && sheep.count > 0) {
    sheep.wool = Math.min(1, sheep.wool + 0.012 * sheep.condition);
  }
}

function spoilFreshMeat(state: GameState, season: Season): void {
  if (season === 'winter') return; // the cold keeps it
  if (state.store.meat > 3) {
    state.store.meat -= 1;
    state.log.push('Some meat went off. Buried it.');
  }
}

function advanceCrops(state: GameState): void {
  const today = absoluteDay(state);
  const nextSeason = seasonOfDay(state.dayOfYear + 1);
  let frostTook = 0;

  forEachTile(state.plot, (t) => {
    const crop = t.crop;
    if (!crop || crop.stage === 'ruined') return;

    const spec = CROPS[crop.kind];
    const age = today - crop.sownOn;
    if (age >= spec.matureDays) crop.stage = 'ready';
    else if (age >= spec.growStartDays && crop.stage === 'sown') crop.stage = 'growing';

    // Winter takes whatever is still standing.
    if (nextSeason === 'winter') {
      crop.stage = 'ruined';
      frostTook++;
    }
  });

  if (frostTook > 0) {
    state.log.push('Frost took what still stood in the field.');
  }
}

function applyWeatherToCrops(state: GameState): void {
  const season = seasonOfDay(state.dayOfYear);
  const droughty = isDroughty(state.weather);
  const frostKill = isEarlyFrostKill(state.weather, season);
  let killed = 0;

  forEachTile(state.plot, (t) => {
    const crop = t.crop;
    if (!crop) return;
    if (crop.stage !== 'growing' && crop.stage !== 'ready') return;

    if (droughty) crop.droughtStress = Math.min(0.6, crop.droughtStress + 0.05);
    if (frostKill) {
      crop.stage = 'ruined';
      killed++;
    }
  });

  if (killed > 0) {
    state.log.push('An early hard frost. The crop is finished.');
  }
}

/**
 * Snow lies and water stands, then both go away slowly.
 *
 * Melting is uneven on purpose. Open ground and the trodden yard clear
 * first; the north side and the shade of the wood hold their snow for
 * days after the field is bare. That patchiness is most of what makes a
 * thaw look like a thaw.
 */
function settleSnowAndWater(state: GameState): void {
  const w = state.weather;
  const freezing = w.tempC < 0.5;
  const falling = w.precip > 0.15;

  // Above freezing, melt runs off into standing water.
  const melt = freezing ? 0 : Math.min(0.5, (w.tempC - 0.5) * 0.035 + 0.015);

  forEachTile(state.plot, (t) => {
    if (t.terrain === 'water') {
      t.snow = 0;
      t.puddle = 0;
      return;
    }

    // Shade holds snow; open, walked ground loses it first. The fixed
    // per-tile bias is what makes a thaw patchy rather than uniform —
    // the same hollows keep their drift every single year.
    const sheltered = t.terrain === 'forest' ? 0.62 : 0;
    const trodden = t.treads > 40 ? 0.4 : 0;
    const hollow = 0.55 + snowBias(t.x, t.y) * 0.9;
    const meltHere = melt * (1 - sheltered) * (1 + trodden) * hollow;

    if (falling && freezing) {
      // The wood catches some of it in the canopy.
      const catchRate = t.terrain === 'forest' ? 0.55 : 1;
      t.snow = Math.min(1, t.snow + w.precip * 0.5 * catchRate);
    }

    if (meltHere > 0 && t.snow > 0) {
      const gone = Math.min(t.snow, meltHere);
      t.snow -= gone;
      t.puddle = Math.min(1, t.puddle + gone * 0.5);
    }

    if (falling && !freezing) {
      // Broken ground drinks it; packed yard and path shed it into puddles.
      const drains = t.tilled || t.crop ? 0.35 : t.terrain === 'yard' ? 1 : 0.7;
      t.puddle = Math.min(1, t.puddle + w.precip * 0.55 * drains);
    }

    // Standing water takes days to go, longer in the cold and the still.
    const drying = 0.05 + Math.max(0, w.tempC) * 0.008 + w.wind * 0.003;
    t.puddle = Math.max(0, t.puddle - drying);
    if (t.snow > 0) t.puddle = 0; // frozen over again
  });
}

/**
 * A fixed, position-derived bias so the same ground always holds its
 * snow longest. Deterministic, so it survives a save without storing it.
 */
function snowBias(x: number, y: number): number {
  let h = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Old age, in the journal rather than a popup, and only if the player
 * has left the setting on.
 */
function ageCompanions(state: GameState): void {
  if (!state.animalsAge) return;
  const today = absoluteDay(state);
  for (const c of [state.animals.dog, state.animals.cat]) {
    if (!c || !c.present) continue;
    const years = ageInYears(c, today);
    const span = c === state.animals.dog ? 13 : 16;
    if (years > span && nextRand(state) < 0.3) {
      c.present = false;
      const line = c === state.animals.dog
        ? `${c.name} did not come in from the field edge. I buried him by the wall.`
        : `${c.name} has not been about for some days now. I have stopped looking.`;
      state.log.push(line);
      state.tally.notes.push(line);
    }
  }
  // The dog's help goes with the dog.
  state.hunt.hasDog = !!state.animals.dog && state.animals.dog.present;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
