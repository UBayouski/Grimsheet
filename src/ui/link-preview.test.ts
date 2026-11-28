import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Link-preview tags in index.html (paths are relative to the repository root, where Vitest runs).
const html = readFileSync('index.html', 'utf8');
const SITE = 'https://grimsheet.onrender.com';

function meta(attr: 'name' | 'property', key: string): string | undefined {
  const tag = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(html);
  return tag?.[1];
}

describe('index.html link preview', () => {
  it('has the description, Open Graph and Twitter tags', () => {
    const tagline = /\*\*(A roguelike where every monster is a formula\.)\*\*/.exec(readFileSync('README.md', 'utf8'));
    expect(tagline).not.toBeNull();
    expect(meta('name', 'description')).toBe(tagline?.[1]);
    expect(meta('property', 'og:title')).toBe('GRIMSHEET.XLS');
    expect(meta('property', 'og:description')).toBe(tagline?.[1]);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:url')).toBe(SITE);
    expect(meta('property', 'og:image')).toBe(`${SITE}/og-image.png`);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(readFileSync('README.md', 'utf8')).toContain(SITE);
  });

  it('ships a 1200 x 630 PNG preview image', () => {
    const png = readFileSync('public/og-image.png');
    expect(statSync('public/og-image.png').size).toBeGreaterThan(0);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('uses the skin backdrop as the theme colour and has a noscript line', () => {
    const css = readFileSync('src/styles/chrome.css', 'utf8');
    expect(meta('name', 'theme-color')).toBe(/--backdrop:\s*(#[0-9a-f]{6})/i.exec(css)?.[1]);
    expect(html).toMatch(/<noscript>[^<]*JavaScript[^<]*<\/noscript>/);
  });
});
