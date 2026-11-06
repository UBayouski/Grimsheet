import { describe, expect, it } from 'vitest';
import { describeError, evaluateCell, listCycleCells } from './evaluate-cell';
import { recalculate } from './recalculator';
import { createSheet, getSheetState, getValueByAddress, setCellName, setRawText } from './sheet';
import type { Sheet } from './sheet';
import type { EvaluationContext } from './context';

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return { heroAddress: { col: 1, row: 1 }, random: () => 0.5, ...over };
}

function build(cells: Record<string, string>, recalc = true): Sheet {
  const sheet = createSheet();
  for (const [addr, raw] of Object.entries(cells)) {
    if (!setRawText(sheet, addr, raw).accepted) throw new Error(`bad setup ${addr}`);
  }
  if (recalc) recalculate(sheet, ctx());
  return sheet;
}

const throwingCtx = {
  get heroAddress(): never {
    throw new Error('context was read');
  },
  get random(): never {
    throw new Error('context was read');
  },
} as unknown as EvaluationContext;

describe('evaluateCell', () => {
  it('reports cell-not-found before checking the context', () => {
    const sheet = build({});
    const bad = {} as unknown as EvaluationContext;
    expect(evaluateCell(sheet, { address: 'M1' }, bad)).toEqual({
      ok: false,
      error: { kind: 'cell-not-found' },
    });
    expect(evaluateCell(sheet, { name: 'NOPE' }, bad)).toEqual({
      ok: false,
      error: { kind: 'cell-not-found' },
    });
  });

  it('evaluates a Rule_Cell with the Self_Address', () => {
    const sheet = build({ A1: '=ROW(SELF)*100+COL(SELF)' });
    const r = evaluateCell(sheet, { address: 'A1' }, ctx({ selfAddress: { col: 3, row: 5 } }));
    expect(r).toEqual({
      ok: true,
      value: { kind: 'number', value: 503 },
      source: 'evaluated',
      stale: false,
    });
  });

  it('finds a Cell by name', () => {
    const sheet = build({ A1: '=ROW(SELF)' });
    setCellName(sheet, 'A1', 'mv');
    recalculate(sheet, ctx());
    const r = evaluateCell(sheet, { name: 'mv' }, ctx({ selfAddress: { col: 1, row: 7 } }));
    expect(r.ok && r.value).toEqual({ kind: 'number', value: 7 });
  });

  it('gives #REF! for an absent or out-of-sheet Self_Address', () => {
    const sheet = build({ A1: '=ROW(SELF)' });
    for (const over of [{}, { selfAddress: { col: 13, row: 1 } }]) {
      const r = evaluateCell(sheet, { address: 'A1' }, ctx(over));
      expect(r.ok && r.value.kind === 'error' && r.value.error).toBe('#REF!');
    }
  });

  it('returns invalid-context for a Rule_Cell with a bad context', () => {
    const sheet = build({ A1: '=ROW(SELF)' });
    const r = evaluateCell(sheet, { address: 'A1' }, { heroAddress: { col: 1, row: 1 } } as never);
    expect(r).toEqual({ ok: false, error: { kind: 'invalid-context', field: 'random' } });
  });

  it('returns stored Values for non-Rule_Cells without reading the context', () => {
    const sheet = build({ A1: '=1+2', A2: 'hello', A3: '=RAND()' });
    const a1 = evaluateCell(sheet, { address: 'A1' }, throwingCtx);
    expect(a1).toEqual({ ok: true, value: { kind: 'number', value: 3 }, source: 'stored', stale: false });
    const a2 = evaluateCell(sheet, { address: 'A2' }, throwingCtx);
    expect(a2.ok && a2.value).toEqual({ kind: 'string', value: 'hello' });
    const a3 = evaluateCell(sheet, { address: 'A3' }, throwingCtx);
    expect(a3.ok && a3.value).toEqual({ kind: 'number', value: 0.5 });
  });

  it('returns the stored error for a Rule_Cell on a cycle without reading the context', () => {
    const sheet = build({ A1: '=B1+TOWARD(A2)', B1: '=A1', A2: '1' });
    const r = evaluateCell(sheet, { address: 'A1' }, throwingCtx);
    expect(r.ok && r.source).toBe('stored');
    expect(r.ok && r.value.kind === 'error' && r.value.error).toBe('#CYCLE!');
  });

  it('returns "" for an empty Cell', () => {
    const sheet = build({});
    const r = evaluateCell(sheet, { address: 'C3' }, throwingCtx);
    expect(r.ok && r.value).toEqual({ kind: 'string', value: '' });
  });

  it('stores nothing', () => {
    const sheet = build({ A1: '=ROW(SELF)' });
    const before = getValueByAddress(sheet, 'A1');
    evaluateCell(sheet, { address: 'A1' }, ctx({ selfAddress: { col: 2, row: 9 } }));
    expect(getValueByAddress(sheet, 'A1')).toEqual(before);
    expect(before.ok && before.value.kind).toBe('rule');
  });

  it('sees #VALUE! when a Rule_Cell references another Rule_Cell', () => {
    const sheet = build({ A1: '=ROW(SELF)', B1: '=A1+ROW(SELF)' });
    const r = evaluateCell(sheet, { address: 'B1' }, ctx({ selfAddress: { col: 1, row: 4 } }));
    expect(r.ok && r.value.kind === 'error' && r.value.error).toBe('#VALUE!');
    expect(r.ok && r.value.kind === 'error' && r.value.cause).toContain('A1');
  });

  it('returns an erroring formula as an Error_Value with ok: true', () => {
    const sheet = build({ A1: '=1/0+ROW(SELF)' });
    const r = evaluateCell(sheet, { address: 'A1' }, ctx({ selfAddress: { col: 1, row: 1 } }));
    expect(r.ok && r.source).toBe('evaluated');
    expect(r.ok && r.value.kind === 'error' && r.value.error).toBe('#DIV/0!');
  });

  it('reports stale after an unrecalculated edit', () => {
    const sheet = build({ A1: '=ROW(SELF)', A2: '1' });
    setRawText(sheet, 'A2', '2');
    const rule = evaluateCell(sheet, { address: 'A1' }, ctx({ selfAddress: { col: 1, row: 1 } }));
    const stored = evaluateCell(sheet, { address: 'A2' }, ctx());
    expect(rule.ok && rule.stale).toBe(true);
    expect(stored.ok && stored.stale).toBe(true);
  });
});

