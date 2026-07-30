/**
 * Play the game without a human, and print what the years did.
 * This is how the economy gets proved before anything is drawn.
 */

import { GameState, initialState } from '../src/sim/state.js';
import { DAYS_PER_YEAR } from '../src/sim/calendar.js';
import { countTiles, forEachTile } from '../src/sim/grid.js';
import { isWornPath } from '../src/sim/work.js';
import { Policy, diligent, careless, playDay } from '../src/testkit/policies.js';

interface YearRow {
  year: number;
  grain: number;
  wood: number;
  meat: number;
  sown: number;
  worked: number;
  soil: number;
  hungry: number;
  cold: number;
  path: number;
  works: string;
  stock: string;
}

function play(policy: Policy, years: number, seed: number): { state: GameState; rows: YearRow[] } {
  const s = initialState(seed);
  const rows: YearRow[] = [];
  let hungry = 0;
  let cold = 0;
  let sownPeak = 0;

  for (let y = 1; y <= years; y++) {
    for (let d = 0; d < DAYS_PER_YEAR; d++) {
      playDay(s, policy);
      if (!s.person.ateToday) hungry++;
      if (s.person.wasColdLastNight) cold++;
      sownPeak = Math.max(sownPeak, countTiles(s.plot, (t) => t.crop !== null));
    }
    let soilSum = 0;
    let soilN = 0;
    forEachTile(s.plot, (t) => {
      if (t.yearsWorked > 0) {
        soilSum += t.soil;
        soilN++;
      }
    });
    rows.push({
      year: y,
      grain: Math.round(s.store.grain),
      wood: s.store.firewood,
      meat: s.store.meat + s.store.smokedMeat,
      sown: sownPeak,
      worked: countTiles(s.plot, (t) => t.yearsWorked > 0),
      soil: soilN ? soilSum / soilN : 0,
      hungry,
      cold,
      path: countTiles(s.plot, isWornPath),
      works: (['shed','barn','hutch','byre','smokehouse'] as const)
        .filter((k) => s.works[k]).join(',') || '-',
      stock: [
        ...(s.animals.dog ? ['dog'] : []),
        ...(s.animals.cat ? ['cat'] : []),
        ...s.animals.herds.map((h) => `${h.kind}x${h.count}`),
      ].join(',') || '-',
    });
    sownPeak = 0;
  }
  return { state: s, rows };
}

function report(name: string, policy: Policy, years = 5, seed = 1): void {
  const { state, rows } = play(policy, years, seed);
  console.log(`\n=== ${name} (seed ${seed}) ===`);
  console.log('year  grain  wood  meat  sown  ever-worked  mean-soil  hungry  cold  path  works                   stock');
  for (const r of rows) {
    console.log(
      `${String(r.year).padStart(4)}  ` +
        `${String(r.grain).padStart(5)}  ` +
        `${String(r.wood).padStart(4)}  ` +
        `${String(r.meat).padStart(4)}  ` +
        `${String(r.sown).padStart(4)}  ` +
        `${String(r.worked).padStart(11)}  ` +
        `${r.soil.toFixed(2).padStart(9)}  ` +
        `${String(r.hungry).padStart(6)}  ` +
        `${String(r.cold).padStart(4)}  ` +
        `${String(r.path).padStart(4)}  ` +
        r.works.padEnd(22) + '  ' + r.stock
    );
  }
  console.log(
    `stumps left: ${countTiles(state.plot, (t) => t.stump)} of ` +
      `${countTiles(state.plot, (t) => t.terrain === 'clearing')} clearing tiles`
  );
}

report('diligent', diligent, 10);
report('careless', careless, 10);
