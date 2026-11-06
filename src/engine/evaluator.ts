import { formatAddress, isInSheet, type GridPoint } from './address';
import type { BinaryOperator, CellNode, Node } from './ast';
import { makeError, pickError } from './errors';
import {
  absOf,
  andOf,
  argModeAt,
  arityAccepts,
  colOf,
  distOf,
  lookupFunction,
  maxOf,
  minOf,
  modOf,
  notOf,
  orOf,
  rowOf,
  sumOf,
  towardOf,
  type ArgMode,
} from './functions';
import {
  booleanValue,
  formatNumber,
  numberValue,
  stringValue,
  type ErrorValue,
  type Value,
} from './values';

/** What the evaluator needs to know about one Cell. */
export interface CellView {
  readonly empty: boolean; // Raw_Text is "" (distinct from a Formula that yields "")
  readonly name: string | null;
  readonly value: Value; // stored Value; kind 'rule' for a Rule_Cell off a cycle
}

export interface EvalEnv {
  readonly origin: GridPoint; // Cell whose Formula is being evaluated (labels causes)
  readonly cellAt: (p: GridPoint) => CellView; // p is always in the Sheet
  readonly resolveName: (upper: string) => GridPoint | undefined; // Cell_Name lookup (never HERO or SELF)
  readonly hero: GridPoint; // validated, may be outside the Sheet
  readonly self: GridPoint | undefined; // absent during recalculation
  readonly random: () => number;
}

/** A value that is never 'rule'. */
type FinalValue = Exclude<Value, { kind: 'rule' }>;

// Typed wrappers: the values.ts builders return the wider Value type.
function numberFinal(n: number): FinalValue {
  return numberValue(n) as FinalValue;
}

function stringFinal(s: string): FinalValue {
  return stringValue(s) as FinalValue;
}

function booleanFinal(b: boolean): FinalValue {
  return booleanValue(b) as FinalValue;
}

type Operand =
  | { readonly t: 'val'; readonly v: FinalValue }
  | { readonly t: 'ref'; readonly point: GridPoint }
  | { readonly t: 'range'; readonly from: GridPoint; readonly to: GridPoint };

interface EmptyMarker {
  readonly kind: 'empty';
}

const EMPTY: EmptyMarker = { kind: 'empty' };

type Scalar = FinalValue | EmptyMarker;

function val(v: FinalValue): Operand {
  return { t: 'val', v };
}

function isError(s: Scalar): s is ErrorValue {
  return s.kind === 'error';
}

/** Text of a cell node as written, for causes. */
function cellText(node: CellNode): string {
  return formatAddress({ col: node.col, row: node.row }) || `col ${node.col} row ${node.row}`;
}

/** Points of a normalized range in row-major order. */
function rangePoints(from: GridPoint, to: GridPoint): GridPoint[] {
  const out: GridPoint[] = [];
  for (let row = from.row; row <= to.row; row++) {
    for (let col = from.col; col <= to.col; col++) out.push({ col, row });
  }
  return out;
}

class Evaluation {
  private readonly originText: string;

  constructor(private readonly env: EvalEnv) {
    this.originText = formatAddress(env.origin) || 'cell';
  }

  err(kind: ErrorValue['error'], text: string): ErrorValue {
    return makeError(kind, this.originText, text);
  }

  evaluate(node: Node): Operand {
    switch (node.kind) {
      case 'number':
        return val(numberFinal(node.value));
      case 'string':
        return val(stringFinal(node.value));
      case 'boolean':
        return val(booleanFinal(node.value));
      case 'cell':
        return this.evalCell(node);
      case 'range':
        return this.evalRange(node.from, node.to);
      case 'name':
        return this.evalName(node.name);
      case 'negate':
        return this.evalNegate(node.operand);
      case 'binary':
        return this.evalBinary(node.op, node.left, node.right);
      case 'call':
        return this.evaluateCall(node.name, node.args);
    }
  }

