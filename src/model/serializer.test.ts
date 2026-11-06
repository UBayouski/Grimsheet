import { describe, expect, it } from 'vitest';
import { normalize, serializeLevel, serializeLevelText, tabLabel } from './serializer';
import type { CellSpec, Level } from './types';

const BLANK_ROW = '.'.repeat(12);

function makeLevel(overrides: Partial<Level> = {}): Level {
  return {
    schemaVersion: 1,
    id: '01-the-corridor',
    title: 'The Corridor',
    hint: 'Walk east.',
    startingHp: 10,
    ink: 3,
    seed: 7,
    hero: { at: 'A1' },
    monsters: [],
    map: Array.from({ length: 12 }, () => BLANK_ROW),
    cells: [],
    ...overrides,
  };
}

function mapWith(row: number, col: number, ch: string): string[] {
  return Array.from({ length: 12 }, (_, r) =>
    r === row - 1 ? BLANK_ROW.slice(0, col - 1) + ch + BLANK_ROW.slice(col) : BLANK_ROW,
  );
}

describe('tabLabel', () => {
  it('labels 01-the-corridor', () => {
    expect(tabLabel(makeLevel())).toBe('Sheet1: The Corridor');
  });

  it('labels 10-x', () => {
    expect(tabLabel(makeLevel({ id: '10-x', title: 'X' }))).toBe('Sheet10: X');
  });
});

describe('field order', () => {
  const level = makeLevel({
    monsters: [{ id: 'M1', at: 'B2', move: 'MOVE_M1', atk: 'ATK_M1' }],
    cells: [{ address: 'B14', raw: '5', locked: true, name: 'HP' }],
  });

  it('writes root keys in the fixed order', () => {
    expect(Object.keys(serializeLevel(level))).toEqual([
      'schemaVersion',
      'id',
      'title',
      'hint',
      'startingHp',
      'ink',
      'seed',
      'hero',
      'monsters',
      'map',
      'cells',
    ]);
  });

  it('writes cell keys in the fixed order', () => {
    const cell = serializeLevel(level).cells[0];
    expect(Object.keys(cell ?? {})).toEqual(['address', 'raw', 'locked', 'name']);
  });

  it('writes monster keys in the fixed order', () => {
    const monster = serializeLevel(level).monsters[0];
    expect(Object.keys(monster ?? {})).toEqual(['id', 'at', 'move', 'atk']);
  });

  it('keeps monsters in author order with upper-case rule names', () => {
    const doc = normalize(
      makeLevel({
        monsters: [
          { id: 'M2', at: 'b2', move: 'move_m2', atk: 'atk_m2' },
          { id: 'M1', at: 'c3', move: 'MOVE_M1', atk: 'ATK_M1' },
        ],
      }),
    );
    expect(doc.monsters.map((m) => m.id)).toEqual(['M2', 'M1']);
    expect(doc.monsters[0]).toEqual({ id: 'M2', at: 'B2', move: 'MOVE_M2', atk: 'ATK_M2' });
  });
});

describe('text form', () => {
  it('ends with one newline and has no carriage return', () => {
    const text = serializeLevelText(makeLevel());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
  });

  it('uses two-space indentation', () => {
    expect(serializeLevelText(makeLevel())).toContain('\n  "schemaVersion": 1,');
  });

  it('equals JSON.stringify of the normalized document', () => {
    const level = makeLevel();
    expect(serializeLevelText(level)).toBe(JSON.stringify(serializeLevel(level), null, 2) + '\n');
  });

  it('gives identical text for equal levels', () => {
    expect(serializeLevelText(makeLevel())).toBe(serializeLevelText(makeLevel()));
  });
});

