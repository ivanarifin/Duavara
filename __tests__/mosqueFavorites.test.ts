import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildMosqueDirectionsUrl,
  getFavorites,
  isFavorite,
  MosqueFavoritesStorageError,
  MOSQUE_FAVORITES_KEY,
  normalizeMosqueFavorites,
  saveFavorites,
  toggleFavorite,
} from '@/services/mosqueFavorites';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const favorite = (id: string, overrides = {}) => ({
  id,
  name: `Mosque ${id}`,
  latitude: 35.681236,
  longitude: 139.767125,
  ...overrides,
});

describe('mosque favorites storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('normalizes invalid entries, deduplicates by id, and caps at 50', () => {
    const normalized = normalizeMosqueFavorites([
      favorite('first', { localPrayerNote: '  after prayer  ' }),
      favorite('first', { name: 'Duplicate' }),
      { id: 'invalid' },
      ...Array.from({ length: 55 }, (_, index) => favorite(`mosque-${index}`)),
    ]);

    expect(normalized).toHaveLength(50);
    expect(normalized[0]).toMatchObject({
      id: 'first',
      localPrayerNote: 'after prayer',
    });
    expect(normalized.filter(item => item.id === 'first')).toHaveLength(1);
    expect(normalized.some(item => item.id === 'mosque-48')).toBe(true);
    expect(normalized.some(item => item.id === 'mosque-49')).toBe(false);
  });

  test('saves, reads, checks, and toggles favorites', async () => {
    const first = favorite('first');
    const second = favorite('second');

    await expect(saveFavorites([first])).resolves.toEqual([first]);
    await expect(getFavorites()).resolves.toEqual([first]);
    await expect(isFavorite('first')).resolves.toBe(true);
    await expect(isFavorite('missing')).resolves.toBe(false);

    await expect(toggleFavorite(second)).resolves.toEqual([second, first]);
    await expect(toggleFavorite(second)).resolves.toEqual([first]);
  });

  test('treats missing storage as empty but surfaces malformed data as a read error', async () => {
    await expect(getFavorites()).resolves.toEqual([]);

    await AsyncStorage.setItem(MOSQUE_FAVORITES_KEY, '{malformed');
    await expect(getFavorites()).rejects.toMatchObject({
      name: 'MosqueFavoritesStorageError',
      operation: 'read',
    });
    await expect(getFavorites()).rejects.toBeInstanceOf(
      MosqueFavoritesStorageError,
    );
  });

  test('surfaces storage read and write failures distinctly', async () => {
    const getItem = AsyncStorage.getItem as jest.Mock;
    getItem.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(getFavorites()).rejects.toMatchObject({
      operation: 'read',
      message: 'Failed to read mosque favorites: disk unavailable',
    });

    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(saveFavorites([favorite('first')])).rejects.toMatchObject({
      operation: 'write',
      message: 'Failed to write mosque favorites: quota exceeded',
    });
  });
});

describe('mosque directions URL', () => {
  test('uses current location as the route source', () => {
    expect(
      buildMosqueDirectionsUrl(
        { latitude: 35.7, longitude: 139.8 },
        { latitude: 35.6, longitude: 139.7 },
      ),
    ).toBe(
      'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=35.6,139.7;35.7,139.8',
    );
  });

  test('falls back to the destination map URL without a source', () => {
    expect(buildMosqueDirectionsUrl({ latitude: 35.7, longitude: 139.8 })).toBe(
      'https://www.openstreetmap.org/?mlat=35.7&mlon=139.8#map=18/35.7/139.8',
    );
  });
});
