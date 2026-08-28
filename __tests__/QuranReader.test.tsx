import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_QURAN_READER_PREFERENCES } from '@/domain/quran';
import type {
  QuranAyah,
  QuranEdition,
  SurahDetail,
  SurahSummary,
} from '@/services/quran';

type MockedQuran = {
  getSurahs: jest.Mock;
  getTranslationEditions: jest.Mock;
  getVerseByVerseReciters: jest.Mock;
  getSurah: jest.Mock;
};

type MockedStorage = {
  getBookmarks: jest.Mock;
  getProgress: jest.Mock;
  getReaderPreferences: jest.Mock;
  saveReaderPreferences: jest.Mock;
  toggleBookmark: jest.Mock;
};

type MockedAudio = {
  stream: jest.Mock;
  stop: jest.Mock;
  release: jest.Mock;
  pause: jest.Mock;
  play: jest.Mock;
  downloadAudio: jest.Mock;
  isAudioDownloaded: jest.Mock;
};

jest.mock('@/services/quran', () => {
  const mocks: MockedQuran = {
    getSurahs: jest.fn(),
    getTranslationEditions: jest.fn(),
    getVerseByVerseReciters: jest.fn(),
    getSurah: jest.fn(),
  };

  return {
    DEFAULT_RECITER_EDITION: 'ar.alafasy',
    DEFAULT_TRANSLATION_EDITION: 'en.sahih',
    QURAN_SOURCE:
      'Arabic Quran text: AlQuran.cloud / Islamic Network (Uthmani edition).',
    quranClient: mocks,
    __mocks: mocks,
  };
});

jest.mock('@/services/quranAudio', () => {
  const mocks: MockedAudio = {
    stream: jest.fn(),
    stop: jest.fn(),
    release: jest.fn(),
    pause: jest.fn(),
    play: jest.fn(),
    downloadAudio: jest.fn(),
    isAudioDownloaded: jest.fn(),
  };

  class MockQuranAudioPlayer {
    stream(...args: unknown[]) {
      return mocks.stream(...args);
    }

    stop(...args: unknown[]) {
      return mocks.stop(...args);
    }

    release(...args: unknown[]) {
      return mocks.release(...args);
    }

    pause(...args: unknown[]) {
      return mocks.pause(...args);
    }

    play(...args: unknown[]) {
      return mocks.play(...args);
    }

    downloadAudio(...args: unknown[]) {
      return mocks.downloadAudio(...args);
    }
  }

  return {
    QuranAudioPlayer: MockQuranAudioPlayer,
    isAudioDownloaded: mocks.isAudioDownloaded,
    __mocks: mocks,
  };
});

jest.mock('@/services/quranStorage', () => {
  const mocks: MockedStorage = {
    getBookmarks: jest.fn(),
    getProgress: jest.fn(),
    getReaderPreferences: jest.fn(),
    saveReaderPreferences: jest.fn(),
    toggleBookmark: jest.fn(),
  };

  return {
    getBookmarks: mocks.getBookmarks,
    getProgress: mocks.getProgress,
    getReaderPreferences: mocks.getReaderPreferences,
    saveProgress: jest.fn(),
    saveReaderPreferences: mocks.saveReaderPreferences,
    toggleBookmark: mocks.toggleBookmark,
    __mocks: mocks,
  };
});

const quranMocks = jest.requireMock('@/services/quran').__mocks as MockedQuran;
const mockGetSurahs = quranMocks.getSurahs;
const mockGetTranslationEditions = quranMocks.getTranslationEditions;
const mockGetVerseByVerseReciters = quranMocks.getVerseByVerseReciters;
const mockGetSurah = quranMocks.getSurah;
const storageMocks = jest.requireMock('@/services/quranStorage')
  .__mocks as MockedStorage;
const mockToggleBookmark = storageMocks.toggleBookmark;
const mockGetBookmarks = storageMocks.getBookmarks;
const mockGetProgress = storageMocks.getProgress;
const mockGetReaderPreferences = storageMocks.getReaderPreferences;
const mockSaveReaderPreferences = storageMocks.saveReaderPreferences;
const audioMocks = jest.requireMock('@/services/quranAudio')
  .__mocks as MockedAudio;
const mockStream = audioMocks.stream;
const mockIsAudioDownloaded = audioMocks.isAudioDownloaded;
const renderers = new Set<ReactTestRenderer.ReactTestRenderer>();

import { QuranReader } from '@/components/QuranReader';

const summary: SurahSummary = {
  number: 1,
  name: 'الفاتحة',
  englishName: 'Al-Faatiha',
  englishNameTranslation: 'The Opening',
  revelationType: 'Meccan',
  numberOfAyahs: 1,
};

const arabicAyah: QuranAyah = {
  number: 1,
  text: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
  numberInSurah: 1,
  juz: 1,
  manzil: 1,
  page: 1,
  ruku: 1,
  hizbQuarter: 1,
  sajda: false,
};

const translationAyah: QuranAyah = {
  ...arabicAyah,
  text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
};

const audioAyah: QuranAyah = {
  ...arabicAyah,
  text: '',
  audio: 'https://audio.example.test/alafasy/1.mp3',
};

const arabicDetail: SurahDetail = { ...summary, ayahs: [arabicAyah] };
const translationDetail: SurahDetail = {
  ...summary,
  ayahs: [translationAyah],
};
const audioDetail: SurahDetail = { ...summary, ayahs: [audioAyah] };

