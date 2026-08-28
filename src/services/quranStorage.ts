import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from '@/services/storageLock';
import {
  normalizeQuranBookmarks,
  normalizeQuranProgress,
  normalizeQuranReaderPreferences,
  QuranBookmark,
  QuranProgress,
  QuranReaderPreferences,
  isValidAyahNumber,
  isValidSurahNumber,
} from '@/domain/quran';

export const QURAN_BOOKMARKS_KEY = 'duavara.quran.bookmarks';
export const QURAN_PROGRESS_KEY = 'duavara.quran.progress';
export const QURAN_READER_PREFERENCES_KEY = 'duavara.quran.reader.preferences';

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getBookmarks(): Promise<QuranBookmark[]> {
  return normalizeQuranBookmarks(await readJson(QURAN_BOOKMARKS_KEY));
}

async function saveBookmarksUnlocked(
  normalized: QuranBookmark[],
): Promise<QuranBookmark[]> {
  await AsyncStorage.setItem(QURAN_BOOKMARKS_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function saveBookmarks(
  bookmarks: unknown,
): Promise<QuranBookmark[]> {
  const normalized = normalizeQuranBookmarks(bookmarks);
  return withStorageLock(() => saveBookmarksUnlocked(normalized));
}

export async function toggleBookmark(
  bookmark: unknown,
): Promise<QuranBookmark[]> {
  const normalizedBookmark = normalizeQuranBookmarks([bookmark])[0];
  if (!normalizedBookmark) {
    throw new Error(
      'Bookmark must have a surah number from 1 through 114 and a positive ayah number',
    );
  }

  return withStorageLock(async () => {
    const bookmarks = await getBookmarks();
    const index = bookmarks.findIndex(
      item =>
        item.surahNumber === normalizedBookmark.surahNumber &&
        item.ayahNumber === normalizedBookmark.ayahNumber,
    );

    if (index >= 0) bookmarks.splice(index, 1);
    else bookmarks.push(normalizedBookmark);

    return saveBookmarksUnlocked(normalizeQuranBookmarks(bookmarks));
  });
}

export async function isBookmarked(
  surahNumber: unknown,
  ayahNumber: unknown,
): Promise<boolean> {
  if (!isValidSurahNumber(surahNumber) || !isValidAyahNumber(ayahNumber)) {
    return false;
  }

  const bookmarks = await getBookmarks();
  return bookmarks.some(
    bookmark =>
      bookmark.surahNumber === surahNumber &&
      bookmark.ayahNumber === ayahNumber,
  );
}

export async function getReaderPreferences(): Promise<QuranReaderPreferences> {
  return normalizeQuranReaderPreferences(
    await readJson(QURAN_READER_PREFERENCES_KEY),
  );
}

export async function saveReaderPreferences(
  preferences: unknown,
): Promise<QuranReaderPreferences> {
  const normalized = normalizeQuranReaderPreferences(preferences);
  await withStorageLock(() =>
    AsyncStorage.setItem(
      QURAN_READER_PREFERENCES_KEY,
      JSON.stringify(normalized),
    ),
  );
  return normalized;
}

export async function getProgress(): Promise<QuranProgress | null> {
  return normalizeQuranProgress(await readJson(QURAN_PROGRESS_KEY));
}

export async function saveProgress(
  progress: unknown,
): Promise<QuranProgress | null> {
  const normalized = normalizeQuranProgress(progress);
  await withStorageLock(() =>
    normalized
      ? AsyncStorage.setItem(QURAN_PROGRESS_KEY, JSON.stringify(normalized))
      : AsyncStorage.removeItem(QURAN_PROGRESS_KEY),
  );
  return normalized;
}
