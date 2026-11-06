import { describe, expect, it } from 'vitest';
import { MAX_DEPTH } from './ast';
import type { Node } from './ast';
import { parseFormula } from './parser';
import { printFormula } from './printer';

function parse(text: string): Node {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(`parse failed: ${text}`);
  return result.ast;
}

function print(text: string): string {
  const result = printFormula(parse(text));
  if (!result.ok) throw new Error(`print refused: ${result.error.detail}`);
  return result.text;
}

/** The detail text of a refusal. */
function refusal(node: unknown): string {
  const result = printFormula(node as Node);
  if (result.ok) throw new Error(`expected refusal, got ${result.text}`);
  return result.error.detail;
}

/** The error kind of a refusal. */
function refusalKind(node: unknown): string {
  const result = printFormula(node as Node);
  if (result.ok) throw new Error(`expected refusal, got ${result.text}`);
  return result.error.kind;
}

describe('printFormula parentheses', () => {
  it('keeps parentheses that change the grouping', () => {
    expect(print('=(1+2)*3')).toBe('=(1 + 2) * 3');
    expect(print('=1-(2-3)')).toBe('=1 - (2 - 3)');
    expect(print('=-(1+2)')).toBe('=-(1 + 2)');
    expect(print('=1=(2=3)')).toBe('=1 = (2 = 3)');
  });

  it('treats comparisons as left-associative', () => {
    // (1=2)=3 groups the same way as 1=2=3, so the parentheses are redundant.
    expect(print('=(1=2)=3')).toBe('=1 = 2 = 3');
    expect(parse('=(1=2)=3')).toEqual(parse('=1=2=3'));
  });

  it('drops parentheses that do not matter', () => {
    expect(print('=(1*2)+3')).toBe('=1 * 2 + 3');
    expect(print('=(1-2)-3')).toBe('=1 - 2 - 3');
    expect(print('=((4))')).toBe('=4');
    expect(print('=(1+2)&"a"')).toBe('=1 + 2 & "a"');
  });

  it('prints a double negation', () => {
    expect(print('=--3')).toBe('=--3');
  });
});

describe('printFormula text form', () => {
  it('puts one space around binary operators', () => {
    expect(print('=1+2')).toBe('=1 + 2');
    expect(print('=1   <=   2')).toBe('=1 <= 2');
    expect(print('=A1&B1')).toBe('=A1 & B1');
    expect(print('=1<>2')).toBe('=1 <> 2');
  });

  it('puts ", " between call arguments', () => {
    expect(print('=MOD(7,2)')).toBe('=MOD(7, 2)');
    expect(print('=IF(TRUE,1,2)')).toBe('=IF(TRUE, 1, 2)');
    expect(print('=RAND()')).toBe('=RAND()');
  });

  it('upper-cases names, cells, calls and booleans', () => {
    expect(print('=sum(a1:b2)')).toBe('=SUM(A1:B2)');
    expect(print('=hp')).toBe('=HP');
    expect(print('=true')).toBe('=TRUE');
    expect(print('=if(false,b9,self)')).toBe('=IF(FALSE, B9, SELF)');
  });

  it('escapes quotes in strings by doubling them', () => {
    expect(print('="say ""hi"""')).toBe('="say ""hi"""');
    expect(
      printFormula({ kind: 'string', value: 'a"b' }),
    ).toEqual({ ok: true, text: '="a""b"' });
    expect(print('=""')).toBe('=""');
  });

  it('prints numbers', () => {
    expect(print('=3')).toBe('=3');
    expect(print('=2.5')).toBe('=2.5');
  });

  it('allows a range as a function argument', () => {
    expect(print('=SUM(A14:A20, 1)')).toBe('=SUM(A14:A20, 1)');
  });
});

describe('printFormula round trip', () => {
  const formulas = [
    '=1',
    '=2.5',
    '="text"',
    '="a ""quoted"" word"',
    '=TRUE',
    '=B9',
    '=HP',
    '=-A1',
    '=--3',
    '=-(1+2)',
    '=(1+2)*3',
    '=1-(2-3)',
    '=1-2-3',
    '=2*(3+4)/5',
    '=8/(4/2)',
    '=(1=2)=3',
    '=1<2',
    '=A1&"x"&B2',
    '=("a"&"b")=("ab")',
    '=SUM(A14:A20)',
    '=MAX(1, A1, SUM(B1:B3))',
    '=IF(DIST(HERO, SELF) < 3, TOWARD(HERO), "-")',
    '=AND(TRUE, NOT(FALSE), OR(A1>1, A2<=2))',
    '=MOD(ABS(-7), 3)',
    '=ROW(B3)+COL(C4)',
    '=RAND()*10',
    '=-(-(-1))',
    '=(((1)))',
  ];

  it.each(formulas)('parse, print, parse is stable for %s', (formula) => {
    const first = parse(formula);
    const printed = printFormula(first);
    expect(printed.ok).toBe(true);
    if (!printed.ok) return;
    const second = parse(printed.text);
    expect(second).toEqual(first);
    const again = printFormula(second);
    expect(again).toEqual(printed);
  });
});

