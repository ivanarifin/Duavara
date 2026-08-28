import type { ApiEnvelope } from '@/domain/types';

export const QURAN_API_BASE_URL = 'https://api.alquran.cloud/v1';
export const QURAN_SOURCE =
  'Arabic Quran text: AlQuran.cloud / Islamic Network (Uthmani edition).';
export const DEFAULT_TRANSLATION_EDITION = 'en.sahih';
export const DEFAULT_RECITER_EDITION = 'ar.alafasy';

const DEFAULT_TIMEOUT_MS = 15_000;
const EDITION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface SurahSummary {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: string;
  numberOfAyahs: number;
}

export interface QuranEdition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
  direction: string | null;
}

export interface QuranAyah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean | Record<string, unknown>;
  audio?: string;
  audioSecondary?: string[];
}

export interface SurahDetail extends SurahSummary {
  ayahs: QuranAyah[];
  edition?: QuranEdition;
}

export interface QuranSearchEdition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  type: string;
}

export interface QuranSearchMatch {
  number: number;
  text: string;
  edition: QuranSearchEdition;
  surah: Omit<SurahSummary, 'numberOfAyahs'>;
  numberInSurah: number;
}

export interface QuranSearchResults {
  count: number;
  matches: QuranSearchMatch[];
  total?: number;
  offset?: number;
  limit?: number;
}

export class QuranError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'QuranError';
  }
}

export interface QuranClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value)
  );
}

function isSurahSummary(value: unknown): value is SurahSummary {
  return (
    isRecord(value) &&
    isFiniteInteger(value.number) &&
    typeof value.name === 'string' &&
    typeof value.englishName === 'string' &&
    typeof value.englishNameTranslation === 'string' &&
    typeof value.revelationType === 'string' &&
    isFiniteInteger(value.numberOfAyahs)
  );
}

function isSearchSurah(value: unknown): value is QuranSearchMatch['surah'] {
  return (
    isRecord(value) &&
    isFiniteInteger(value.number) &&
    typeof value.name === 'string' &&
    typeof value.englishName === 'string' &&
    typeof value.englishNameTranslation === 'string' &&
    typeof value.revelationType === 'string'
  );
}

function isQuranEdition(value: unknown): value is QuranEdition {
  return (
    isRecord(value) &&
    typeof value.identifier === 'string' &&
    typeof value.language === 'string' &&
    typeof value.name === 'string' &&
    typeof value.englishName === 'string' &&
    typeof value.format === 'string' &&
    typeof value.type === 'string' &&
    (typeof value.direction === 'string' || value.direction === null)
  );
}

function isQuranSearchEdition(value: unknown): value is QuranSearchEdition {
  return (
    isRecord(value) &&
    typeof value.identifier === 'string' &&
    typeof value.language === 'string' &&
    typeof value.name === 'string' &&
    typeof value.englishName === 'string' &&
    typeof value.type === 'string'
  );
}

function isQuranAyah(value: unknown): value is QuranAyah {
  return (
    isRecord(value) &&
    isFiniteInteger(value.number) &&
    typeof value.text === 'string' &&
    isFiniteInteger(value.numberInSurah) &&
    isFiniteInteger(value.juz) &&
    isFiniteInteger(value.manzil) &&
    isFiniteInteger(value.page) &&
    isFiniteInteger(value.ruku) &&
    isFiniteInteger(value.hizbQuarter) &&
    (typeof value.sajda === 'boolean' || isRecord(value.sajda)) &&
    (value.audio === undefined || typeof value.audio === 'string') &&
    (value.audioSecondary === undefined ||
      (Array.isArray(value.audioSecondary) &&
        value.audioSecondary.every(item => typeof item === 'string')))
  );
}

function isSurahDetail(value: unknown): value is SurahDetail {
  return (
    isRecord(value) &&
    isSurahSummary(value) &&
    Array.isArray(value.ayahs) &&
    value.ayahs.every(isQuranAyah) &&
    (value.edition === undefined || isQuranEdition(value.edition))
  );
}

function isSurahSummaryList(value: unknown): value is SurahSummary[] {
  return Array.isArray(value) && value.every(isSurahSummary);
}

function isEditionList(value: unknown): value is QuranEdition[] {
  return Array.isArray(value) && value.every(isQuranEdition);
}

function isQuranSearchMatch(value: unknown): value is QuranSearchMatch {
  return (
    isRecord(value) &&
    isFiniteInteger(value.number) &&
    typeof value.text === 'string' &&
    isQuranSearchEdition(value.edition) &&
    isSearchSurah(value.surah) &&
    isFiniteInteger(value.numberInSurah)
  );
}

