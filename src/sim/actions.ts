import { GameState, nextRand, absoluteDay } from './state.js';
import { seasonOfDay } from './calendar.js';
import { isStormy, isTooWetToTill, isTooWetToSow } from './weather.js';
import { CROPS, soilCeiling } from './crops.js';
import { countTiles } from './grid.js';
import {
  MAX_SNARES, MAX_WATER_SNARES, MAX_DEADFALLS,
  Snare, rollSnare, rollIceFish,
} from './hunt.js';
import {
  stumpTiles, tillableTiles, sowableTiles, weedableTiles,
  harvestableTiles, ruinedTiles, whereabouts,
  walkToAll, walkTo, forestAccess, waterAccess,
} from './work.js';
import { WORKS, WorkKind, canRaise } from './buildings.js';
import { STOCK, Stock, herd, has, DOG_NAMES, CAT_NAMES } from './animals.js';

export interface Availability {
  ok: boolean;
  reason?: string;
}

export interface Action {
  id: string;
  label: string;
  hours: number;
  stamina: number; // positive costs, negative restores
  available(state: GameState): Availability;
  apply(state: GameState): void;
}

/** What one season's turning adds to a tile, before the ceiling bites. */
const SOIL_GAIN_PER_TILLING = 0.07;

/** A sit-down restores this much, less each time you do it in one day. */
const REST_BASE = 28;
const REST_FALLOFF = 0.4;

/**
 * One action per thing that can be raised. They all work the same way:
 * timber, a long day, and it stands there afterwards for good.
 */
function buildActions(): Record<string, Action> {
  const out: Record<string, Action> = {};
  for (const kind of Object.keys(WORKS) as WorkKind[]) {
    const spec = WORKS[kind];
    out[`build_${kind}`] = {
      id: `build_${kind}`,
      label: spec.label,
      hours: spec.hours,
      stamina: spec.stamina,
      available(s) {
        const allowed = canRaise(s.works, kind);
        if (!allowed.ok) return allowed;
        if (s.store.timber < spec.timber) {
          return { ok: false, reason: `needs ${spec.timber} timber` };
        }
        if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
        return { ok: true };
      },
      apply(s) {
        s.store.timber -= spec.timber;
        s.works[kind] = true;
        s.tally.raisedWorks.push(spec.kind === 'barn' ? 'the barn' : `the ${spec.kind}`);
        s.log.push(spec.blurb);
      },
    };
  }
  return out;
}

/**
 * Taking on stock. Bought from a neighbour with grain, which is the only
 * currency here — nobody in this valley is carrying coin.
 */
function stockActions(): Record<string, Action> {
  const out: Record<string, Action> = {};
  for (const kind of Object.keys(STOCK) as Stock[]) {
    const spec = STOCK[kind];
    out[`get_${kind}`] = {
      id: `get_${kind}`,
      label: `take on ${spec.label}`,
      hours: 5,
      stamina: 20,
      available(s) {
        if (has(s.animals, kind)) return { ok: false, reason: 'already have some' };
        if (s.store.grain < spec.price) return { ok: false, reason: `needs ${spec.price} grain` };
        if (spec.wantsShelter && !s.works.byre) return { ok: false, reason: 'nowhere to shelter it' };
        if (kind === 'rabbits' && !s.works.hutch) return { ok: false, reason: 'no hutch' };
        if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
        return { ok: true };
      },
      apply(s) {
        s.store.grain -= spec.price;
        const count = kind === 'hens' ? 4 : kind === 'rabbits' ? 3 : kind === 'sheep' ? 3 : 1;
        s.animals.herds.push({
          kind,
          count,
          condition: 0.7,
          fedToday: true,
          acquiredOn: absoluteDay(s),
          wool: 0,
        });
        s.tally.tookOnStock.push(spec.label);
        s.log.push(spec.blurb);
      },
    };
  }
  return out;
}

