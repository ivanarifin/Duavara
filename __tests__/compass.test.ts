import { getRelativeQiblaAngle } from '@/services/compass';

describe('Qibla compass math', () => {
  test('chooses the shortest turn across north', () => {
    expect(getRelativeQiblaAngle(10, 350)).toBe(20);
    expect(getRelativeQiblaAngle(350, 10)).toBe(-20);
  });

  test('returns zero when the Qibla bearing is aligned', () => {
    expect(getRelativeQiblaAngle(118, 118)).toBe(0);
  });

  test('converts a raw true-north Qibla bearing into a phone-relative turn', () => {
    expect(getRelativeQiblaAngle(118, 90)).toBe(28);
    expect(getRelativeQiblaAngle(118, 150)).toBe(-32);
  });
});
