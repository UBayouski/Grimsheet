const WALL = '############';
const FLOOR = '#..........#';
const map = [WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, '#.........X#', WALL];

const ERRORS = {
  schemaVersion: 1,
  id: '03-fixture-errors',
  title: 'Fixture Errors',
  hint: 'Look at the errors.',
  map, // 12 x 12, hero on floor B2, exit at K11, no monster
  cells: [
    { address: 'B9', raw: '=M30' },
    { address: 'D9', raw: '=FOO(1)' },
    { address: 'F9', raw: '=1/0' },
    { address: 'H9', raw: '="a"+1' },
    { address: 'J9', raw: '=K9' },
    { address: 'K9', raw: '=J9' },
    { address: 'L9', raw: '=K9+1' }, // downstream of the cycle: haunted look, no ghost
  ],
  hero: { at: 'B2' },
  monsters: [],
  startingHp: 9,
  ink: 3,
  seed: 3,
};

export const ERROR_FIXTURE_LEVELS: readonly unknown[] = [ERRORS];
