/** Function names of the frozen subset. A Cell_Name may not equal one of these. */
export const FUNCTION_NAMES: readonly string[] = [
  'SUM',
  'MIN',
  'MAX',
  'ABS',
  'MOD',
  'IF',
  'AND',
  'OR',
  'NOT',
  'ROW',
  'COL',
  'DIST',
  'TOWARD',
  'RAND',
];

/** Names with a fixed meaning in formulas. A Cell_Name may not equal one of these. */
export const RESERVED_NAMES: readonly string[] = ['HERO', 'SELF', 'TRUE', 'FALSE'];

export type NameCheckFailure = 'pattern' | 'reserved' | 'function' | 'address-like';

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ADDRESS_LIKE = /^[A-La-l][0-9]+$/;

/**
 * Checks, in order: pattern, reserved, function, address-like. All comparisons are
 * case-insensitive. The canonical form is upper case.
 */
export function validateCellName(
  name: string,
): { ok: true; canonical: string } | { ok: false; failed: NameCheckFailure } {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return { ok: false, failed: 'pattern' };
  }
  const canonical = name.toUpperCase();
  if (RESERVED_NAMES.includes(canonical)) return { ok: false, failed: 'reserved' };
  if (FUNCTION_NAMES.includes(canonical)) return { ok: false, failed: 'function' };
  if (ADDRESS_LIKE.test(canonical)) return { ok: false, failed: 'address-like' };
  return { ok: true, canonical };
}
