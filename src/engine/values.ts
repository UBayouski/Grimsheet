export type ErrorKind = '#REF!' | '#NAME?' | '#DIV/0!' | '#VALUE!' | '#CYCLE!';

export type Value =
  | { readonly kind: 'number'; readonly value: number } // always finite
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | {
      readonly kind: 'error';
      readonly error: ErrorKind;
      readonly cause: string;
      readonly origin: string;
    }
  | { readonly kind: 'rule'; readonly text: string };

export type ErrorValue = Extract<Value, { kind: 'error' }>;

export function numberValue(value: number): Value {
  return { kind: 'number', value };
}

export function stringValue(value: string): Value {
  return { kind: 'string', value };
}

export function booleanValue(value: boolean): Value {
  return { kind: 'boolean', value };
}

export function errorValue(error: ErrorKind, cause: string, origin: string): ErrorValue {
  return { kind: 'error', error, cause, origin };
}

export function ruleValue(text: string): Value {
  return { kind: 'rule', text };
}

/** Shortest round-trip decimal text, no exponent, "-0" prints as "0". */
export function formatNumber(n: number): string {
  if (n === 0) return '0';
  if (!Number.isFinite(n)) return String(n);
  const negative = n < 0;
  // toExponential() with no argument yields the fewest digits that round-trip.
  const [mantissa = '', exponentText = '0'] = Math.abs(n).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exponent = Number(exponentText);
  const pointPos = exponent + 1; // digits before the decimal point
  let text: string;
  if (pointPos <= 0) {
    text = `0.${'0'.repeat(-pointPos)}${digits}`;
  } else if (pointPos >= digits.length) {
    text = digits + '0'.repeat(pointPos - digits.length);
  } else {
    text = `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`;
  }
  return negative ? `-${text}` : text;
}

/** Display text: number via formatNumber, string as-is, TRUE/FALSE, the ErrorKind, or the Rule_Cell's Raw_Text. */
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
