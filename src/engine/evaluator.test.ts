import { describe, expect, it } from 'vitest';
import type { GridPoint } from './address';
import type { CellNode, Node } from './ast';
import { evaluateAst, type CellView, type EvalEnv } from './evaluator';
import { parseFormula } from './parser';
import {
  booleanValue,
  errorValue,
  numberValue,
  ruleValue,
  stringValue,
  type Value,
} from './values';

const EMPTY_CELL: CellView = { empty: true, name: null, value: stringValue('') };

interface EnvOptions {
  readonly cells?: Record<string, CellView>; // keyed "col,row"
  readonly names?: Record<string, GridPoint>;
  readonly hero?: GridPoint;
  readonly self?: GridPoint;
  readonly origin?: GridPoint;
}

function key(p: GridPoint): string {
  return `${p.col},${p.row}`;
}

function makeEnv(options: EnvOptions = {}): EvalEnv {
  const cells = options.cells ?? {};
  const names = options.names ?? {};
  return {
    origin: options.origin ?? { col: 2, row: 9 }, // B9
    cellAt: (p) => cells[key(p)] ?? EMPTY_CELL,
    resolveName: (upper) => names[upper],
    hero: options.hero ?? { col: 1, row: 1 },
    self: options.self,
    random: () => 0.5,
  };
}

function run(text: string, options?: EnvOptions): Value {
  const parsed = parseFormula(text);
  if (!parsed.ok) throw new Error(`parse failed: ${text}`);
  return evaluateAst(parsed.ast, makeEnv(options));
}

function cell(col: number, row: number): CellNode {
  return { kind: 'cell', col, row } as CellNode;
}

function runAst(ast: Node, options?: EnvOptions): Value {
  return evaluateAst(ast, makeEnv(options));
}

function errorOf(value: Value): { error: string; cause: string } {
  if (value.kind !== 'error') throw new Error(`expected an error, got ${value.kind}`);
  return { error: value.error, cause: value.cause };
}

describe('empty Cell', () => {
  it('reads as 0 for a plain reference', () => {
    expect(run('=A1')).toEqual(numberValue(0));
  });

  it('acts as 0 in arithmetic', () => {
    expect(run('=A1+5')).toEqual(numberValue(5));
    expect(run('=5-A1')).toEqual(numberValue(5));
    expect(run('=A1*5')).toEqual(numberValue(0));
    expect(run('=-A1')).toEqual(numberValue(0));
    expect(run('=A1+A1')).toEqual(numberValue(0));
  });

  it('divides as 0', () => {
    expect(run('=A1/5')).toEqual(numberValue(0));
    expect(errorOf(run('=5/A1')).error).toBe('#DIV/0!');
  });

  it('acts as empty text for &', () => {
    expect(run('="x"&A1')).toEqual(stringValue('x'));
    expect(run('=A1&"y"')).toEqual(stringValue('y'));
  });

  it('takes the type of the other side in comparisons', () => {
    expect(run('=A1=0')).toEqual(booleanValue(true));
    expect(run('=A1<>0')).toEqual(booleanValue(false));
    expect(run('=A1<1')).toEqual(booleanValue(true));
    expect(run('=A1>-1')).toEqual(booleanValue(true));
    expect(run('=A1<=0')).toEqual(booleanValue(true));
    expect(run('=A1>=0')).toEqual(booleanValue(true));
    expect(run('=A1=""')).toEqual(booleanValue(true));
    expect(run('=A1=FALSE')).toEqual(booleanValue(true));
    expect(run('=A1=TRUE')).toEqual(booleanValue(false));
    expect(run('=A1=A1')).toEqual(booleanValue(true));
  });
});

