import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAllNotifications } from '@/services/notifications';
import { clearPrayerWidget } from '@/services/widget';
import {
  beginLocalDataReset,
  completeLocalDataReset,
  withStorageLock,
} from '@/services/storageLock';
import { isValidLocalDateKey } from '@/domain/fasting';
import {
  CachedScheduleSet,
  DailyPrayerData,
  LocationProfile,
  LocationProfileKind,
  LocationProfileStore,
  PRAYER_NAMES,
  PrayerAdjustments,
  PrayerSettings,
} from '@/domain/types';

export const SETTINGS_KEY = 'duavara.settings';
export const SCHEDULE_KEY = 'duavara.schedule';
export const LOCATION_PROFILES_KEY = 'duavara.location-profiles';
const PROFILE_SCHEDULE_KEY_PREFIX = 'duavara.schedule.';
const APP_STORAGE_KEY_PREFIX = 'duavara.';
const MAX_LOCATION_PROFILES = 12;
const MAX_PROFILE_NAME_LENGTH = 40;

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = {
  method: 3,
  school: 'standard',
  notificationsEnabled: false,
  adhanEnabled: false,
  adhanVolumeCategory: 'notification',
  fastingRoutine: 'off',
  fastingAlarmsEnabled: false,
  suhoorReminderEnabled: true,
  imsakAlarmEnabled: true,
  dawudAnchorDate: null,
  use24HourTime: false,
  enabledPrayers: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
};

function settingsFromUnknown(value: unknown): PrayerSettings {
  if (typeof value !== 'object' || value === null)
    return {
      ...DEFAULT_PRAYER_SETTINGS,
      enabledPrayers: { ...DEFAULT_PRAYER_SETTINGS.enabledPrayers },
    };
  const candidate = value as Partial<PrayerSettings>;
  const enabled = candidate.enabledPrayers;
  const fastingRoutine =
    candidate.fastingRoutine === 'mondayThursday' ||
    candidate.fastingRoutine === 'dawud'
      ? candidate.fastingRoutine
      : 'off';
  return {
    method:
      Number.isInteger(candidate.method) && (candidate.method as number) >= 0
        ? (candidate.method as number)
        : DEFAULT_PRAYER_SETTINGS.method,
    school: candidate.school === 'hanafi' ? 'hanafi' : 'standard',
    notificationsEnabled:
      typeof candidate.notificationsEnabled === 'boolean'
        ? candidate.notificationsEnabled
        : DEFAULT_PRAYER_SETTINGS.notificationsEnabled,
    adhanEnabled:
      typeof candidate.adhanEnabled === 'boolean'
        ? candidate.adhanEnabled
        : DEFAULT_PRAYER_SETTINGS.adhanEnabled,
    adhanVolumeCategory:
      candidate.adhanVolumeCategory === 'alarm' ||
      candidate.adhanVolumeCategory === 'media'
        ? candidate.adhanVolumeCategory
        : 'notification',
    fastingRoutine,
    fastingAlarmsEnabled:
      fastingRoutine === 'off'
        ? false
        : typeof candidate.fastingAlarmsEnabled === 'boolean'
        ? candidate.fastingAlarmsEnabled
        : DEFAULT_PRAYER_SETTINGS.fastingAlarmsEnabled,
    suhoorReminderEnabled:
      typeof candidate.suhoorReminderEnabled === 'boolean'
        ? candidate.suhoorReminderEnabled
        : DEFAULT_PRAYER_SETTINGS.suhoorReminderEnabled,
    imsakAlarmEnabled:
      typeof candidate.imsakAlarmEnabled === 'boolean'
        ? candidate.imsakAlarmEnabled
        : DEFAULT_PRAYER_SETTINGS.imsakAlarmEnabled,
    dawudAnchorDate: isValidLocalDateKey(candidate.dawudAnchorDate)
      ? candidate.dawudAnchorDate
      : null,
    use24HourTime:
      typeof candidate.use24HourTime === 'boolean'
        ? candidate.use24HourTime
        : DEFAULT_PRAYER_SETTINGS.use24HourTime,
    enabledPrayers: Object.fromEntries(
      PRAYER_NAMES.map(name => [
        name,
        typeof enabled?.[name] === 'boolean' ? enabled[name] : true,
      ]),
    ) as PrayerSettings['enabledPrayers'],
  };
}

