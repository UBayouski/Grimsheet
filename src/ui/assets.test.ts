import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static assets that ship with the skin: the font, its licence, the favicon and the README credit.
// Paths are relative to the repository root, which is where Vitest runs.

const FONT = 'public/fonts/vt323-regular.ttf';
const LICENCE = 'public/fonts/OFL.txt';
const FAVICON = 'public/favicon.svg';

describe('font', () => {
  it('is the upstream VT323 file, 153,116 bytes', () => {
    expect(statSync(FONT).size).toBe(153116);
  });

  it('starts with a TrueType magic number', () => {
    const head = readFileSync(FONT).subarray(0, 4);
    const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join(' ');
    // 00 01 00 00 is TrueType outlines; "true" is the older Apple spelling. Accept both.
    expect(['00 01 00 00', '74 72 75 65']).toContain(hex);
  });
});

describe('OFL.txt', () => {
  const text = readFileSync(LICENCE, 'utf8');

  it('is the SIL Open Font License', () => {
    expect(text.toUpperCase()).toContain('SIL OPEN FONT LICENSE');
  });

  it('carries the VT323 copyright line', () => {
    expect(text).toContain('Copyright 2011, The VT323 Project Authors (peter.hull@oikoi.com)');
  });
});

describe('favicon.svg', () => {
  const svg = readFileSync(FAVICON, 'utf8');

  it('is an SVG with a viewBox', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox');
  });

  it('has no script', () => {
    expect(svg.toLowerCase()).not.toContain('<script');
  });

  it('has no href to an http URL', () => {
    expect(svg).not.toMatch(/href\s*=\s*["']\s*https?:/i);
  });
});

describe('README credit', () => {
  it('contains the font credit sentence exactly', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain(
      'Font: VT323 by Peter Hull, SIL Open Font License 1.1, https://github.com/google/fonts/tree/main/ofl/vt323 (file shipped unchanged).',
    );
  });
});
