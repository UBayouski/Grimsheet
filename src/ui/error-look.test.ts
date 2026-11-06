import { describe, expect, it } from 'vitest';
import type { ErrorKind, Value } from '../engine/index';

const ALL_KINDS: readonly ErrorKind[] = ['#REF!', '#NAME?', '#DIV/0!', '#VALUE!', '#CYCLE!'];
import {
  cycleCellsOf,
  ERROR_CLASS,
  GHOST_INTERVAL_MS,
  isCycleCell,
  nextGhostCell,
  placeGhost,
  sameCells,
  type AddressValue,
} from './error-look';

function cycle(origin: string): Value {
  return { kind: 'error', error: '#CYCLE!', cause: `${origin} is circular`, origin };
}

describe('ERROR_CLASS', () => {
  it('maps every ErrorKind to its expected class', () => {
    expect(ERROR_CLASS['#REF!']).toBe('cell-error-ref');
    expect(ERROR_CLASS['#NAME?']).toBe('cell-error-name');
    expect(ERROR_CLASS['#DIV/0!']).toBe('cell-error-div0');
    expect(ERROR_CLASS['#VALUE!']).toBe('cell-error-value');
    expect(ERROR_CLASS['#CYCLE!']).toBe('cell-error-cycle');
    for (const kind of ALL_KINDS) {
      expect(ERROR_CLASS[kind]).toMatch(/^cell-error-/);
    }
  });

  it('returns undefined for a kind absent from the table', () => {
    const table = ERROR_CLASS as Readonly<Record<string, string | undefined>>;
    expect(table['#NOPE!']).toBeUndefined();
  });
});

describe('GHOST_INTERVAL_MS', () => {
  it('is 800', () => {
    expect(GHOST_INTERVAL_MS).toBe(800);
  });
});

describe('isCycleCell', () => {
  it('is true for a #CYCLE! cell whose origin equals its own address', () => {
    expect(isCycleCell('A1', cycle('A1'))).toBe(true);
  });

  it('is false for a #CYCLE! cell with another origin', () => {
    expect(isCycleCell('B1', cycle('A1'))).toBe(false);
  });

  it('is false for a non-error Value', () => {
    expect(isCycleCell('A1', { kind: 'number', value: 1 })).toBe(false);
  });

  it('is false for a non-#CYCLE! error', () => {
    const ref: Value = { kind: 'error', error: '#REF!', cause: 'x', origin: 'A1' };
    expect(isCycleCell('A1', ref)).toBe(false);
  });

  it('is false for an undefined Value', () => {
    expect(isCycleCell('A1', undefined)).toBe(false);
  });
});

describe('cycleCellsOf', () => {
  it('returns scrambled input in reading order', () => {
    const cells: AddressValue[] = [
      { address: 'B1', value: cycle('B1') },
      { address: 'A2', value: cycle('A2') },
      { address: 'A1', value: cycle('A1') },
      { address: 'C1', value: cycle('C1') },
    ];
    expect(cycleCellsOf(cells)).toEqual(['A1', 'B1', 'C1', 'A2']);
  });

  it('excludes a downstream #CYCLE! cell (B1 depends on A1 but is not its own origin)', () => {
    const cells: AddressValue[] = [
      { address: 'A1', value: cycle('A1') },
      { address: 'B1', value: cycle('A1') },
    ];
    expect(cycleCellsOf(cells)).toEqual(['A1']);
  });

  it('drops an invalid address', () => {
    const cells: AddressValue[] = [
      { address: 'A1', value: cycle('A1') },
      { address: 'ZZ99', value: cycle('ZZ99') },
    ];
    expect(cycleCellsOf(cells)).toEqual(['A1']);
  });

  it('returns an empty list for no cycle cells', () => {
    expect(cycleCellsOf([])).toEqual([]);
  });
});

describe('sameCells', () => {
  it('is true for equal lists', () => {
    expect(sameCells(['A1', 'B1'], ['A1', 'B1'])).toBe(true);
  });

  it('is false for different lengths', () => {
    expect(sameCells(['A1'], ['A1', 'B1'])).toBe(false);
  });

  it('is false for different entries', () => {
    expect(sameCells(['A1', 'B1'], ['A1', 'C1'])).toBe(false);
  });

  it('is true for two empty lists', () => {
    expect(sameCells([], [])).toBe(true);
  });
});

describe('nextGhostCell', () => {
  it('steps to the next cell in order', () => {
    expect(nextGhostCell(['A1', 'B1', 'C1'], 'A1')).toBe('B1');
  });

  it('wraps after the last cell', () => {
    expect(nextGhostCell(['A1', 'B1', 'C1'], 'C1')).toBe('A1');
  });

  it('returns the only cell of a one-cell list', () => {
    expect(nextGhostCell(['A1'], 'A1')).toBe('A1');
  });

  it('returns the first cell for an unlisted current', () => {
    expect(nextGhostCell(['A1', 'B1'], 'Z9')).toBe('A1');
  });

  it('returns the first cell for an undefined current', () => {
    expect(nextGhostCell(['A1', 'B1'], undefined)).toBe('A1');
  });

  it('returns undefined for an empty list', () => {
    expect(nextGhostCell([], undefined)).toBeUndefined();
    expect(nextGhostCell([], 'A1')).toBeUndefined();
  });

  it('returns to the start after stepping n times for every length 0 to 240', () => {
    for (let n = 0; n <= 240; n++) {
      const list = Array.from({ length: n }, (_, i) => `cell${i}`);
      let current = n === 0 ? undefined : list[0];
      for (let step = 0; step < n; step++) {
        current = nextGhostCell(list, current);
      }
      if (n === 0) {
        expect(current).toBeUndefined();
      } else {
        expect(current).toBe(list[0]);
      }
    }
  });
});

describe('placeGhost', () => {
  it('returns undefined for an empty cell set', () => {
    expect(
      placeGhost({ prevCells: ['A1'], prevAt: 'A1', cells: [], levelChanged: false, still: false }),
    ).toBeUndefined();
  });

  it('returns the first cell when still', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: 'B1',
        cells: ['A1', 'B1'],
        levelChanged: false,
        still: true,
      }),
    ).toBe('A1');
  });

  it('returns the first cell when the level changed', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: 'B1',
        cells: ['A1', 'B1'],
        levelChanged: true,
        still: false,
      }),
    ).toBe('A1');
  });

  it('returns the first cell when the set changed', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: 'B1',
        cells: ['A1', 'C1'],
        levelChanged: false,
        still: false,
      }),
    ).toBe('A1');
  });

  it('keeps prevAt when it is still listed', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: 'B1',
        cells: ['A1', 'B1'],
        levelChanged: false,
        still: false,
      }),
    ).toBe('B1');
  });

  it('falls back to the first cell when prevAt is stale', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: 'Z9',
        cells: ['A1', 'B1'],
        levelChanged: false,
        still: false,
      }),
    ).toBe('A1');
  });

  it('falls back to the first cell when prevAt is undefined', () => {
    expect(
      placeGhost({
        prevCells: ['A1', 'B1'],
        prevAt: undefined,
        cells: ['A1', 'B1'],
        levelChanged: false,
        still: false,
      }),
    ).toBe('A1');
  });
});
