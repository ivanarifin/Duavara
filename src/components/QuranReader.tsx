import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DEFAULT_QURAN_READER_PREFERENCES,
  QuranBookmark,
  QuranProgress,
  QuranReaderPreferences,
  QuranReadingTheme,
} from '@/domain/quran';
import {
  DEFAULT_RECITER_EDITION,
  DEFAULT_TRANSLATION_EDITION,
  QURAN_SOURCE,
  QuranAyah,
  QuranEdition,
  QuranSearchMatch,
  quranClient,
  SurahDetail,
  SurahSummary,
} from '@/services/quran';
import {
  isAudioDownloaded,
  QuranAudioPlayer,
  QuranAudioState,
} from '@/services/quranAudio';
import {
  getBookmarks,
  getProgress,
  getReaderPreferences,
  saveProgress,
  saveReaderPreferences,
  toggleBookmark,
} from '@/services/quranStorage';

type QuranReaderProps = {
  visible: boolean;
  onClose: () => void;
};

type SurahContent = {
  arabic: SurahDetail;
  translation: SurahDetail | null;
  audioByAyah: Map<number, QuranAyah>;
  metadataNotice: string | null;
};

const COLORS = {
  ink: '#061B18',
  deepEmerald: '#0B2925',
  emerald: '#17483E',
  parchment: '#FFF8E8',
  parchmentMuted: '#E9DDC5',
  gold: '#EACB7D',
  mint: '#A8D9C2',
  muted: '#8EA99B',
  coral: '#EF967C',
  line: 'rgba(255, 248, 232, 0.14)',
};

const READING_PALETTES = {
  light: {
    card: COLORS.parchment,
    cardStyle: { backgroundColor: COLORS.parchment },
    arabic: COLORS.ink,
    translation: COLORS.emerald,
    divider: 'rgba(6, 27, 24, 0.12)',
    actionBackground: 'rgba(23, 72, 62, 0.12)',
    actionBorder: 'rgba(23, 72, 62, 0.2)',
  },
  dark: {
    card: '#123630',
    cardStyle: { backgroundColor: '#123630' },
    arabic: COLORS.parchment,
    translation: COLORS.mint,
    divider: 'rgba(255, 248, 232, 0.18)',
    actionBackground: 'rgba(168, 217, 194, 0.12)',
    actionBorder: 'rgba(168, 217, 194, 0.3)',
  },
} as const;

export function QuranReader({ visible, onClose }: QuranReaderProps) {
  if (!visible) return null;

  return <QuranReaderContent onClose={onClose} />;
}

