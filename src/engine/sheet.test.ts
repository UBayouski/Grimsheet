import { afterEach, describe, expect, it, vi } from 'vitest';
import * as addressModule from './address';
import * as namesModule from './names';
import { parseFormula } from './parser';
import * as parserModule from './parser';
import { printFormula } from './printer';
import {
  commitRecalculation,
  createSheet,
  getSheetState,
  getValueByAddress,
  getValueByName,
  setCellName,
  setRawText,
} from './sheet';
import type { Sheet } from './sheet';
import { numberValue, stringValue } from './values';
import type { Value } from './values';

const COUNT = 240;

function acceptedText(sheet: Sheet, address: string, text: string): string | null {
  const result = setRawText(sheet, address, text);
  if (!result.accepted) throw new Error(`refused: ${text}`);
  return result.canonicalText;
}

describe('createSheet', () => {
  it('builds 240 empty cells in reading order', () => {
    const state = getSheetState(createSheet());
    expect(state).toBeDefined();
    expect(state?.cells).toHaveLength(COUNT);
    state?.cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
      expect(cell.raw).toBe('');
      expect(cell.name).toBeNull();
      expect(cell.ast).toBeNull();
      expect(cell.isRule).toBe(false);
      expect(cell.onCycle).toBe(false);
      expect(cell.value).toEqual(stringValue(''));
    });
    expect(state?.names.size).toBe(0);
    expect(state?.dirty).toBe(false);
  });

  it('gives each sheet its own state', () => {
    const a = createSheet();
    const b = createSheet();
    setRawText(a, 'A1', '5');
    expect(getSheetState(b)?.cells[0]?.raw).toBe('');
    expect(getSheetState(a)).not.toBe(getSheetState(b));
  });

  it('returns undefined state for a foreign handle', () => {
    expect(getSheetState({} as unknown as Sheet)).toBeUndefined();
  });
});

describe('setRawText', () => {
  it('stores a literal with no canonical text and marks dirty', () => {
    const sheet = createSheet();
    const result = setRawText(sheet, 'b2', '42');
    expect(result).toEqual({
      accepted: true,
      address: 'B2',
      kind: 'literal',
      canonicalText: null,
    });
    const state = getSheetState(sheet);
    expect(state?.cells[13]?.raw).toBe('42');
    expect(state?.cells[13]?.ast).toBeNull();
    expect(state?.dirty).toBe(true);
  });

  it('stores a formula with canonical text from the printer', () => {
    const sheet = createSheet();
    const raw = '=  SUM( A1:A3 )+  1';
    const result = setRawText(sheet, 'C1', raw);
    expect(result.accepted).toBe(true);
    const parsed = parseFormula(raw);
    if (!parsed.ok) throw new Error('parse');
    const printed = printFormula(parsed.ast);
    if (!printed.ok) throw new Error('print');
    if (!result.accepted) throw new Error('refused');
    expect(result.kind).toBe('formula');
    expect(result.canonicalText).toBe(printed.text);
    const cell = getSheetState(sheet)?.cells[2];
    expect(cell?.raw).toBe(raw);
    expect(cell?.ast).not.toBeNull();
  });

  it('canonical text is stable under re-entry', () => {
    const sheet = createSheet();
    const first = acceptedText(sheet, 'A1', '=IF( A2>1 ,  "x" , "y" )');
    expect(first).not.toBeNull();
    const second = acceptedText(sheet, 'A1', first as string);
    expect(second).toBe(first);
  });

  it('refuses a parse error and leaves the cell unchanged', () => {
    const sheet = createSheet();
    setRawText(sheet, 'A1', '7');
    const before = getSheetState(sheet)?.cells[0]?.raw;
    const result = setRawText(sheet, 'A1', '=1+');
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.error.kind).toBe('parse-error');
    expect(getSheetState(sheet)?.cells[0]?.raw).toBe(before);
  });

  it('refuses an invalid address', () => {
    const sheet = createSheet();
    for (const address of ['M1', 'A21', 'A0', '', 'zz']) {
      expect(setRawText(sheet, address, '1')).toEqual({
        accepted: false,
        error: { kind: 'invalid-address' },
      });
    }
    expect(getSheetState(sheet)?.dirty).toBe(false);
  });

  it('turning a formula into a literal clears the ast', () => {
    const sheet = createSheet();
    setRawText(sheet, 'A1', '=1+2');
    setRawText(sheet, 'A1', 'hello');
    const cell = getSheetState(sheet)?.cells[0];
    expect(cell?.ast).toBeNull();
    expect(cell?.isRule).toBe(false);
    expect(cell?.raw).toBe('hello');
  });
});

