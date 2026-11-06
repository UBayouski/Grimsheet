/** Value types, constructors and display formatting. Imports nothing from other engine files. */

export type ErrorKind = '#REF!' | '#NAME?' | '#DIV/0!' | '#VALUE!' | '#CYCLE!';

export interface NumberValue {
  readonly kind: 'number';
  readonly value: number;
}
export interface StringValue {
  readonly kind: 'string';
  readonly value: string;
}
export interface BooleanValue {
  readonly kind: 'boolean';
  readonly value: boolean;
}
export interface ErrorValue {
  readonly kind: 'error';
  readonly error: ErrorKind;
  readonly cause: string;
  readonly origin: string;
}
export interface RuleValue {
  readonly kind: 'rule';
  readonly text: string;
}

export type Value = NumberValue | StringValue | BooleanValue | ErrorValue | RuleValue;

export function numberValue(value: number): NumberValue {
  return { kind: 'number', value };
}

export function stringValue(value: string): StringValue {
  return { kind: 'string', value };
}

export function booleanValue(value: boolean): BooleanValue {
  return { kind: 'boolean', value };
}

export function errorValue(error: ErrorKind, cause: string, origin: string): ErrorValue {
  return { kind: 'error', error, cause, origin };
}

export function ruleValue(text: string): RuleValue {
  return { kind: 'rule', text };
}

/** Shortest round-trip decimal text, no exponent, "-0" prints as "0". Non-finite input prints as "0". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const negative = n < 0;
  // toExponential() with no argument gives the fewest digits that round-trip.
  const [mantissa = '', expText = '0'] = Math.abs(n).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exp = Number(expText);
  const pointAt = exp + 1; // digits before the decimal point
  let text: string;
  if (pointAt <= 0) {
    text = '0.' + '0'.repeat(-pointAt) + digits;
  } else if (pointAt >= digits.length) {
    text = digits + '0'.repeat(pointAt - digits.length);
  } else {
    text = digits.slice(0, pointAt) + '.' + digits.slice(pointAt);
  }
  return negative ? '-' + text : text;
}

/** Display text: number via formatNumber, string as-is, TRUE/FALSE, the ErrorKind, or the rule's Raw_Text. */
export function formatValue(v: Value): string {
  switch (v.kind) {
    case 'number':
      return formatNumber(v.value);
    case 'string':
      return v.value;
    case 'boolean':
      return v.value ? 'TRUE' : 'FALSE';
    case 'error':
      return v.error;
    case 'rule':
      return v.text;
  }
}
