import {
  formatDecimalInput,
  formatNumberWithSeparators,
  isSignedDecimalInput,
  isSignedIntegerInput,
  parseSignedDecimal,
  parseSignedInteger,
  parseUnsignedDecimal,
} from '@/domain';

describe('numeric input helpers', () => {
  test('formats editable positive decimal amounts with separators', () => {
    expect(formatDecimalInput('1234567.89')).toBe('1,234,567.89');
    expect(formatDecimalInput('1000.')).toBe('1,000.');
    expect(formatDecimalInput('12a')).toBeNull();
    expect(parseUnsignedDecimal('1,234,567.89')).toBe(1_234_567.89);
    expect(formatNumberWithSeparators(1234.5)).toBe('1,234.50');
  });

  test('accepts only the expected signed coordinate and integer inputs', () => {
    expect(isSignedDecimalInput('-6.9147')).toBe(true);
    expect(isSignedDecimalInput('1e3')).toBe(false);
    expect(parseSignedDecimal('-6.9147')).toBe(-6.9147);
    expect(parseSignedDecimal('--6')).toBeNull();
    expect(isSignedIntegerInput('-180')).toBe(true);
    expect(isSignedIntegerInput('1.5')).toBe(false);
    expect(parseSignedInteger('-180')).toBe(-180);
    expect(parseSignedInteger('1.5')).toBeNull();
  });
});