export async function getPrayerSettings(): Promise<PrayerSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw
      ? settingsFromUnknown(JSON.parse(raw))
      : settingsFromUnknown(undefined);
  } catch {
    return settingsFromUnknown(undefined);
  }
}

export async function savePrayerSettings(
  settings: PrayerSettings,
): Promise<void> {
  await withStorageLock(() =>
    AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settingsFromUnknown(settings)),
    ),
  );
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

function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100)
    return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeAdjustments(value: unknown): Partial<PrayerAdjustments> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    PRAYER_NAMES.flatMap(name => {
      const adjustment = value[name];
      return typeof adjustment === 'number' &&
        Number.isInteger(adjustment) &&
        adjustment >= -180 &&
        adjustment <= 180
        ? [[name, adjustment]]
        : [];
    }),
  ) as Partial<PrayerAdjustments>;
}

function normalizeLocationProfile(value: unknown): LocationProfile | null {
  if (!isRecord(value)) return null;
  const { id, name, kind, coordinates } = value;
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > MAX_PROFILE_NAME_LENGTH ||
    !['home', 'work', 'mosque', 'travel', 'custom'].includes(
      kind as LocationProfileKind,
    ) ||
    !isRecord(coordinates) ||
    !isValidCoordinate(coordinates.latitude, -90, 90) ||
    !isValidCoordinate(coordinates.longitude, -180, 180)
  ) {
    return null;
  }

  const timezone = isValidTimezone(value.timezone) ? value.timezone : undefined;
  const highLatitudeRule =
    value.highLatitudeRule === 'angleBased' ||
    value.highLatitudeRule === 'midnight' ||
    value.highLatitudeRule === 'oneSeventh'
      ? value.highLatitudeRule
      : undefined;
  const adjustments = normalizeAdjustments(value.adjustments);

  return {
    id,
    name: name.trim(),
    kind: kind as LocationProfileKind,
    coordinates: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
    ...(timezone ? { timezone } : {}),
    ...(highLatitudeRule ? { highLatitudeRule } : {}),
    ...(Object.keys(adjustments).length ? { adjustments } : {}),
  };
}

export function normalizeLocationProfileStore(
  value: unknown,
): LocationProfileStore {
  if (!isRecord(value) || !Array.isArray(value.profiles)) {
    return { activeProfileId: null, profiles: [] };
  }
  const ids = new Set<string>();
  const profiles = value.profiles
    .map(normalizeLocationProfile)
    .filter((profile): profile is LocationProfile => profile !== null)
    .filter(profile => {
      if (ids.has(profile.id)) return false;
      ids.add(profile.id);
      return true;
    })
    .slice(0, MAX_LOCATION_PROFILES);
  const activeProfileId =
    typeof value.activeProfileId === 'string' &&
    profiles.some(profile => profile.id === value.activeProfileId)
      ? value.activeProfileId
      : profiles[0]?.id ?? null;
  return { activeProfileId, profiles };
}

export async function getLocationProfileStore(): Promise<LocationProfileStore> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_PROFILES_KEY);
    return normalizeLocationProfileStore(raw ? JSON.parse(raw) : null);
  } catch {
    return { activeProfileId: null, profiles: [] };
  }
}

async function readLocationProfileStoreUnlocked(): Promise<LocationProfileStore> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_PROFILES_KEY);
    return normalizeLocationProfileStore(raw ? JSON.parse(raw) : null);
  } catch {
    return { activeProfileId: null, profiles: [] };
  }
}

async function saveLocationProfileStoreUnlocked(
  normalized: LocationProfileStore,
): Promise<LocationProfileStore> {
  const current = await readLocationProfileStoreUnlocked();
  const profiles = [
    ...normalized.profiles,
    ...current.profiles.filter(
      currentProfile =>
        !normalized.profiles.some(profile => profile.id === currentProfile.id),
    ),
  ].slice(0, MAX_LOCATION_PROFILES);
  const merged = normalizeLocationProfileStore({
    activeProfileId: normalized.activeProfileId ?? current.activeProfileId,
    profiles,
  });
  await AsyncStorage.setItem(LOCATION_PROFILES_KEY, JSON.stringify(merged));
  return merged;
}

