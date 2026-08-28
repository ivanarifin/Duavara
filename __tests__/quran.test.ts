import {
  QuranClient,
  QURAN_SOURCE,
  SurahDetail,
  SurahSummary,
} from '@/services/quran';

type MockResponse = {
  body: unknown;
  ok?: boolean;
  status?: number;
};

const baseUrl = 'https://quran.test/v1';

function createClient({ body, ok = true, status = 200 }: MockResponse): {
  client: QuranClient;
  fetchMock: jest.MockedFunction<typeof fetch>;
} {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  fetchMock.mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);

  return {
    client: new QuranClient({ baseUrl, fetchImpl: fetchMock }),
    fetchMock,
  };
}

const summary: SurahSummary = {
  number: 1,
  name: 'الفاتحة',
  englishName: 'Al-Faatiha',
  englishNameTranslation: 'The Opening',
  revelationType: 'Meccan',
  numberOfAyahs: 7,
};

const detail: SurahDetail = {
  ...summary,
  ayahs: [
    {
      number: 1,
      text: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
      numberInSurah: 1,
      juz: 1,
      manzil: 1,
      page: 1,
      ruku: 1,
      hizbQuarter: 1,
      sajda: false,
    },
  ],
};

describe('QuranClient', () => {
  test('times out while parsing response JSON', async () => {
    jest.useFakeTimers();
    try {
      const json = jest.fn(() => new Promise<never>(() => undefined));
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json,
      } as unknown as Response);
      const client = new QuranClient({
        baseUrl,
        timeoutMs: 10,
        fetchImpl: fetchMock,
      });

      const request = client.getSurahs();
      await Promise.resolve();
      await Promise.resolve();
      expect(json).toHaveBeenCalled();
      jest.advanceTimersByTime(10);

      await expect(request).rejects.toThrow(
        'AlQuran.cloud request timed out after 10ms',
      );
    } finally {
      jest.useRealTimers();
    }
  });
  test('requests and parses the surah list', async () => {
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: [summary] },
    });

    await expect(client.getSurahs()).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: [summary],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/surah`);
  });

  test('requests and parses an Arabic Uthmani surah', async () => {
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: detail },
    });

    await expect(client.getSurah(1)).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: detail,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${baseUrl}/surah/1/quran-uthmani`,
    );
    expect(QURAN_SOURCE).toBe(
      'Arabic Quran text: AlQuran.cloud / Islamic Network (Uthmani edition).',
    );
  });

  test('requests and parses translation editions across languages', async () => {
    const translationEdition = {
      identifier: 'en.sahih',
      language: 'en',
      name: 'Saheeh International',
      englishName: 'Saheeh International',
      format: 'text',
      type: 'translation',
      direction: 'ltr',
    };
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: [translationEdition] },
    });

    await expect(client.getTranslationEditions()).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: [translationEdition],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${baseUrl}/edition?format=text&type=translation`,
    );
  });

  test('keeps the English-only edition query for compatible callers', async () => {
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: [] },
    });

    await client.getEnglishTranslations();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${baseUrl}/edition?language=en&format=text&type=translation`,
    );
  });

  test('requests and parses verse-by-verse reciter editions', async () => {
    const reciterEdition = {
      identifier: 'ar.alafasy',
      language: 'ar',
      name: 'Alafasy',
      englishName: 'Alafasy',
      format: 'audio',
      type: 'versebyverse',
      direction: 'rtl',
    };
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: [reciterEdition] },
    });

    await expect(client.getVerseByVerseReciters()).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: [reciterEdition],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${baseUrl}/edition?format=audio&type=versebyverse`,
    );
  });

  test('requests a custom edition and parses edition audio metadata', async () => {
    const edition = {
      identifier: 'en.sahih',
      language: 'en',
      name: 'Saheeh International',
      englishName: 'Saheeh International',
      format: 'text',
      type: 'translation',
      direction: 'ltr',
    };
    const customDetail = {
      ...detail,
      edition,
      ayahs: [
        {
          ...detail.ayahs[0],
          audio: 'https://audio.test/1.mp3',
          audioSecondary: ['https://audio.test/1-low.mp3'],
        },
      ],
    };
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: customDetail },
    });

    await expect(client.getSurah(1, 'en.sahih')).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: customDetail,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/surah/1/en.sahih`);
  });

  test('requests encoded searches and parses search matches', async () => {
    const searchMatch = {
      number: 1,
      text: 'Indeed, Allah is with the patient.',
      edition: {
        identifier: 'en.sahih',
        language: 'en',
        name: 'Saheeh International',
        englishName: 'Saheeh International',
        format: 'text',
        type: 'translation',
        direction: 'ltr',
      },
      surah: summary,
      numberInSurah: 1,
    };
    const searchResults = {
      count: 1,
      matches: [searchMatch],
      total: 1,
      offset: 0,
      limit: 20,
    };
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: searchResults },
    });

    await expect(client.search('mercy & patience')).resolves.toEqual({
      code: 200,
      status: 'OK',
      data: searchResults,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${baseUrl}/search/mercy%20%26%20patience/all/en.sahih?offset=0&limit=20`,
    );
  });

  test('validates edition identifiers, search queries, and search limits', () => {
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: detail },
    });

    for (const edition of [
      '',
      'en/sahih',
      '../quran-uthmani',
      'en.sahih?x=1',
    ]) {
      expect(() => client.getSurah(1, edition)).toThrow();
    }
    for (const query of ['', '   ']) {
      expect(() => client.search(query)).toThrow();
    }
    for (const limit of [0, 51, 1.5, Number.NaN]) {
      expect(() => client.search('mercy', 'en.sahih', limit)).toThrow();
    }
    expect(() => client.search('mercy', 'en/sahih')).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects malformed envelopes and invalid payloads with clear errors', async () => {
    const malformed = createClient({
      body: { code: 200, status: 'OK' },
    });
    await expect(malformed.client.getSurahs()).rejects.toThrow(
      'unexpected response envelope',
    );

    const invalidData = createClient({
      body: { code: 200, status: 'OK', data: {} },
    });
    await expect(invalidData.client.getSurahs()).rejects.toThrow(
      'invalid surah list data',
    );

    const apiError = createClient({
      body: { code: 404, status: 'Not Found', data: null },
    });
    await expect(apiError.client.getSurahs()).rejects.toMatchObject({
      message: 'AlQuran.cloud API error 404: Not Found',
      statusCode: 404,
    });
  });

  test('rejects HTTP failures with the status code', async () => {
    const { client } = createClient({
      body: { code: 500, status: 'Server Error', data: null },
      ok: false,
      status: 500,
    });

    await expect(client.getSurahs()).rejects.toMatchObject({
      message: 'AlQuran.cloud request failed (HTTP 500)',
      statusCode: 500,
    });
  });

  test('validates surah numbers before making a request', () => {
    const { client, fetchMock } = createClient({
      body: { code: 200, status: 'OK', data: detail },
    });

    for (const number of [0, 115, 1.5, Number.NaN]) {
      expect(() => client.getSurah(number)).toThrow(
        'Surah number must be an integer from 1 through 114',
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
