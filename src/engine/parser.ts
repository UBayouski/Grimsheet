import { MAX_DEPTH } from './ast';
import type { BinaryOperator, CellNode, Node } from './ast';
import { describeChar, makeParseError, scan } from './tokenizer';
import type { ParseError, Token } from './tokenizer';

export type ParseResult =
  | { readonly ok: true; readonly ast: Node }
  | { readonly ok: false; readonly error: ParseError };

/** A parsed node together with its tree height. */
interface Parsed {
  readonly node: Node;
  readonly h: number;
}

/** Internal control flow only: never escapes `parseFormula`. */
class ParseFailure {
  constructor(readonly error: ParseError) {}
}

const COMPARISON_OPS: readonly string[] = ['=', '<>', '<', '>', '<=', '>='];
const CONCAT_OPS: readonly string[] = ['&'];
const ADDITIVE_OPS: readonly string[] = ['+', '-'];
const TERM_OPS: readonly string[] = ['*', '/'];

const MAX_SHOWN = 20;
const MAX_ROW = 1_000_000;

/** Token text for a message: at most 20 output characters, unprintable ones written as U+XXXX. */
function shown(text: string): string {
  let out = '';
  for (const ch of text) {
    const piece = describeChar(ch);
    if (out.length + piece.length > MAX_SHOWN) break;
    out += piece;
  }
  return out;
}