export async function saveLocationProfileStore(
  store: unknown,
): Promise<LocationProfileStore> {
  const normalized = normalizeLocationProfileStore(store);
  return withStorageLock(() => saveLocationProfileStoreUnlocked(normalized));
}

export async function setActiveLocationProfile(
  profileId: string,
  shouldCommit: () => boolean = () => true,
): Promise<LocationProfileStore | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileId)) {
    throw new Error('Invalid location profile ID');
  }
  return withStorageLock(async () => {
    if (!shouldCommit()) return null;
    const current = await readLocationProfileStoreUnlocked();
    if (!current.profiles.some(profile => profile.id === profileId)) {
      throw new Error('Location profile was not found');
    }
    const next = { ...current, activeProfileId: profileId };
    await AsyncStorage.setItem(LOCATION_PROFILES_KEY, JSON.stringify(next));
    return next;
  });
}

export async function upsertLocationProfile(
  profile: unknown,
  shouldCommit: () => boolean = () => true,
): Promise<LocationProfileStore | null> {
  const normalized = normalizeLocationProfile(profile);
  if (!normalized) throw new Error('Invalid location profile');
  return withStorageLock(async () => {
    if (!shouldCommit()) return null;
    const current = await readLocationProfileStoreUnlocked();
    const next = normalizeLocationProfileStore({
      activeProfileId: normalized.id,
      profiles: [
        normalized,
        ...current.profiles.filter(item => item.id !== normalized.id),
      ],
    });
    await AsyncStorage.setItem(LOCATION_PROFILES_KEY, JSON.stringify(next));
    return next;
  });
}

function reviveDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function isValidPersistedTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function reviveSchedule(value: unknown): DailyPrayerData | null {
  if (
    !isRecord(value) ||
    !isValidDateKey(value.date) ||
    !isRecord(value.timings) ||
    !Array.isArray(value.prayers)
  ) {
    return null;
  }
  const timings = PRAYER_NAMES.reduce<Record<string, string> | null>(
    (result, name) => {
      const time = (value.timings as Record<string, unknown>)[name];
      if (!result || !isValidPersistedTime(time)) return null;
      result[name] = time;
      return result;
    },
    {},
  );
  if (
    !timings ||
    !isValidPersistedTime(
      value.imsak && isRecord(value.imsak) ? value.imsak.time : null,
    )
  ) {
    return null;
  }
  const prayers = value.prayers.map(prayer => {
    if (
      !isRecord(prayer) ||
      !PRAYER_NAMES.includes(prayer.name as (typeof PRAYER_NAMES)[number]) ||
      !isValidPersistedTime(prayer.time) ||
      prayer.time !== timings[prayer.name as string]
    ) {
      return null;
    }
    const date = reviveDate(prayer.date);
    return date
      ? {
          name: prayer.name as (typeof PRAYER_NAMES)[number],
          time: prayer.time,
          date,
        }
      : null;
  });
  if (
    prayers.some(prayer => prayer === null) ||
    prayers.length !== PRAYER_NAMES.length
  )
    return null;
  const prayerNames = new Set(prayers.map(prayer => prayer?.name));
  if (prayerNames.size !== PRAYER_NAMES.length) return null;
  const imsak = isRecord(value.imsak) ? value.imsak : null;
  const imsakDate = reviveDate(imsak?.date);
  if (!imsak || !imsakDate) return null;
  if (value.timezone !== undefined && !isValidTimezone(value.timezone)) {
    return null;
  }
  if (
    value.location !== undefined &&
    (!isRecord(value.location) ||
      !isValidCoordinate(value.location.latitude, -90, 90) ||
      !isValidCoordinate(value.location.longitude, -180, 180))
  ) {
    return null;
  }
  return {
    ...value,
    date: value.date,
    timings: timings as Record<(typeof PRAYER_NAMES)[number], string>,
    prayers: prayers as DailyPrayerData['prayers'],
    imsak: { time: imsak.time as string, date: imsakDate },
  } as DailyPrayerData;
}

