import { describe, expect, it } from 'vitest';
import {
  booleanValue,
  errorValue,
  formatNumber,
  formatValue,
  numberValue,
  ruleValue,
  stringValue,
  type ErrorKind,
} from './values';

describe('formatNumber', () => {
  it('prints short decimals as-is', () => {
    expect(formatNumber(0.1)).toBe('0.1');
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });

  it('never uses an exponent', () => {
    expect(formatNumber(1e21)).toBe('1000000000000000000000');
    expect(formatNumber(5e-7)).toBe('0.0000005');
    expect(formatNumber(123456789012345680000)).toBe('123456789012345680000');
  });

  it('prints -0 as 0', () => {
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatValue', () => {
  it('formats each kind', () => {
    expect(formatValue(numberValue(0.1))).toBe('0.1');
    expect(formatValue(stringValue('hi'))).toBe('hi');
    expect(formatValue(booleanValue(true))).toBe('TRUE');
    expect(formatValue(booleanValue(false))).toBe('FALSE');
    expect(formatValue(errorValue('#REF!', 'bad ref', 'A1'))).toBe('#REF!');
    expect(formatValue(ruleValue('=TOWARD(HERO)'))).toBe('=TOWARD(HERO)');
  });

  it('shows five distinct error display texts', () => {
    const kinds: ErrorKind[] = ['#REF!', '#NAME?', '#DIV/0!', '#VALUE!', '#CYCLE!'];
    const texts = kinds.map((k) => formatValue(errorValue(k, 'cause', 'A1')));
    expect(texts).toEqual(kinds);
    expect(new Set(texts).size).toBe(5);
  });
});
