import { describe, expect, it } from 'vitest';
import { scan, tokenize, type Token } from './tokenizer';

function ok(text: string): readonly Token[] {
  const r = tokenize(text);
  if (!r.ok) throw new Error(`unexpected error: ${r.error.text}`);
  return r.tokens;
}

function summary(text: string): string[] {
  return ok(text)
    .filter((t) => t.kind !== 'eof')
    .map((t) => `${t.kind}:${t.text}@${t.column}`);
}

function fails(text: string): string {
  const r = tokenize(text);
  if (r.ok) throw new Error('expected a tokenizer error');
  return r.error.text;
}

describe('tokenize: operators', () => {
  it('reads the longest operator', () => {
    expect(summary('=1<=2')).toEqual(['op:=@1', 'number:1@2', 'op:<=@3', 'number:2@5']);
    expect(summary('=1>=2')).toContain('op:>=@3');
    expect(summary('=1<>2')).toContain('op:<>@3');
    expect(summary('=1< =2').filter((s) => s.startsWith('op'))).toEqual(['op:=@1', 'op:<@3', 'op:=@5']);
  });

  it('reads every single-character operator and punctuation', () => {
    expect(summary('=+-*/&=< >():,').map((s) => s.split('@')[0])).toEqual([
      'op:=',
      'op:+',
      'op:-',
      'op:*',
      'op:/',
      'op:&',
      'op:=',
      'op:<',
      'op:>',
      'lparen:(',
      'rparen:)',
      'colon::',
      'comma:,',
    ]);
  });

  it('keeps minus before a number as its own token', () => {
    expect(summary('=-3')).toEqual(['op:=@1', 'op:-@2', 'number:3@3']);
  });
});

describe('tokenize: columns', () => {
  it('counts the leading = as column 1 and skips spaces', () => {
    expect(summary('= SUM(A1,  B2)')).toEqual([
      'op:=@1',
      'ident:SUM@3',
      'lparen:(@6',
      'address:A1@7',
      'comma:,@9',
      'address:B2@12',
      'rparen:)@14',
    ]);
  });

  it('puts eof one past the last character', () => {
    const tokens = ok('=1+2');
    expect(tokens[tokens.length - 1]).toMatchObject({ kind: 'eof', column: 5 });
  });

  it('counts UTF-16 code units', () => {
    const tokens = ok('="😀"+1');
    expect(tokens.map((t) => t.column)).toEqual([1, 2, 6, 7, 8]);
  });
});

describe('tokenize: words', () => {
  it('upper-cases words and recognises booleans and addresses', () => {
    expect(summary('=true+False+b9+m30+a0+hp+_x+a1b')).toEqual([
      'op:=@1',
      'boolean:TRUE@2',
      'op:+@6',
      'boolean:FALSE@7',
      'op:+@12',
      'address:B9@13',
      'op:+@15',
      'address:M30@16',
      'op:+@19',
      'address:A0@20',
      'op:+@22',
      'ident:HP@23',
      'op:+@25',
      'ident:_X@26',
      'op:+@28',
      'ident:A1B@29',
    ]);
  });
});

describe('tokenize: numbers', () => {
  it('reads integers and decimals', () => {
    const tokens = ok('=3+2.5+007');
    expect(tokens.filter((t) => t.kind === 'number').map((t) => t.number)).toEqual([3, 2.5, 7]);
  });

  it('rejects a dot with no digit after it', () => {
    expect(fails('=1.')).toBe("Col 3: number needs a digit after '.'.");
    expect(fails('=1.+2')).toBe("Col 3: number needs a digit after '.'.");
  });

  it('rejects a second dot', () => {
    expect(fails('=1.5.2')).toBe("Col 5: number has a second '.'.");
  });

  it('rejects a leading dot as an unknown character', () => {
    expect(fails('=.5')).toBe('Col 2: unexpected character ..');
  });

  it('rejects a number that is not finite', () => {
    expect(fails(`=${'9'.repeat(400)}`)).toBe('Col 2: number is too large.');
  });
});

describe('tokenize: strings', () => {
  it('decodes doubled quotes into one token', () => {
    const tokens = ok('="a""b"&""');
    const strings = tokens.filter((t) => t.kind === 'string');
    expect(strings.map((t) => t.string)).toEqual(['a"b', '']);
    expect(strings.map((t) => t.column)).toEqual([2, 9]);
  });

  it('allows any character inside a string', () => {
    const tokens = ok('="a\tb\nc"');
    expect(tokens.find((t) => t.kind === 'string')?.string).toBe('a\tb\nc');
  });

  it('reports an unterminated string at the opening quote', () => {
    expect(fails('=1+"abc')).toBe('Col 4: string is missing its closing quote.');
    expect(fails('="a""')).toBe('Col 2: string is missing its closing quote.');
  });
});

describe('tokenize: errors', () => {
  it('rejects $ at its column', () => {
    expect(fails('=$A$1')).toBe('Col 2: absolute references are not supported.');
    expect(fails('=A1+$B2')).toBe('Col 5: absolute references are not supported.');
  });

  it('rejects tab and newline', () => {
    expect(fails('=1\t+2')).toBe('Col 3: unexpected character U+0009.');
    expect(fails('=1+\n2')).toBe('Col 4: unexpected character U+000A.');
  });

  it('rejects other unknown characters', () => {
    expect(fails('=1#2')).toBe('Col 3: unexpected character #.');
    expect(fails('=1\u00a02')).toBe('Col 3: unexpected character U+00A0.');
  });

  it('keeps messages at most 80 characters', () => {
    expect(fails('=\u{1F600}').length).toBeLessThanOrEqual(80);
  });

  it('produces no tokens on error in strict mode', () => {
    const r = tokenize('=1+#');
    expect(r).toMatchObject({ ok: false });
    expect('tokens' in r).toBe(false);
  });
});

describe('scan', () => {
  it('returns the tokens before the first error, without eof', () => {
    const r = scan('=1+#+2');
    expect(r.error?.column).toBe(4);
    expect(r.tokens.map((t) => t.text)).toEqual(['=', '1', '+']);
  });

  it('returns eof and no error for clean text', () => {
    const r = scan('=1');
    expect(r.error).toBeNull();
    expect(r.tokens.at(-1)?.kind).toBe('eof');
  });

  it('handles empty text', () => {
    expect(scan('')).toEqual({ tokens: [{ kind: 'eof', column: 1, text: '' }], error: null });
  });
});
