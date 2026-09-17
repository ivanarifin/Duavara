import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Coordinates } from '@/domain';
import {
  buildMosqueDirectionsUrl,
  getFavorites,
  MosqueFavorite,
  MosqueFavoritesStorageError,
  saveFavorites,
  toggleFavorite,
} from '@/services/mosqueFavorites';
import {
  getNearbyMosques,
  MAX_NEARBY_MOSQUES,
  Mosque,
  MosqueLookupError,
  OSM_ATTRIBUTION,
} from '@/services/mosques';

const MANUAL_SEARCH_COOLDOWN_MS = 30_000;

const COLORS = {
  ink: '#08201E',
  inkSoft: '#10332F',
  inkDeep: '#051816',
  moss: '#1F5147',
  mint: '#91D6BE',
  mintBright: '#C7F0DA',
  cream: '#FFF8E8',
  parchment: '#F6EEDC',
  gold: '#EACB7D',
  coral: '#EF967C',
};

type NearbyMosquesProps = {
  coordinates: Coordinates | null;
};

type LoadState = 'idle' | 'loading' | 'success' | 'error';

type StorageAction = {
  message: string;
};

export function NearbyMosques({ coordinates }: NearbyMosquesProps) {
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [favorites, setFavorites] = useState<MosqueFavorite[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [manualSearchNotice, setManualSearchNotice] = useState<string | null>(
    null,
  );
  const [storageAction, setStorageAction] = useState<StorageAction | null>(
    null,
  );
  const storageRetry = useRef<(() => Promise<void>) | null>(null);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const manualSearchCooldownUntil = useRef(0);

  const clearStorageError = useCallback(() => {
    storageRetry.current = null;
    setStorageAction(null);
  }, []);

  const reportStorageError = useCallback(
    (errorValue: unknown, retry: () => Promise<void>) => {
      const operation =
        errorValue instanceof MosqueFavoritesStorageError
          ? errorValue.operation
          : 'write';
      storageRetry.current = retry;
      setStorageAction({
        message:
          operation === 'read'
            ? 'Saved mosques could not be loaded. Your visible favorites were kept. Try again.'
            : 'Your change could not be saved. Your visible favorites were kept. Try again.',
      });
    },
    [],
  );

  const retryStorageAction = useCallback(async () => {
    const retry = storageRetry.current;
    if (!retry) return;
    try {
      await retry();
      clearStorageError();
    } catch (errorValue) {
      reportStorageError(errorValue, retry);
    }
  }, [clearStorageError, reportStorageError]);

  const loadFavorites = useCallback(async () => {
    try {
      const items = await getFavorites();
      setFavorites(items);
      clearStorageError();
    } catch (errorValue) {
      reportStorageError(errorValue, async () => {
        const items = await getFavorites();
        setFavorites(items);
      });
    }
  }, [clearStorageError, reportStorageError]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    requestId.current += 1;
    setMosques([]);
    setState('idle');
    setError(null);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      requestId.current += 1;
    };
  }, [coordinates]);

  const loadMosques = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (!coordinates) {
        setMosques([]);
        setState('idle');
        setError(null);
        return;
      }

      activeRequest.current?.abort();
      const controller =
        typeof AbortController === 'undefined' ? null : new AbortController();
      activeRequest.current = controller;
      const currentRequestId = ++requestId.current;
      setState('loading');
      setError(null);
      setManualSearchNotice(null);

      try {
        const results = await getNearbyMosques(coordinates, {
          radiusMeters: 5_000,
          cacheTtlMs: 5 * 60 * 1_000,
          forceRefresh,
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (currentRequestId !== requestId.current) return;
        setMosques(results.slice(0, MAX_NEARBY_MOSQUES));
        setState('success');
      } catch (errorValue) {
        if (
          currentRequestId !== requestId.current ||
          (errorValue instanceof MosqueLookupError &&
            errorValue.code === 'ABORTED')
        ) {
          return;
        }
        setState('error');
        setError(mosqueSearchMessage(errorValue));
      } finally {
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    },
    [coordinates],
  );

  useEffect(() => {
    if (coordinates) loadMosques().catch(() => undefined);
  }, [coordinates, loadMosques]);

  const handleManualSearch = useCallback(() => {
    const remainingMs = manualSearchCooldownUntil.current - Date.now();
    if (remainingMs > 0) {
      const remainingSeconds = Math.ceil(remainingMs / 1_000);
      setManualSearchNotice(
        `Please wait ${remainingSeconds} seconds before searching again.`,
      );
      return;
    }
    manualSearchCooldownUntil.current = Date.now() + MANUAL_SEARCH_COOLDOWN_MS;
    loadMosques({ forceRefresh: true }).catch(() => undefined);
  }, [loadMosques]);

  const handleToggleFavorite = useCallback(
    async (mosque: Mosque) => {
      try {
        const next = await toggleFavorite(toMosqueFavorite(mosque));
        setFavorites(next);
        clearStorageError();
      } catch (errorValue) {
        reportStorageError(errorValue, async () => {
          const next = await toggleFavorite(toMosqueFavorite(mosque));
          setFavorites(next);
        });
      }
    },
    [clearStorageError, reportStorageError],
  );

  const handleNoteSave = useCallback(
    async (id: string, note: string): Promise<boolean> => {
      const next = favorites.map(favorite =>
        favorite.id === id ? { ...favorite, localPrayerNote: note } : favorite,
      );
      const saveNote = async () => {
        const saved = await saveFavorites(next);
        setFavorites(saved);
        clearStorageError();
      };
      try {
        await saveNote();
        return true;
      } catch (errorValue) {
        reportStorageError(errorValue, saveNote);
        return false;
      }
    },
    [clearStorageError, favorites, reportStorageError],
  );

  const openDirections = useCallback(
    (destination: Coordinates) => {
      Linking.openURL(buildMosqueDirectionsUrl(destination, coordinates)).catch(
        () => undefined,
      );
    },
    [coordinates],
  );

  const hasCoordinates = coordinates !== null;
  const isLoading = state === 'loading';
  const favoriteIds = new Set(favorites.map(favorite => favorite.id));

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>LOCAL PLACES OF WORSHIP</Text>
          <Text style={styles.title}>Nearby mosques</Text>
          <Text style={styles.description}>
            Find Muslim places of worship within 5 km of your active location.
          </Text>
        </View>
        <View style={styles.locationMark} accessibilityElementsHidden>
          <Text style={styles.locationMarkText}>⌖</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.findButton,
          !hasCoordinates && styles.findButtonDisabled,
          pressed && hasCoordinates && styles.findButtonPressed,
        ]}
        onPress={handleManualSearch}
        disabled={!hasCoordinates || isLoading}
        accessibilityRole="button"
        accessibilityLabel="Find mosques near me"
        accessibilityHint={
          hasCoordinates
            ? 'Loads mosques within 5 kilometres of your active location.'
            : 'Set an active location before searching for nearby mosques.'
        }
        accessibilityState={{
          disabled: !hasCoordinates || isLoading,
          busy: isLoading,
        }}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.ink} size="small" />
        ) : (
          <Text style={styles.findButtonText}>FIND MOSQUES NEAR ME</Text>
        )}
      </Pressable>

      {!hasCoordinates ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageTitle}>Location needed</Text>
          <Text style={styles.messageText}>
            Choose or allow a location in the prayer settings, then come back to
            search for mosques near you.
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.messageCard} accessibilityLiveRegion="polite">
          <Text style={styles.messageTitle}>
            {mosques.length ? 'Refreshing nearby results…' : 'Looking nearby…'}
          </Text>
          <Text style={styles.messageText}>
            {mosques.length
              ? 'Keeping your previous results visible while OpenStreetMap refreshes.'
              : 'Searching OpenStreetMap for mosques within 5 km.'}
          </Text>
        </View>
      ) : null}

      {manualSearchNotice ? (
        <View
          style={styles.messageCard}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.messageTitle}>Search cooling down</Text>
          <Text style={styles.messageText}>{manualSearchNotice}</Text>
        </View>
      ) : null}

      {storageAction ? (
        <View
          style={styles.errorCard}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.errorTitle}>Saved mosques unavailable</Text>
          <Text style={styles.errorText}>{storageAction.message}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
            onPress={retryStorageAction}
            accessibilityRole="button"
            accessibilityLabel="Try saving mosque changes again"
            accessibilityHint="Retries the failed saved mosque storage operation."
          >
            <Text style={styles.retryButtonText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      ) : null}

      {state === 'error' ? (
        <View
          style={styles.errorCard}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.errorTitle}>Search unavailable</Text>
          <Text style={styles.errorText}>
            {error}
            {mosques.length
              ? ' Showing your previous results while the directory recovers.'
              : ''}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
            onPress={handleManualSearch}
            accessibilityRole="button"
            accessibilityLabel="Try finding mosques again"
            accessibilityHint="Repeats the nearby mosque search."
          >
            <Text style={styles.retryButtonText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      ) : null}

      {favorites.length > 0 ? (
        <View style={styles.favorites} accessibilityLiveRegion="polite">
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsLabel}>SAVED MOSQUES</Text>
            <Text style={styles.resultsCount}>{favorites.length}</Text>
          </View>
          {favorites.map(favorite => (
            <FavoriteCard
              key={favorite.id}
              favorite={favorite}
              onToggle={() => handleToggleFavorite(favorite)}
              onDirections={() => openDirections(favorite)}
              onNoteSave={handleNoteSave}
            />
          ))}
        </View>
      ) : null}

      {state === 'success' && mosques.length === 0 ? (
        <View style={styles.messageCard} accessibilityLiveRegion="polite">
          <Text style={styles.messageTitle}>No mosques found</Text>
          <Text style={styles.messageText}>
            There are no mapped mosques within 5 km of this location. Try again
            from a nearby area.
          </Text>
        </View>
      ) : null}

      {mosques.length > 0 ? (
        <View style={styles.results} accessibilityLiveRegion="polite">
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsLabel}>RESULTS</Text>
            <Text style={styles.resultsCount}>{mosques.length}</Text>
          </View>
          {mosques.map(mosque => (
            <MosqueCard
              key={mosque.id}
              mosque={mosque}
              isFavorite={favoriteIds.has(mosque.id)}
              onToggle={() => handleToggleFavorite(mosque)}
              onDirections={() => openDirections(mosque)}
            />
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          Linking.openURL('https://www.openstreetmap.org/copyright').catch(
            () => undefined,
          )
        }
        accessibilityRole="link"
        accessibilityLabel={OSM_ATTRIBUTION}
        accessibilityHint="Opens OpenStreetMap attribution information."
      >
        <Text style={styles.attribution}>{OSM_ATTRIBUTION}</Text>
      </Pressable>
    </View>
  );
}

function mosqueSearchMessage(error: unknown): string {
  if (error instanceof MosqueLookupError) {
    if (error.statusCode === 429) {
      return 'The mosque directory is busy. Try again in a moment.';
    }
    if (error.statusCode && error.statusCode >= 500) {
      return 'The mosque directory is temporarily unavailable. Try again shortly.';
    }
    if (error.message.includes('timed out')) {
      return 'The mosque directory took too long to respond. Try again in a moment.';
    }
  }
  return "We couldn't complete the mosque search. Check your connection and try again.";
}

function toMosqueFavorite(mosque: Mosque): MosqueFavorite {
  return {
    id: mosque.id,
    name: mosque.name,
    latitude: mosque.latitude,
    longitude: mosque.longitude,
    ...(mosque.address ? { address: mosque.address } : {}),
  };
}

function MosqueCard({
  mosque,
  isFavorite,
  onToggle,
  onDirections,
}: {
  mosque: Mosque;
  isFavorite: boolean;
  onToggle: () => void;
  onDirections: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardAccent} />
      <View style={styles.cardContent}>
        <View style={styles.cardTopline}>
          <Text
            style={styles.mosqueName}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {mosque.name}
          </Text>
          {mosque.distanceMeters !== undefined ? (
            <Text style={styles.distance}>
              {formatDistance(mosque.distanceMeters)}
            </Text>
          ) : null}
        </View>
        {mosque.address ? (
          <Text style={styles.address} numberOfLines={3}>
            {mosque.address}
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          <Pressable
            onPress={onToggle}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={
              isFavorite
                ? `Remove ${mosque.name} from saved mosques`
                : `Save ${mosque.name}`
            }
            accessibilityState={{ selected: isFavorite }}
          >
            <Text style={styles.actionText}>
              {isFavorite ? '♥ SAVED' : '♡ SAVE'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onDirections}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${mosque.name}`}
          >
            <Text style={styles.actionText}>DIRECTIONS ↗</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FavoriteCard({
  favorite,
  onToggle,
  onDirections,
  onNoteSave,
}: {
  favorite: MosqueFavorite;
  onToggle: () => void;
  onDirections: () => void;
  onNoteSave: (id: string, note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(favorite.localPrayerNote ?? '');

  useEffect(() => {
    setNote(favorite.localPrayerNote ?? '');
  }, [favorite.localPrayerNote]);

  return (
    <View style={styles.card}>
      <View style={[styles.cardAccent, styles.favoriteAccent]} />
      <View style={styles.cardContent}>
        <View style={styles.cardTopline}>
          <Text
            style={styles.mosqueName}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {favorite.name}
          </Text>
          <Text style={styles.savedLabel}>SAVED</Text>
        </View>
        {favorite.address ? (
          <Text style={styles.address} numberOfLines={2}>
            {favorite.address}
          </Text>
        ) : null}
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          onBlur={async () => {
            const saved = await onNoteSave(favorite.id, note.slice(0, 240));
            if (!saved) setNote(favorite.localPrayerNote ?? '');
          }}
          placeholder="Add a local prayer note"
          placeholderTextColor={COLORS.mint}
          maxLength={240}
          multiline
          accessibilityLabel={`Prayer note for ${favorite.name}`}
        />
        <View style={styles.actionRow}>
          <Pressable
            onPress={onToggle}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${favorite.name} from saved mosques`}
          >
            <Text style={styles.actionText}>♥ REMOVE</Text>
          </Pressable>
          <Pressable
            onPress={onDirections}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={`Get directions to ${favorite.name}`}
          >
            <Text style={styles.actionText}>DIRECTIONS ↗</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  const kilometers = Math.round((distanceMeters / 1_000) * 10) / 10;
  return `${
    kilometers % 1 === 0 ? kilometers.toFixed(0) : kilometers.toFixed(1)
  } km`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.inkDeep,
    borderColor: COLORS.moss,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 18,
    padding: 20,
  },
  headingRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headingCopy: { flex: 1, paddingRight: 16 },
  kicker: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  title: {
    color: COLORS.cream,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  description: {
    color: COLORS.mint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  locationMark: {
    alignItems: 'center',
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.moss,
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  locationMarkText: { color: COLORS.gold, fontSize: 28, lineHeight: 32 },
  findButton: {
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
  },
  findButtonDisabled: { backgroundColor: '#4E655E' },
  findButtonPressed: {
    backgroundColor: COLORS.parchment,
    transform: [{ scale: 0.985 }],
  },
  findButtonText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  messageCard: {
    backgroundColor: COLORS.inkSoft,
    borderRadius: 16,
    marginTop: 14,
    padding: 16,
  },
  messageTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '800' },
  messageText: {
    color: COLORS.mint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  errorCard: {
    backgroundColor: '#3A2723',
    borderColor: COLORS.coral,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  errorTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '800' },
  errorText: { color: '#FFD1C2', fontSize: 13, lineHeight: 19, marginTop: 5 },
  retryButton: {
    alignSelf: 'flex-start',
    borderColor: COLORS.coral,
    borderRadius: 9,
    borderWidth: 1,
    marginTop: 13,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  retryButtonPressed: { backgroundColor: '#5A332D' },
  retryButtonText: {
    color: '#FFD1C2',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  results: { marginTop: 20 },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  resultsLabel: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  resultsCount: {
    color: COLORS.mint,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.inkSoft,
    borderColor: COLORS.moss,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 9,
    overflow: 'hidden',
  },
  cardAccent: { backgroundColor: COLORS.gold, width: 4 },
  favoriteAccent: { backgroundColor: COLORS.mint },
  cardContent: { flex: 1, padding: 14 },
  cardTopline: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mosqueName: {
    color: COLORS.cream,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
    paddingRight: 10,
  },
  distance: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: '800',
    paddingTop: 2,
  },
  address: {
    color: COLORS.mint,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  favorites: { marginTop: 20 },
  savedLabel: {
    color: COLORS.mintBright,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    paddingTop: 3,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    borderColor: COLORS.moss,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionText: {
    color: COLORS.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  noteInput: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.moss,
    borderRadius: 9,
    borderWidth: 1,
    color: COLORS.cream,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 11,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: 'top',
  },
  attribution: {
    color: COLORS.mintBright,
    fontSize: 11,
    marginTop: 12,
    textDecorationLine: 'underline',
  },
});
