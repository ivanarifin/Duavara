import { NativeModules } from 'react-native';
import { getRegionName } from '@/services/region';

describe('region lookup', () => {
  test('returns a valid native region name and ignores unavailable results', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraLocation;
    modules.DuavaraLocation = {
      reverseGeocode: jest.fn().mockResolvedValue('South Jakarta'),
    };

    try {
      await expect(
        getRegionName({ latitude: -6.2615, longitude: 106.8106 }),
      ).resolves.toBe('South Jakarta');

      modules.DuavaraLocation = {};
      await expect(
        getRegionName({ latitude: -6.9147, longitude: 107.6098 }),
      ).resolves.toBeNull();
    } finally {
      modules.DuavaraLocation = original;
    }
  });
});
