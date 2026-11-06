import { afterEach, describe, expect, it, vi } from 'vitest';
import * as graphModule from './graph';
import { recalculate } from './recalculator';
import { createSheet, getValueByAddress, setCellName, setRawText } from './sheet';
import type { Sheet } from './sheet';
import type { EvaluationContext } from './context';
import type { Value } from './values';

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return { heroAddress: { col: 1, row: 1 }, random: () => 0.5, ...over };
}

function build(cells: Record<string, string>): Sheet {
  const sheet = createSheet();
  for (const [addr, raw] of Object.entries(cells)) {
    const r = setRawText(sheet, addr, raw);
    if (!r.accepted) throw new Error(`bad setup ${addr}`);
  }
  return sheet;
}

function val(sheet: Sheet, addr: string): Value {
  const r = getValueByAddress(sheet, addr);
  if (!r.ok) throw new Error('missing');
  return r.value;
}

function scripted(numbers: number[]): { random: () => number; calls: () => number } {
  let i = 0;
  return {
    random: () => {
      const n = numbers[i] ?? 0;
      i += 1;
      return n;
    },
    calls: () => i,
  };
}

describe('recalculate', () => {
  it('evaluates dependents defined before their dependencies', () => {
    const sheet = build({ A1: '=B1+1', B1: '=C1*2', C1: '5' });
    expect(recalculate(sheet, ctx())).toEqual({ accepted: true, cycleCells: [] });
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 11 });
    expect(getValueByAddress(sheet, 'A1')).toMatchObject({ stale: false });
  });

  it('sets a cycle, clears it by an edit, and a Rule_Cell regains its rule Value', () => {
    const sheet = build({ A1: '=B1', B1: '=A1', C1: '=TOWARD(HERO)', D1: '=C1' });
    const first = recalculate(sheet, ctx());
    expect(first).toEqual({ accepted: true, cycleCells: ['A1', 'B1'] });
    expect(val(sheet, 'A1')).toMatchObject({
      kind: 'error',
      error: '#CYCLE!',
      origin: 'A1',
      cause: 'A1 is on a circular reference with B1',
    });
    expect(val(sheet, 'C1')).toEqual({ kind: 'rule', text: '=TOWARD(HERO)' });

    // A Rule_Cell that joins the cycle holds #CYCLE!, then regains its rule Value.
    setRawText(sheet, 'B1', '=C1');
    setRawText(sheet, 'C1', '=TOWARD(HERO)+B1');
    recalculate(sheet, ctx());
    expect(val(sheet, 'C1')).toMatchObject({ error: '#CYCLE!' });

    setRawText(sheet, 'B1', '7');
    setRawText(sheet, 'C1', '=TOWARD(HERO)');
    expect(recalculate(sheet, ctx())).toEqual({ accepted: true, cycleCells: [] });
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 7 });
    expect(val(sheet, 'C1')).toEqual({ kind: 'rule', text: '=TOWARD(HERO)' });
  });

  it('reports a self reference with its own cause', () => {
    const sheet = build({ B1: '=B1+1' });
    recalculate(sheet, ctx());
    expect(val(sheet, 'B1')).toMatchObject({ error: '#CYCLE!', cause: 'B1 refers to itself' });
  });

  it('propagates #CYCLE! downstream', () => {
    const sheet = build({ A1: '=A1', B1: '=A1+1', C1: '=B1*2' });
    expect(recalculate(sheet, ctx())).toEqual({ accepted: true, cycleCells: ['A1'] });
    expect(val(sheet, 'C1')).toMatchObject({ error: '#CYCLE!', origin: 'A1' });
  });

  it('ignores an untaken IF branch as an operand but keeps it as an edge', () => {
    const sheet = build({ A1: '=IF(TRUE, 1, B1)', B1: '=A1' });
    expect(recalculate(sheet, ctx())).toEqual({ accepted: true, cycleCells: ['A1', 'B1'] });
    const ok = build({ A1: '=IF(TRUE, 1, B1)', B1: '=1/0' });
    recalculate(ok, ctx());
    expect(val(ok, 'A1')).toEqual({ kind: 'number', value: 1 });
  });

  it('gives #CYCLE! from a Range member', () => {
    const sheet = build({ A1: '=SUM(B1:B3)', B2: '=A1' });
    recalculate(sheet, ctx());
    expect(val(sheet, 'A1')).toMatchObject({ error: '#CYCLE!' });
    expect(val(sheet, 'B2')).toMatchObject({ error: '#CYCLE!' });
  });

  it('puts #CYCLE! on a Rule_Cell on a cycle', () => {
    const sheet = build({ A1: '=TOWARD(B1)', B1: '=A1' });
    recalculate(sheet, ctx());
    expect(val(sheet, 'A1')).toMatchObject({ error: '#CYCLE!' });
  });

  it('gives #VALUE! naming the Rule_Cell to a reader', () => {
    const sheet = build({ A1: '=TOWARD(HERO)', B1: '=A1' });
    recalculate(sheet, ctx());
    const v = val(sheet, 'B1');
    expect(v).toMatchObject({ kind: 'error', error: '#VALUE!' });
    expect(v.kind === 'error' && v.cause).toContain('A1');
  });

  it('draws random numbers in evaluation order and never for Rule_Cells', () => {
    const sheet = build({
      A1: '=RAND()+B1',
      B1: '=RAND()',
      C1: '=IF(RAND()>2, SELF, 1)',
      D1: '=TOWARD(HERO)+RAND()',
    });
    const src = scripted([0.25, 0.75, 0.5]);
    recalculate(sheet, ctx({ random: src.random }));
    // B1 first (dependency), then A1.
    expect(val(sheet, 'B1')).toEqual({ kind: 'number', value: 0.25 });
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 1 });
    expect(src.calls()).toBe(2);
    expect(val(sheet, 'C1')).toEqual({ kind: 'rule', text: '=IF(RAND()>2, SELF, 1)' });
  });

  it('ignores selfAddress', () => {
    const sheet = build({ A1: '=SELF', B1: '=ROW(SELF)', C1: '=SUM(1,2)' });
    recalculate(sheet, ctx({ selfAddress: { col: 2, row: 2 } }));
    expect(val(sheet, 'A1')).toEqual({ kind: 'rule', text: '=SELF' });
    expect(val(sheet, 'B1')).toEqual({ kind: 'rule', text: '=ROW(SELF)' });
    expect(val(sheet, 'C1')).toEqual({ kind: 'number', value: 3 });
  });

  it('gives #REF! for HERO outside the Sheet', () => {
    const sheet = build({ A1: '=HERO', B1: '=ROW(HERO)' });
    recalculate(sheet, ctx({ heroAddress: { col: 30, row: 30 } }));
    expect(val(sheet, 'A1')).toMatchObject({ error: '#REF!' });
    expect(val(sheet, 'B1')).toMatchObject({ error: '#REF!' });
  });

  it('reads the hero Cell value after evaluating it', () => {
    const sheet = build({ A1: '=HERO', L20: '=2+2' });
    recalculate(sheet, ctx({ heroAddress: { col: 12, row: 20 } }));
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 4 });
  });

  it('resolves Cell_Names', () => {
    const sheet = build({ A1: '=HP*2', B1: '21' });
    setCellName(sheet, 'B1', 'hp');
    recalculate(sheet, ctx());
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 42 });
  });

  it('refuses an invalid context and changes nothing', () => {
    const sheet = build({ A1: '=1+1' });
    recalculate(sheet, ctx());
    setRawText(sheet, 'A1', '=5');
    const bad = recalculate(sheet, { random: () => 0 } as unknown as EvaluationContext);
    expect(bad).toEqual({ accepted: false, error: { kind: 'invalid-context', field: 'heroAddress' } });
    const bad2 = recalculate(sheet, {
      heroAddress: { col: 1, row: 1 },
      random: 1,
    } as unknown as EvaluationContext);
    expect(bad2).toEqual({ accepted: false, error: { kind: 'invalid-context', field: 'random' } });
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 2 });
    expect(getValueByAddress(sheet, 'A1')).toMatchObject({ stale: true });
  });

  describe('performance on full-sheet cycles', () => {
    const addresses: string[] = [];
    for (let row = 1; row <= 20; row += 1) {
      for (let col = 0; col < 12; col += 1) addresses.push(`${String.fromCharCode(65 + col)}${row}`);
    }

    it('recalculates 240 cells all =SUM(A1:L20) in under 1 second', () => {
      const sheet = build(Object.fromEntries(addresses.map((a) => [a, '=SUM(A1:L20)'])));
      const start = performance.now();
      const result = recalculate(sheet, ctx());
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(result).toEqual({ accepted: true, cycleCells: [...addresses].sort(byIndex) });
      for (const a of addresses) expect(val(sheet, a)).toMatchObject({ error: '#CYCLE!' });
      expect(val(sheet, 'B1')).toMatchObject({
        cause: expect.stringMatching(/^B1 is on a circular reference with A1, C1,/) as unknown,
      });
    });

    it('recalculates a 240-cell circular chain in under 1 second', () => {
      const cells: Record<string, string> = {};
      addresses.forEach((a, i) => {
        cells[a] = `=${addresses[(i + 1) % addresses.length]}`;
      });
      const sheet = build(cells);
      const start = performance.now();
      const result = recalculate(sheet, ctx());
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000);
      expect(result.accepted && result.cycleCells.length).toBe(240);
      for (const a of addresses) expect(val(sheet, a)).toMatchObject({ error: '#CYCLE!' });
    });

    function byIndex(a: string, b: string): number {
      return addresses.indexOf(a) - addresses.indexOf(b);
    }
  });

  it.each([
    ['', { kind: 'string', value: '' }],
    ['12', { kind: 'number', value: 12 }],
    ['-3.5', { kind: 'number', value: -3.5 }],
    ['+4', { kind: 'number', value: 4 }],
    ['007', { kind: 'number', value: 7 }],
    ['1e3', { kind: 'string', value: '1e3' }],
    [' 5', { kind: 'string', value: ' 5' }],
    ['0x10', { kind: 'string', value: '0x10' }],
    ['5.', { kind: 'string', value: '5.' }],
    ['.5', { kind: 'string', value: '.5' }],
    ['hello', { kind: 'string', value: 'hello' }],
    ['1'.repeat(400), { kind: 'string', value: '1'.repeat(400) }],
  ])('classifies literal %j', (raw, expected) => {
    const sheet = build(raw === '' ? {} : { A1: raw });
    recalculate(sheet, ctx());
    expect(val(sheet, 'A1')).toEqual(expected);
  });
});