function QuranReaderContent({ onClose }: { onClose: () => void }) {
  const [surahs, setSurahs] = useState<SurahSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listRetryKey, setListRetryKey] = useState(0);
  const [selectedSurah, setSelectedSurah] = useState<SurahSummary | null>(null);
  const [content, setContent] = useState<SurahContent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const [translations, setTranslations] = useState<QuranEdition[]>([]);
  const [reciters, setReciters] = useState<QuranEdition[]>([]);
  const [translationEditionId, setTranslationEditionId] = useState(
    DEFAULT_TRANSLATION_EDITION,
  );

  const [readerPreferences, setReaderPreferences] =
    useState<QuranReaderPreferences>(DEFAULT_QURAN_READER_PREFERENCES);

  const [showReadingSettings, setShowReadingSettings] = useState(false);
  const [reciterEditionId, setReciterEditionId] = useState(
    DEFAULT_RECITER_EDITION,
  );
  const [picker, setPicker] = useState<'translation' | 'reciter' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<QuranSearchMatch[] | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<QuranBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkBusyAyah, setBookmarkBusyAyah] = useState<number | null>(null);
  const [progress, setProgress] = useState<QuranProgress | null>(null);
  const [resumeAyahNumber, setResumeAyahNumber] = useState<number | null>(null);
  const [playingAyahNumber, setPlayingAyahNumber] = useState<number | null>(
    null,
  );
  const [audioState, setAudioState] = useState<QuranAudioState>('stopped');
  const [downloadingAyahNumber, setDownloadingAyahNumber] = useState<
    number | null
  >(null);
  const [downloadedAyahNumbers, setDownloadedAyahNumbers] = useState<
    Set<number>
  >(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const playerRef = useRef(new QuranAudioPlayer());
  const lastProgressRef = useRef<string | null>(null);
  const preferencesRef = useRef(readerPreferences);
  const searchRequestRef = useRef(0);

  const selectedTranslation = useMemo(
    () =>
      translations.find(
        edition => edition.identifier === translationEditionId,
      ) ?? fallbackEdition(translationEditionId, 'Translation'),
    [translationEditionId, translations],
  );
  const selectedReciter = useMemo(
    () =>
      reciters.find(edition => edition.identifier === reciterEditionId) ??
      fallbackEdition(reciterEditionId, 'Recitation'),
    [reciterEditionId, reciters],
  );
  const bookmarkedAyahKeys = useMemo(
    () => new Set(bookmarks.map(bookmarkKey)),
    [bookmarks],
  );
  const readingPalette = READING_PALETTES[readerPreferences.theme];
  const arabicTextStyle = useMemo(
    () => ({
      color: readingPalette.arabic,
      fontSize: readerPreferences.arabicFontSize,
      lineHeight: Math.round(readerPreferences.arabicFontSize * 1.85),
    }),
    [readerPreferences.arabicFontSize, readingPalette.arabic],
  );
  const translationTextStyle = useMemo(
    () => ({
      color: readingPalette.translation,
      borderTopColor: readingPalette.divider,
      fontSize: readerPreferences.translationFontSize,
      lineHeight: Math.round(readerPreferences.translationFontSize * 1.55),
    }),
    [
      readerPreferences.translationFontSize,
      readingPalette.divider,
      readingPalette.translation,
    ],
  );
  const languageOptions = useMemo(
    () =>
      Array.from(new Set(translations.map(edition => edition.language))).sort(),
    [translations],
  );

  const updateReaderPreferences = (
    updates: Partial<QuranReaderPreferences>,
  ) => {
    const next = { ...preferencesRef.current, ...updates };
    preferencesRef.current = next;
    setReaderPreferences(next);
    saveReaderPreferences(next).catch(() => undefined);
  };

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    quranClient
      .getSurahs()
      .then(response => {
        if (cancelled) return;
        setSurahs(response.data);
        setListLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        setListLoading(false);
        setListError(
          errorMessage(error, 'The surah list could not be loaded.'),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [listRetryKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      quranClient.getTranslationEditions(),
      quranClient.getVerseByVerseReciters(),
      getBookmarks(),
      getProgress(),
      getReaderPreferences(),
    ])
      .then(
        ([
          translationResponse,
          reciterResponse,
          savedBookmarks,
          savedProgress,
          savedPreferences,
        ]) => {
          if (cancelled) return;
          const availableTranslations = translationResponse.data;
          const savedEdition =
            availableTranslations.find(
              edition =>
                edition.identifier === savedPreferences.translationEditionId,
            ) ??
            availableTranslations.find(
              edition =>
                edition.language === savedPreferences.translationLanguage,
            ) ??
            availableTranslations.find(
              edition => edition.identifier === DEFAULT_TRANSLATION_EDITION,
            ) ??
            availableTranslations[0];
          const safePreferences = savedEdition
            ? {
                ...savedPreferences,
                translationEditionId: savedEdition.identifier,
                translationLanguage: savedEdition.language,
              }
            : savedPreferences;
          preferencesRef.current = safePreferences;
          setReaderPreferences(safePreferences);

          setTranslationEditionId(safePreferences.translationEditionId);
          setTranslations(availableTranslations);
          setReciters(reciterResponse.data);
          setBookmarks(savedBookmarks);
          setProgress(savedProgress);

          if (
            JSON.stringify(savedPreferences) !== JSON.stringify(safePreferences)
          )
            saveReaderPreferences(safePreferences).catch(() => undefined);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setNotice(
            'Some Quran options are unavailable. You can still read Arabic text.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      player.release();
    };
  }, []);

  useEffect(() => {
    if (!selectedSurah) {
      setContent(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setContent(null);
    setDetailLoading(true);
    setDetailError(null);
    setPlayingAyahNumber(null);
    setAudioState('stopped');
    setDownloadedAyahNumbers(new Set());
    playerRef.current.stop();

    quranClient
      .getSurah(selectedSurah.number)
      .then(async arabicResponse => {
        const [translationResult, audioResult] = await Promise.allSettled([
          quranClient.getSurah(selectedSurah.number, translationEditionId),
          quranClient.getSurah(selectedSurah.number, reciterEditionId),
        ]);
        if (cancelled) return;

        const translation =
          translationResult.status === 'fulfilled'
            ? translationResult.value.data
            : null;
        const audioAyahs =
          audioResult.status === 'fulfilled'
            ? audioResult.value.data.ayahs
            : [];
        const audioByAyah = new Map<number, QuranAyah>(
          audioAyahs.map(ayah => [ayah.number, ayah]),
        );
        const rehydratedDownloadedAyahNumbers = new Set(
          (
            await Promise.all(
              audioAyahs.map(async audioAyah =>
                audioAyah.audio &&
                (await isAudioDownloaded({
                  editionId: reciterEditionId,
                  reciterName: selectedReciter.englishName,
                  audioUrl: audioAyah.audio,
                  ayahNumber: audioAyah.number,
                }))
                  ? audioAyah.number
                  : null,
              ),
            )
          ).filter((ayahNumber): ayahNumber is number => ayahNumber !== null),
        );
        if (cancelled) return;
        const unavailable = [
          translationResult.status === 'rejected' ? 'translation' : null,
          audioResult.status === 'rejected' ? 'recitation' : null,
        ].filter(Boolean);

        setContent({
          arabic: arabicResponse.data,
          translation,
          audioByAyah,
          metadataNotice: unavailable.length
            ? `${unavailable.join(' and ')} unavailable for this surah.`
            : null,
        });
        setDownloadedAyahNumbers(rehydratedDownloadedAyahNumbers);
        setDetailLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        setDetailLoading(false);
        setDetailError(errorMessage(error, 'This surah could not be loaded.'));
      });

    return () => {
      cancelled = true;
    };
  }, [
    detailRetryKey,
    reciterEditionId,
    selectedReciter.englishName,
    selectedSurah,
    translationEditionId,
  ]);

  const selectTranslation = (edition: QuranEdition) => {
    setTranslationEditionId(edition.identifier);

    updateReaderPreferences({
      translationEditionId: edition.identifier,
      translationLanguage: edition.language,
    });
  };

  const selectSurah = (
    surah: SurahSummary,
    ayahNumber: number | null = null,
  ) => {
    setDetailRetryKey(0);
    setResumeAyahNumber(ayahNumber);
    setSelectedSurah(surah);
    setSearchResults(null);
    setSearchError(null);
    setShowBookmarks(false);
  };

  const recordProgress = (ayahNumber: number) => {
    if (!selectedSurah) return;
    const nextProgress = {
      surahNumber: selectedSurah.number,
      ayahNumber,
      updatedAt: Date.now(),
    };
    const key = `${nextProgress.surahNumber}:${nextProgress.ayahNumber}`;
    if (lastProgressRef.current === key) return;
    lastProgressRef.current = key;
    setProgress(nextProgress);
    saveProgress(nextProgress).catch(() => undefined);
  };

  const runSearch = () => {
    const query = searchQuery.trim();
    const requestToken = searchRequestRef.current + 1;
    searchRequestRef.current = requestToken;
    if (!query) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    quranClient
      .search(query, translationEditionId)
      .then(response => {
        if (searchRequestRef.current === requestToken) {
          setSearchResults(response.data.matches);
        }
      })
      .catch(error => {
        if (searchRequestRef.current === requestToken) {
          setSearchError(
            errorMessage(error, 'The Quran search could not be completed.'),
          );
        }
      })
      .finally(() => {
        if (searchRequestRef.current === requestToken) setSearchLoading(false);
      });
  };

  const openSearchMatch = (match: QuranSearchMatch) => {
    const surah = surahs.find(item => item.number === match.surah.number);
    if (surah) selectSurah(surah, match.numberInSurah);
    else setNotice('The surah list is still loading. Please try again.');
  };

  const toggleAyahBookmark = async (ayah: QuranAyah) => {
    if (!selectedSurah || bookmarkBusyAyah === ayah.number) return;
    setBookmarkBusyAyah(ayah.number);
    try {
      setBookmarks(
        await toggleBookmark({
          surahNumber: selectedSurah.number,
          ayahNumber: ayah.numberInSurah,
          surahName: selectedSurah.englishName,
          ayahText: ayah.text,
          createdAt: Date.now(),
        }),
      );
    } catch (error) {
      setNotice(errorMessage(error, 'Bookmark could not be saved.'));
    } finally {
      setBookmarkBusyAyah(null);
    }
  };

  const playAyah = async (ayah: QuranAyah) => {
    const audioAyah = content?.audioByAyah.get(ayah.number);
    if (!audioAyah?.audio) {
      setNotice('Recitation audio is unavailable for this ayah.');
      return;
    }

    if (playingAyahNumber === ayah.number) {
      if (audioState === 'playing') playerRef.current.pause();
      else if (audioState === 'paused') playerRef.current.play();
      return;
    }

    setPlayingAyahNumber(ayah.number);
    setAudioState('loading');
    try {
      await playerRef.current.stream(
        {
          editionId: reciterEditionId,
          reciterName: selectedReciter.englishName,
          audioUrl: audioAyah.audio,
          ayahNumber: ayah.number,
        },
        (state, error) => {
          setAudioState(state);
          if (
            state === 'stopped' ||
            state === 'error' ||
            state === 'released'
          ) {
            setPlayingAyahNumber(null);
          }
          if (error) setNotice(error.message);
        },
      );
    } catch (error) {
      setPlayingAyahNumber(null);
      setNotice(errorMessage(error, 'Recitation audio could not be played.'));
    }
  };

  const downloadAyah = async (ayah: QuranAyah) => {
    const audioAyah = content?.audioByAyah.get(ayah.number);
    if (!audioAyah?.audio || downloadingAyahNumber === ayah.number) return;

    setDownloadingAyahNumber(ayah.number);
    try {
      await playerRef.current.downloadAudio({
        editionId: reciterEditionId,
        reciterName: selectedReciter.englishName,
        audioUrl: audioAyah.audio,
        ayahNumber: ayah.number,
      });
      setDownloadedAyahNumbers(previous => new Set(previous).add(ayah.number));
      setNotice('Recitation saved to this device.');
    } catch (error) {
      setNotice(
        errorMessage(error, 'Recitation audio could not be downloaded.'),
      );
    } finally {
      setDownloadingAyahNumber(null);
    }
  };

  const displayBookmarks = bookmarks.map(bookmark => ({
    bookmark,
    surah: surahs.find(item => item.number === bookmark.surahNumber),
  }));

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={selectedSurah ? () => setSelectedSurah(null) : onClose}
    >
      <SafeAreaView style={styles.screen}>
        {selectedSurah ? (
          <View style={styles.content}>
            <View style={styles.header}>
              <Pressable
                style={styles.navigationButton}
                onPress={() => setSelectedSurah(null)}
                accessibilityRole="button"
                accessibilityLabel="Back to surah list"
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <View style={styles.headerTitles}>
                <Text style={styles.eyebrow}>QURAN READER</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {content?.arabic.englishName ?? selectedSurah.englishName}
                </Text>
              </View>
              <View style={styles.headerControls}>
                <Pressable
                  style={styles.navigationButton}
                  onPress={() => setShowReadingSettings(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Reading settings"
                  accessibilityHint="Adjust Arabic and translation text size, theme, language, and translation edition."
                >
                  <Text style={styles.settingsIcon}>Aa</Text>
                </Pressable>
                <Pressable
                  style={styles.navigationButton}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close Quran reader"
                >
                  <Text style={styles.closeIcon}>×</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.detailIntro}>
              <Text style={styles.detailArabicName}>
                {content?.arabic.name ?? selectedSurah.name}
              </Text>
              <Text style={styles.detailSubtitle}>
                {content?.arabic.englishNameTranslation ??
                  selectedSurah.englishNameTranslation}
                {'  ·  '}
                {content?.arabic.numberOfAyahs ??
                  selectedSurah.numberOfAyahs}{' '}
                ayat
              </Text>
              {resumeAyahNumber ? (
                <Text style={styles.resumeNote}>
                  Continue at ayah {resumeAyahNumber}
                </Text>
              ) : null}
            </View>

            <View style={styles.editionRow}>
              <EditionButton
                label={`TRANSLATION · ${selectedTranslation.language.toUpperCase()}`}
                value={selectedTranslation.englishName}
                onPress={() => setPicker('translation')}
                accessibilityHint="Select the translation edition used for this surah."
              />
              <EditionButton
                label="RECITATION"
                value={selectedReciter.englishName}
                onPress={() => setPicker('reciter')}
              />
            </View>

            {detailLoading ? (
              <StatusState loading label="Opening the surah…" />
            ) : detailError ? (
              <StatusState
                message={detailError}
                actionLabel="TRY AGAIN"
                onAction={() => setDetailRetryKey(value => value + 1)}
              />
            ) : content ? (
              <FlatList
                data={content.arabic.ayahs}
                keyExtractor={ayah => String(ayah.number)}
                renderItem={({ item }) => {
                  const translation = content.translation?.ayahs.find(
                    ayah => ayah.number === item.number,
                  );
                  const isPlaying = playingAyahNumber === item.number;
                  const isBookmarked = bookmarkedAyahKeys.has(
                    `${selectedSurah.number}:${item.numberInSurah}`,
                  );
                  return (
                    <View
                      accessible
                      accessibilityLabel={`Ayah ${item.numberInSurah}`}
                      style={[
                        styles.ayahCard,
                        readingPalette.cardStyle,
                        resumeAyahNumber === item.numberInSurah &&
                          styles.ayahCardResume,
                      ]}
                    >
                      <View style={styles.ayahToolbar}>
                        <View style={styles.ayahNumber}>
                          <Text style={styles.ayahNumberText}>
                            {item.numberInSurah}
                          </Text>
                        </View>
                        <View style={styles.ayahActions}>
                          <AyahAction
                            label={
                              isPlaying && audioState === 'playing'
                                ? `Pause recitation for ayah ${item.numberInSurah}`
                                : `Play ayah ${item.numberInSurah}`
                            }
                            hint="Plays or pauses this ayah's recitation."
                            text={
                              isPlaying && audioState === 'loading'
                                ? '…'
                                : isPlaying && audioState === 'playing'
                                ? 'Ⅱ'
                                : '▶'
                            }
                            onPress={() => playAyah(item)}
                          />
                          <AyahAction
                            label={`Download ayah ${item.numberInSurah} recitation`}
                            hint="Downloads this ayah's recitation for offline listening."
                            text={
                              downloadingAyahNumber === item.number
                                ? '…'
                                : downloadedAyahNumbers.has(item.number)
                                ? '✓'
                                : '↓'
                            }
                            onPress={() => downloadAyah(item)}
                          />
                          <AyahAction
                            label={
                              isBookmarked
                                ? `Remove bookmark from ayah ${item.numberInSurah}`
                                : `Bookmark ayah ${item.numberInSurah}`
                            }
                            hint="Saves or removes this ayah from bookmarks."
                            text={
                              bookmarkBusyAyah === item.number
                                ? '…'
                                : isBookmarked
                                ? '★'
                                : '☆'
                            }
                            onPress={() => toggleAyahBookmark(item)}
                          />
                        </View>
                      </View>
                      <Text
                        accessible
                        accessibilityLanguage="ar"
                        accessibilityLabel={`Arabic ayah ${item.numberInSurah}`}
                        style={[styles.ayahText, arabicTextStyle]}
                      >
                        {item.text}
                      </Text>
                      {translation ? (
                        <Text
                          accessible
                          accessibilityLanguage={selectedTranslation.language}
                          accessibilityLabel={`Translation ayah ${item.numberInSurah} in ${selectedTranslation.language}`}
                          style={[
                            styles.translationText,
                            translationTextStyle,
                            selectedTranslation.direction === 'rtl'
                              ? styles.translationRtl
                              : styles.translationLtr,
                          ]}
                        >
                          {translation.text}
                        </Text>
                      ) : null}
                    </View>
                  );
                }}
                contentContainerStyle={styles.ayahList}
                showsVerticalScrollIndicator={false}
                onViewableItemsChanged={({ viewableItems }) => {
                  const first = viewableItems.find(item => item.isViewable)
                    ?.item as QuranAyah | undefined;
                  if (first) recordProgress(first.numberInSurah);
                }}
                viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
              />
            ) : null}
            {content?.metadataNotice ? (
              <Text accessibilityRole="alert" style={styles.metadataNotice}>
                {content.metadataNotice}
              </Text>
            ) : null}
            <Text style={styles.editionAttribution}>
              Translation: {selectedTranslation.englishName} · Recitation:{' '}
              {selectedReciter.englishName}
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.header}>
              <View style={styles.headerTitles}>
                <Text style={styles.eyebrow}>DUAVARA · QURAN</Text>
                <Text style={styles.title}>Read & reflect</Text>
              </View>
              <View style={styles.headerControls}>
                <Pressable
                  style={styles.navigationButton}
                  onPress={() => setShowReadingSettings(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open Reading settings"
                  accessibilityHint="Adjust Arabic and translation text size, theme, language, and translation edition."
                >
                  <Text style={styles.settingsIcon}>Aa</Text>
                </Pressable>
                <Pressable
                  style={styles.navigationButton}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close Quran reader"
                >
                  <Text style={styles.closeIcon}>×</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.listIntro}>
              <Text style={styles.introArabic}>القرآن الكريم</Text>
              <Text style={styles.introText}>
                Arabic Uthmani text · translation · recitation
              </Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={runSearch}
                  placeholder="Search translation"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="search"
                  accessibilityLabel="Search Quran translation"
                />
                <Pressable
                  style={styles.searchButton}
                  onPress={runSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Search Quran"
                >
                  <Text style={styles.searchButtonText}>SEARCH</Text>
                </Pressable>
              </View>
              <View style={styles.listActions}>
                <Pressable
                  style={styles.textAction}
                  onPress={() => setPicker('translation')}
                  accessibilityRole="button"
                  accessibilityLabel={`Search Quran in ${selectedTranslation.englishName}`}
                  accessibilityHint="Selects the translation edition used for Quran search."
                >
                  <Text style={styles.textActionLabel}>SEARCH IN</Text>
                  <Text style={styles.textActionValue}>
                    {selectedTranslation.englishName}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.textAction}
                  onPress={() => setShowBookmarks(value => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${bookmarks.length} saved Quran bookmarks`}
                  accessibilityHint="Opens your saved ayahs."
                >
                  <Text style={styles.textActionLabel}>SAVED</Text>
                  <Text style={styles.textActionValue}>
                    {bookmarks.length} bookmarks
                  </Text>
                </Pressable>
              </View>
              {progress ? (
                <Pressable
                  style={styles.continueCard}
                  onPress={() => {
                    const surah = surahs.find(
                      item => item.number === progress.surahNumber,
                    );
                    if (surah) selectSurah(surah, progress.ayahNumber);
                    else
                      setNotice(
                        'The surah list is still loading. Please try again.',
                      );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue reading surah ${progress.surahNumber}, ayah ${progress.ayahNumber}`}
                >
                  <Text style={styles.continueLabel}>CONTINUE READING</Text>
                  <Text style={styles.continueText}>
                    {surahs.find(item => item.number === progress.surahNumber)
                      ?.englishName ?? `Surah ${progress.surahNumber}`}
                    {' · '}Ayah {progress.ayahNumber}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {searchLoading ? (
              <StatusState loading label="Searching Quran…" />
            ) : searchError ? (
              <StatusState
                message={searchError}
                actionLabel="TRY AGAIN"
                onAction={runSearch}
              />
            ) : searchResults ? (
              <FlatList
                data={searchResults}
                keyExtractor={match =>
                  `${match.surah.number}:${match.numberInSurah}`
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.searchResult}
                    onPress={() => openSearchMatch(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.surah.englishName}, ayah ${item.numberInSurah}`}
                  >
                    <Text style={styles.searchResultSurah}>
                      {item.surah.englishName} · {item.numberInSurah}
                    </Text>
                    <Text style={styles.searchResultText}>{item.text}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <StatusState message="No matching ayahs found." />
                }
                contentContainerStyle={styles.surahList}
                showsVerticalScrollIndicator={false}
              />
            ) : showBookmarks ? (
              <FlatList
                data={displayBookmarks}
                keyExtractor={({ bookmark }) => bookmarkKey(bookmark)}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.searchResult}
                    onPress={() => {
                      if (item.surah)
                        selectSurah(item.surah, item.bookmark.ayahNumber);
                      else
                        setNotice(
                          'The surah list is still loading. Please try again.',
                        );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open bookmarked ${item.bookmark.surahName}, ayah ${item.bookmark.ayahNumber}`}
                  >
                    <Text style={styles.searchResultSurah}>
                      {item.bookmark.surahName} · {item.bookmark.ayahNumber}
                    </Text>
                    <Text style={styles.searchResultText} numberOfLines={2}>
                      {item.bookmark.ayahText}
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <StatusState message="No bookmarks yet. Save an ayah with the star button." />
                }
                contentContainerStyle={styles.surahList}
                showsVerticalScrollIndicator={false}
              />
            ) : listLoading ? (
              <StatusState loading label="Loading surahs…" />
            ) : listError ? (
              <StatusState
                message={listError}
                actionLabel="TRY AGAIN"
                onAction={() => setListRetryKey(value => value + 1)}
              />
            ) : (
              <FlatList
                data={surahs}
                keyExtractor={surah => String(surah.number)}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.surahRow,
                      pressed && styles.surahRowPressed,
                    ]}
                    onPress={() => selectSurah(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.englishName}, ${item.numberOfAyahs} ayahs`}
                  >
                    <View style={styles.surahNumber}>
                      <Text style={styles.surahNumberText}>{item.number}</Text>
                    </View>
                    <View style={styles.surahNames}>
                      <Text style={styles.surahEnglish}>
                        {item.englishName}
                      </Text>
                      <Text style={styles.surahTranslation}>
                        {item.englishNameTranslation}
                      </Text>
                    </View>
                    <View style={styles.surahMeta}>
                      <Text style={styles.surahArabic}>{item.name}</Text>
                      <Text style={styles.ayahCount}>
                        {item.numberOfAyahs} ayat
                      </Text>
                    </View>
                  </Pressable>
                )}
                contentContainerStyle={styles.surahList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}
        {notice ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
        <Text style={styles.attribution}>{QURAN_SOURCE}</Text>
      </SafeAreaView>
      <EditionPicker
        visible={picker !== null}
        title={picker === 'translation' ? 'Translation' : 'Recitation'}
        editions={picker === 'translation' ? translations : reciters}
        selectedEditionId={
          picker === 'translation' ? translationEditionId : reciterEditionId
        }
        fallbackEdition={
          picker === 'translation' ? selectedTranslation : selectedReciter
        }
        onSelect={edition => {
          if (picker === 'translation') selectTranslation(edition);
          else setReciterEditionId(edition.identifier);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <ReadingSettings
        visible={showReadingSettings}
        preferences={readerPreferences}
        languages={languageOptions}
        translations={translations}
        selectedEdition={selectedTranslation}
        onChange={updateReaderPreferences}
        onSelectTranslation={selectTranslation}
        onClose={() => setShowReadingSettings(false)}
      />
    </Modal>
  );
}

function fallbackEdition(identifier: string, label: string): QuranEdition {
  return {
    identifier,
    language: identifier.split('.')[0] || 'en',
    name: label,
    englishName: label,
    format: 'text',
    type: label.toLowerCase(),
    direction: 'ltr',
  };
}

function bookmarkKey(
  bookmark: Pick<QuranBookmark, 'surahNumber' | 'ayahNumber'>,
): string {
  return `${bookmark.surahNumber}:${bookmark.ayahNumber}`;
}

function EditionButton({
  label,
  value,
  onPress,
  accessibilityHint,
}: {
  label: string;
  value: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      style={styles.editionButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={accessibilityHint}
    >
      <Text style={styles.editionLabel}>{label}</Text>
      <Text style={styles.editionValue} numberOfLines={1}>
        {value}⌄
      </Text>
    </Pressable>
  );
}

function AyahAction({
  label,
  text,
  hint,
  onPress,
}: {
  label: string;
  text: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.ayahAction}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={styles.ayahActionText}>{text}</Text>
    </Pressable>
  );
}

function ReadingSettings({
  visible,
  preferences,
  languages,
  translations,
  selectedEdition,
  onChange,
  onSelectTranslation,
  onClose,
}: {
  visible: boolean;
  preferences: QuranReaderPreferences;
  languages: string[];
  translations: QuranEdition[];
  selectedEdition: QuranEdition;
  onChange: (updates: Partial<QuranReaderPreferences>) => void;
  onSelectTranslation: (edition: QuranEdition) => void;
  onClose: () => void;
}) {
  const visibleTranslations = translations.filter(
    edition => edition.language === preferences.translationLanguage,
  );

  const adjustFontSize = (
    field: 'arabicFontSize' | 'translationFontSize',
    delta: number,
    minimum: number,
    maximum: number,
  ) => {
    const next = Math.max(
      minimum,
      Math.min(maximum, preferences[field] + delta),
    );
    if (next !== preferences[field]) onChange({ [field]: next });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.settingsBackdrop}>
        <View
          accessible
          accessibilityLabel="Reading settings"
          accessibilityViewIsModal
          style={styles.settingsSheet}
        >
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Reading settings</Text>
            <Pressable
              style={styles.settingsCloseButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close Reading settings"
              accessibilityHint="Returns to the Quran reader."
            >
              <Text style={styles.pickerClose}>×</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsSectionLabel}>TEXT SIZE</Text>
            <FontSizeControl
              label="Arabic font size"
              value={preferences.arabicFontSize}
              minimum={18}
              maximum={40}
              onDecrease={() => adjustFontSize('arabicFontSize', -1, 18, 40)}
              onIncrease={() => adjustFontSize('arabicFontSize', 1, 18, 40)}
            />
            <FontSizeControl
              label="Translation font size"
              value={preferences.translationFontSize}
              minimum={12}
              maximum={30}
              onDecrease={() =>
                adjustFontSize('translationFontSize', -1, 12, 30)
              }
              onIncrease={() =>
                adjustFontSize('translationFontSize', 1, 12, 30)
              }
            />

            <Text style={styles.settingsSectionLabel}>READING THEME</Text>
            <View style={styles.settingsChoiceRow}>
              {(['light', 'dark'] as QuranReadingTheme[]).map(theme => (
                <Pressable
                  key={theme}
                  style={[
                    styles.settingsChoice,
                    preferences.theme === theme &&
                      styles.settingsChoiceSelected,
                  ]}
                  onPress={() => onChange({ theme })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: preferences.theme === theme }}
                  accessibilityLabel={`${theme} reading theme`}
                  accessibilityHint={`Use the ${theme} palette for ayah cards and text.`}
                >
                  <Text style={styles.settingsChoiceText}>
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.settingsSectionLabel}>
              TRANSLATION LANGUAGE
            </Text>
            {languages.length ? (
              <View style={styles.settingsChoiceRow}>
                {languages.map(language => (
                  <Pressable
                    key={language}
                    style={[
                      styles.settingsChoice,
                      preferences.translationLanguage === language &&
                        styles.settingsChoiceSelected,
                    ]}
                    onPress={() => {
                      const firstEdition = translations.find(
                        edition => edition.language === language,
                      );
                      if (firstEdition) onSelectTranslation(firstEdition);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: preferences.translationLanguage === language,
                    }}
                    accessibilityLabel={`Translation language ${language}`}
                    accessibilityHint="Filters the available translation editions."
                  >
                    <Text style={styles.settingsChoiceText}>
                      {language.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.settingsEmpty}>
                Translation languages are unavailable.
              </Text>
            )}

            <Text style={styles.settingsSectionLabel}>TRANSLATION EDITION</Text>
            {visibleTranslations.length ? (
              visibleTranslations.map(edition => (
                <Pressable
                  key={edition.identifier}
                  style={[
                    styles.settingsEdition,
                    edition.identifier === selectedEdition.identifier &&
                      styles.settingsChoiceSelected,
                  ]}
                  onPress={() => onSelectTranslation(edition)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: edition.identifier === selectedEdition.identifier,
                  }}
                  accessibilityLabel={`Translation edition ${edition.englishName}`}
                  accessibilityHint={`Use ${edition.englishName} for Arabic ayahs.`}
                >
                  <Text style={styles.settingsEditionName}>
                    {edition.englishName}
                  </Text>
                  <Text style={styles.settingsEditionMeta}>
                    {edition.identifier}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.settingsEmpty}>
                No editions are available for this language.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FontSizeControl({
  label,
  value,
  minimum,
  maximum,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.fontSizeRow}>
      <Text style={styles.fontSizeLabel}>{label}</Text>
      <View style={styles.fontSizeControls}>
        <Pressable
          style={styles.fontSizeButton}
          onPress={onDecrease}
          disabled={value <= minimum}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityHint={`Decreases from ${value}. Minimum is ${minimum}.`}
        >
          <Text style={styles.fontSizeButtonText}>−</Text>
        </Pressable>
        <Text
          style={styles.fontSizeValue}
          accessibilityRole="text"
          accessibilityLabel={`${label} ${value}`}
        >
          {value}
        </Text>
        <Pressable
          style={styles.fontSizeButton}
          onPress={onIncrease}
          disabled={value >= maximum}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityHint={`Increases from ${value}. Maximum is ${maximum}.`}
        >
          <Text style={styles.fontSizeButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EditionPicker({
  visible,
  title,
  editions,
  selectedEditionId,
  fallbackEdition: selectedFallback,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  editions: QuranEdition[];
  selectedEditionId: string;
  fallbackEdition: QuranEdition;
  onSelect: (edition: QuranEdition) => void;
  onClose: () => void;
}) {
  const options = editions.length ? editions : [selectedFallback];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.pickerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title} selector`}
            >
              <Text style={styles.pickerClose}>×</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={edition => edition.identifier}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.pickerOption,
                  item.identifier === selectedEditionId &&
                    styles.pickerOptionSelected,
                ]}
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item.englishName}`}
                accessibilityHint={`Selects the ${title.toLowerCase()} edition ${
                  item.identifier
                }.`}
                accessibilityState={{
                  selected: item.identifier === selectedEditionId,
                }}
              >
                <Text style={styles.pickerOptionName}>{item.englishName}</Text>
                <Text style={styles.pickerOptionMeta}>{item.identifier}</Text>
              </Pressable>
            )}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

function StatusState({
  loading,
  label,
  message,
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  label?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      accessible={!loading}
      accessibilityRole={loading ? undefined : 'alert'}
      style={styles.statusState}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.gold} />
      ) : (
        <Text style={styles.errorMark}>!</Text>
      )}
      <Text style={styles.statusTitle}>
        {loading ? label : 'Unable to load'}
      </Text>
      {message ? <Text style={styles.statusMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          style={styles.retryButton}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.ink },
  content: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  headerTitles: { flex: 1, marginHorizontal: 12 },
  headerControls: { flexDirection: 'row', gap: 8 },
  eyebrow: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 25,
    marginTop: 5,
  },
  navigationButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: COLORS.emerald,
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.3)',
  },
  backIcon: {
    color: COLORS.gold,
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 36,
    marginTop: -3,
  },
  settingsIcon: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '900',
  },
  closeIcon: {
    color: COLORS.parchment,
    fontSize: 27,
    fontWeight: '300',
    lineHeight: 29,
  },
  listIntro: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 },
  introArabic: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 27,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  introText: {
    color: COLORS.muted,
    fontSize: 12,
    letterSpacing: 0.35,
    marginTop: 5,
  },
  searchRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  searchInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    color: COLORS.parchment,
    paddingHorizontal: 13,
    fontSize: 14,
    backgroundColor: COLORS.deepEmerald,
  },
  searchButton: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    backgroundColor: COLORS.gold,
  },
  searchButtonText: {
    color: COLORS.ink,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  listActions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  textAction: {
    flex: 1,
    minHeight: 48,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 11,
    backgroundColor: COLORS.deepEmerald,
  },
  textActionLabel: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  textActionValue: { color: COLORS.mint, fontSize: 11, marginTop: 4 },
  continueCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(234, 203, 125, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.28)',
  },
  continueLabel: {
    color: COLORS.gold,
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: '900',
  },
  continueText: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 15,
    marginTop: 5,
  },
  surahList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    flexGrow: 1,
  },
  surahRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: COLORS.deepEmerald,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  surahRowPressed: { backgroundColor: COLORS.emerald },
  surahNumber: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(234, 203, 125, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.35)',
  },
  surahNumberText: { color: COLORS.gold, fontSize: 12, fontWeight: '800' },
  surahNames: { flex: 1, marginHorizontal: 13 },
  surahEnglish: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 17,
  },
  surahTranslation: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  surahMeta: { alignItems: 'flex-end', maxWidth: '38%' },
  surahArabic: {
    color: COLORS.mint,
    fontFamily: 'Georgia',
    fontSize: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ayahCount: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  detailIntro: {
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 8,
  },
  detailArabicName: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 30,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 5 },
  resumeNote: { color: COLORS.gold, fontSize: 11, marginTop: 7 },
  editionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  editionButton: {
    flex: 1,
    minHeight: 51,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 11,
    backgroundColor: COLORS.deepEmerald,
  },
  editionLabel: {
    color: COLORS.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  editionValue: { color: COLORS.mint, fontSize: 11, marginTop: 4 },
  ayahList: { paddingHorizontal: 16, paddingBottom: 18 },
  ayahCard: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: COLORS.parchment,
  },
  ayahCardResume: { borderWidth: 2, borderColor: COLORS.gold },
  ayahToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ayahNumber: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.emerald,
  },
  ayahNumberText: { color: COLORS.gold, fontSize: 11, fontWeight: '800' },
  ayahActions: { flexDirection: 'row', gap: 7 },
  ayahAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(23, 72, 62, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(23, 72, 62, 0.2)',
  },
  ayahActionText: { color: COLORS.emerald, fontSize: 15, fontWeight: '900' },
  ayahText: {
    color: COLORS.ink,
    fontFamily: 'Georgia',
    fontSize: 23,
    lineHeight: 43,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  translationText: {
    color: COLORS.emerald,
    fontFamily: 'Georgia',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6, 27, 24, 0.12)',
  },
  translationLtr: { textAlign: 'left', writingDirection: 'ltr' },
  translationRtl: { textAlign: 'right', writingDirection: 'rtl' },
  metadataNotice: {
    color: COLORS.coral,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  editionAttribution: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
    paddingHorizontal: 18,
    paddingBottom: 7,
  },
  searchResult: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: COLORS.deepEmerald,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  searchResultSurah: { color: COLORS.gold, fontSize: 11, fontWeight: '900' },
  searchResultText: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
  },
  statusState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  errorMark: {
    width: 30,
    height: 30,
    color: COLORS.ink,
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '900',
    borderRadius: 15,
    backgroundColor: COLORS.coral,
    overflow: 'hidden',
  },
  statusTitle: {
    color: COLORS.parchment,
    fontFamily: 'Georgia',
    fontSize: 20,
    textAlign: 'center',
    marginTop: 15,
  },
  statusMessage: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  retryText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  notice: {
    color: COLORS.coral,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 18,
    paddingTop: 7,
  },
  attribution: {
    color: COLORS.muted,
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  settingsBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  settingsSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 28,
    backgroundColor: COLORS.deepEmerald,
  },
  settingsCloseButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSectionLabel: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 13,
    marginBottom: 8,
  },
  fontSizeRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  fontSizeLabel: { color: COLORS.parchment, fontSize: 14 },
  fontSizeControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fontSizeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: COLORS.emerald,
    borderWidth: 1,
    borderColor: 'rgba(234, 203, 125, 0.3)',
  },
  fontSizeButtonText: { color: COLORS.gold, fontSize: 25, lineHeight: 27 },
  fontSizeValue: {
    minWidth: 30,
    color: COLORS.parchment,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  settingsChoice: {
    minHeight: 44,
    minWidth: 76,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  settingsChoiceSelected: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(234, 203, 125, 0.11)',
  },
  settingsChoiceText: { color: COLORS.mint, fontSize: 12, fontWeight: '800' },
  settingsEdition: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 13,
    marginBottom: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  settingsEditionName: { color: COLORS.parchment, fontSize: 14 },
  settingsEditionMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  settingsEmpty: { color: COLORS.muted, fontSize: 12, paddingVertical: 8 },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  pickerSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 28,
    backgroundColor: COLORS.deepEmerald,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingBottom: 13,
  },
  pickerTitle: { color: COLORS.parchment, fontFamily: 'Georgia', fontSize: 23 },
  pickerClose: { color: COLORS.parchment, fontSize: 28, lineHeight: 30 },
  pickerOption: {
    padding: 14,
    marginBottom: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  pickerOptionSelected: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(234, 203, 125, 0.11)',
  },
  pickerOptionName: {
    color: COLORS.parchment,
    fontSize: 15,
    fontFamily: 'Georgia',
  },
  pickerOptionMeta: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
});
