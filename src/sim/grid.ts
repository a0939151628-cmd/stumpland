/**
 * The plot. A 24x24 coordinate grid, owned by the simulation.
 *
 * No THREE, no canvas, no DOM. The renderer reads this and draws it;
 * it never writes back. Swap renderers and nothing here changes.
 *
 * Axes: x runs west->east, y runs north->south. Tile [0,0] is the
 * north-west corner. One tile is roughly five paces.
 */

export const GRID_W = 24;
export const GRID_H = 24;

export type Terrain =
  | 'water'    // the stream along the west edge
  | 'forest'   // standing timber. wood, forage, snares
  | 'clearing' // workable ground. stumps to pull, soil to break
  | 'yard';    // packed earth around the cottage. never farmed

export type CropKind = 'barley' | 'rye' | 'flax';

export type CropStage = 'sown' | 'growing' | 'ready' | 'ruined';

export interface Crop {
  kind: CropKind;
  sownOn: number;      // absolute day
  stage: CropStage;
  weeded: number;      // times weeded this planting
  droughtStress: number; // 0..0.6, shaves the yield
}

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  /** A stump sits here. Blocks tilling until pulled. */
  stump: boolean;
  /** 0..1. Rises with work and manure, falls with neglect. */
  soil: number;
  /** Seasons this tile has carried a crop through. Raises the soil ceiling. */
  yearsWorked: number;
  /** Broken this year. Reset each spring. */
  tilled: boolean;
  crop: Crop | null;
  /** Footfall. Enough of it wears a path into the grass. */
  treads: number;
  /** Lying snow, 0 to 1. Melts unevenly — the open ground goes first. */
  snow: number;
  /** Standing water after rain, 0 to 1. Takes days to dry. */
  puddle: number;
}

export interface Plot {
  w: number;
  h: number;
  tiles: Tile[]; // row-major, length w*h
}

export function tileAt(plot: Plot, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= plot.w || y >= plot.h) return undefined;
  return plot.tiles[y * plot.w + x];
}

export function forEachTile(plot: Plot, fn: (t: Tile) => void): void {
  for (const t of plot.tiles) fn(t);
}

export function countTiles(plot: Plot, pred: (t: Tile) => boolean): number {
  let n = 0;
  for (const t of plot.tiles) if (pred(t)) n++;
  return n;
}

/** Tiles that can hold a crop once the stump is out and the soil is broken. */
export function isArable(t: Tile): boolean {
  return t.terrain === 'clearing';
}

/**
 * Lay out the plot the settler walked onto.
 *
 * Stream down the west edge. Cottage and yard on the high ground
 * south-east of it. A patch of old clearing between the two, stumps
 * still in it. Forest everywhere else, pressing in.
 */
export function makePlot(seed = 1): Plot {
  const rand = mulberry32(seed);
  const tiles: Tile[] = [];

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      tiles.push({
        x,
        y,
        terrain: terrainFor(x, y, rand),
        stump: false,
        soil: 0,
        yearsWorked: 0,
        tilled: false,
        crop: null,
        treads: 0,
        snow: 0,
        puddle: 0,
      });
    }
  }

  const plot: Plot = { w: GRID_W, h: GRID_H, tiles };

  // Clearing soil starts poor. Forest floor is richer but you cannot plough it.
  forEachTile(plot, (t) => {
    if (t.terrain === 'clearing') t.soil = 0.22 + rand() * 0.10;
  });

  scatterStumps(plot, rand);
  return plot;
}

function terrainFor(x: number, y: number, rand: () => number): Terrain {
  // Stream: west edge, wandering a little so it is not a ruled line.
  const streamX = 1 + Math.round(Math.sin(y * 0.45) * 0.8);
  if (x <= streamX) return 'water';
  if (x === streamX + 1 && rand() < 0.25) return 'water';

  // Yard: packed earth around the cottage, south-east of the clearing.
  if (x >= 13 && x <= 17 && y >= 14 && y <= 18) return 'yard';

  // Clearing: the workable middle. Soft-edged so it reads as a real
  // gap in the trees rather than a rectangle.
  const cx = 10.5;
  const cy = 10.0;
  const dx = (x - cx) / 6.4;
  const dy = (y - cy) / 5.6;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.85 + rand() * 0.22) return 'clearing';

  return 'forest';
}

/**
 * Stumps only in the clearing, and not on every tile — someone worked
 * this ground once and gave it up part-finished.
 */
function scatterStumps(plot: Plot, rand: () => number): void {
  forEachTile(plot, (t) => {
    if (t.terrain !== 'clearing') return;
    // Denser toward the edges, where the trees were taken last.
    const dx = (t.x - 10.5) / 6.4;
    const dy = (t.y - 10.0) / 5.6;
    const d = Math.sqrt(dx * dx + dy * dy);
    const chance = 0.18 + d * 0.45;
    if (rand() < chance) t.stump = true;
  });
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
