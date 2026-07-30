/**
 * Print the plot as ASCII, optionally after N years of play.
 *   npm run map          -- day one
 *   npm run map -- 5     -- after five years of working it
 *
 * Sanity check on layout and on visible accumulation, before any 3D exists.
 */
import { initialState } from '../src/sim/state.js';
import { tileAt, countTiles, Tile, GRID_W, GRID_H } from '../src/sim/grid.js';
import { diligent, playYears } from '../src/testkit/policies.js';

const years = Number(process.argv[2] ?? 0);
const seed = Number(process.argv[3] ?? 1);

const s = initialState(seed);
if (years > 0) playYears(s, years, diligent);

const glyph = (t: Tile | undefined): string => {
  if (!t) return ' ';
  if (t.terrain === 'water') return '~';
  if (t.terrain === 'forest') return '^';
  if (t.terrain === 'yard') return '=';
  if (t.stump) return 'o';
  if (t.crop) return t.crop.stage === 'ruined' ? 'x' : t.crop.stage === 'ready' ? '#' : ',';
  if (t.tilled) return '-';
  // Ground that has carried a crop reads darker than ground that has not.
  return t.yearsWorked > 0 ? ':' : '.';
};

const rows: string[] = [];
for (let y = 0; y < GRID_H; y++) {
  let row = '';
  for (let x = 0; x < GRID_W; x++) row += glyph(tileAt(s.plot, x, y)) + ' ';
  rows.push(row.trimEnd());
}
console.log(rows.join('\n'));

const clearing = countTiles(s.plot, (t) => t.terrain === 'clearing');
console.log(
  `\nseed ${seed}, after ${years} year(s)\n` +
    '~ water  ^ forest  = yard  o stump  . rough  : worked  - broken  , growing  # ready\n' +
    `clearing ${clearing}   stumps ${countTiles(s.plot, (t) => t.stump)}   ` +
    `ever worked ${countTiles(s.plot, (t) => t.yearsWorked > 0)}   ` +
    `grain ${Math.round(s.store.grain)}   firewood ${s.store.firewood}`
);
