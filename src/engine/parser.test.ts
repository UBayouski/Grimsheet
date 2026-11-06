import { describe, expect, it } from 'vitest';
import type { Node } from './ast';
import { parseFormula } from './parser';

function parseOk(text: string): Node {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(`expected ok for ${text}, got ${result.error.text}`);
  return result.ast;
}

function parseErr(text: string): { column: number; message: string; text: string } {
  const result = parseFormula(text);
  if (result.ok) throw new Error(`expected an error for ${text}`);
  return result.error;
}

const num = (value: number): Node => ({ kind: 'number', value });
const bin = (op: string, left: Node, right: Node): Node =>
  ({ kind: 'binary', op, left, right }) as Node;

describe('parseFormula: precedence and shape', () => {
  it('is left associative: 1-2-3', () => {
    expect(parseOk('=1-2-3')).toEqual(bin('-', bin('-', num(1), num(2)), num(3)));
  });

  it('multiplies before adding: 1+2*3', () => {
    expect(parseOk('=1+2*3')).toEqual(bin('+', num(1), bin('*', num(2), num(3))));
  });

  it('joins before comparing: 1&2=3', () => {
    expect(parseOk('=1&2=3')).toEqual(bin('=', bin('&', num(1), num(2)), num(3)));
  });

  it('binds unary minus tighter than *: -2*3', () => {
    expect(parseOk('=-2*3')).toEqual(
      bin('*', { kind: 'negate', operand: num(2) }, num(3)),
    );
  });

  it('nests unary minus: --3', () => {
    expect(parseOk('=--3')).toEqual({
      kind: 'negate',
      operand: { kind: 'negate', operand: num(3) },
    });
  });

  it('groups with parentheses: (1+2)*3', () => {
    expect(parseOk('=(1+2)*3')).toEqual(bin('*', bin('+', num(1), num(2)), num(3)));
  });

  it('parses a range as a function argument', () => {
    expect(parseOk('=SUM(A1:A3)')).toEqual({
      kind: 'call',
      name: 'SUM',
      args: [
        {
          kind: 'range',
          from: { kind: 'cell', col: 1, row: 1 },
          to: { kind: 'cell', col: 1, row: 3 },
        },
      ],
    });
  });

  it('reads A01 as A1', () => {
    expect(parseOk('=A01')).toEqual({ kind: 'cell', col: 1, row: 1 });
  });
});

describe('parseFormula: ranges only as direct function arguments', () => {
  it('rejects a range inside an expression at the range start', () => {
    const error = parseErr('=SUM(A1:A3+1)');
    expect(error.column).toBe(6);
  });

  it('rejects a bare range at the range start', () => {
    expect(parseErr('=A1:A3').column).toBe(2);
  });

  it('rejects a parenthesized range at the range start', () => {
    expect(parseErr('=(A1:A3)').column).toBe(3);
  });
});

describe('parseFormula: error columns and format', () => {
  it('reports an unexpected token at its column', () => {
    const error = parseErr('=1+*2');
    expect(error.column).toBe(4);
    expect(error.text).toBe(`Col 4: ${error.message}.`);
  });

  it('reports end of input at length + 1', () => {
    const text = '=1+';
    expect(parseErr(text).column).toBe(text.length + 1);
  });

  it('reports a leftover token at its column', () => {
    expect(parseErr('=1 2').column).toBe(4);
  });

  it('reports a missing leading = at Col 1', () => {
    expect(parseErr('1+2').column).toBe(1);
  });

  it('lets the lowest column win when a lexical error follows a syntax error', () => {
    expect(parseErr('=1+*2 @').column).toBe(4);
  });

  it('lets a lexical error win when it comes first', () => {
    expect(parseErr('=1 @ +*').column).toBe(4);
  });

  it('uses the Col N: <message>. format with at most 80 characters of message', () => {
    const inputs = [
      '=1+',
      '=(1',
      '=1 2',
      '=)',
      '=SUM(1,',
      '=A1:A3',
      '=1+*2',
      `=${'\u0001'.repeat(50)}`,
      `=${'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'} ${'Y'.repeat(60)}`,
      `=1 ${'"x'.repeat(5)}`,
    ];
    for (const input of inputs) {
      const result = parseFormula(input);
      if (result.ok) continue;
      expect(result.error.text).toBe(`Col ${result.error.column}: ${result.error.message}.`);
      expect(result.error.message.length).toBeLessThanOrEqual(80);
      expect(result.error.text).toMatch(/^Col \d+: .+\.$/);
    }
  });
});

describe('parseFormula: depth cap of 200', () => {
  // Each builder makes a nest of depth n: n parentheses, or a tree of height n.
  const forms: Record<string, (n: number) => string> = {
    parentheses: (n) => `=${'('.repeat(n)}1${')'.repeat(n)}`,
    'unary minus': (n) => `=${'-'.repeat(n - 1)}1`,
    calls: (n) => `=${'ABS('.repeat(n - 1)}1${')'.repeat(n - 1)}`,
    'binary chain': (n) => `=1${'+1'.repeat(n - 1)}`,
  };

  for (const [form, build] of Object.entries(forms)) {
    describe(form, () => {
      it('accepts depth 200', () => {
        expect(parseFormula(build(200)).ok).toBe(true);
      });

      it('rejects depth 201', () => {
        const result = parseFormula(build(201));
        expect(result.ok).toBe(false);
      });

      it('rejects depth 100000 without throwing', () => {
        const result = parseFormula(build(100000));
        expect(result.ok).toBe(false);
      });
    });
  }
});

describe('parseFormula: never throws', () => {
  it('returns a result for odd input', () => {
    const inputs = ['', '=', '==', '=(', '=)', '="', '=\u0000', '=\ud800', '=SUM(', '=A1:', '=:', '=1e999'];
    for (const input of inputs) {
      expect(() => parseFormula(input)).not.toThrow();
    }
  });
});