describe('setCellName', () => {
  it('names a cell with canonical upper case', () => {
    const sheet = createSheet();
    expect(setCellName(sheet, 'B14', 'hp')).toEqual({
      accepted: true,
      address: 'B14',
      name: 'HP',
    });
    expect(getSheetState(sheet)?.names.get('HP')).toBe(13 * 12 + 1);
  });

  it('refuses a duplicate name and reports the holder', () => {
    const sheet = createSheet();
    setCellName(sheet, 'B14', 'HP');
    const result = setCellName(sheet, 'B15', 'HP');
    expect(result).toEqual({
      accepted: false,
      error: { kind: 'duplicate-name', name: 'HP', heldBy: 'B14' },
    });
    expect(getSheetState(sheet)?.cells[14 * 12 + 1]?.name).toBeNull();
  });

  it('allows renaming a cell to its own name', () => {
    const sheet = createSheet();
    setCellName(sheet, 'B14', 'HP');
    expect(setCellName(sheet, 'B14', 'hp').accepted).toBe(true);
  });

  it('refuses an invalid name', () => {
    const sheet = createSheet();
    const result = setCellName(sheet, 'B14', '1 bad');
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.error.kind).toBe('invalid-name');
    expect(getSheetState(sheet)?.names.size).toBe(0);
  });

  it('refuses an invalid address', () => {
    expect(setCellName(createSheet(), 'Q99', 'HP')).toEqual({
      accepted: false,
      error: { kind: 'invalid-address' },
    });
  });

  it('clears a name with null and frees it', () => {
    const sheet = createSheet();
    setCellName(sheet, 'B14', 'HP');
    expect(setCellName(sheet, 'B14', null)).toEqual({
      accepted: true,
      address: 'B14',
      name: null,
    });
    expect(getSheetState(sheet)?.names.has('HP')).toBe(false);
    expect(setCellName(sheet, 'B15', 'HP').accepted).toBe(true);
  });

  it('moving a name between names frees the old one', () => {
    const sheet = createSheet();
    setCellName(sheet, 'B14', 'HP');
    setCellName(sheet, 'B14', 'LIFE');
    const names = getSheetState(sheet)?.names;
    expect(names?.has('HP')).toBe(false);
    expect(names?.get('LIFE')).toBe(13 * 12 + 1);
  });
});

describe('commitRecalculation', () => {
  function build(): Sheet {
    const sheet = createSheet();
    setRawText(sheet, 'A1', '1');
    setCellName(sheet, 'A1', 'ONE');
    return sheet;
  }

  it('writes values and cycle flags and clears dirty', () => {
    const sheet = build();
    const values: Value[] = Array.from({ length: COUNT }, (_, i) => numberValue(i));
    const flags: boolean[] = Array.from({ length: COUNT }, (_, i) => i === 3);
    expect(getSheetState(sheet)?.dirty).toBe(true);
    commitRecalculation(sheet, values, flags);
    const state = getSheetState(sheet);
    expect(state?.dirty).toBe(false);
    expect(state?.cells[5]?.value).toEqual(numberValue(5));
    expect(state?.cells[3]?.onCycle).toBe(true);
    expect(state?.cells[4]?.onCycle).toBe(false);
  });

  it('ignores arrays of the wrong length', () => {
    const sheet = build();
    commitRecalculation(sheet, [numberValue(1)], [false]);
    const state = getSheetState(sheet);
    expect(state?.dirty).toBe(true);
    expect(state?.cells[0]?.value).toEqual(stringValue(''));
  });

  it('ignores a foreign handle without throwing', () => {
    expect(() =>
      commitRecalculation({} as unknown as Sheet, [], []),
    ).not.toThrow();
  });

  it('reads become fresh after commit and stale after an edit', () => {
    const sheet = build();
    const values: Value[] = Array.from({ length: COUNT }, () => numberValue(9));
    const flags: boolean[] = Array.from({ length: COUNT }, () => false);
    const stale = getValueByAddress(sheet, 'A1');
    expect(stale.ok && stale.stale).toBe(true);
    commitRecalculation(sheet, values, flags);
    const fresh = getValueByAddress(sheet, 'a1');
    expect(fresh).toEqual({
      ok: true,
      address: 'A1',
      name: 'ONE',
      value: numberValue(9),
      stale: false,
    });
    setRawText(sheet, 'A2', '2');
    const again = getValueByName(sheet, 'one');
    expect(again.ok && again.stale).toBe(true);
  });
});

