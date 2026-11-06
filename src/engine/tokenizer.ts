export type TokenKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'address'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  /** 1-based, counted in UTF-16 code units; the leading '=' is column 1. */
  readonly column: number;
  /** Upper-cased for ident, address and boolean; operator text for op; source text otherwise. */
  readonly text: string;
  /** Number tokens. */
  readonly number?: number;
  /** String tokens: the decoded literal (doubled quotes collapsed). */
  readonly string?: string;
}

/** `text` is `Col N: <message>.` */
export interface ParseError {
  readonly column: number;
  readonly message: string;
  readonly text: string;
}

export function makeParseError(column: number, message: string): ParseError {
  return { column, message, text: `Col ${column}: ${message}.` };
}

/** A character or token for use in a message: control and non-printing characters become U+XXXX. */
export function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  const unprintable =
    cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0xd800 && cp <= 0xdfff) || /\s/u.test(ch);
  return unprintable ? `U+${cp.toString(16).toUpperCase().padStart(4, '0')}` : ch;
}

const OPERATORS_2 = ['<=', '>=', '<>'];
const OPERATORS_1 = '+-*/&=<>';

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function isWordStart(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_');
}

function isWordPart(ch: string | undefined): boolean {
  return isWordStart(ch) || isDigit(ch);
}

/**
 * Internal form used by the parser: the tokens before the first lexical error, plus that error.
 * When there is no error the token list ends with an `eof` token at column length + 1.
 * When there is an error the list has no `eof` token.
 */
export function scan(rawText: string): { tokens: readonly Token[]; error: ParseError | null } {
  const tokens: Token[] = [];
  const n = rawText.length;
  let i = 0;
  const fail = (index: number, message: string) => ({
    tokens,
    error: makeParseError(index + 1, message),
  });

  while (i < n) {
    const ch = rawText.charAt(i);
    const column = i + 1;

    if (ch === ' ') {
      i++;
      continue;
    }

    if (isDigit(ch)) {
      let j = i;
      while (isDigit(rawText.charAt(j))) j++;
      if (rawText.charAt(j) === '.') {
        if (!isDigit(rawText.charAt(j + 1))) return fail(j, "number needs a digit after '.'");
        j++;
        while (isDigit(rawText.charAt(j))) j++;
        if (rawText.charAt(j) === '.') return fail(j, "number has a second '.'");
      }
      const text = rawText.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) return fail(i, 'number is too large');
      tokens.push({ kind: 'number', column, text, number: value });
      i = j;
      continue;
    }

    if (isWordStart(ch)) {
      let j = i + 1;
      while (isWordPart(rawText.charAt(j))) j++;
      const text = rawText.slice(i, j).toUpperCase();
      let kind: TokenKind = 'ident';
      if (text === 'TRUE' || text === 'FALSE') kind = 'boolean';
      else if (/^[A-Z][0-9]+$/.test(text)) kind = 'address';
      tokens.push({ kind, column, text });
      i = j;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let decoded = '';
      let closed = false;
      while (j < n) {
        const c = rawText.charAt(j);
        if (c === '"') {
          if (rawText.charAt(j + 1) === '"') {
            decoded += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        decoded += c;
        j++;
      }
      if (!closed) return fail(i, 'string is missing its closing quote');
      tokens.push({ kind: 'string', column, text: rawText.slice(i, j), string: decoded });
      i = j;
      continue;
    }

    if (ch === '$') return fail(i, 'absolute references are not supported');

    const two = rawText.slice(i, i + 2);
    if (OPERATORS_2.includes(two)) {
      tokens.push({ kind: 'op', column, text: two });
      i += 2;
      continue;
    }
    if (OPERATORS_1.includes(ch)) {
      tokens.push({ kind: 'op', column, text: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', column, text: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', column, text: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', column, text: ch });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon', column, text: ch });
      i++;
      continue;
    }

    const point = String.fromCodePoint(rawText.codePointAt(i) ?? 0);
    return fail(i, `unexpected character ${describeChar(point)}`);
  }

  tokens.push({ kind: 'eof', column: n + 1, text: '' });
  return { tokens, error: null };
}

/** Strict form: either all tokens (ending with `eof`) or one error and no tokens. */
export function tokenize(
  rawText: string,
): { ok: true; tokens: readonly Token[] } | { ok: false; error: ParseError } {
  // Plain-JavaScript callers may pass anything: refuse it, like parseFormula. Never throws.
  try {
    if (typeof rawText !== 'string') {
      return { ok: false, error: makeParseError(1, 'formula could not be read') };
    }
    const result = scan(rawText);
    if (result.error !== null) return { ok: false, error: result.error };
    return { ok: true, tokens: result.tokens };
  } catch {
    return { ok: false, error: makeParseError(1, 'formula could not be read') };
  }
}