function isQuranSearchResults(value: unknown): value is QuranSearchResults {
  return (
    isRecord(value) &&
    isFiniteInteger(value.count) &&
    Array.isArray(value.matches) &&
    value.matches.every(isQuranSearchMatch) &&
    (value.total === undefined || isFiniteInteger(value.total)) &&
    (value.offset === undefined || isFiniteInteger(value.offset)) &&
    (value.limit === undefined || isFiniteInteger(value.limit))
  );
}

function validateSurahNumber(number: number): void {
  if (!Number.isInteger(number) || number < 1 || number > 114) {
    throw new Error('Surah number must be an integer from 1 through 114');
  }
}

function validateEditionId(edition: string): void {
  if (
    typeof edition !== 'string' ||
    !EDITION_ID_PATTERN.test(edition) ||
    edition.length > 128
  ) {
    throw new Error('Quran edition ID is invalid');
  }
}

function validateSearchQuery(query: string): string {
  const normalized = query.trim();
  if (!normalized || normalized.length > 120) {
    throw new Error('Quran search must contain 1 to 120 characters');
  }
  return normalized;
}

function validateSearchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Quran search limit must be an integer from 1 through 50');
  }
}

export class QuranClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: QuranClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? QURAN_API_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.baseUrl) throw new Error('AlQuran.cloud base URL is required');
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('AlQuran.cloud timeout must be positive');
    }
  }

  private async request<T>(
    path: string,
    isValidData: (value: unknown) => value is T,
    dataName: string,
  ): Promise<ApiEnvelope<T>> {
    const url = `${this.baseUrl}${path}`;
    const controller =
      typeof AbortController === 'undefined'
        ? undefined
        : new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(
          new QuranError(
            `AlQuran.cloud request timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    let response: Response;
    try {
      try {
        response = await Promise.race([
          this.fetchImpl(
            url,
            controller ? { signal: controller.signal } : undefined,
          ),
          timeoutPromise,
        ]);
      } catch (error) {
        if (timedOut) throw error;
        const message =
          error instanceof Error ? error.message : 'Network request failed';
        throw new QuranError(`AlQuran.cloud request failed: ${message}`);
      }

      let body: unknown;
      try {
        body = await Promise.race([response.json(), timeoutPromise]);
      } catch (error) {
        if (timedOut) throw error;
        throw new QuranError(
          `AlQuran.cloud returned invalid JSON (HTTP ${response.status})`,
          response.status,
        );
      }

      if (!response.ok) {
        throw new QuranError(
          `AlQuran.cloud request failed (HTTP ${response.status})`,
          response.status,
        );
      }

      if (
        !isRecord(body) ||
        typeof body.code !== 'number' ||
        typeof body.status !== 'string' ||
        !('data' in body)
      ) {
        throw new QuranError(
          'AlQuran.cloud returned an unexpected response envelope',
        );
      }

      if (body.code !== 200) {
        throw new QuranError(
          `AlQuran.cloud API error ${body.code}: ${
            body.status || 'unknown error'
          }`,
          body.code,
        );
      }

      if (!isValidData(body.data)) {
        throw new QuranError(`AlQuran.cloud returned invalid ${dataName} data`);
      }

      return body as unknown as ApiEnvelope<T>;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  getSurahs(): Promise<ApiEnvelope<SurahSummary[]>> {
    return this.request('/surah', isSurahSummaryList, 'surah list');
  }

  getTranslationEditions(): Promise<ApiEnvelope<QuranEdition[]>> {
    return this.request(
      '/edition?format=text&type=translation',
      isEditionList,
      'translation edition list',
    );
  }

  getEnglishTranslations(): Promise<ApiEnvelope<QuranEdition[]>> {
    return this.request(
      '/edition?language=en&format=text&type=translation',
      isEditionList,
      'English translation edition list',
    );
  }

  getVerseByVerseReciters(): Promise<ApiEnvelope<QuranEdition[]>> {
    return this.request(
      '/edition?format=audio&type=versebyverse',
      isEditionList,
      'verse-by-verse reciter edition list',
    );
  }

  getSurah(
    number: number,
    edition = 'quran-uthmani',
  ): Promise<ApiEnvelope<SurahDetail>> {
    validateSurahNumber(number);
    validateEditionId(edition);
    return this.request(
      `/surah/${number}/${edition}`,
      isSurahDetail,
      'surah detail',
    );
  }

  search(
    query: string,
    edition = DEFAULT_TRANSLATION_EDITION,
    limit = 20,
  ): Promise<ApiEnvelope<QuranSearchResults>> {
    const normalizedQuery = validateSearchQuery(query);
    validateEditionId(edition);
    validateSearchLimit(limit);
    return this.request(
      `/search/${encodeURIComponent(
        normalizedQuery,
      )}/all/${edition}?offset=0&limit=${limit}`,
      isQuranSearchResults,
      'Quran search results',
    );
  }
}

export const quranClient = new QuranClient();