  /**
   * The call pipeline. Order of checks:
   * 1. `#CYCLE!` in any evaluated argument, 2. unknown function (`#NAME?`),
   * 3. wrong argument count (`#VALUE!`), 4. leftmost argument error, 5. type errors.
   * `IF` is lazy: only the condition and the taken branch are evaluated.
   */
  evaluateCall(name: string, args: readonly Node[]): Operand {
    const spec = lookupFunction(name);
    if (spec !== undefined && spec.name === 'IF' && args.length === 3) {
      return this.evalIf(args as readonly [Node, Node, Node]);
    }
    const known = spec !== undefined && arityAccepts(spec, args.length);
    const operands = args.map((a) => this.evaluate(a));
    const errors: (ErrorValue | undefined)[] = operands.map((op, i) => {
      const mode: ArgMode | 'scan' =
        known && spec !== undefined ? (argModeAt(spec, i) ?? 'scan') : 'scan';
      return this.argError(op, mode);
    });

    // 1. #CYCLE! anywhere in the arguments wins.
    const cycles = errors.filter((e): e is ErrorValue => e !== undefined && e.error === '#CYCLE!');
    const [firstCycle, ...otherCycles] = cycles;
    if (firstCycle !== undefined) return val(pickError([firstCycle, ...otherCycles]));

    // 2. Unknown function.
    if (spec === undefined) {
      return val(this.err('#NAME?', `calls ${name}, which is not a function`));
    }
    // 3. Wrong argument count.
    if (!arityAccepts(spec, args.length)) {
      return val(
        this.err('#VALUE!', `calls ${spec.name} with ${args.length} argument(s), which it does not accept`),
      );
    }
    // 4. Leftmost argument error.
    for (const e of errors) if (e !== undefined) return val(e);

    // 5. Types and result.
    return this.applyFunction(spec.name, operands);
  }

  private evalIf(args: readonly [Node, Node, Node]): Operand {
    const cond = this.deref(this.evaluate(args[0]));
    if (isError(cond)) return val(cond);
    if (cond.kind !== 'boolean') {
      return val(this.err('#VALUE!', 'uses a condition in IF that is not TRUE or FALSE'));
    }
    return this.evaluate(cond.value ? args[1] : args[2]);
  }

  /** The error an argument carries (before any type check), or undefined. */
  private argError(op: Operand, mode: ArgMode | 'scan'): ErrorValue | undefined {
    if (mode === 'ref') {
      if (op.t === 'ref') return undefined;
      if (op.t === 'val') return op.v.kind === 'error' ? op.v : undefined;
      return this.deref(op) as ErrorValue; // a range: #REF!
    }
    if (op.t === 'range' && (mode === 'rangeOrValue' || mode === 'scan')) {
      const found: ErrorValue[] = [];
      for (const point of rangePoints(op.from, op.to)) {
        const s = this.deref({ t: 'ref', point });
        if (isError(s)) found.push(s);
      }
      const [first, ...rest] = found;
      return first === undefined ? undefined : pickError([first, ...rest]);
    }
    const s = this.deref(op);
    return isError(s) ? s : undefined;
  }

  private applyFunction(fn: string, operands: readonly Operand[]): Operand {
    const nums = (): number[] | ErrorValue => {
      const out: number[] = [];
      for (const op of operands) {
        if (op.t === 'range') {
          for (const point of rangePoints(op.from, op.to)) {
            const s = this.deref({ t: 'ref', point });
            if (s.kind === 'number') out.push(s.value);
          }
        } else {
          const s = this.deref(op);
          if (s.kind === 'empty') continue;
          const n = this.toNumber(s);
          if (typeof n !== 'number') return n;
          out.push(n);
        }
      }
      return out;
    };
    const num = (i: number): number | ErrorValue => {
      const s = this.deref(operands[i] as Operand);
      return this.toNumber(s);
    };
    const bools = (): boolean[] | ErrorValue => {
      const out: boolean[] = [];
      for (const op of operands) {
        const s = this.deref(op);
        if (s.kind !== 'boolean') {
          return this.err('#VALUE!', `uses a value that is not TRUE or FALSE in ${fn}`);
        }
        out.push(s.value);
      }
      return out;
    };
    const point = (i: number): GridPoint | ErrorValue => {
      const op = operands[i] as Operand;
      if (op.t === 'ref') return op.point;
      return this.err('#VALUE!', `uses a value in ${fn} where a cell reference is needed`);
    };

    switch (fn) {
      case 'SUM':
      case 'MIN':
      case 'MAX': {
        const xs = nums();
        if (!Array.isArray(xs)) return val(xs as ErrorValue);
        if (fn === 'SUM') return this.numberResult(sumOf(xs));
        const r = fn === 'MIN' ? minOf(xs) : maxOf(xs);
        if (r === undefined) return val(this.err('#VALUE!', `calls ${fn} with no numbers`));
        return this.numberResult(r);
      }
      case 'ABS': {
        const x = num(0);
        return typeof x === 'number' ? this.numberResult(absOf(x)) : val(x);
      }
      case 'MOD': {
        const a = num(0);
        if (typeof a !== 'number') return val(a);
        const b = num(1);
        if (typeof b !== 'number') return val(b);
        const r = modOf(a, b);
        if (!r.ok) return val(this.err(r.error, 'divides by zero in MOD'));
        return this.numberResult(r.value);
      }
      case 'AND':
      case 'OR': {
        const bs = bools();
        if (!Array.isArray(bs)) return val(bs as ErrorValue);
        return val(booleanFinal(fn === 'AND' ? andOf(bs) : orOf(bs)));
      }
      case 'NOT': {
        const bs = bools();
        if (!Array.isArray(bs)) return val(bs as ErrorValue);
        return val(booleanFinal(notOf(bs[0] as boolean)));
      }
      case 'ROW':
      case 'COL': {
        const p = point(0);
        if ('kind' in p) return val(p);
        return val(numberFinal(fn === 'ROW' ? rowOf(p) : colOf(p)));
      }
      case 'DIST': {
        const a = point(0);
        if ('kind' in a) return val(a);
        const b = point(1);
        if ('kind' in b) return val(b);
        return val(numberFinal(distOf(a, b)));
      }
      case 'TOWARD': {
        const t = point(0);
        if ('kind' in t) return val(t);
        const self = this.env.self;
        if (self === undefined || !isInSheet(self)) {
          return val(this.err('#REF!', 'calls TOWARD, but no monster is being evaluated'));
        }
        return val(stringFinal(towardOf(self, t)));
      }
      case 'RAND':
        return this.numberResult(this.env.random());
      default:
        return val(this.err('#NAME?', `calls ${fn}, which is not a function`));
    }
  }

