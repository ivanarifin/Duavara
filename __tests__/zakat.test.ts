jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { calculateZakat } from '@/components/ZakatCalculator';

describe('Zakat calculator', () => {
  test('calculates net assets, selected nisab, and 2.5% Zakat locally', () => {
    expect(
      calculateZakat({
        cash: 10_000,
        goldGrams: 10,
        goldPricePerGram: 100,
        silverGrams: 100,
        silverPricePerGram: 1,
        businessAssets: 1_000,
        debtsDue: 2_100,
        nisabBasis: 'gold',
      }),
    ).toEqual({ assets: 10_000, nisab: 8_500, zakat: 250 });
  });

  test('does not charge Zakat below the selected nisab', () => {
    expect(
      calculateZakat({
        cash: 500,
        goldGrams: 0,
        goldPricePerGram: 100,
        silverGrams: 0,
        silverPricePerGram: 1,
        businessAssets: 0,
        debtsDue: 0,
        nisabBasis: 'silver',
      }),
    ).toEqual({ assets: 500, nisab: 595, zakat: 0 });
  });
});
