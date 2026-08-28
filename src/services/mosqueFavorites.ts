import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coordinates } from '@/domain/types';
import { withStorageLock } from '@/services/storageLock';

export const MOSQUE_FAVORITES_KEY = 'duavara.mosque.favorites';
export const MAX_MOSQUE_FAVORITES = 50;
export const MAX_LOCAL_PRAYER_NOTE_LENGTH = 240;

export class MosqueFavoritesStorageError extends Error {
  constructor(public readonly operation: 'read' | 'write', message: string) {
    super(`Failed to ${operation} mosque favorites: ${message}`);
    this.name = 'MosqueFavoritesStorageError';
  }
}

const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;

export interface MosqueFavorite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  localPrayerNote?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function boundedString(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximumLength) : undefined;
}

function normalizeFavorite(value: unknown): MosqueFavorite | null {
  if (!isRecord(value)) return null;

  const id = boundedString(value.id, MAX_ID_LENGTH);
  const name = boundedString(value.name, MAX_NAME_LENGTH);
  if (
    !id ||
    !name ||
    !isValidCoordinate(value.latitude, -90, 90) ||
    !isValidCoordinate(value.longitude, -180, 180)
  ) {
    return null;
  }

  const address = boundedString(value.address, MAX_ADDRESS_LENGTH);
  const localPrayerNote = boundedString(
    value.localPrayerNote,
    MAX_LOCAL_PRAYER_NOTE_LENGTH,
  );

  return {
    id,
    name,
    latitude: value.latitude,
    longitude: value.longitude,
    ...(address ? { address } : {}),
    ...(localPrayerNote ? { localPrayerNote } : {}),
  };
}

export function normalizeMosqueFavorites(value: unknown): MosqueFavorite[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: MosqueFavorite[] = [];
  for (const item of value) {
    const favorite = normalizeFavorite(item);
    if (!favorite || seen.has(favorite.id)) continue;
    seen.add(favorite.id);
    normalized.push(favorite);
    if (normalized.length === MAX_MOSQUE_FAVORITES) break;
  }
  return normalized;
}

export async function getFavorites(): Promise<MosqueFavorite[]> {
  let stored: string | null;
  try {
    stored = await AsyncStorage.getItem(MOSQUE_FAVORITES_KEY);
  } catch (error) {
    throw new MosqueFavoritesStorageError(
      'read',
      error instanceof Error ? error.message : 'storage read failed',
    );
  }

  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new Error('stored data is not a favorites list');
    }
    if (parsed.some(item => normalizeFavorite(item) === null)) {
      throw new Error('stored data contains an invalid favorite');
    }
    return normalizeMosqueFavorites(parsed);
  } catch (error) {
    throw new MosqueFavoritesStorageError(
      'read',
      error instanceof Error ? error.message : 'stored data is invalid',
    );
  }
}

export async function saveFavorites(
  favorites: MosqueFavorite[],
): Promise<MosqueFavorite[]> {
  const normalized = normalizeMosqueFavorites(favorites);
  return withStorageLock(() => saveFavoritesUnlocked(normalized));
}

async function saveFavoritesUnlocked(
  normalized: MosqueFavorite[],
): Promise<MosqueFavorite[]> {
  try {
    await AsyncStorage.setItem(
      MOSQUE_FAVORITES_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    throw new MosqueFavoritesStorageError(
      'write',
      error instanceof Error ? error.message : 'storage write failed',
    );
  }
  return normalized;
}

export async function toggleFavorite(
  favorite: MosqueFavorite,
): Promise<MosqueFavorite[]> {
  const normalizedFavorite = normalizeFavorite(favorite);
  if (!normalizedFavorite) {
    throw new Error('Invalid mosque favorite');
  }

  return withStorageLock(async () => {
    const current = await getFavorites();
    const existingIndex = current.findIndex(
      item => item.id === normalizedFavorite.id,
    );
    const next =
      existingIndex >= 0
        ? current.filter(item => item.id !== normalizedFavorite.id)
        : [normalizedFavorite, ...current];
    return saveFavoritesUnlocked(normalizeMosqueFavorites(next));
  });
}

export async function isFavorite(id: string): Promise<boolean> {
  const normalizedId = boundedString(id, MAX_ID_LENGTH);
  if (!normalizedId) return false;
  const favorites = await getFavorites();
  return favorites.some(favorite => favorite.id === normalizedId);
}

export function buildMosqueDirectionsUrl(
  destination: Coordinates,
  source?: Coordinates | null,
): string {
  if (source) {
    const route = [source, destination]
      .map(coordinates => `${coordinates.latitude},${coordinates.longitude}`)
      .join(';');
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${route}`;
  }

  return `https://www.openstreetmap.org/?mlat=${destination.latitude}&mlon=${destination.longitude}#map=18/${destination.latitude}/${destination.longitude}`;
}

export const getMosqueFavorites = getFavorites;
export const saveMosqueFavorites = saveFavorites;
export const toggleMosqueFavorite = toggleFavorite;
export const isMosqueFavorite = isFavorite;
export const getMosqueDirectionsUrl = buildMosqueDirectionsUrl;
export const buildDirectionsUrl = buildMosqueDirectionsUrl;
