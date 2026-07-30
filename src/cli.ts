/**
 * Stumpland, in the terminal.
 *
 * Step 1: prove the economy before any of it is drawn. Nothing here
 * imports the renderer, and nothing in src/sim imports this.
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { GameState, initialState } from './sim/state.js';
import { ACTIONS, ACTION_ORDER } from './sim/actions.js';
import { doAction } from './sim/step.js';
import { seasonOfDay, dayInSeason } from './sim/calendar.js';
import { countTiles, tileAt, GRID_W, GRID_H, Tile } from './sim/grid.js';

const SAVE = path.join(process.cwd(), 'save.json');

function load(): GameState {
  if (process.argv.includes('--new') || !fs.existsSync(SAVE)) return initialState(1);
  try {
    return JSON.parse(fs.readFileSync(SAVE, 'utf8')) as GameState;
  } catch {
    return initialState(1);
  }
}

function save(s: GameState): void {
  fs.writeFileSync(SAVE, JSON.stringify(s), 'utf8');
}

function header(s: GameState): string {
  const season = seasonOfDay(s.dayOfYear);
  const d = dayInSeason(s.dayOfYear);
  const light = s.hoursLeft.toFixed(1);
  return (
    `\nYear ${s.year}, ${season} day ${d}` +
    `    ${light}h light left    ${Math.round(s.person.stamina)}/${s.person.maxStamina} stamina`
  );
}

function stores(s: GameState): string {
  const st = s.store;
  return (
    `grain ${Math.round(st.grain)}   firewood ${st.firewood}   ` +
    `meat ${st.meat}   smoked ${st.smokedMeat}   hides ${st.hides}`
  );
}

function ground(s: GameState): string {
  const stumps = countTiles(s.plot, (t) => t.stump);
  const broken = countTiles(s.plot, (t) => t.tilled && t.crop === null);
  const standing = countTiles(s.plot, (t) => t.crop !== null && t.crop.stage !== 'ruined');
  const ready = countTiles(s.plot, (t) => t.crop !== null && t.crop.stage === 'ready');
  const ruined = countTiles(s.plot, (t) => t.crop !== null && t.crop.stage === 'ruined');
  const parts = [`${stumps} stumps`, `${broken} broken`, `${standing} standing`];
  if (ready) parts.push(`${ready} ready`);
  if (ruined) parts.push(`${ruined} dead`);
  return `ground: ${parts.join(', ')}`;
}

function glyph(t: Tile | undefined): string {
  if (!t) return ' ';
  if (t.terrain === 'water') return '~';
  if (t.terrain === 'forest') return '^';
  if (t.terrain === 'yard') return '=';
  if (t.stump) return 'o';
  if (t.crop) {
    if (t.crop.stage === 'ruined') return 'x';
    if (t.crop.stage === 'ready') return '#';
    return ',';
  }
  if (t.tilled) return '-';
  return '.';
}

function drawMap(s: GameState): string {
  const rows: string[] = [];
  for (let y = 0; y < GRID_H; y++) {
    let row = '  ';
    for (let x = 0; x < GRID_W; x++) row += glyph(tileAt(s.plot, x, y)) + ' ';
    rows.push(row.trimEnd());
  }
  return (
    rows.join('\n') +
    '\n\n  ~ water  ^ forest  = yard  o stump  . open  - broken  , growing  # ready  x dead'
  );
}

function menu(s: GameState): string {
  const lines: string[] = [];
  ACTION_ORDER.forEach((id, i) => {
    const a = ACTIONS[id];
    if (!a) return;
    const n = String(i + 1).padStart(2);
    const avail = a.available(s);
    const cost = a.stamina < 0
      ? `${a.hours}h  +${-a.stamina}st`
      : `${a.hours}h  ${a.stamina}st`;
    if (avail.ok) {
      lines.push(`  ${n}  ${a.label.padEnd(22)} ${cost}`);
    } else {
      lines.push(`   -  ${a.label.padEnd(22)} ${avail.reason}`);
    }
  });
  return lines.join('\n');
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  let s = load();

  console.log('\nStumpland. Forest edge, spring. The stumps are still in the ground.');
  console.log("Type a number, or 'map', 'log', 'quit'.");

  let lastLogLen = s.log.length;

  for (;;) {
    console.log(header(s));
    console.log(s.weather.todaysLine);
    console.log('');
    console.log(stores(s));
    console.log(ground(s));
    console.log('');
    console.log(menu(s));

    const answer = (await rl.question('\n> ')).trim().toLowerCase();

    if (answer === 'quit' || answer === 'q') break;
    if (answer === 'map' || answer === 'm') {
      console.log('\n' + drawMap(s));
      continue;
    }
    if (answer === 'log') {
      console.log('\n' + s.log.slice(-30).map((l) => '  ' + l).join('\n'));
      continue;
    }

    const idx = Number(answer) - 1;
    const id = ACTION_ORDER[idx];
    if (!id) {
      console.log('  Not one of the options.');
      continue;
    }

    const before = s.dayOfYear;
    const res = doAction(s, id);
    if (!res.ok) {
      console.log(`  ${res.message}`);
      continue;
    }

    // Echo whatever the sim wrote to the journal for this action.
    const fresh = s.log.slice(lastLogLen);
    lastLogLen = s.log.length;
    if (fresh.length) console.log('\n' + fresh.map((l) => '  ' + l).join('\n'));

    if (s.dayOfYear !== before) {
      save(s);
      console.log('\n  —');
    }
  }

  save(s);
  rl.close();
  console.log('\nSaved.\n');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