describe('evaluateCell with a missing Cell record', () => {
  // createSheet always makes 240 records, so this only happens if the state is corrupted.
  it('gives #REF! naming the missing Address', () => {
    const sheet = build({ A1: '=B1+ROW(SELF)' });
    const state = getSheetState(sheet);
    if (state === undefined) throw new Error('no state');
    Reflect.deleteProperty(state.cells, 1); // B1
    const r = evaluateCell(sheet, { address: 'A1' }, ctx({ selfAddress: { col: 1, row: 1 } }));
    expect(r.ok && r.source).toBe('evaluated');
    expect(r.ok && r.value.kind === 'error' && r.value.error).toBe('#REF!');
    expect(r.ok && r.value.kind === 'error' && r.value.cause).toContain('B1');
  });
});
describe('listCycleCells', () => {
  it('lists cycle Cells in reading order without duplicates', () => {
    const sheet = build({ C2: '=B2', B2: '=C2', A1: '=A1', D1: '=A1' });
    expect(listCycleCells(sheet)).toEqual(['A1', 'B2', 'C2']);
  });

  it('is empty without cycles', () => {
    expect(listCycleCells(build({ A1: '1', B1: '=A1' }))).toEqual([]);
  });
});

describe('describeError', () => {
  it('describes an error Value', () => {
    const sheet = build({ A1: '=1/0', B1: '=A1' });
    const r = describeError(sheet, { address: 'B1' });
    expect(r.ok && r.description?.kind).toBe('#DIV/0!');
    expect(r.ok && r.description?.origin).toBe('A1');
    expect(r.ok && r.description?.cause).toContain('A1');
  });

  it('gives null for a non-error Cell', () => {
    const sheet = build({ A1: '5' });
    expect(describeError(sheet, { address: 'A1' })).toEqual({ ok: true, description: null });
  });

  it('gives cell-not-found for a missing Cell', () => {
    const sheet = build({});
    expect(describeError(sheet, { address: 'Z99' })).toEqual({
      ok: false,
      error: { kind: 'cell-not-found' },
    });
  });
});

describe('evaluateCell with a hostile context', () => {
  const hostile: Array<[string, EvaluationContext, 'heroAddress' | 'random']> = [
    [
      'a heroAddress getter that throws',
      {
        get heroAddress(): never {
          throw new Error('hero getter');
        },
        random: () => 0.5,
      } as unknown as EvaluationContext,
      'heroAddress',
    ],
    [
      'a random getter that throws',
      {
        heroAddress: { col: 1, row: 1 },
        get random(): never {
          throw new Error('random getter');
        },
      } as unknown as EvaluationContext,
      'random',
    ],
    [
      'a Proxy that throws on every get',
      new Proxy(
        {},
        {
          get() {
            throw new Error('proxy trap');
          },
        },
      ) as unknown as EvaluationContext,
      'heroAddress',
    ],
  ];

  for (const [label, hostileCtx, field] of hostile) {
    it(`returns invalid-context for ${label}`, () => {
      const sheet = build({ A1: '=ROW(SELF)' });
      expect(evaluateCell(sheet, { address: 'A1' }, hostileCtx)).toEqual({
        ok: false,
        error: { kind: 'invalid-context', field },
      });
    });

    it(`still reports cell-not-found first for ${label}`, () => {
      const sheet = build({ A1: '=ROW(SELF)' });
      expect(evaluateCell(sheet, { address: 'M1' }, hostileCtx)).toEqual({
        ok: false,
        error: { kind: 'cell-not-found' },
      });
    });
  }
});