export async function getCachedSchedule(): Promise<DailyPrayerData | null> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    return raw ? reviveSchedule(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveCachedSchedule(
  schedule: DailyPrayerData,
): Promise<void> {
  const validSchedule = reviveSchedule(schedule);
  if (!validSchedule) throw new Error('Invalid cached schedule');
  await withStorageLock(() =>
    AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(validSchedule)),
  );
}

export async function clearCachedSchedule(): Promise<void> {
  await withStorageLock(() => AsyncStorage.removeItem(SCHEDULE_KEY));
}

function profileScheduleKey(profileId: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profileId)) {
    throw new Error('Invalid location profile ID');
  }
  return `${PROFILE_SCHEDULE_KEY_PREFIX}${profileId}`;
}

function reviveScheduleSet(
  value: unknown,
  profileId: string,
  calculationKey: string,
): DailyPrayerData[] | null {
  if (
    !isRecord(value) ||
    value.profileId !== profileId ||
    value.calculationKey !== calculationKey
  ) {
    return null;
  }
  if (
    !Array.isArray(value.schedules) ||
    value.schedules.length === 0 ||
    value.schedules.length > 31
  ) {
    return null;
  }
  const schedules = value.schedules.map(reviveSchedule);
  if (schedules.some(schedule => schedule === null)) return null;
  const validSchedules = schedules as DailyPrayerData[];
  const dates = new Set(validSchedules.map(schedule => schedule.date));
  return dates.size === validSchedules.length
    ? validSchedules.sort((first, second) =>
        first.date.localeCompare(second.date),
      )
    : null;
}

export async function getCachedSchedules(
  profileId: string,
  calculationKey: string,
): Promise<DailyPrayerData[] | null> {
  try {
    const raw = await AsyncStorage.getItem(profileScheduleKey(profileId));
    return raw
      ? reviveScheduleSet(JSON.parse(raw), profileId, calculationKey)
      : null;
  } catch {
    return null;
  }
}

export async function saveCachedSchedules(
  profileId: string,
  calculationKey: string,
  schedules: readonly DailyPrayerData[],
): Promise<void> {
  if (
    !/^[A-Za-z0-9_-]{1,80}$/.test(profileId) ||
    !calculationKey ||
    calculationKey.length > 2_000 ||
    schedules.length === 0 ||
    schedules.length > 31
  ) {
    throw new Error('Invalid cached schedules');
  }
  const validSchedules = schedules.map(reviveSchedule);
  if (validSchedules.some(schedule => schedule === null)) {
    throw new Error('Invalid cached schedule');
  }
  const scheduleSet: CachedScheduleSet = {
    profileId,
    calculationKey,
    savedAt: Date.now(),
    schedules: validSchedules as DailyPrayerData[],
  };
  await withStorageLock(() =>
    AsyncStorage.setItem(
      profileScheduleKey(profileId),
      JSON.stringify(scheduleSet),
    ),
  );
}

export async function clearCachedSchedules(profileId: string): Promise<void> {
  await withStorageLock(() =>
    AsyncStorage.removeItem(profileScheduleKey(profileId)),
  );
}

export async function deleteAllLocalData(): Promise<void> {
  const resetEpoch = beginLocalDataReset();
  const results: PromiseSettledResult<unknown>[] = [];

  try {
    await withStorageLock(
      async () => {
        const keys = await AsyncStorage.getAllKeys();
        const appKeys = keys.filter(key =>
          key.startsWith(APP_STORAGE_KEY_PREFIX),
        );
        await Promise.all(appKeys.map(key => AsyncStorage.removeItem(key)));
      },
      resetEpoch,
      true,
    );
  } catch (reason) {
    results.push({ status: 'rejected', reason });
  }

  try {
    const { clearDownloadedAudio } =
      require('@/services/quranAudio') as typeof import('@/services/quranAudio');
    results.push(
      await clearDownloadedAudio(resetEpoch).then(
        () => ({ status: 'fulfilled', value: undefined as void }),
        reason => ({ status: 'rejected', reason }),
      ),
    );
  } catch (reason) {
    results.push({ status: 'rejected', reason });
  }

  results.push(
    ...(await Promise.allSettled([
      clearAllNotifications(resetEpoch),
      clearPrayerWidget(resetEpoch),
    ])),
  );

  completeLocalDataReset(resetEpoch);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) throw failure.reason;
}