/** Stumps still standing in a tile block sowing on that tile, not the whole plot. */
export const ACTIONS: Record<string, Action> = {
  clear_stump: {
    id: 'clear_stump',
    label: 'clear stumps',
    hours: 5,
    stamina: 40,
    available(s) {
      if (stumpTiles(s.plot).length === 0) return { ok: false, reason: 'no stumps left' };
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'ground frozen' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      const tiles = stumpTiles(s.plot);
      const where = whereabouts(tiles);
      walkToAll(s.plot, tiles);
      for (const t of tiles) t.stump = false;
      s.tally.stumpsPulled += tiles.length;
      const left = countTiles(s.plot, (t) => t.stump);
      s.log.push(
        left === 0
          ? 'The last stump is out. Roots and all.'
          : `Pulled ${tiles.length === 1 ? 'a stump' : `${tiles.length} stumps`} from ${where}. ${left} to go.`
      );
    },
  },

  break_soil: {
    id: 'break_soil',
    label: 'break soil',
    hours: 4,
    stamina: 40,
    /** An ox halves this. Applied in step.ts where costs are worked out. */
    available(s) {
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'ground frozen' };
      if (tillableTiles(s.plot).length === 0) return { ok: false, reason: 'nothing left to break' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (isTooWetToTill(s.weather)) return { ok: false, reason: 'ground too wet' };
      return { ok: true };
    },
    apply(s) {
      const tiles = tillableTiles(s.plot);
      const where = whereabouts(tiles);
      walkToAll(s.plot, tiles);
      let anyGained = false;
      for (const t of tiles) {
        t.tilled = true;
        // A ploughed tile is not a path any more, whatever was worn into it.
        t.treads = 0;
        const ceiling = soilCeiling(t.yearsWorked);
        const before = t.soil;
        t.soil = Math.min(ceiling, t.soil + SOIL_GAIN_PER_TILLING);
        if (t.soil > before + 1e-9) anyGained = true;
      }
      s.log.push(
        anyGained
          ? `Turned the soil at ${where}. Dark underneath.`
          : `Turned the soil at ${where}. It will not take more this year.`
      );
    },
  },

  sow_barley: {
    id: 'sow_barley',
    label: 'sow barley',
    hours: 2,
    stamina: 15,
    available(s) {
      if (seasonOfDay(s.dayOfYear) !== 'spring') return { ok: false, reason: 'not sowing season' };
      const tiles = sowableTiles(s.plot);
      if (tiles.length === 0) return { ok: false, reason: 'no broken ground to sow' };
      const cost = CROPS.barley.seedPerTile * tiles.length;
      if (s.store.grain < cost) return { ok: false, reason: 'no seed grain' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (isTooWetToSow(s.weather)) return { ok: false, reason: 'seed would rot in wet ground' };
      return { ok: true };
    },
    apply(s) {
      const spec = CROPS.barley;
      const tiles = sowableTiles(s.plot);
      const where = whereabouts(tiles);
      walkToAll(s.plot, tiles);
      s.store.grain -= spec.seedPerTile * tiles.length;
      for (const t of tiles) {
        t.crop = {
          kind: 'barley',
          sownOn: absoluteDay(s),
          stage: 'sown',
          weeded: 0,
          droughtStress: 0,
        };
      }
      s.tally.tilesSown += tiles.length;
      s.log.push(`Sowed ${where}. Barley seed thrown broadcast.`);
    },
  },

  weed: {
    id: 'weed',
    label: 'weed the rows',
    hours: 3,
    stamina: 25,
    available(s) {
      if (weedableTiles(s.plot).length === 0) return { ok: false, reason: 'nothing to weed' };
      return { ok: true };
    },
    apply(s) {
      const tiles = weedableTiles(s.plot);
      walkToAll(s.plot, tiles);
      for (const t of tiles) if (t.crop) t.crop.weeded += 1;
      // Wet ground gives the weeds up easily.
      const easy = s.weather.soilMoisture > 0.6;
      s.log.push(
        easy
          ? 'Went down the rows. Wet ground, the weeds came up whole.'
          : 'Went down the rows. Pulled what did not belong.'
      );
    },
  },

  harvest: {
    id: 'harvest',
    label: 'harvest barley',
    hours: 3,
    stamina: 30,
    available(s) {
      if (harvestableTiles(s.plot).length === 0) return { ok: false, reason: 'nothing ready' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      const tiles = harvestableTiles(s.plot);
      walkToAll(s.plot, tiles);
      let total = 0;
      let stress = 0;
      for (const t of tiles) {
        const crop = t.crop;
        if (!crop) continue;
        const spec = CROPS[crop.kind];
        const weedBonus = 1 + crop.weeded * 0.1;
        const droughtFactor = 1 - crop.droughtStress;
        const jitter = 0.85 + nextRand(s) * 0.3;
        total += spec.yieldPerTile * t.soil * weedBonus * droughtFactor * jitter;
        stress += crop.droughtStress;
        t.crop = null;
        t.tilled = false;
        t.yearsWorked += 1;
      }
      const y = Math.max(0, Math.round(total));
      s.store.grain += y;
      s.tally.grainHarvested += y;
      const note = stress / Math.max(1, tiles.length) > 0.2 ? ' A hard year for the crop.' : '';
      s.log.push(`Cut and threshed. ${y} bushels in.${note}`);
    },
  },

  clear_ruined: {
    id: 'clear_ruined',
    label: 'clear dead crop',
    hours: 2,
    stamina: 20,
    available(s) {
      if (ruinedTiles(s.plot).length === 0) return { ok: false, reason: 'nothing to clear' };
      return { ok: true };
    },
    apply(s) {
      const tiles = ruinedTiles(s.plot);
      walkToAll(s.plot, tiles);
      for (const t of tiles) {
        t.crop = null;
        t.tilled = false;
      }
      s.log.push('Pulled the dead stalks and turned them under.');
    },
  },

  chop_wood: {
    id: 'chop_wood',
    label: 'chop firewood',
    hours: 3,
    stamina: 35,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, forestAccess(s.plot));
      const r = nextRand(s);
      const wood = r < 0.2 ? 1 : r < 0.85 ? 2 : 3;
      s.store.firewood += wood;
      s.log.push(`Split ${wood} loads of wood. Stacked by the wall.`);
    },
  },

  forage: {
    id: 'forage',
    label: 'forage the wood',
    hours: 4,
    stamina: 20,
    available(s) {
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'nothing left to forage' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      // The same wood, walked over again and again, gives less each time.
      walkTo(s.plot, forestAccess(s.plot));
      const season = seasonOfDay(s.dayOfYear);
      const seasonBase = season === 'autumn' ? 1.5 : season === 'spring' ? 1.0 : 0.85;
      const depletion = Math.max(0.22, 1 - s.foragedThisSeason * 0.05);
      s.foragedThisSeason += 1;

      // A forager can feed themselves. They cannot fill a winter store.
      const take = seasonBase * depletion * (0.6 + nextRand(s) * 0.8);
      let grain = Math.floor(take);
      if (nextRand(s) < take - grain) grain += 1;

      if (grain >= 2) {
        s.store.grain += grain;
        s.log.push(
          season === 'autumn'
            ? 'Hazelnuts and sloes. A good handful.'
            : 'Greens and roots. More than enough for the pot.'
        );
      } else if (grain === 1) {
        s.store.grain += 1;
        s.log.push('Thin pickings. Enough for the pot, just.');
      } else if (nextRand(s) < 0.25) {
        s.store.firewood += 1;
        s.log.push('A bundle of dead branches. Nothing to eat.');
      } else {
        s.log.push('The wood has been picked over. Nothing today.');
      }
    },
  },

  rest: {
    id: 'rest',
    label: 'rest a while',
    hours: 2,
    // Restoration is handled in apply — it falls off through the day.
    stamina: 0,
    available() {
      return { ok: true };
    },
    apply(s) {
      const back = Math.round(REST_BASE * Math.pow(REST_FALLOFF, s.restsToday));
      s.restsToday += 1;
      s.person.stamina = Math.min(s.person.maxStamina, s.person.stamina + back);
      s.log.push(
        back >= 15
          ? 'Sat by the fire.'
          : back >= 6
            ? 'Sat a while. Legs still heavy.'
            : 'Sat down again. It did not help much.'
      );
    },
  },

  set_snare_forest: {
    id: 'set_snare_forest',
    label: 'set forest snare',
    hours: 3,
    stamina: 15,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (seasonOfDay(s.dayOfYear) === 'winter') {
        return { ok: false, reason: 'ground too hard to set snares' };
      }
      if (s.hunt.snares.length >= MAX_SNARES) return { ok: false, reason: 'no snare wire left' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, forestAccess(s.plot));
      s.hunt.snares.push({ placement: 'forest', type: 'snare', setOnDay: absoluteDay(s), daysActive: 0 });
      s.log.push('Set a snare along the deer path in the pines.');
    },
  },

  set_snare_water: {
    id: 'set_snare_water',
    label: 'set water-edge snare',
    hours: 3,
    stamina: 15,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (seasonOfDay(s.dayOfYear) === 'winter') {
        return { ok: false, reason: 'ground too hard to set snares' };
      }
      if (s.hunt.snares.length >= MAX_SNARES) return { ok: false, reason: 'no snare wire left' };
      const water = s.hunt.snares.filter((x) => x.placement === 'water-edge').length;
      if (water >= MAX_WATER_SNARES) return { ok: false, reason: 'already a water snare' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, waterAccess(s.plot));
      s.hunt.snares.push({ placement: 'water-edge', type: 'snare', setOnDay: absoluteDay(s), daysActive: 0 });
      s.log.push('Set a snare in the reeds by the water.');
    },
  },

  set_deadfall: {
    id: 'set_deadfall',
    label: 'set deadfall trap',
    hours: 6,
    stamina: 30,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'ground too hard' };
      if (s.hunt.snares.length >= MAX_SNARES) return { ok: false, reason: 'no trap space left' };
      const deadfalls = s.hunt.snares.filter((x) => x.type === 'deadfall').length;
      if (deadfalls >= MAX_DEADFALLS) return { ok: false, reason: 'already a deadfall out' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, forestAccess(s.plot));
      s.hunt.snares.push({ placement: 'forest', type: 'deadfall', setOnDay: absoluteDay(s), daysActive: 0 });
      s.log.push('Built a deadfall in the pines. Careful work with the trigger.');
    },
  },

  check_snares: {
    id: 'check_snares',
    label: 'check snares',
    hours: 4,
    stamina: 20,
    available(s) {
      if (s.hunt.snares.length === 0) return { ok: false, reason: 'no snares set' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, forestAccess(s.plot));
      const season = seasonOfDay(s.dayOfYear);
      const remaining: Snare[] = [];
      for (const snare of s.hunt.snares) {
        const res = rollSnare(snare, s, s.weather, season);
        s.log.push(`  ${res.line}`);
        if (res.species === 'nothing') {
          remaining.push(snare); // stays set, keeps aging
          s.tally.emptySnares += 1;
        } else {
          s.store.meat += res.meat;
          s.store.hides += res.hides;
          s.tally.caught[res.species] = (s.tally.caught[res.species] ?? 0) + 1;
          // a sprung trap has to be reset
        }
      }
      s.hunt.snares = remaining;
    },
  },

  ice_fish: {
    id: 'ice_fish',
    label: 'fish through ice',
    hours: 5,
    stamina: 20,
    available(s) {
      if (seasonOfDay(s.dayOfYear) !== 'winter') return { ok: false, reason: 'no ice yet' };
      if (s.weather.tempC > 2) return { ok: false, reason: 'ice too thin' };
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, waterAccess(s.plot));
      const res = rollIceFish(s, s.weather);
      s.store.meat += res.meat;
      s.log.push(res.line);
    },
  },

  smoke_meat: {
    id: 'smoke_meat',
    label: 'smoke meat',
    hours: 3,
    stamina: 15,
    available(s) {
      if (s.store.meat < 3) return { ok: false, reason: 'not enough fresh meat' };
      if (s.store.firewood < 2) return { ok: false, reason: 'not enough firewood' };
      return { ok: true };
    },
    apply(s) {
      s.store.meat -= 3;
      s.store.firewood -= 2;
      s.store.smokedMeat += 2;
      s.log.push('Smoked what would spoil. Two lots hung in the rafters.');
    },
  },

  visit_neighbour: {
    id: 'visit_neighbour',
    label: 'lend a hand next door',
    hours: 8,
    stamina: 45,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'nothing doing over there' };
      return { ok: true };
    },
    apply(s) {
      // A whole day given away. It comes back when you are busiest.
      const list = s.neighbours;
      const owedMost = [...list].sort((a, b) => b.owing - a.owing)[0] ?? list[0];
      if (!owedMost) return;
      owedMost.owing = Math.max(0, owedMost.owing - 1);
      owedMost.owed += 1;
      owedMost.lastSeen = absoluteDay(s);
      s.log.push(
        `Walked over to ${owedMost.holding} and worked the day for ${owedMost.name}. ` +
          'Ate there. Walked back in the dark.'
      );
    },
  },

  take_in_dog: {
    id: 'take_in_dog',
    label: 'take in a dog',
    hours: 4,
    stamina: 15,
    available(s) {
      if (s.animals.dog) return { ok: false, reason: 'already have one' };
      if (s.store.grain < 6) return { ok: false, reason: 'needs 6 grain' };
      return { ok: true };
    },
    apply(s) {
      s.store.grain -= 6;
      const name = DOG_NAMES[Math.floor(nextRand(s) * DOG_NAMES.length)] ?? 'Vakr';
      s.animals.dog = { name, bornOn: absoluteDay(s) - 60, present: true };
      s.hunt.hasDog = true;
      s.log.push(`A dog from the next holding. ${name}. He sat by the door and would not come in.`);
    },
  },

  take_in_cat: {
    id: 'take_in_cat',
    label: 'take in a cat',
    hours: 2,
    stamina: 8,
    available(s) {
      if (s.animals.cat) return { ok: false, reason: 'already have one' };
      if (s.store.grain < 3) return { ok: false, reason: 'needs 3 grain' };
      return { ok: true };
    },
    apply(s) {
      s.store.grain -= 3;
      const name = CAT_NAMES[Math.floor(nextRand(s) * CAT_NAMES.length)] ?? 'Mus';
      s.animals.cat = { name, bornOn: absoluteDay(s) - 40, present: true };
      s.log.push(`${name} came back with the grain sacks and stayed. The store will thank her.`);
    },
  },

  tend_animals: {
    id: 'tend_animals',
    label: 'tend the animals',
    hours: 2,
    stamina: 18,
    available(s) {
      if (s.animals.herds.length === 0) return { ok: false, reason: 'no stock to tend' };
      return { ok: true };
    },
    apply(s) {
      // Feeding proper, not the scraps the daily step assumes. A tended
      // animal picks up condition faster than one left to itself.
      for (const h of s.animals.herds) {
        h.condition = Math.min(1, h.condition + 0.06);
      }
      s.animals.hensShutIn = true;
      const thin = s.animals.herds.filter((h) => h.condition < 0.45);
      s.log.push(
        thin.length > 0
          ? `Fed and watered. The ${STOCK[thin[0]!.kind].label} still looks poor.`
          : 'Fed and watered. Bedding turned. Hens shut in.'
      );
    },
  },

  shear_sheep: {
    id: 'shear_sheep',
    label: 'shear the sheep',
    hours: 4,
    stamina: 25,
    available(s) {
      const sheep = herd(s.animals, 'sheep');
      if (!sheep || sheep.count === 0) return { ok: false, reason: 'no sheep' };
      if (seasonOfDay(s.dayOfYear) !== 'summer') return { ok: false, reason: 'not the season' };
      if (sheep.wool < 0.5) return { ok: false, reason: 'fleece too short' };
      return { ok: true };
    },
    apply(s) {
      const sheep = herd(s.animals, 'sheep')!;
      const got = Math.round(sheep.count * sheep.wool * 2.2 * sheep.condition);
      s.store.wool += got;
      sheep.wool = 0;
      s.tally.notes.push('Sheared the ewes. They look half the size and twice as cross.');
      s.log.push(`Shorn. ${got} fleeces, rolled and tied.`);
    },
  },

  slaughter_pig: {
    id: 'slaughter_pig',
    label: 'slaughter the pig',
    hours: 6,
    stamina: 40,
    available(s) {
      const pig = herd(s.animals, 'pig');
      if (!pig || pig.count === 0) return { ok: false, reason: 'no pig' };
      if (seasonOfDay(s.dayOfYear) !== 'autumn') return { ok: false, reason: 'not the season' };
      return { ok: true };
    },
    apply(s) {
      const pig = herd(s.animals, 'pig')!;
      const meat = Math.round(14 + 16 * pig.condition);
      pig.count -= 1;
      if (pig.count <= 0) s.animals.herds = s.animals.herds.filter((h) => h.kind !== 'pig');
      s.store.meat += meat;
      s.store.hides += 1;
      // Matter-of-fact: the work of butchering, not the death.
      s.tally.notes.push('Killed the pig. A long morning of it, and the smokehouse full by dark.');
      s.log.push(`A long morning of it. ${meat} of meat, and the hide off clean.`);
    },
  },

  fell_timber: {
    id: 'fell_timber',
    label: 'fell and dress timber',
    hours: 6,
    stamina: 45,
    available(s) {
      if (isStormy(s.weather)) return { ok: false, reason: 'storm outside' };
      if (seasonOfDay(s.dayOfYear) === 'winter') return { ok: false, reason: 'sap is up, wood too wet to work' };
      return { ok: true };
    },
    apply(s) {
      walkTo(s.plot, forestAccess(s.plot));
      const r = nextRand(s);
      const got = r < 0.25 ? 1 : r < 0.85 ? 2 : 3;
      s.store.timber += got;
      s.tally.timberFelled += got;
      s.log.push(
        got === 1
          ? 'Took one down. Trimmed and squared it by dusk.'
          : `Felled and dressed ${got} lengths. Stacked to season.`
      );
    },
  },

  ...buildActions(),
  ...stockActions(),

  sleep: {
    id: 'sleep',
    label: 'sleep (end day)',
    hours: 0,
    stamina: 0,
    available() {
      return { ok: true };
    },
    apply(_s) {
      // handled by endDay
    },
  },
};

export const ACTION_ORDER: readonly string[] = [
  'clear_stump',
  'break_soil',
  'sow_barley',
  'weed',
  'harvest',
  'clear_ruined',
  'visit_neighbour',
  'take_in_dog',
  'take_in_cat',
  'tend_animals',
  'shear_sheep',
  'slaughter_pig',
  'chop_wood',
  'fell_timber',
  'build_shed',
  'build_barn',
  'build_hutch',
  'build_byre',
  'build_smokehouse',
  'get_hens',
  'get_rabbits',
  'get_goat',
  'get_sheep',
  'get_pig',
  'get_ox',
  'forage',
  'set_snare_forest',
  'set_snare_water',
  'set_deadfall',
  'check_snares',
  'ice_fish',
  'smoke_meat',
  'rest',
  'sleep',
];
