import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  calculateCurrentStreak,
  calculatePrayedCount,
  completedCycles,
  getPrayerStatus as getPrayerStatusFromRecords,
  getWorshipHistory as getWorshipHistoryFromRecords,
  incrementTasbih as incrementTasbihState,
  normalizeTasbihState,
  normalizeWorshipRecords,
  resetTasbih as resetTasbihState,
  setPrayerStatus as setPrayerStatusInRecords,
  setTasbihTarget as setTasbihTargetState,
  togglePrayerStatus as togglePrayerStatusInRecords,
  TasbihState,
  TasbihTarget,
  PrayerStatus,
  WorshipHistoryEntry,
  WorshipRecords,
} from '@/domain/worship';
import { PrayerName } from '@/domain/types';
import { withStorageLock } from '@/services/storageLock';

export type {
  PrayerStatus,
  TasbihState,
  TasbihTarget,
  WorshipDay,
  WorshipHistoryEntry,
  WorshipRecords,
} from '@/domain/worship';

export const WORSHIP_KEY = 'duavara.worship';
export const TASBIH_KEY = 'duavara.tasbih';

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function getWorshipRecords(): Promise<WorshipRecords> {
  return normalizeWorshipRecords(await readJson(WORSHIP_KEY));
}

export async function saveWorshipRecords(
  records: unknown,
): Promise<WorshipRecords> {
  const normalized = normalizeWorshipRecords(records);
  return withStorageLock(() => saveWorshipRecordsUnlocked(normalized));
}

export async function getPrayerStatus(
  date: string | Date,
  prayer: PrayerName,
): Promise<PrayerStatus | null> {
  return getPrayerStatusFromRecords(await getWorshipRecords(), date, prayer);
}

async function saveWorshipRecordsUnlocked(
  normalized: WorshipRecords,
): Promise<WorshipRecords> {
  await AsyncStorage.setItem(WORSHIP_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function setPrayerStatus(
  date: string | Date,
  prayer: PrayerName,
  status: PrayerStatus | null,
): Promise<WorshipRecords> {
  return withStorageLock(async () => {
    const next = setPrayerStatusInRecords(
      await getWorshipRecords(),
      date,
      prayer,
      status,
    );
    return saveWorshipRecordsUnlocked(next);
  });
}

export async function togglePrayerStatus(
  date: string | Date,
  prayer: PrayerName,
  status: PrayerStatus = 'prayed',
): Promise<WorshipRecords> {
  return withStorageLock(async () => {
    const next = togglePrayerStatusInRecords(
      await getWorshipRecords(),
      date,
      prayer,
      status,
    );
    return saveWorshipRecordsUnlocked(next);
  });
}

export async function getDailyPrayedCount(
  date: string | Date,
): Promise<number> {
  return calculatePrayedCount(await getWorshipRecords(), date);
}

export async function getCurrentStreak(
  today: string | Date = new Date(),
): Promise<number> {
  return calculateCurrentStreak(await getWorshipRecords(), today);
}

export async function getWorshipHistory(
  limit = 30,
): Promise<WorshipHistoryEntry[]> {
  return getWorshipHistoryFromRecords(await getWorshipRecords(), limit);
}

export async function getTasbihState(): Promise<TasbihState> {
  return normalizeTasbihState(await readJson(TASBIH_KEY));
}

export async function saveTasbihState(state: unknown): Promise<TasbihState> {
  const normalized = normalizeTasbihState(state);
  return withStorageLock(() => saveTasbihStateUnlocked(normalized));
}

async function saveTasbihStateUnlocked(
  normalized: TasbihState,
): Promise<TasbihState> {
  await AsyncStorage.setItem(TASBIH_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function incrementTasbih(): Promise<TasbihState> {
  return withStorageLock(async () =>
    saveTasbihStateUnlocked(incrementTasbihState(await getTasbihState())),
  );
}

export async function resetTasbih(): Promise<TasbihState> {
  return withStorageLock(async () =>
    saveTasbihStateUnlocked(resetTasbihState(await getTasbihState())),
  );
}

export async function setTasbihTarget(
  target: TasbihTarget,
): Promise<TasbihState> {
  return withStorageLock(async () =>
    saveTasbihStateUnlocked(
      setTasbihTargetState(await getTasbihState(), target),
    ),
  );
}

export { completedCycles };
