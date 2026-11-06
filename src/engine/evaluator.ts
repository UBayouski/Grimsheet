import { formatAddress, isInSheet, type GridPoint } from './address';
import type { BinaryOperator, CellNode, Node } from './ast';
import { makeError, pickError } from './errors';
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
        return val(numberValue(node.value));
      case 'string':
        return val(stringValue(node.value));
      case 'boolean':
        return val(booleanValue(node.value));
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
        return this.evaluateCall(node.name);
    }
  }

  /** Task 3.3 replaces this stub with the call pipeline. Every call is `#NAME?` for now. */
  evaluateCall(name: string): Operand {
    return val(this.err('#NAME?', `calls ${name}, which is not a function`));
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
    if (isError(n)) return val(n);
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
    return val(numberValue(n === 0 ? 0 : n));
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
        return val(stringValue(this.toText(left) + this.toText(right)));
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
        return val(booleanValue(order === 0));
      case '<>':
        return val(booleanValue(order !== 0));
      case '<':
        return val(booleanValue(order < 0));
      case '>':
        return val(booleanValue(order > 0));
      case '<=':
        return val(booleanValue(order <= 0));
      case '>=':
        return val(booleanValue(order >= 0));
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