describe('references', () => {
  it('gives #REF! for an out-of-sheet cell', () => {
    const result = errorOf(run('=M1'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('M1');
    expect(errorOf(run('=A21+1')).error).toBe('#REF!');
  });

  it('gives #REF! for an out-of-sheet range end', () => {
    const range: Node = { kind: 'range', from: cell(1, 1), to: cell(13, 1) };
    expect(errorOf(runAst(range)).error).toBe('#REF!');
  });

  it('gives #REF! for an unknown name', () => {
    const result = errorOf(run('=GHOST'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('GHOST');
  });

  it('resolves a known name to its cell value', () => {
    const options: EnvOptions = {
      names: { HP: { col: 3, row: 14 } },
      cells: { '3,14': { empty: false, name: 'HP', value: numberValue(7) } },
    };
    expect(run('=HP+1', options)).toEqual(numberValue(8));
  });

  it('gives #REF! for a range used as a plain value', () => {
    // The parser only allows ranges inside calls, so build the AST by hand.
    const range: Node = { kind: 'range', from: cell(1, 1), to: cell(1, 3) };
    const result = errorOf(runAst(range));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('A1:A3');
    const sum: Node = { kind: 'binary', op: '+', left: range, right: { kind: 'number', value: 1 } };
    expect(errorOf(runAst(sum)).error).toBe('#REF!');
  });
});

describe('HERO and SELF', () => {
  it('resolves HERO to the hero cell value', () => {
    const options: EnvOptions = {
      hero: { col: 2, row: 3 },
      cells: { '2,3': { empty: false, name: null, value: stringValue('.') } },
    };
    expect(run('=HERO', options)).toEqual(stringValue('.'));
  });

  it('gives #REF! when HERO is off the sheet', () => {
    expect(errorOf(run('=HERO', { hero: { col: 0, row: 0 } })).error).toBe('#REF!');
  });

  it('resolves SELF when a monster is bound', () => {
    const options: EnvOptions = {
      self: { col: 4, row: 5 },
      cells: { '4,5': { empty: false, name: null, value: numberValue(9) } },
    };
    expect(run('=SELF', options)).toEqual(numberValue(9));
  });

  it('gives #REF! for SELF when no monster is bound', () => {
    const result = errorOf(run('=SELF'));
    expect(result.error).toBe('#REF!');
    expect(result.cause).toContain('SELF');
  });
});

describe('Rule_Cell reference', () => {
  it('gives #VALUE! naming the Rule_Cell', () => {
    const options: EnvOptions = {
      cells: { '2,14': { empty: false, name: 'MOVE_M1', value: ruleValue('=TOWARD(HERO)') } },
    };
    const result = errorOf(run('=B14', options));
    expect(result.error).toBe('#VALUE!');
    expect(result.cause).toContain('B14');
    expect(result.cause).toContain('MOVE_M1');
  });

  it('names an unnamed Rule_Cell by address', () => {
    const options: EnvOptions = {
      cells: { '2,14': { empty: false, name: null, value: ruleValue('=1') } },
    };
    const result = errorOf(run('=B14+1', options));
    expect(result.error).toBe('#VALUE!');
    expect(result.cause).toContain('B14');
  });
});

describe('types', () => {
  it('gives #VALUE! mixing text and numbers', () => {
    expect(errorOf(run('="a"+1')).error).toBe('#VALUE!');
    expect(errorOf(run('=1+"a"')).error).toBe('#VALUE!');
    expect(errorOf(run('=-"a"')).error).toBe('#VALUE!');
    expect(errorOf(run('=TRUE*2')).error).toBe('#VALUE!');
    expect(errorOf(run('="a"=1')).error).toBe('#VALUE!');
    expect(errorOf(run('=1<"a"')).error).toBe('#VALUE!');
  });

  it('compares text without regard to case', () => {
    expect(run('="a"="A"')).toEqual(booleanValue(true));
    expect(run('="a"<"B"')).toEqual(booleanValue(true));
    expect(run('="a"<>"A"')).toEqual(booleanValue(false));
    expect(run('="b"<"A"')).toEqual(booleanValue(false));
  });

  it('folds the sharp s to SS', () => {
    expect(run('="ß"="SS"')).toEqual(booleanValue(true));
  });

  it('joins text and numbers with &', () => {
    expect(run('="a"&1&TRUE')).toEqual(stringValue('a1TRUE'));
  });

  it('propagates operand errors', () => {
    expect(errorOf(run('=1/0+"a"')).error).toBe('#DIV/0!');
    expect(errorOf(run('=M1+1/0')).error).toBe('#REF!');
  });
});

function numCells(...values: number[]): Record<string, CellView> {
  const cells: Record<string, CellView> = {};
  values.forEach((n, i) => {
    cells[`1,${i + 1}`] = { empty: false, name: null, value: numberValue(n) };
  });
  return cells;
}

const CYCLE_CELLS: Record<string, CellView> = {
  '1,1': {
    empty: false,
    name: null,
    value: errorValue('#CYCLE!', 'A1 is on a circular reference', 'A1'),
  },
};

describe('function calls', () => {
  it('SUM, MIN and MAX take values and ranges', () => {
    expect(run('=SUM(1,2,3)')).toEqual(numberValue(6));
    expect(run('=MIN(4,2,9)')).toEqual(numberValue(2));
    expect(run('=MAX(4,2,9)')).toEqual(numberValue(9));
    const cells = numCells(1, 2, 3);
    expect(run('=SUM(A1:A3)', { cells })).toEqual(numberValue(6));
    expect(run('=SUM(A1:A3, 10)', { cells })).toEqual(numberValue(16));
    expect(run('=MIN(A1:A3)', { cells })).toEqual(numberValue(1));
    expect(run('=MAX(A1:A3)', { cells })).toEqual(numberValue(3));
    expect(run('=SUM(A3:A1)', { cells })).toEqual(numberValue(6));
  });

  it('ranges skip text and empty cells', () => {
    const cells: Record<string, CellView> = {
      ...numCells(1),
      '1,2': { empty: false, name: null, value: stringValue('x') },
    };
    expect(run('=SUM(A1:A3)', { cells })).toEqual(numberValue(1));
  });

  it('MIN and MAX over no numbers give #VALUE!', () => {
    expect(errorOf(run('=MIN(A1:A3)')).error).toBe('#VALUE!');
    expect(errorOf(run('=MAX(A1:A3)')).error).toBe('#VALUE!');
    expect(run('=SUM(A1:A3)')).toEqual(numberValue(0));
  });

  it('an error inside a range propagates', () => {
    const cells: Record<string, CellView> = {
      ...numCells(1, 2, 3),
      '1,2': { empty: false, name: null, value: errorValue('#DIV/0!', 'A2 divides by zero', 'A2') },
    };
    expect(errorOf(run('=SUM(A1:A3)', { cells })).error).toBe('#DIV/0!');
  });

  it('a range outside a range-taking argument gives #REF!', () => {
    expect(errorOf(run('=ABS(A1:A3)')).error).toBe('#REF!');
  });

  it('ABS and MOD', () => {
    expect(run('=ABS(-3)')).toEqual(numberValue(3));
    expect(run('=MOD(7,3)')).toEqual(numberValue(1));
    expect(errorOf(run('=MOD(7,0)')).error).toBe('#DIV/0!');
    expect(errorOf(run('=ABS("a")')).error).toBe('#VALUE!');
  });

  it('AND, OR and NOT', () => {
    expect(run('=AND(TRUE,FALSE)')).toEqual(booleanValue(false));
    expect(run('=AND(TRUE,TRUE)')).toEqual(booleanValue(true));
    expect(run('=OR(FALSE,TRUE)')).toEqual(booleanValue(true));
    expect(run('=OR(FALSE,FALSE)')).toEqual(booleanValue(false));
    expect(run('=NOT(FALSE)')).toEqual(booleanValue(true));
    expect(errorOf(run('=AND(TRUE,1)')).error).toBe('#VALUE!');
    expect(errorOf(run('=NOT("a")')).error).toBe('#VALUE!');
  });

  it('ROW, COL and DIST read cell references', () => {
    expect(run('=ROW(B9)')).toEqual(numberValue(9));
    expect(run('=COL(B9)')).toEqual(numberValue(2));
    expect(run('=DIST(A1,C3)')).toEqual(numberValue(4));
    expect(errorOf(run('=ROW(5)')).error).toBe('#VALUE!');
    expect(errorOf(run('=DIST(A1,5)')).error).toBe('#VALUE!');
  });

  it('TOWARD needs a bound monster', () => {
    const self = { col: 2, row: 5 };
    expect(run('=TOWARD(B2)', { self })).toEqual(stringValue('N'));
    expect(run('=TOWARD(B8)', { self })).toEqual(stringValue('S'));
    expect(run('=TOWARD(B5)', { self })).toEqual(stringValue('-'));
    expect(errorOf(run('=TOWARD(B2)')).error).toBe('#REF!');
  });

  describe('RAND with a bad Random_Source', () => {
    const CAUSE = 'RAND() got an invalid number from the random source';
    const badSources: Array<[string, () => unknown]> = [
      [
        'throws',
        () => {
          throw new Error('random source failed');
        },
      ],
      ['returns a non-number', () => '0.5'],
      ['returns NaN', () => Number.NaN],
      ['returns Infinity', () => Number.POSITIVE_INFINITY],
      ['returns a number below 0', () => -0.1],
      ['returns 1', () => 1],
      ['returns a number above 1', () => 1.5],
    ];

    it.each(badSources)('source that %s gives #VALUE!', (_name, random) => {
      const parsed = parseFormula('=RAND() * 2');
      if (!parsed.ok) throw new Error('parse failed');
      const env: EvalEnv = { ...makeEnv(), random: random as () => number };
      const e = errorOf(evaluateAst(parsed.ast, env));
      expect(e.error).toBe('#VALUE!');
      expect(e.cause).toContain(CAUSE);
      expect(e.cause).not.toMatch(/internal error/i);
    });
  });

  it('RAND uses the supplied generator', () => {
    expect(run('=RAND()')).toEqual(numberValue(0.5));
  });

  it('function names are matched case-insensitively', () => {
    expect(run('=sum(1,2)')).toEqual(numberValue(3));
  });

  it('calls nest inside expressions', () => {
    expect(run('=1+ABS(-2)*SUM(1,2)')).toEqual(numberValue(7));
  });
});

describe('call check order', () => {
  it('#CYCLE! in an argument beats an unknown function', () => {
    expect(errorOf(run('=FOO(A1)', { cells: CYCLE_CELLS })).error).toBe('#CYCLE!');
  });

  it('#CYCLE! beats a wrong argument count', () => {
    expect(errorOf(run('=ABS(A1, 2)', { cells: CYCLE_CELLS })).error).toBe('#CYCLE!');
  });

  it('#CYCLE! beats an earlier argument error', () => {
    expect(errorOf(run('=SUM(1/0, A1)', { cells: CYCLE_CELLS })).error).toBe('#CYCLE!');
  });

  it('an unknown function beats a wrong argument count', () => {
    expect(errorOf(run('=FOO(1,2,3)')).error).toBe('#NAME?');
    expect(errorOf(run('=FOO()')).error).toBe('#NAME?');
  });

  it('an unknown function beats an argument error', () => {
    expect(errorOf(run('=FOO(1/0)')).error).toBe('#NAME?');
    expect(errorOf(run('=FOO(M1)')).error).toBe('#NAME?');
  });

  it('a wrong argument count beats an argument error', () => {
    expect(errorOf(run('=ABS(1/0, 2)')).error).toBe('#VALUE!');
    expect(errorOf(run('=RAND(1/0)')).error).toBe('#VALUE!');
    expect(errorOf(run('=MOD(M1)')).error).toBe('#VALUE!');
    expect(errorOf(run('=SUM()')).error).toBe('#VALUE!');
  });

  it('the leftmost argument error wins', () => {
    expect(errorOf(run('=SUM(1/0, M1)')).error).toBe('#DIV/0!');
    expect(errorOf(run('=SUM(M1, 1/0)')).error).toBe('#REF!');
  });

  it('the leftmost argument error beats a type error', () => {
    expect(errorOf(run('=MOD("a", 1/0)')).error).toBe('#DIV/0!');
    expect(errorOf(run('=MOD(1/0, "a")')).error).toBe('#DIV/0!');
    expect(errorOf(run('=AND(1, M1)')).error).toBe('#REF!');
  });

  it('a type error shows when no argument is an error', () => {
    expect(errorOf(run('=MOD("a", 1)')).error).toBe('#VALUE!');
  });
});

describe('IF', () => {
  it('takes only the chosen branch', () => {
    expect(run('=IF(TRUE, 1, 1/0)')).toEqual(numberValue(1));
    expect(run('=IF(FALSE, 1/0, 2)')).toEqual(numberValue(2));
    expect(run('=IF(TRUE, 1, GHOST)')).toEqual(numberValue(1));
    expect(run('=IF(FALSE, FOO(), 2)')).toEqual(numberValue(2));
  });

  it('does not evaluate the skipped branch even when it holds a cycle', () => {
    expect(run('=IF(TRUE, 1, A1)', { cells: CYCLE_CELLS })).toEqual(numberValue(1));
  });

  it('returns an error from the chosen branch', () => {
    expect(errorOf(run('=IF(TRUE, 1/0, 2)')).error).toBe('#DIV/0!');
    expect(errorOf(run('=IF(FALSE, 1, M1)')).error).toBe('#REF!');
  });

  it('propagates a condition error', () => {
    expect(errorOf(run('=IF(1/0, 1, 2)')).error).toBe('#DIV/0!');
  });

  it('gives #VALUE! for a condition that is not a boolean', () => {
    expect(errorOf(run('=IF(1, 2, 3)')).error).toBe('#VALUE!');
    expect(errorOf(run('=IF("a", 2, 3)')).error).toBe('#VALUE!');
  });

  it('gives #VALUE! for a wrong argument count', () => {
    expect(errorOf(run('=IF(TRUE, 1)')).error).toBe('#VALUE!');
    expect(errorOf(run('=IF(TRUE, 1, 2, 3)')).error).toBe('#VALUE!');
  });

  it('compares with cell values', () => {
    const cells = numCells(5);
    expect(run('=IF(A1>3, "big", "small")', { cells })).toEqual(stringValue('big'));
  });
});

describe('totality', () => {
  const formulas = [
    '=SUM()',
    '=SUM(A1:A3)',
    '=IF()',
    '=IF(1,2,3)',
    '=FOO(FOO(FOO()))',
    '=TOWARD(5)',
    '=DIST()',
    '=MOD(1)',
    '=ABS(ABS(ABS("x")))',
    '=SUM(M1:M3)',
    '=SUM(A1:M1)',
    '=ROW(A1:A3)',
    '=SUM(1e308*10)',
  ];

  it('never throws and always gives a value', () => {
    for (const text of formulas) {
      const parsed = parseFormula(text);
      if (!parsed.ok) continue;
      const result = evaluateAst(parsed.ast, makeEnv({ cells: CYCLE_CELLS }));
      expect(['number', 'string', 'boolean', 'error']).toContain(result.kind);
    }
  });

  it('turns a throwing environment into an error', () => {
    const parsed = parseFormula('=SUM(A1:A3)');
    if (!parsed.ok) throw new Error('parse failed');
    const env: EvalEnv = {
      ...makeEnv(),
      cellAt: () => {
        throw new Error('boom');
      },
    };
    expect(evaluateAst(parsed.ast, env).kind).toBe('error');
  });
});

describe('empty Cell in a boolean position is FALSE', () => {
  it('IF takes the else branch', () => {
    expect(run('=IF(A1,1,2)')).toEqual(numberValue(2));
  });

  it('AND, OR and NOT treat it as FALSE', () => {
    expect(run('=AND(A1)')).toEqual(booleanValue(false));
    expect(run('=OR(A1,TRUE)')).toEqual(booleanValue(true));
    expect(run('=OR(A1)')).toEqual(booleanValue(false));
    expect(run('=NOT(A1)')).toEqual(booleanValue(true));
    expect(run('=AND(TRUE,A1)')).toEqual(booleanValue(false));
  });

  it('still gives #VALUE! for numbers and strings in those positions', () => {
    const cells: Record<string, CellView> = {
      '1,1': { empty: false, name: null, value: numberValue(1) },
      '1,2': { empty: false, name: null, value: stringValue('x') },
    };
    for (const text of ['=IF(1,1,2)', '=IF("x",1,2)', '=IF(A1,1,2)', '=IF(A2,1,2)', '=AND(A1)', '=OR(A2)', '=NOT(A1)', '=NOT("x")']) {
      expect(errorOf(run(text, { cells })).error).toBe('#VALUE!');
    }
  });
});

describe('a single empty Cell argument to SUM, MIN and MAX is skipped', () => {
  it('matches how a Range member is treated', () => {
    expect(run('=MIN(A1,5)')).toEqual(numberValue(5));
    expect(run('=MAX(A1,-5)')).toEqual(numberValue(-5));
    expect(run('=SUM(A1)')).toEqual(numberValue(0));
    expect(run('=MIN(5,A1)')).toEqual(run('=MIN(5,A1:A1)'));
  });

  it('MIN and MAX of only empty Cells are #VALUE!', () => {
    expect(errorOf(run('=MIN(A1)')).error).toBe('#VALUE!');
    expect(errorOf(run('=MAX(A1)')).error).toBe('#VALUE!');
  });
});

describe('error causes name the origin Cell', () => {
  const named: Record<string, CellView> = {
    '2,9': { empty: false, name: 'MOVE_M1', value: stringValue('') },
  };
  const cases: Array<[string, string, string]> = [
    ['#DIV/0!', '=1/0', 'divides by zero'],
    ['#VALUE!', '="a"+1', 'used text where a number is needed'],
    ['#REF!', '=M1', 'refers to M1, which does not exist'],
  ];

  for (const [kind, formula, tail] of cases) {
    it(`${kind}: a named origin starts the cause with the address and the name`, () => {
      const e = run(formula, { cells: named });
      if (e.kind !== 'error') throw new Error('expected an error');
      expect(e.error).toBe(kind);
      expect(e.cause).toBe(`B9 (MOVE_M1) ${tail}`);
      expect(e.origin).toBe('B9'); // the origin field stays the bare Address
    });

    it(`${kind}: an unnamed origin starts the cause with the address only`, () => {
      const e = run(formula);
      if (e.kind !== 'error') throw new Error('expected an error');
      expect(e.cause).toBe(`B9 ${tail}`);
      expect(e.origin).toBe('B9');
    });
  }

  it('keeps the 200 character cap with a name in the prefix', () => {
    const longName = 'N'.repeat(250);
    const e = run('=1/0', { cells: { '2,9': { empty: false, name: longName, value: stringValue('') } } });
    if (e.kind !== 'error') throw new Error('expected an error');
    expect(Array.from(e.cause)).toHaveLength(200);
    expect(e.cause.startsWith('B9 (NNN')).toBe(true);
  });
});

describe('error order inside a Range', () => {
  const err = (kind: '#REF!' | '#DIV/0!' | '#VALUE!', origin: string): CellView => ({
    empty: false,
    name: null,
    value: errorValue(kind, `${origin} failed`, origin),
  });

  it('the first error in row-major order wins, not column-major', () => {
    // A1:B2 in row-major order is A1, B1, A2, B2. Column-major would reach A2 before B1.
    const refAtB1: Record<string, CellView> = { '2,1': err('#REF!', 'B1'), '1,2': err('#DIV/0!', 'A2') };
    expect(errorOf(run('=SUM(A1:B2)', { cells: refAtB1 })).error).toBe('#REF!');
    expect(errorOf(run('=MAX(A1:B2)', { cells: refAtB1 })).error).toBe('#REF!');
    const divAtB1: Record<string, CellView> = { '2,1': err('#DIV/0!', 'B1'), '1,2': err('#REF!', 'A2') };
    expect(errorOf(run('=SUM(A1:B2)', { cells: divAtB1 })).error).toBe('#DIV/0!');
  });

  it('a #CYCLE! member beats an earlier ordinary error', () => {
    const cells: Record<string, CellView> = {
      '1,1': err('#REF!', 'A1'),
      '2,2': {
        empty: false,
        name: null,
        value: errorValue('#CYCLE!', 'B2 is on a circular reference', 'B2'),
      },
    };
    expect(errorOf(run('=SUM(A1:B2)', { cells })).error).toBe('#CYCLE!');
    expect(errorOf(run('=MIN(A1:B2)', { cells })).error).toBe('#CYCLE!');
  });
});

describe('a Rule_Cell read through a Range member or a Cell_Name', () => {
  const options: EnvOptions = {
    cells: {
      '2,14': { empty: false, name: 'MOVE_M1', value: ruleValue('=TOWARD(HERO)') },
      '2,15': { empty: false, name: null, value: numberValue(4) },
    },
    names: { MOVE_M1: { col: 2, row: 14 } },
  };

  it('gives #VALUE! through a Range member, with the rule wording', () => {
    const result = errorOf(run('=SUM(B14:B15)', options));
    expect(result.error).toBe('#VALUE!');
    expect(result.cause).toContain('which is a rule');
    expect(result.cause).toContain('B14');
  });

  it('gives #VALUE! through its Cell_Name, with the rule wording', () => {
    for (const formula of ['=MOVE_M1', '=MOVE_M1+1']) {
      const result = errorOf(run(formula, options));
      expect(result.error).toBe('#VALUE!');
      expect(result.cause).toContain('which is a rule');
      expect(result.cause).toContain('MOVE_M1');
    }
  });
});