describe('recalculate with a hostile context', () => {
  const hostile: Array<[string, () => EvaluationContext, 'heroAddress' | 'random']> = [
    [
      'a heroAddress getter that throws',
      () =>
        ({
          get heroAddress(): never {
            throw new Error('hero getter');
          },
          random: () => 0.5,
        }) as unknown as EvaluationContext,
      'heroAddress',
    ],
    [
      'a random getter that throws',
      () =>
        ({
          heroAddress: { col: 1, row: 1 },
          get random(): never {
            throw new Error('random getter');
          },
        }) as unknown as EvaluationContext,
      'random',
    ],
    [
      'a Proxy that throws on every get',
      () =>
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
    [
      'a heroAddress whose col getter throws',
      () =>
        ({
          heroAddress: {
            get col(): never {
              throw new Error('col getter');
            },
            row: 1,
          },
          random: () => 0.5,
        }) as unknown as EvaluationContext,
      'heroAddress',
    ],
  ];

  for (const [label, make, field] of hostile) {
    it(`returns invalid-context for ${label}`, () => {
      const sheet = build({ A1: '5', B1: '=A1+1' });
      expect(recalculate(sheet, make())).toEqual({
        accepted: false,
        error: { kind: 'invalid-context', field },
      });
      // Nothing was stored: the sheet is still stale.
      expect(getValueByAddress(sheet, 'B1')).toMatchObject({ stale: true });
    });
  }
});

describe('literal -0', () => {
  it('is stored as 0, not -0', () => {
    const sheet = build({ A1: '-0', B1: '-0.0', C1: '+0' });
    recalculate(sheet, ctx());
    for (const addr of ['A1', 'B1', 'C1']) {
      const v = val(sheet, addr);
      expect(v).toEqual({ kind: 'number', value: 0 });
      expect(v.kind === 'number' && Object.is(v.value, 0)).toBe(true);
    }
  });
});

describe('recalculation speed without a cycle', () => {
  it('finishes 240 formula cells with several large Ranges each in under 5,000 ms', () => {
    const cells: Record<string, string> = {};
    // Rows 2..20: each formula reads four large Ranges covering every cell in the rows above it,
    // so each reads up to 7 x 228 cells. References only point upward, so there is no cycle.
    for (let row = 2; row <= 20; row += 1) {
      for (let col = 1; col <= 12; col += 1) {
        const above = `A1:L${row - 1}`;
        cells[`${String.fromCharCode(64 + col)}${row}`] =
          `=SUM(${above}, ${above}) + MIN(${above}, ${above}) + MAX(${above}, ${above}) + SUM(${above})`;
      }
    }
    // Row 1: formulas too, each reading only the cell to its left (a chain, no cycle), so all 240 are formulas.
    for (let col = 1; col <= 12; col += 1) {
      const self = `${String.fromCharCode(64 + col)}1`;
      const prev = col === 1 ? '1' : `${String.fromCharCode(63 + col)}1`;
      cells[self] = `=${prev} + 1`;
    }
    expect(Object.keys(cells)).toHaveLength(240);
    const sheet = build(cells);

    const started = performance.now();
    const result = recalculate(sheet, ctx());
    const elapsed = performance.now() - started;

    expect(result).toEqual({ accepted: true, cycleCells: [] });
    expect(elapsed).toBeLessThan(5000);
    // Every cell is a formula and none is an error.
    for (const addr of ['A1', 'L1', 'A2', 'L20']) expect(val(sheet, addr).kind).toBe('number');
  });
});

describe('recalculate with an internal fault', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a refused internal-error result instead of throwing, and stores nothing', () => {
    const sheet = build({ A1: '5', B1: '=A1+1' });
    vi.spyOn(graphModule, 'buildGraph').mockImplementation(() => {
      throw new Error('forced fault');
    });
    expect(recalculate(sheet, ctx())).toEqual({
      accepted: false,
      error: { kind: 'internal-error' },
    });
    vi.restoreAllMocks();
    expect(getValueByAddress(sheet, 'B1')).toMatchObject({ stale: true });
    expect(recalculate(sheet, ctx())).toEqual({ accepted: true, cycleCells: [] });
  });
});