describe('printFormula refusals', () => {
  const cell = { kind: 'cell', col: 1, row: 1 } as const;
  const one = { kind: 'number', value: 1 } as const;

  it('refuses non-finite and negative numbers', () => {
    expect(refusal({ kind: 'number', value: Number.NaN })).toBeTruthy();
    expect(refusal({ kind: 'number', value: Number.POSITIVE_INFINITY })).toBeTruthy();
    expect(refusal({ kind: 'number', value: -1 })).toBeTruthy();
    expect(refusal({ kind: 'number', value: -0 })).toBeTruthy();
    expect(refusal({ kind: 'number', value: '1' })).toBeTruthy();
  });

  it('refuses malformed strings, booleans and names', () => {
    expect(refusal({ kind: 'string', value: 5 })).toBeTruthy();
    expect(refusal({ kind: 'boolean', value: 'yes' })).toBeTruthy();
    expect(refusal({ kind: 'name', name: '' })).toBeTruthy();
    expect(refusal({ kind: 'name' })).toBeTruthy();
  });

  it('refuses out-of-range cells', () => {
    expect(refusal({ kind: 'cell', col: 0, row: 1 })).toBeTruthy();
    expect(refusal({ kind: 'cell', col: 27, row: 1 })).toBeTruthy();
    expect(refusal({ kind: 'cell', col: 1.5, row: 1 })).toBeTruthy();
    expect(refusal({ kind: 'cell', col: 1, row: -1 })).toBeTruthy();
    expect(refusal({ kind: 'cell', col: 1, row: 1_000_001 })).toBeTruthy();
    expect(refusal({ kind: 'cell', col: 1, row: 0.5 })).toBeTruthy();
  });

  it('refuses a range outside a function argument', () => {
    expect(refusal({ kind: 'range', from: cell, to: cell })).toMatch(/range/);
    expect(
      refusal({ kind: 'binary', op: '+', left: { kind: 'range', from: cell, to: cell }, right: one }),
    ).toMatch(/range/);
    expect(refusal({ kind: 'negate', operand: { kind: 'range', from: cell, to: cell } })).toMatch(/range/);
  });

  it('refuses a range whose ends are not cells', () => {
    expect(refusal({ kind: 'call', name: 'SUM', args: [{ kind: 'range', from: one, to: cell }] })).toMatch(
      /cells/,
    );
    expect(refusal({ kind: 'call', name: 'SUM', args: [{ kind: 'range', from: cell, to: undefined }] })).toBeTruthy();
  });

  it('refuses unknown operators and node kinds', () => {
    expect(refusal({ kind: 'binary', op: '^', left: one, right: one })).toMatch(/operator/);
    expect(refusal({ kind: 'mystery' })).toMatch(/node kind/);
  });

  it('refuses missing children', () => {
    expect(refusal(null)).toBeTruthy();
    expect(refusal(undefined)).toBeTruthy();
    expect(refusal({ kind: 'negate' })).toBeTruthy();
    expect(refusal({ kind: 'binary', op: '+', left: one })).toBeTruthy();
    expect(refusal({ kind: 'call', name: 'SUM', args: [null] })).toBeTruthy();
  });

  it('refuses malformed calls', () => {
    expect(refusal({ kind: 'call', name: '', args: [] })).toBeTruthy();
    expect(refusal({ kind: 'call', name: 'SUM' })).toBeTruthy();
    expect(refusal({ kind: 'call', name: 'SUM', args: 'x' })).toBeTruthy();
  });

  it('refuses a tree nested deeper than MAX_DEPTH, and accepts one at the limit', () => {
    const nest = (levels: number): Node => {
      let node: Node = one;
      for (let i = 1; i < levels; i += 1) node = { kind: 'negate', operand: node };
      return node;
    };
    expect(printFormula(nest(MAX_DEPTH)).ok).toBe(true);
    expect(refusal(nest(MAX_DEPTH + 1))).toMatch(/deeply/);
    expect(refusal(nest(50_000))).toMatch(/deeply/);
  });

  it('never returns partial text on refusal', () => {
    const result = printFormula({ kind: 'binary', op: '+', left: one, right: null } as unknown as Node);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'invalid-node', detail: expect.any(String) },
    });
    expect('text' in result).toBe(false);
  });

  it('reports non-finite-number only for a non-finite number node', () => {
    expect(refusalKind({ kind: 'number', value: Number.NaN })).toBe('non-finite-number');
    expect(refusalKind({ kind: 'number', value: Number.POSITIVE_INFINITY })).toBe('non-finite-number');
    expect(refusalKind({ kind: 'number', value: Number.NEGATIVE_INFINITY })).toBe('non-finite-number');
    expect(refusalKind({ kind: 'binary', op: '+', left: one, right: { kind: 'number', value: Number.NaN } })).toBe(
      'non-finite-number',
    );
  });

  it('reports invalid-node for every other refusal', () => {
    expect(refusalKind({ kind: 'number', value: -1 })).toBe('invalid-node');
    expect(refusalKind({ kind: 'number', value: '1' })).toBe('invalid-node');
    expect(refusalKind({ kind: 'range', from: cell, to: cell })).toBe('invalid-node');
    expect(refusalKind({ kind: 'cell', col: 27, row: 1 })).toBe('invalid-node');
    expect(refusalKind({ kind: 'mystery' })).toBe('invalid-node');
    expect(refusalKind(null)).toBe('invalid-node');
  });
});
