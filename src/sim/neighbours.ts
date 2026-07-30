/**
 * Three people within walking distance.
 *
 * They are not a quest system. There are no meters, no romance, no
 * conflict and nothing to unlock. They borrow things, they lend things,
 * they turn up at harvest, and sometimes they just come by. Helping one
 * costs a day now and gets you a day back later, which is the whole of
 * the economy between you.
 *
 * They are tired too.
 */

export interface Neighbour {
  name: string;
  holding: string;
  /** Days of labour they owe you. Paid back when you are busiest. */
  owed: number;
  /** Days of labour you owe them. Never enforced. */
  owing: number;
  lastSeen: number;
  note: string;
}

export function initialNeighbours(): Neighbour[] {
  return [
    {
      name: 'Halla',
      holding: 'the holding under the ridge',
      owed: 0,
      owing: 0,
      lastSeen: -99,
      note: 'Older than she says. Keeps bees and will not explain how.',
    },
    {
      name: 'Ottarr',
      holding: 'the low ground by the ford',
      owed: 0,
      owing: 0,
      lastSeen: -99,
      note: 'Talks while he works and works the whole time he talks.',
    },
    {
      name: 'Sigrun',
      holding: 'the far side of the wood',
      owed: 0,
      owing: 0,
      lastSeen: -99,
      note: 'Came up from the coast two winters back. Good with sheep.',
    },
  ];
}

export type CallKind = 'borrow' | 'gift' | 'ask_help' | 'repay' | 'passing';

export interface Call {
  who: string;
  kind: CallKind;
  line: string;
}

/** What a neighbour says when they turn up. Terse. No exclamation points. */
export function callLine(kind: CallKind, n: Neighbour, detail = ''): string {
  switch (kind) {
    case 'borrow':
      return `${n.name} came for the long-handled axe. Said two days. It will be four.`;
    case 'gift':
      return `${n.name} left ${detail} by the door and did not stay.`;
    case 'ask_help':
      return `${n.name} needs a hand getting the crop in before it turns.`;
    case 'repay':
      return `${n.name} came and worked the day without being asked. ${detail}`;
    case 'passing':
      return `${n.name} came by from ${n.holding}. Sat a while. Said little.`;
  }
}

export function byName(list: Neighbour[], name: string): Neighbour | undefined {
  return list.find((n) => n.name === name);
}