describe('reads', () => {
  it('reports cell-not-found for bad address and unknown name', () => {
    const sheet = createSheet();
    expect(getValueByAddress(sheet, 'Z9')).toEqual({
      ok: false,
      error: { kind: 'cell-not-found' },
    });
    expect(getValueByName(sheet, 'NOPE')).toEqual({
      ok: false,
      error: { kind: 'cell-not-found' },
    });
  });
});

describe('order independence', () => {
  const edits: ReadonlyArray<readonly [string, string]> = [
    ['A1', '3'],
    ['B1', '=A1+1'],
    ['C1', '=SUM(A1:B1)'],
    ['A2', 'text'],
    ['B2', '=IF(A1>1, "big", "small")'],
  ];
  const names: ReadonlyArray<readonly [string, string]> = [
    ['A1', 'FIRST'],
    ['C1', 'TOTAL'],
  ];

  function snapshot(sheet: Sheet): unknown {
    const state = getSheetState(sheet);
    return {
      cells: state?.cells.map((c) => ({
        index: c.index,
        raw: c.raw,
        name: c.name,
        ast: c.ast,
        isRule: c.isRule,
      })),
      names: [...(state?.names.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)),
    };
  }

  it('same edits in any order give the same sheet state', () => {
    const forward = createSheet();
    const backward = createSheet();
    for (const [a, t] of edits) setRawText(forward, a, t);
    for (const [a, n] of names) setCellName(forward, a, n);
    for (const [a, t] of [...edits].reverse()) setRawText(backward, a, t);
    for (const [a, n] of [...names].reverse()) setCellName(backward, a, n);
    expect(snapshot(backward)).toEqual(snapshot(forward));
  });

  it('naming before or after writing text gives the same state', () => {
    const named = createSheet();
    const written = createSheet();
    for (const [a, n] of names) setCellName(named, a, n);
    for (const [a, t] of edits) setRawText(named, a, t);
    for (const [a, t] of edits) setRawText(written, a, t);
    for (const [a, n] of names) setCellName(written, a, n);
    expect(snapshot(named)).toEqual(snapshot(written));
  });
});

describe('internal faults become a refused result', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const INTERNAL = { kind: 'internal-error' };

  it('setRawText', () => {
    const sheet = createSheet();
    vi.spyOn(parserModule, 'parseFormula').mockImplementation(() => {
      throw new Error('forced fault');
    });
    expect(setRawText(sheet, 'A1', '=1+1')).toEqual({ accepted: false, error: INTERNAL });
    vi.restoreAllMocks();
    expect(getValueByAddress(sheet, 'A1')).toMatchObject({ ok: true, stale: false });
  });

  it('setCellName', () => {
    const sheet = createSheet();
    vi.spyOn(namesModule, 'validateCellName').mockImplementation(() => {
      throw new Error('forced fault');
    });
    expect(setCellName(sheet, 'A1', 'HP')).toEqual({ accepted: false, error: INTERNAL });
  });

  it('getValueByAddress', () => {
    const sheet = createSheet();
    vi.spyOn(addressModule, 'parseAddress').mockImplementation(() => {
      throw new Error('forced fault');
    });
    expect(getValueByAddress(sheet, 'A1')).toEqual({ ok: false, error: INTERNAL });
  });

  it('getValueByName', () => {
    const sheet = createSheet();
    setCellName(sheet, 'A1', 'HP');
    const spy = vi.spyOn(Map.prototype, 'get').mockImplementation(() => {
      throw new Error('forced fault');
    });
    let result: unknown;
    try {
      result = getValueByName(sheet, 'HP');
    } finally {
      spy.mockRestore();
    }
    expect(result).toEqual({ ok: false, error: INTERNAL });
  });

  it('still reports ordinary refusals as before once the spies are restored', () => {
    const sheet = createSheet();
    expect(getValueByAddress(sheet, 'M1')).toEqual({ ok: false, error: { kind: 'cell-not-found' } });
    expect(setRawText(sheet, 'M1', '1')).toEqual({ accepted: false, error: { kind: 'invalid-address' } });
  });
});