describe('spec removal and folding', () => {
  it('drops an unlocked, unnamed spec equal to its map character', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'C3', raw: '.' }] }));
    expect(doc.cells).toEqual([]);
  });

  it('drops an empty spec outside the map', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'C15', raw: '' }] }));
    expect(doc.cells).toEqual([]);
  });

  it('keeps an empty locked spec outside the map', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'C15', raw: '', locked: true }] }));
    expect(doc.cells).toEqual([{ address: 'C15', raw: '', locked: true }]);
  });

  it('keeps a named spec equal to its map character', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'C3', raw: '.', name: 'DOOR' }] }));
    expect(doc.cells).toEqual([{ address: 'C3', raw: '.', name: 'DOOR' }]);
  });

  it('folds raw "X" over "." into the map and drops the spec', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'B2', raw: 'X' }] }));
    expect(doc.map[1]?.[1]).toBe('X');
    expect(doc.cells).toEqual([]);
  });

  it('folds a non-glyph override to "." and keeps the spec', () => {
    const doc = normalize(
      makeLevel({ map: mapWith(2, 2, '#'), cells: [{ address: 'B2', raw: '=1+1' }] }),
    );
    expect(doc.map[1]?.[1]).toBe('.');
    expect(doc.cells).toEqual([{ address: 'B2', raw: '=1+1' }]);
  });

  it('keeps a map glyph when no spec overrides it', () => {
    const doc = normalize(makeLevel({ map: mapWith(3, 4, '^') }));
    expect(doc.map[2]?.[3]).toBe('^');
  });

  it('drops locked: false', () => {
    const cell = { address: 'B14', raw: 'hi', locked: false } as unknown as CellSpec;
    const doc = normalize(makeLevel({ cells: [cell] }));
    expect(doc.cells).toEqual([{ address: 'B14', raw: 'hi' }]);
    expect('locked' in (doc.cells[0] ?? {})).toBe(false);
  });

  it('upper-cases lower-case addresses and names', () => {
    const doc = normalize(makeLevel({ cells: [{ address: 'b14', raw: '5', name: 'hp' }] }));
    expect(doc.cells).toEqual([{ address: 'B14', raw: '5', name: 'HP' }]);
  });

  it('sorts specs in reading order', () => {
    const cells: CellSpec[] = [
      { address: 'B15', raw: 'b' },
      { address: 'L14', raw: 'a' },
      { address: 'A15', raw: 'c' },
      { address: 'C2', raw: '=1+1' },
      { address: 'A14', raw: 'd' },
    ];
    const doc = normalize(makeLevel({ cells }));
    expect(doc.cells.map((c) => c.address)).toEqual(['C2', 'A14', 'L14', 'A15', 'B15']);
  });
});

describe('normalize', () => {
  it('is idempotent on a hand-built level', () => {
    const level = makeLevel({
      map: mapWith(4, 4, 'X'),
      monsters: [{ id: 'M1', at: 'c3', move: 'move_m1', atk: 'atk_m1' }],
      cells: [
        { address: 'l20', raw: '', name: 'last' },
        { address: 'b2', raw: '^' },
        { address: 'D4', raw: '=1+2' },
        { address: 'a14', raw: 'Label', locked: true },
        { address: 'B14', raw: '3', name: 'hp' },
      ],
    });
    const once = normalize(level);
    expect(normalize(once)).toEqual(once);
    expect(JSON.stringify(normalize(once))).toBe(JSON.stringify(once));
  });

  it('does not mutate its input', () => {
    const level = makeLevel({ cells: [{ address: 'b2', raw: 'X' }] });
    const before = JSON.stringify(level);
    normalize(level);
    expect(JSON.stringify(level)).toBe(before);
  });
});

describe('normalize: negative zero', () => {
  it('maps -0 to 0 for every number field', () => {
    const out = normalize(makeLevel({ ink: -0, seed: -0, startingHp: -0, schemaVersion: -0 as unknown as 1 }));
    expect(Object.is(out.ink, 0)).toBe(true);
    expect(Object.is(out.seed, 0)).toBe(true);
    expect(Object.is(out.startingHp, 0)).toBe(true);
    expect(Object.is(out.schemaVersion, 1)).toBe(true);
  });
});
