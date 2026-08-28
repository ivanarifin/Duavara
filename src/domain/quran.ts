export interface QuranBookmark {
  surahNumber: number;
  ayahNumber: number;
  surahName: string;
  ayahText: string;
  createdAt: number;
}

export interface QuranProgress {
  surahNumber: number;
  ayahNumber: number;
  updatedAt: number;
}

export type QuranReadingTheme = 'light' | 'dark';

export interface QuranReaderPreferences {
  arabicFontSize: number;
  translationFontSize: number;
  theme: QuranReadingTheme;
  translationLanguage: string;
  translationEditionId: string;
}

export const DEFAULT_QURAN_READER_PREFERENCES: QuranReaderPreferences = {
  arabicFontSize: 23,
  translationFontSize: 15,
  theme: 'light',
  translationLanguage: 'en',
  translationEditionId: 'en.sahih',
};

export const MAX_QURAN_BOOKMARKS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidReaderString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  );
}

function isValidFontSize(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isValidSurahNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 114
  );
}

export function isValidAyahNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeQuranBookmark(value: unknown): QuranBookmark | null {
  if (
    !isRecord(value) ||
    !isValidSurahNumber(value.surahNumber) ||
    !isValidAyahNumber(value.ayahNumber) ||
    typeof value.surahName !== 'string' ||
    typeof value.ayahText !== 'string' ||
    !isValidTimestamp(value.createdAt)
  ) {
    return null;
  }

  return {
    surahNumber: value.surahNumber,
    ayahNumber: value.ayahNumber,
    surahName: value.surahName,
    ayahText: value.ayahText,
    createdAt: value.createdAt,
  };
}

export function normalizeQuranBookmarks(value: unknown): QuranBookmark[] {
  if (!Array.isArray(value)) return [];

  const newestByAyah = new Map<string, QuranBookmark>();
  for (const item of value) {
    const bookmark = normalizeQuranBookmark(item);
    if (!bookmark) continue;

    const key = `${bookmark.surahNumber}:${bookmark.ayahNumber}`;
    const existing = newestByAyah.get(key);
    if (!existing || bookmark.createdAt > existing.createdAt) {
      newestByAyah.set(key, bookmark);
    }
  }

  return Array.from(newestByAyah.values())
    .sort((first, second) => second.createdAt - first.createdAt)
    .slice(0, MAX_QURAN_BOOKMARKS);
}

export function normalizeQuranReaderPreferences(
  value: unknown,
): QuranReaderPreferences {
  const record = isRecord(value) ? value : {};
  return {
    arabicFontSize: isValidFontSize(record.arabicFontSize, 18, 40)
      ? record.arabicFontSize
      : DEFAULT_QURAN_READER_PREFERENCES.arabicFontSize,
    translationFontSize: isValidFontSize(record.translationFontSize, 12, 30)
      ? record.translationFontSize
      : DEFAULT_QURAN_READER_PREFERENCES.translationFontSize,
    theme:
      record.theme === 'dark' || record.theme === 'light'
        ? record.theme
        : DEFAULT_QURAN_READER_PREFERENCES.theme,
    translationLanguage: isValidReaderString(record.translationLanguage, 32)
      ? record.translationLanguage
      : DEFAULT_QURAN_READER_PREFERENCES.translationLanguage,
    translationEditionId: isValidReaderString(record.translationEditionId, 128)
      ? record.translationEditionId
      : DEFAULT_QURAN_READER_PREFERENCES.translationEditionId,
  };
}

export function normalizeQuranProgress(value: unknown): QuranProgress | null {
  if (
    !isRecord(value) ||
    !isValidSurahNumber(value.surahNumber) ||
    !isValidAyahNumber(value.ayahNumber) ||
    !isValidTimestamp(value.updatedAt)
  ) {
    return null;
  }

  return {
    surahNumber: value.surahNumber,
    ayahNumber: value.ayahNumber,
    updatedAt: value.updatedAt,
  };
}
