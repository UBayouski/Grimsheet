import { describe, expect, it } from 'vitest';
import { FUNCTION_NAMES, RESERVED_NAMES, validateCellName } from './names';
import { recalculate } from './recalculator';
import { createSheet, getValueByAddress, setCellName, setRawText } from './sheet';

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

  it('rejects a name that is any letter plus digits, not only columns A to L', () => {
    for (const bad of ['M1', 'm1', 'Z9', 'x20', 'Q007', 'F2']) {
      expect(validateCellName(bad)).toEqual({ ok: false, failed: 'address-like' });
    }
  });

  it('allows names that only start like an address', () => {
    expect(validateCellName('A1B')).toEqual({ ok: true, canonical: 'A1B' });
    expect(validateCellName('AB1')).toEqual({ ok: true, canonical: 'AB1' });
    expect(validateCellName('M_1')).toEqual({ ok: true, canonical: 'M_1' });
  });

  it('every accepted name from a sample list can be used in a formula and resolves', () => {
    const samples = ['HP', '_X', 'move_m1', 'A1B', 'AB1', 'M_1', 'X', 'Zed', 'M1', 'Z9', 'q20', 'hero2', '_1'];
    for (const sample of samples) {
      const checked = validateCellName(sample);
      if (!checked.ok) continue; // rejected names are covered above
      const sheet = createSheet();
      expect(setCellName(sheet, 'B2', sample)).toMatchObject({ accepted: true, name: checked.canonical });
      expect(setRawText(sheet, 'B2', '41').accepted).toBe(true);
      expect(setRawText(sheet, 'C3', `=${sample}+1`).accepted).toBe(true);
      recalculate(sheet, { heroAddress: { col: 1, row: 1 }, random: () => 0.5 });
      expect(getValueByAddress(sheet, 'C3'), `name ${sample}`).toMatchObject({
        ok: true,
        value: { kind: 'number', value: 42 },
      });
    }
    // The sample list must keep some accepted names, or the loop above proves nothing.
    expect(samples.filter((s) => validateCellName(s).ok).length).toBeGreaterThan(8);
  });

  it('lists 14 functions and 4 reserved names', () => {
    expect(FUNCTION_NAMES).toHaveLength(14);
    expect(RESERVED_NAMES).toEqual(['HERO', 'SELF', 'TRUE', 'FALSE']);
  });
});