  private evalCell(node: CellNode): Operand {
    const point: GridPoint = { col: node.col, row: node.row };
    if (!isInSheet(point)) {
      return val(this.err('#REF!', `refers to ${cellText(node)}, which does not exist`));
    }
    return { t: 'ref', point };
  }

  private evalRange(from: CellNode, to: CellNode): Operand {
    const a: GridPoint = { col: from.col, row: from.row };
    const b: GridPoint = { col: to.col, row: to.row };
    if (!isInSheet(a)) {
      return val(this.err('#REF!', `refers to ${cellText(from)}, which does not exist`));
    }
    if (!isInSheet(b)) {
      return val(this.err('#REF!', `refers to ${cellText(to)}, which does not exist`));
    }
    return {
      t: 'range',
      from: { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
      to: { col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
    };
  }

  private evalName(name: string): Operand {
    if (name === 'HERO') {
      if (isInSheet(this.env.hero)) return { t: 'ref', point: this.env.hero };
      return val(this.err('#REF!', 'uses HERO, which is not on the sheet'));
    }
    if (name === 'SELF') {
      const self = this.env.self;
      if (self === undefined) {
        return val(this.err('#REF!', 'uses SELF, but no monster is being evaluated'));
      }
      if (!isInSheet(self)) {
        return val(this.err('#REF!', 'uses SELF, which is not on the sheet'));
      }
      return { t: 'ref', point: self };
    }
    const point = this.env.resolveName(name);
    if (point === undefined || !isInSheet(point)) {
      return val(this.err('#REF!', `refers to ${name}, which is not a cell name`));
    }
    return { t: 'ref', point };
  }

  /** Read an operand as a single scalar. */
  deref(op: Operand): Scalar {
    switch (op.t) {
      case 'val':
        return op.v;
      case 'range':
        return this.err(
          '#REF!',
          `uses the range ${formatAddress(op.from)}:${formatAddress(op.to)} where a single value is needed`,
        );
      case 'ref': {
        const view = this.env.cellAt(op.point);
        const v = view.value;
        if (v.kind === 'rule') {
          const label = formatAddress(op.point);
          const named = view.name === null ? label : `${label} (${view.name})`;
          return this.err('#VALUE!', `refers to ${named}, which is a rule, not a value`);
        }
        if (view.empty) return EMPTY;
        return v;
      }
    }
  }

  private evalNegate(operandNode: Node): Operand {
    const s = this.deref(this.evaluate(operandNode));
    if (isError(s)) return val(s);
    const n = this.toNumber(s);
    if (typeof n !== 'number') return val(n);
    return this.numberResult(-n);
  }

  private toNumber(s: Scalar): number | ErrorValue {
    if (isError(s)) return s;
    switch (s.kind) {
      case 'empty':
        return 0;
      case 'number':
        return s.value;
      case 'string':
        return this.err('#VALUE!', 'used text where a number is needed');
      case 'boolean':
        return this.err('#VALUE!', 'used TRUE or FALSE where a number is needed');
    }
  }

  private numberResult(n: number): Operand {
    if (!Number.isFinite(n)) {
      return val(this.err('#VALUE!', 'produced a number that is too large'));
    }
    // Normalize -0 to 0 so results print and compare uniformly.
    return val(numberFinal(n === 0 ? 0 : n));
  }

  private evalBinary(op: BinaryOperator, leftNode: Node, rightNode: Node): Operand {
    // Evaluate both sides left to right, then pick the winning operand error.
    const left = this.deref(this.evaluate(leftNode));
    const right = this.deref(this.evaluate(rightNode));
    const errors: ErrorValue[] = [];
    if (isError(left)) errors.push(left);
    if (isError(right)) errors.push(right);
    const [first, ...rest] = errors;
    if (first !== undefined) return val(pickError([first, ...rest]));

    switch (op) {
      case '+':
      case '-':
      case '*':
      case '/':
        return this.arithmetic(op, left, right);
      case '&':
        return val(stringFinal(this.toText(left) + this.toText(right)));
      case '=':
      case '<>':
      case '<':
      case '>':
      case '<=':
      case '>=':
        return this.compare(op, left, right);
    }
  }

  private arithmetic(op: '+' | '-' | '*' | '/', left: Scalar, right: Scalar): Operand {
    const a = this.toNumber(left);
    if (typeof a !== 'number') return val(a);
    const b = this.toNumber(right);
    if (typeof b !== 'number') return val(b);
    switch (op) {
      case '+':
        return this.numberResult(a + b);
      case '-':
        return this.numberResult(a - b);
      case '*':
        return this.numberResult(a * b);
      case '/':
        if (b === 0) return val(this.err('#DIV/0!', 'divides by zero'));
        return this.numberResult(a / b);
    }
  }

  private toText(s: Scalar): string {
    switch (s.kind) {
      case 'empty':
        return '';
      case 'number':
        return formatNumber(s.value);
      case 'string':
        return s.value;
      case 'boolean':
        return s.value ? 'TRUE' : 'FALSE';
      case 'error':
        return '';
    }
  }

  private compare(
    op: '=' | '<>' | '<' | '>' | '<=' | '>=',
    left: Scalar,
    right: Scalar,
  ): Operand {
    const [a, b] = coerceForCompare(left, right);
    if (a.kind !== b.kind) {
      return val(this.err('#VALUE!', 'compares values of different types'));
    }
    let order: number;
    if (a.kind === 'number' && b.kind === 'number') {
      order = a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    } else if (a.kind === 'string' && b.kind === 'string') {
      const x = a.value.toUpperCase();
      const y = b.value.toUpperCase();
      order = x < y ? -1 : x > y ? 1 : 0;
    } else if (a.kind === 'boolean' && b.kind === 'boolean') {
      order = a.value === b.value ? 0 : a.value ? 1 : -1;
    } else {
      return val(this.err('#VALUE!', 'compares values that cannot be compared'));
    }
    switch (op) {
      case '=':
        return val(booleanFinal(order === 0));
      case '<>':
        return val(booleanFinal(order !== 0));
      case '<':
        return val(booleanFinal(order < 0));
      case '>':
        return val(booleanFinal(order > 0));
      case '<=':
        return val(booleanFinal(order <= 0));
      case '>=':
        return val(booleanFinal(order >= 0));
    }
  }
}

type PlainScalar = Exclude<Scalar, ErrorValue>;
type Comparable = Exclude<PlainScalar, EmptyMarker>;

/** Empty-Cell coercion for comparisons: string -> "", boolean -> FALSE, otherwise 0. */
function coerceForCompare(left: Scalar, right: Scalar): [Comparable, Comparable] {
  const l = left as PlainScalar;
  const r = right as PlainScalar;
  const fill = (s: PlainScalar, other: PlainScalar): Comparable => {
    if (s.kind !== 'empty') return s;
    if (other.kind === 'string') return stringValue('') as Comparable;
    if (other.kind === 'boolean') return booleanValue(false) as Comparable;
    return numberValue(0) as Comparable;
  };
  return [fill(l, r), fill(r, l)];
}

/** Evaluate one Formula AST to a final Value (never 'rule'). Never throws. */
export function evaluateAst(ast: Node, env: EvalEnv): Value {
  try {
    const run = new Evaluation(env);
    const s = run.deref(run.evaluate(ast));
    if (s.kind === 'empty') return numberValue(0);
    return s;
  } catch (e) {
    let origin = 'cell';
    try {
      origin = formatAddress(env.origin) || origin;
    } catch {
      // keep the fallback origin
    }
    const detail = e instanceof Error ? e.message : String(e);
    return makeError('#VALUE!', origin, `internal error: ${detail}`);
  }
}