describe('#CYCLE! causes name a named origin', () => {
  it('starts the cause with the address and the name', () => {
    const sheet = build({ A1: '=B1', B1: '=A1' });
    setCellName(sheet, 'A1', 'loop_a');
    recalculate(sheet, ctx());
    expect(val(sheet, 'A1')).toMatchObject({
      error: '#CYCLE!',
      origin: 'A1',
      cause: 'A1 (LOOP_A) is on a circular reference with B1',
    });
    expect(val(sheet, 'B1')).toMatchObject({ cause: 'B1 is on a circular reference with A1' });
  });
});

describe('HERO on a cycle, read through a function with the wrong argument count', () => {
  const heroOnC3 = (): EvaluationContext => ctx({ heroAddress: { col: 3, row: 3 } });

  for (const formula of ['=ROW(HERO, 1)', '=DIST(HERO)']) {
    it(`${formula} gives #CYCLE! when the hero Cell is on a cycle`, () => {
      // A1 comes before C3 in reading order, so it is evaluated first unless the HERO edge orders it.
      const sheet = build({ A1: formula, C3: '=D3', D3: '=C3' });
      recalculate(sheet, heroOnC3());
      expect(val(sheet, 'A1')).toMatchObject({ kind: 'error', error: '#CYCLE!' });
    });
  }

  it('a valid-count ROW(HERO) is unaffected by the cycle', () => {
    const sheet = build({ A1: '=ROW(HERO)', C3: '=D3', D3: '=C3' });
    recalculate(sheet, heroOnC3());
    expect(val(sheet, 'A1')).toEqual({ kind: 'number', value: 3 });
  });
});
