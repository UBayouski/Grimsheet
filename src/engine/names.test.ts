import { describe, expect, it } from 'vitest';
import { FUNCTION_NAMES, RESERVED_NAMES, validateCellName } from './names';

describe('validateCellName', () => {
  it('accepts valid names and returns the upper case form', () => {
    expect(validateCellName('HP')).toEqual({ ok: true, canonical: 'HP' });
    expect(validateCellName('_X')).toEqual({ ok: true, canonical: '_X' });
    expect(validateCellName('move_m1')).toEqual({ ok: true, canonical: 'MOVE_M1' });
  });

  it('fails the pattern check', () => {
    for (const bad of ['1HP', '', 'A-B', 'A B', 'é', 'HP!']) {
      expect(validateCellName(bad)).toEqual({ ok: false, failed: 'pattern' });
    }
  });

  it('fails the reserved check, case-insensitively', () => {
    for (const bad of ['HERO', 'self', 'True', 'FALSE']) {
      expect(validateCellName(bad)).toEqual({ ok: false, failed: 'reserved' });
    }
  });

  it('fails the function check, case-insensitively', () => {
    for (const bad of ['SUM', 'toward', 'Rand', 'IF']) {
      expect(validateCellName(bad)).toEqual({ ok: false, failed: 'function' });
    }
  });

  it('fails the address-like check, case-insensitively', () => {
    for (const bad of ['A1', 'l20', 'B99', 'C0', 'a007']) {
      expect(validateCellName(bad)).toEqual({ ok: false, failed: 'address-like' });
    }
  });

  it('allows names that only start like an address', () => {
    expect(validateCellName('M1')).toEqual({ ok: true, canonical: 'M1' });
    expect(validateCellName('A1B')).toEqual({ ok: true, canonical: 'A1B' });
    expect(validateCellName('AB1')).toEqual({ ok: true, canonical: 'AB1' });
  });

  it('lists 14 functions and 4 reserved names', () => {
    expect(FUNCTION_NAMES).toHaveLength(14);
    expect(RESERVED_NAMES).toEqual(['HERO', 'SELF', 'TRUE', 'FALSE']);
  });
});
