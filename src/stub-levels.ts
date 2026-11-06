const STUB = {
  schemaVersion: 1,
  id: '01-stub',
  title: 'Stub',
  hint: 'Walk to the exit.',
  map: [
    '############',
    '#.........X#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
  ],
  cells: [],
  hero: { at: 'B2' },
  monsters: [],
  startingHp: 5,
  ink: 3,
  seed: 1,
};

export const STUB_LEVELS: readonly unknown[] = [STUB];
