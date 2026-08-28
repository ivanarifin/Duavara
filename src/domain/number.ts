const UNSIGNED_DECIMAL_INPUT = /^\d*(?:\.\d*)?$/;
const UNSIGNED_DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIGNED_DECIMAL_INPUT = /^-?(?:\d+(?:\.\d*)?|\.\d*)?$/;
const SIGNED_DECIMAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIGNED_INTEGER_INPUT = /^-?\d*$/;
const SIGNED_INTEGER = /^-?\d+$/;
const UNSIGNED_INTEGER_INPUT = /^\d*$/;

export function isSignedDecimalInput(value: string): boolean {
  return SIGNED_DECIMAL_INPUT.test(value);
}

export function isSignedIntegerInput(value: string): boolean {
  return SIGNED_INTEGER_INPUT.test(value);
}

export function isUnsignedIntegerInput(value: string): boolean {
  return UNSIGNED_INTEGER_INPUT.test(value);
}

export function parseSignedDecimal(value: string): number | null {
  const normalized = value.trim();
  if (!SIGNED_DECIMAL.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseSignedInteger(value: string): number | null {
  const normalized = value.trim();
  if (!SIGNED_INTEGER.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) ? number : null;
}

export function formatDecimalInput(value: string): string | null {
  const normalized = value.replace(/,/g, '');
  if (!UNSIGNED_DECIMAL_INPUT.test(normalized)) return null;
  const [integer, fraction] = normalized.split('.');
  const grouped = integer
    .replace(/^0+(?=\d)/, '')
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function parseUnsignedDecimal(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!UNSIGNED_DECIMAL.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatNumberWithSeparators(value: number): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : '0.00';
}
