const WALL = '############';
const FLOOR_ROW = '#..........#';

/** Rows 1 to 12 of a bordered room, with `X` placed at (col, row) 1-based. */
function room(exitCol: number, exitRow: number): string[] {
  const rows = [WALL, ...Array.from({ length: 10 }, () => FLOOR_ROW), WALL];
  const row = rows[exitRow - 1] ?? FLOOR_ROW;
  rows[exitRow - 1] = row.slice(0, exitCol - 1) + 'X' + row.slice(exitCol);
  return rows;
}

const CORRIDOR = {
  schemaVersion: 1,
  id: '01-fixture-corridor',
  title: 'Fixture Corridor',
  hint: 'Walk to the exit.',
  map: room(4, 2),
  cells: [],
  hero: { at: 'B2' },
  monsters: [],
  startingHp: 5,
  ink: 3,
  seed: 1,
};

const LAB = {
  schemaVersion: 1,
  id: '02-fixture-lab',
  title: 'Fixture Lab',
  hint: 'Break the monster rule.',
  map: room(11, 11),
  cells: [
    { address: 'A15', raw: 'Move M1' },
    { address: 'B15', raw: '"-"', name: 'MOVE_M1' },
    { address: 'A16', raw: 'Attack M1' },
    { address: 'B16', raw: '0', name: 'ATK_M1' },
  ],
  hero: { at: 'B2' },
  monsters: [{ id: 'M1', at: 'K10', move: 'MOVE_M1', atk: 'ATK_M1' }],
  startingHp: 5,
  ink: 3,
  seed: 2,
};

export const FIXTURE_LEVELS: readonly unknown[] = [CORRIDOR, LAB];