const translationEdition: QuranEdition = {
  identifier: 'en.sahih',
  language: 'en',
  name: 'Saheeh International',
  englishName: 'Saheeh International',
  format: 'text',
  type: 'translation',
  direction: 'ltr',
};

const reciterEdition: QuranEdition = {
  identifier: 'ar.alafasy',
  language: 'ar',
  name: 'Alafasy',
  englishName: 'Mishary Rashid Alafasy',
  format: 'audio',
  type: 'versebyverse',
  direction: 'rtl',
};

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function findByAccessibilityLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const match = renderer.root.findAll(
    node => node.props.accessibilityLabel === label,
  )[0];
  if (!match)
    throw new Error(`No control found for accessibility label: ${label}`);
  return match;
}

function expectText(
  renderer: ReactTestRenderer.ReactTestRenderer,
  text: string,
): void {
  expect(
    renderer.root.findAll(node => node.props.children === text),
  ).not.toHaveLength(0);
}

async function renderReader(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <QuranReader visible onClose={jest.fn()} />,
    );
    await flushMicrotasks();
  });
  renderers.add(renderer);
  return renderer;
}

async function press(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): Promise<void> {
  const control = findByAccessibilityLabel(renderer, label);
  await ReactTestRenderer.act(async () => {
    control.props.onPress();
    await flushMicrotasks();
  });
}

async function openFirstSurah(): Promise<ReactTestRenderer.ReactTestRenderer> {
  const renderer = await renderReader();
  await press(renderer, 'Open Al-Faatiha, 1 ayahs');
  return renderer;
}

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const renderer of renderers) renderer.unmount();
    renderers.clear();
    await flushMicrotasks();
  });
});

beforeEach(() => {
  jest.clearAllMocks();

  mockStream.mockResolvedValue(undefined);
  mockIsAudioDownloaded.mockResolvedValue(false);
  mockGetSurahs.mockResolvedValue({ data: [summary] });
  mockGetTranslationEditions.mockResolvedValue({ data: [translationEdition] });
  mockGetVerseByVerseReciters.mockResolvedValue({ data: [reciterEdition] });
  mockGetBookmarks.mockResolvedValue([]);
  mockGetProgress.mockResolvedValue(null);
  mockGetReaderPreferences.mockResolvedValue(DEFAULT_QURAN_READER_PREFERENCES);
  mockSaveReaderPreferences.mockImplementation(
    async preferences => preferences,
  );
  mockToggleBookmark.mockResolvedValue([]);
  mockGetSurah.mockImplementation(
    (_number: number, edition = 'quran-uthmani') =>
      Promise.resolve({
        data:
          edition === 'quran-uthmani'
            ? arabicDetail
            : edition === 'en.sahih'
            ? translationDetail
            : audioDetail,
      }),
  );
});

describe('QuranReader', () => {
  test('renders surahs and opens a surah with Arabic and translation text', async () => {
    const renderer = await renderReader();

    expectText(renderer, 'Al-Faatiha');
    expectText(renderer, 'The Opening');

    await press(renderer, 'Open Al-Faatiha, 1 ayahs');

    expectText(renderer, arabicAyah.text);
    expectText(renderer, translationAyah.text);
  });

  test('opens accessible Reading settings and persists an Arabic font adjustment', async () => {
    const renderer = await renderReader();
    const settingsButton = findByAccessibilityLabel(
      renderer,
      'Open Reading settings',
    );

    expect(settingsButton.props.accessibilityHint).toContain('text size');
    await press(renderer, 'Open Reading settings');
    await press(renderer, 'Increase Arabic font size');

    expect(
      findByAccessibilityLabel(renderer, 'Arabic font size 24'),
    ).toBeDefined();
    expect(mockSaveReaderPreferences).toHaveBeenCalledWith({
      ...DEFAULT_QURAN_READER_PREFERENCES,
      arabicFontSize: 24,
    });
  });

  test('bookmarks the selected ayah with surah and ayah metadata', async () => {
    const renderer = await openFirstSurah();

    await press(renderer, 'Bookmark ayah 1');

    expect(mockToggleBookmark).toHaveBeenCalledTimes(1);
    expect(mockToggleBookmark).toHaveBeenCalledWith({
      surahNumber: 1,
      ayahNumber: 1,
      surahName: 'Al-Faatiha',
      ayahText: arabicAyah.text,
      createdAt: expect.any(Number),
    });
  });

  test('rehydrates downloaded ayah state when opening a surah', async () => {
    mockIsAudioDownloaded.mockResolvedValue(true);

    const renderer = await openFirstSurah();

    expectText(renderer, '✓');
    expect(mockIsAudioDownloaded).toHaveBeenCalledWith({
      editionId: 'ar.alafasy',
      reciterName: 'Mishary Rashid Alafasy',
      audioUrl: audioAyah.audio,
      ayahNumber: 1,
    });
  });

  test('plays the selected ayah through the reciter audio URL', async () => {
    const renderer = await openFirstSurah();

    await press(renderer, 'Play ayah 1');

    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockStream).toHaveBeenCalledWith(
      {
        editionId: 'ar.alafasy',
        reciterName: 'Mishary Rashid Alafasy',
        audioUrl: audioAyah.audio,
        ayahNumber: 1,
      },
      expect.any(Function),
    );
  });
});
