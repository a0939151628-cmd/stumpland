/**
 * What gets put up on the plot, and what it costs.
 *
 * Buildings are permanent. Nothing here is ever torn down or reset —
 * a barn raised in year three is still standing in year ten.
 */

export type WorkKind = 'shed' | 'barn' | 'hutch' | 'byre' | 'smokehouse';

export interface Works {
  shed: boolean;
  barn: boolean; // the shed rebuilt bigger; implies shed
  hutch: boolean;
  byre: boolean;
  smokehouse: boolean;
  /** Sections of fence stood up, in tile-edges. Earned, never free. */
  fenceSections: number;
}

export function initialWorks(): Works {
  return {
    shed: false,
    barn: false,
    hutch: false,
    byre: false,
    smokehouse: false,
    fenceSections: 0,
  };
}

export interface WorkSpec {
  kind: WorkKind;
  label: string;
  timber: number;
  hours: number;
  stamina: number;
  /** Where it stands, in grid tiles. */
  at: { x: number; y: number };
  blurb: string;
}

export const WORKS: Record<WorkKind, WorkSpec> = {
  shed: {
    kind: 'shed',
    label: 'raise a shed',
    timber: 8,
    hours: 6,
    stamina: 45,
    at: { x: 13.5, y: 14.0 },
    blurb: 'A shed against the north wall. Somewhere dry for the tools.',
  },
  hutch: {
    kind: 'hutch',
    label: 'build a hutch',
    timber: 5,
    hours: 4,
    stamina: 30,
    at: { x: 16.9, y: 14.0 },
    blurb: 'A hutch on legs, out of the wet.',
  },
  smokehouse: {
    kind: 'smokehouse',
    label: 'build a smokehouse',
    timber: 10,
    hours: 6,
    stamina: 40,
    at: { x: 17.5, y: 15.7 },
    blurb: 'A smokehouse. Small, tight, and it will earn its keep by winter.',
  },
  byre: {
    kind: 'byre',
    label: 'build a byre',
    timber: 16,
    hours: 8,
    stamina: 55,
    at: { x: 12.4, y: 16.3 },
    blurb: 'A byre. Room for stock to stand out of the weather.',
  },
  barn: {
    kind: 'barn',
    label: 'rebuild the shed as a barn',
    timber: 24,
    hours: 10,
    stamina: 60,
    at: { x: 13.5, y: 14.0 },
    blurb: 'The shed came down and the barn went up in its place. It took the week.',
  },
};

/** Build order: the barn only follows a shed. */
export function canRaise(works: Works, kind: WorkKind): { ok: boolean; reason?: string } {
  if (kind === 'barn') {
    if (works.barn) return { ok: false, reason: 'the barn is up' };
    if (!works.shed) return { ok: false, reason: 'no shed to build on' };
    return { ok: true };
  }
  if (works[kind]) return { ok: false, reason: 'already standing' };
  return { ok: true };
}