function toCellNode(token: Token): CellNode {
  const col = token.text.charCodeAt(0) - 64;
  const row = Math.min(Number(token.text.slice(1)), MAX_ROW);
  return { kind: 'cell', col, row };
}

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(offset = 0): Token {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[index] as Token;
  }

  private fail(column: number, message: string): never {
    throw new ParseFailure(makeParseError(column, message));
  }

  private enter(token: Token): void {
    this.depth++;
    if (this.depth > MAX_DEPTH) this.fail(token.column, 'formula is nested too deeply');
  }

  private leave(): void {
    this.depth--;
  }

  private checkHeight(h: number, token: Token): void {
    if (h > MAX_DEPTH) this.fail(token.column, 'formula is nested too deeply');
  }

  private unexpected(token: Token): never {
    if (token.kind === 'eof') this.fail(token.column, 'unexpected end of formula');
    this.fail(token.column, `unexpected ${shown(token.text)}`);
  }

  parseTop(): Node {
    const first = this.peek();
    if (first.kind !== 'op' || first.text !== '=' || first.column !== 1) {
      this.fail(1, "formula must start with '='");
    }
    this.pos++;
    const result = this.parseComparison();
    const rest = this.peek();
    if (rest.kind !== 'eof') {
      this.fail(rest.column, `unexpected ${shown(rest.text)} after the formula`);
    }
    return result.node;
  }

  private parseLevel(ops: readonly string[], next: () => Parsed): Parsed {
    let left = next();
    for (;;) {
      const token = this.peek();
      if (token.kind !== 'op' || !ops.includes(token.text)) return left;
      this.pos++;
      const right = next();
      const h = Math.max(left.h, right.h) + 1;
      this.checkHeight(h, token);
      left = {
        node: { kind: 'binary', op: token.text as BinaryOperator, left: left.node, right: right.node },
        h,
      };
    }
  }

  private parseComparison(): Parsed {
    return this.parseLevel(COMPARISON_OPS, () => this.parseConcat());
  }

  private parseConcat(): Parsed {
    return this.parseLevel(CONCAT_OPS, () => this.parseAdditive());
  }

  private parseAdditive(): Parsed {
    return this.parseLevel(ADDITIVE_OPS, () => this.parseTerm());
  }

  private parseTerm(): Parsed {
    return this.parseLevel(TERM_OPS, () => this.parseUnary());
  }

  private parseUnary(): Parsed {
    const token = this.peek();
    this.enter(token);
    try {
      if (token.kind === 'op' && token.text === '-') {
        this.pos++;
        const operand = this.parseUnary();
        const h = operand.h + 1;
        this.checkHeight(h, token);
        return { node: { kind: 'negate', operand: operand.node }, h };
      }
      return this.parsePrimary();
    } finally {
      this.leave();
    }
  }

  private parsePrimary(): Parsed {
    const token = this.peek();
    switch (token.kind) {
      case 'number':
        this.pos++;
        return { node: { kind: 'number', value: token.number ?? 0 }, h: 1 };
      case 'string':
        this.pos++;
        return { node: { kind: 'string', value: token.string ?? '' }, h: 1 };
      case 'boolean':
        this.pos++;
        return { node: { kind: 'boolean', value: token.text === 'TRUE' }, h: 1 };
      case 'address':
        if (this.peek(1).kind === 'colon') {
          this.fail(token.column, 'range is only allowed as a function argument');
        }
        this.pos++;
        return { node: toCellNode(token), h: 1 };
      case 'ident':
        if (this.peek(1).kind === 'lparen') return this.parseCall(token);
        this.pos++;
        return { node: { kind: 'name', name: token.text }, h: 1 };
      case 'lparen': {
        this.pos++;
        this.enter(token);
        try {
          const inner = this.parseComparison();
          this.expectClose("expected ')'");
          return inner;
        } finally {
          this.leave();
        }
      }
      case 'rparen':
      case 'comma':
        return this.fail(token.column, 'expected a value here');
      default:
        return this.unexpected(token);
    }
  }

  private expectClose(message: string): void {
    const token = this.peek();
    if (token.kind === 'rparen') {
      this.pos++;
      return;
    }
    if (token.kind === 'eof') this.fail(token.column, 'unexpected end of formula');
    this.fail(token.column, message);
  }

  private parseCall(nameToken: Token): Parsed {
    this.pos += 2; // identifier and '('
    const args: Node[] = [];
    let maxH = 0;
    if (this.peek().kind === 'rparen') {
      this.pos++;
    } else {
      this.enter(nameToken);
      try {
        for (;;) {
          const arg = this.parseArgument();
          args.push(arg.node);
          maxH = Math.max(maxH, arg.h);
          if (this.peek().kind === 'comma') {
            this.pos++;
            continue;
          }
          this.expectClose("expected ',' or ')'");
          break;
        }
      } finally {
        this.leave();
      }
    }
    const h = maxH + 1;
    this.checkHeight(h, nameToken);
    return { node: { kind: 'call', name: nameToken.text, args }, h };
  }

  private parseArgument(): Parsed {
    const a = this.peek();
    const colon = this.peek(1);
    const b = this.peek(2);
    const after = this.peek(3);
    if (
      a.kind === 'address' &&
      colon.kind === 'colon' &&
      b.kind === 'address' &&
      (after.kind === 'comma' || after.kind === 'rparen')
    ) {
      this.pos += 3;
      return { node: { kind: 'range', from: toCellNode(a), to: toCellNode(b) }, h: 2 };
    }
    return this.parseComparison();
  }
}

/** Parse a full Raw_Text. Raw_Text that does not start with '=' fails at Col 1. Never throws. */
export function parseFormula(rawText: string): ParseResult {
  try {
    const scanned = scan(rawText);
    const lexical = scanned.error;
    const tokens: Token[] = [...scanned.tokens];
    if (lexical !== null) {
      // The partial token list ends where the lexical error starts.
      tokens.push({ kind: 'eof', column: lexical.column, text: '' });
    }
    try {
      const ast = new Parser(tokens).parseTop();
      if (lexical !== null) return { ok: false, error: lexical };
      return { ok: true, ast };
    } catch (failure) {
      if (failure instanceof ParseFailure) {
        if (lexical !== null && lexical.column <= failure.error.column) {
          return { ok: false, error: lexical };
        }
        return { ok: false, error: failure.error };
      }
      throw failure;
    }
  } catch {
    return { ok: false, error: makeParseError(1, 'formula could not be read') };
  }
}
