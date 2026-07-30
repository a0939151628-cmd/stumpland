/**
 * Which ground gets worked.
 *
 * The player picks the action, not the tile. Work starts at the yard
 * end of the clearing and spreads outward, the way you would actually
 * do it — near ground first, because you have to carry the tools.
 */

import { Plot, Tile, forEachTile, tileAt } from './grid.js';

/** Tiles one action covers. Two is slow ground: the plot is years of work. */
export const TILES_PER_ACTION = 2;

/** Treads before grass gives up and the ground shows through. */
export const PATH_THRESHOLD = 60;

let cachedPlot: Plot | null = null;
let cachedOrder: Tile[] | null = null;
let cachedYard: { x: number; y: number } | null = null;

/**
 * Clearing tiles, nearest-the-yard first. Cached per plot object —
 * the ordering only depends on geometry, which never changes.
 */
export function yardCentre(plot: Plot): { x: number; y: number } {
  if (cachedPlot === plot && cachedYard) return cachedYard;
  let yx = 0;
  let yy = 0;
  let n = 0;
  forEachTile(plot, (t) => {
    if (t.terrain === 'yard') {
      yx += t.x;
      yy += t.y;
      n++;
    }
  });
  const centre = n > 0 ? { x: yx / n, y: yy / n } : { x: plot.w / 2, y: plot.h / 2 };
  cachedYard = centre;
  return centre;
}

export function workOrder(plot: Plot): Tile[] {
  if (cachedPlot === plot && cachedOrder) return cachedOrder;

  const { x: yx, y: yy } = yardCentre(plot);

  const order = plot.tiles
    .filter((t) => t.terrain === 'clearing')
    .map((t) => ({ t, d: Math.hypot(t.x - yx, t.y - yy) }))
    .sort((a, b) => a.d - b.d || a.t.y - b.t.y || a.t.x - b.t.x)
    .map((e) => e.t);

  cachedPlot = plot;
  cachedOrder = order;
  return order;
}

function take(plot: Plot, pred: (t: Tile) => boolean, n: number): Tile[] {
  const out: Tile[] = [];
  for (const t of workOrder(plot)) {
    if (out.length >= n) break;
    if (pred(t)) out.push(t);
  }
  return out;
}

export function stumpTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(plot, (t) => t.stump, n);
}

export function tillableTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(plot, (t) => !t.stump && !t.tilled && t.crop === null, n);
}

export function sowableTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(plot, (t) => t.tilled && t.crop === null, n);
}

export function weedableTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(
    plot,
    (t) => t.crop !== null && t.crop.stage === 'growing' && t.crop.weeded < 3,
    n
  );
}

export function harvestableTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(plot, (t) => t.crop !== null && t.crop.stage === 'ready', n);
}

export function ruinedTiles(plot: Plot, n = TILES_PER_ACTION): Tile[] {
  return take(plot, (t) => t.crop !== null && t.crop.stage === 'ruined', n);
}

/** Where on the plot the work happened, for the log line. */
export function whereabouts(tiles: Tile[]): string {
  if (tiles.length === 0) return '';
  const t = tiles[0];
  if (!t) return '';
  const ns = t.y < 9 ? 'north' : t.y > 12 ? 'south' : '';
  const ew = t.x < 9 ? 'west' : t.x > 12 ? 'east' : '';
  if (ns && ew) return `the ${ns}-${ew} corner`;
  if (ns) return `the ${ns} end`;
  if (ew) return `the ${ew} side`;
  return 'the middle of the clearing';
}

/** Reset for tests that build many plots. */
export function clearWorkOrderCache(): void {
  cachedPlot = null;
  cachedOrder = null;
  cachedYard = null;
}

/**
 * Walk from the yard to a tile and back, wearing the ground as you go.
 *
 * Nobody plans a path. It appears because the same route gets used a few
 * hundred times, and eventually the grass gives up.
 */
export function walkTo(plot: Plot, target: Tile | undefined): void {
  if (!target) return;
  const start = yardCentre(plot);
  let x = start.x;
  let y = start.y;
  const dx = target.x - x;
  const dy = target.y - y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const sx = dx / steps;
  const sy = dy / steps;

  for (let i = 0; i <= steps; i++) {
    const t = tileAt(plot, Math.round(x), Math.round(y));
    // Water is forded, not worn. Crops are walked around, not over.
    if (t && t.terrain !== 'water' && !t.crop) t.treads += 1;
    x += sx;
    y += sy;
  }
}

/** Walk to several tiles — one trip out, one back, per tile worked. */
export function walkToAll(plot: Plot, targets: readonly Tile[]): void {
  for (const t of targets) walkTo(plot, t);
}

/** The tile the forest work happens on: nearest standing timber to the yard. */
export function forestAccess(plot: Plot): Tile | undefined {
  return nearestOfTerrain(plot, 'forest');
}

/** The tile the water work happens on: nearest bank to the yard. */
export function waterAccess(plot: Plot): Tile | undefined {
  return nearestOfTerrain(plot, 'water');
}

function nearestOfTerrain(plot: Plot, terrain: Tile['terrain']): Tile | undefined {
  const { x: yx, y: yy } = yardCentre(plot);
  let best: Tile | undefined;
  let bestD = Infinity;
  for (const t of plot.tiles) {
    if (t.terrain !== terrain) continue;
    const d = (t.x - yx) ** 2 + (t.y - yy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

export function isWornPath(t: Tile): boolean {
  return t.treads >= PATH_THRESHOLD && t.terrain !== 'water' && t.terrain !== 'yard';
}
