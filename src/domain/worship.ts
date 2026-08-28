import { PRAYER_NAMES, PrayerName } from '@/domain/types';

export const PRAYER_STATUSES = ['prayed', 'missed', 'qada'] as const;
export type PrayerStatus = (typeof PRAYER_STATUSES)[number];
export type WorshipDay = Partial<Record<PrayerName, PrayerStatus>>;
export type WorshipRecords = Record<string, WorshipDay>;

export const MAX_WORSHIP_DATES = 120;

export type TasbihTarget = 33 | 99;
export interface TasbihState {
  count: number;
  target: TasbihTarget;
}

export interface WorshipHistoryEntry {
  date: string;
  statuses: WorshipDay;
}

const DEFAULT_TASBIH_STATE: TasbihState = { count: 0, target: 33 };
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrayerName(value: unknown): value is PrayerName {
  return PRAYER_NAMES.includes(value as PrayerName);
}

function isPrayerStatus(value: unknown): value is PrayerStatus {
  return PRAYER_STATUSES.includes(value as PrayerStatus);
}

function isValidDateKey(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateKeyFrom(value: string | Date): string | null {
  if (typeof value === 'string') return isValidDateKey(value) ? value : null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(value.getDate()).padStart(2, '0')}`;
}

function dateFromKey(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  const date = new Date(0);
  date.setFullYear(
    Number(match?.[1]),
    Number(match?.[2]) - 1,
    Number(match?.[3]),
  );
  date.setHours(0, 0, 0, 0);
  return date;
}

function cloneDay(day: WorshipDay): WorshipDay {
  return { ...day };
}

export function toLocalWorshipDateKey(value: string | Date): string | null {
  return dateKeyFrom(value);
}

export function normalizeWorshipRecords(value: unknown): WorshipRecords {
  if (!isRecord(value)) return {};

  const entries = Object.entries(value)
    .filter(([date, day]) => isValidDateKey(date) && isRecord(day))
    .map(([date, day]) => {
      const dayRecord = isRecord(day) ? day : {};
      const normalizedDay: WorshipDay = {};
      for (const prayer of PRAYER_NAMES) {
        const status = dayRecord[prayer];
        if (isPrayerStatus(status)) normalizedDay[prayer] = status;
      }
      return [date, normalizedDay] as const;
    })
    .filter(([, day]) => Object.keys(day).length > 0)
    .sort(([first], [second]) => (second > first ? 1 : second < first ? -1 : 0))
    .slice(0, MAX_WORSHIP_DATES);

  return Object.fromEntries(entries);
}

export function getPrayerStatus(
  records: unknown,
  date: string | Date,
  prayer: PrayerName,
): PrayerStatus | null {
  const key = dateKeyFrom(date);
  if (!key || !isPrayerName(prayer)) return null;
  const day = normalizeWorshipRecords(records)[key];
  return day?.[prayer] ?? null;
}

export function setPrayerStatus(
  records: unknown,
  date: string | Date,
  prayer: PrayerName,
  status: PrayerStatus | null,
): WorshipRecords {
  const key = dateKeyFrom(date);
  if (
    !key ||
    !isPrayerName(prayer) ||
    (status !== null && !isPrayerStatus(status))
  ) {
    return normalizeWorshipRecords(records);
  }

  const normalized = normalizeWorshipRecords(records);
  const day = { ...(normalized[key] ?? {}) };
  if (status === null) delete day[prayer];
  else day[prayer] = status;

  if (Object.keys(day).length === 0) delete normalized[key];
  else normalized[key] = day;
  return normalizeWorshipRecords(normalized);
}

export function togglePrayerStatus(
  records: unknown,
  date: string | Date,
  prayer: PrayerName,
  status: PrayerStatus = 'prayed',
): WorshipRecords {
  if (!isPrayerStatus(status)) return normalizeWorshipRecords(records);
  return getPrayerStatus(records, date, prayer) === status
    ? setPrayerStatus(records, date, prayer, null)
    : setPrayerStatus(records, date, prayer, status);
}

export function calculatePrayedCount(
  records: unknown,
  date: string | Date,
): number {
  const key = dateKeyFrom(date);
  if (!key) return 0;
  const day = normalizeWorshipRecords(records)[key];
  return PRAYER_NAMES.filter(
    prayer => day?.[prayer] === 'prayed' || day?.[prayer] === 'qada',
  ).length;
}

export function isWorshipDayComplete(
  records: unknown,
  date: string | Date,
): boolean {
  return calculatePrayedCount(records, date) === PRAYER_NAMES.length;
}

export function calculateCurrentStreak(
  records: unknown,
  today: string | Date = new Date(),
): number {
  const key = dateKeyFrom(today);
  if (!key) return 0;
  const normalized = normalizeWorshipRecords(records);
  let date = dateFromKey(key);
  let streak = 0;

  while (isWorshipDayComplete(normalized, date)) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

export function getWorshipHistory(
  records: unknown,
  limit = 30,
): WorshipHistoryEntry[] {
  const normalized = normalizeWorshipRecords(records);
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return Object.keys(normalized)
    .sort((first, second) => second.localeCompare(first))
    .slice(0, count)
    .map(date => ({ date, statuses: cloneDay(normalized[date]) }));
}

export function normalizeTasbihState(value: unknown): TasbihState {
  if (!isRecord(value)) return { ...DEFAULT_TASBIH_STATE };
  const count = value.count;
  const target = value.target;
  return {
    count:
      typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
        ? count
        : DEFAULT_TASBIH_STATE.count,
    target: target === 99 ? 99 : 33,
  };
}

export function completedCycles(count: number, target: TasbihTarget): number {
  if (!Number.isSafeInteger(count) || count < 0) return 0;
  if (target !== 33 && target !== 99) return 0;
  return Math.floor(count / target);
}

export function incrementTasbih(state: unknown): TasbihState {
  const normalized = normalizeTasbihState(state);
  return {
    ...normalized,
    count: Math.min(Number.MAX_SAFE_INTEGER, normalized.count + 1),
  };
}

export function resetTasbih(state: unknown): TasbihState {
  return { ...normalizeTasbihState(state), count: 0 };
}

export function setTasbihTarget(
  state: unknown,
  target: TasbihTarget,
): TasbihState {
  const normalized = normalizeTasbihState(state);
  return target === 33 || target === 99
    ? { ...normalized, target }
    : normalized;
}
