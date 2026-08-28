import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuranBookmark, normalizeQuranBookmarks } from '@/domain/quran';
import {
  getBookmarks,
  getProgress,
  isBookmarked,
  QURAN_BOOKMARKS_KEY,
  QURAN_PROGRESS_KEY,
  QURAN_READER_PREFERENCES_KEY,
  getReaderPreferences,
  saveBookmarks,
  saveProgress,
  saveReaderPreferences,
  toggleBookmark,
} from '@/services/quranStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const bookmark = (
  surahNumber: number,
  ayahNumber: number,
  createdAt: number,
  overrides: Partial<QuranBookmark> = {},
): QuranBookmark => ({
  surahNumber,
  ayahNumber,
  surahName: `Surah ${surahNumber}`,
  ayahText: `Ayah ${ayahNumber}`,
  createdAt,
  ...overrides,
});

describe('Quran bookmark storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('normalizes, deduplicates by ayah, sorts newest first, and caps at 100', () => {
    const normalized = normalizeQuranBookmarks([
      bookmark(2, 1, 10),
      bookmark(1, 1, 20),
      bookmark(2, 1, 30, { ayahText: 'newest' }),
      bookmark(0, 1, 100),
      bookmark(115, 1, 100),
      bookmark(1, 0, 100),
      { surahNumber: 1, ayahNumber: 2 },
      ...Array.from({ length: 101 }, (_, index) =>
        bookmark(3, index + 1, -101 + index),
      ),
    ]);

    expect(normalized).toHaveLength(100);
    expect(normalized[0]).toEqual(bookmark(2, 1, 30, { ayahText: 'newest' }));
    expect(normalized).toEqual(
      [...normalized].sort(
        (first, second) => second.createdAt - first.createdAt,
      ),
    );
    expect(
      normalized.filter(
        item => item.surahNumber === 2 && item.ayahNumber === 1,
      ),
    ).toHaveLength(1);
    expect(
      normalized.some(item => item.surahNumber === 1 && item.ayahNumber === 1),
    ).toBe(true);
    expect(
      normalized.some(item => item.surahNumber === 3 && item.ayahNumber === 1),
    ).toBe(false);
  });

  test('saves and toggles bookmarks', async () => {
    const first = bookmark(1, 1, 100);
    const second = bookmark(2, 255, 200);

    await saveBookmarks([first]);
    expect(await getBookmarks()).toEqual([first]);
    expect(await isBookmarked(1, 1)).toBe(true);
    expect(await isBookmarked(1, 2)).toBe(false);

    expect(await toggleBookmark(second)).toEqual([second, first]);
    expect(await isBookmarked(2, 255)).toBe(true);
    expect(await toggleBookmark(second)).toEqual([first]);
    expect(await isBookmarked(2, 255)).toBe(false);
  });

  test('rejects invalid bookmark coordinates when toggling', async () => {
    await expect(toggleBookmark(bookmark(0, 1, 1))).rejects.toThrow();
    await expect(toggleBookmark(bookmark(1, 0, 1))).rejects.toThrow();
    expect(await getBookmarks()).toEqual([]);
  });
});

describe('Quran reader preference storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('persists preferences under a separate key and normalizes invalid values', async () => {
    const saved = await saveReaderPreferences({
      arabicFontSize: 40,
      translationFontSize: 12,
      theme: 'dark',
      translationLanguage: 'fr',
      translationEditionId: 'fr.hamidullah',
    });

    expect(saved).toEqual({
      arabicFontSize: 40,
      translationFontSize: 12,
      theme: 'dark',
      translationLanguage: 'fr',
      translationEditionId: 'fr.hamidullah',
    });
    expect(await getReaderPreferences()).toEqual(saved);
    expect(await AsyncStorage.getItem(QURAN_READER_PREFERENCES_KEY)).toBe(
      JSON.stringify(saved),
    );
    expect(await AsyncStorage.getItem(QURAN_BOOKMARKS_KEY)).toBeNull();

    await AsyncStorage.setItem(
      QURAN_READER_PREFERENCES_KEY,
      JSON.stringify({
        arabicFontSize: 999,
        translationFontSize: 'large',
        theme: 'sepia',
        translationLanguage: '../fr',
        translationEditionId: '',
      }),
    );
    await expect(getReaderPreferences()).resolves.toEqual({
      arabicFontSize: 23,
      translationFontSize: 15,
      theme: 'light',
      translationLanguage: 'en',
      translationEditionId: 'en.sahih',
    });
  });
});

describe('Quran progress storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('persists and reads valid progress', async () => {
    const progress = { surahNumber: 36, ayahNumber: 12, updatedAt: 123 };

    await expect(saveProgress(progress)).resolves.toEqual(progress);
    await expect(getProgress()).resolves.toEqual(progress);
  });

  test('falls back safely for malformed bookmark and progress data', async () => {
    await AsyncStorage.setItem(QURAN_BOOKMARKS_KEY, '{malformed');
    await AsyncStorage.setItem(QURAN_PROGRESS_KEY, '{malformed');

    await expect(getBookmarks()).resolves.toEqual([]);
    await expect(getProgress()).resolves.toBeNull();

    await AsyncStorage.setItem(
      QURAN_PROGRESS_KEY,
      JSON.stringify({ surahNumber: 114, ayahNumber: 1 }),
    );
    await expect(getProgress()).resolves.toBeNull();
    await expect(isBookmarked(0, 1)).resolves.toBe(false);
  });
});
