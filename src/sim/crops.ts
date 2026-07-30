/**
 * Crops. Step 1 grows barley only — rye and flax are defined so the
 * shape is right, but not sowable until the economy is proven.
 */

import { CropKind } from './grid.js';

export interface CropSpec {
  kind: CropKind;
  label: string;
  /** Days from sowing to standing crop. */
  growStartDays: number;
  /** Days from sowing to ready. */
  matureDays: number;
  /** Grain per tile at perfect soil, before weather and weeding. */
  yieldPerTile: number;
  /** Grain spent seeding one tile. */
  seedPerTile: number;
  sowable: boolean;
}

export const CROPS: Record<CropKind, CropSpec> = {
  barley: {
    kind: 'barley',
    label: 'barley',
    growStartDays: 5,
    matureDays: 25,
    yieldPerTile: 4.2,
    seedPerTile: 0.5,
    sowable: true,
  },
  rye: {
    kind: 'rye',
    label: 'rye',
    growStartDays: 6,
    matureDays: 30,
    yieldPerTile: 2.4,
    seedPerTile: 0.5,
    sowable: false, // step 1 is one crop
  },
  flax: {
    kind: 'flax',
    label: 'flax',
    growStartDays: 5,
    matureDays: 22,
    yieldPerTile: 1.6,
    seedPerTile: 0.4,
    sowable: false,
  },
};

/**
 * The ceiling a tile's soil can reach. Rises with every season the
 * tile carries a crop — this is the five-year curve made visible.
 */
export function soilCeiling(yearsWorked: number): number {
  return Math.min(1.0, 0.4 + 0.12 * yearsWorked);
}
