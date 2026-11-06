import { MAX_DEPTH } from './ast';
import type { CellNode, Node } from './ast';
import { formatNumber } from './values';

export type PrintResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string };

const MAX_ROW = 1_000_000;

/** Binary operator precedence level: a higher number binds tighter. */
const LEVELS: Readonly<Record<string, number>> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
};

/** Level of a unary minus, above every binary operator. Atoms never need parentheses. */
const NEGATE_LEVEL = 5;
const ATOM_LEVEL = 6;

/** Internal control flow only: never escapes `printFormula`. */
class Refusal {
  constructor(readonly reason: string) {}
}

function refuse(reason: string): never {
  throw new Refusal(reason);
}

function printCell(node: CellNode): string {
  const { col, row } = node;
  if (!Number.isInteger(col) || col < 1 || col > 26) refuse('cell column is out of range');
  if (!Number.isInteger(row) || row < 0 || row > MAX_ROW) refuse('cell row is out of range');
  return `${String.fromCharCode(64 + col)}${row}`;
}

function levelOf(node: Node): number {
  switch (node.kind) {
    case 'binary':
      return LEVELS[node.op] ?? refuse('unknown operator');
    case 'negate':
      return NEGATE_LEVEL;
    default:
      return ATOM_LEVEL;
  }
}

function present(node: unknown): Node {
  if (node === null || typeof node !== 'object') refuse('missing child node');
  return node as Node;
}

/** Print `node` at `depth` (the root is 1). Wraps in parentheses when its level is below `minLevel`. */
function print(raw: unknown, depth: number, minLevel: number, inCallArgument: boolean): string {
  const node = present(raw);
  if (depth > MAX_DEPTH) refuse('formula is nested too deeply');
  const text = printBare(node, depth, inCallArgument);
  return levelOf(node) < minLevel ? `(${text})` : text;
}

function printBare(node: Node, depth: number, inCallArgument: boolean): string {
  switch (node.kind) {
    case 'number':
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) refuse('number is not finite');
      if (node.value < 0 || Object.is(node.value, -0)) refuse('number node is negative');
      return formatNumber(node.value);
    case 'string':
      if (typeof node.value !== 'string') refuse('string node has no text');
      return `"${node.value.replace(/"/g, '""')}"`;
    case 'boolean':
      if (typeof node.value !== 'boolean') refuse('boolean node has no value');
      return node.value ? 'TRUE' : 'FALSE';
    case 'cell':
      return printCell(node);
    case 'range': {
      if (!inCallArgument) refuse('range is only allowed as a function argument');
      if (depth + 1 > MAX_DEPTH) refuse('formula is nested too deeply');
      const from = present(node.from);
      const to = present(node.to);
      if (from.kind !== 'cell' || to.kind !== 'cell') refuse('range ends must be cells');
      return `${printCell(from)}:${printCell(to)}`;
    }
    case 'name':
      if (typeof node.name !== 'string' || node.name === '') refuse('name node has no name');
      return node.name.toUpperCase();
    case 'negate':
      return `-${print(node.operand, depth + 1, NEGATE_LEVEL, false)}`;
    case 'binary': {
      const level = LEVELS[node.op];
      if (level === undefined) refuse('unknown operator');
      // Operators are left-associative: an equal-level right child needs parentheses.
      const left = print(node.left, depth + 1, level, false);
      const right = print(node.right, depth + 1, level + 1, false);
      return `${left} ${node.op} ${right}`;
    }
    case 'call': {
      if (typeof node.name !== 'string' || node.name === '') refuse('call node has no name');
      if (!Array.isArray(node.args)) refuse('call node has no arguments');
      const args = node.args.map((arg) => print(arg, depth + 1, 0, true));
      return `${node.name.toUpperCase()}(${args.join(', ')})`;
    }
    default:
      return refuse('unknown node kind');
  }
}

/** Print an AST as canonical formula text. Never throws; refuses without partial text. */
export function printFormula(ast: Node): PrintResult {
  try {
    return { ok: true, text: `=${print(ast, 1, 0, false)}` };
  } catch (failure) {
    if (failure instanceof Refusal) return { ok: false, reason: failure.reason };
    return { ok: false, reason: 'formula could not be printed' };
  }
}
