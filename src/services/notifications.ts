import { NativeModules } from 'react-native';
import { getFastingAlarms, FastingPreferences } from '@/domain/fasting';
import {
  AdhanVolumeCategory,
  DailyPrayerData,
  PRAYER_NAMES,
  PrayerName,
} from '@/domain/types';
import { formatLocalDateKey, formatPrayerTime } from '@/domain/prayer';
import { withStorageLock } from '@/services/storageLock';

export const PRAYER_NOTIFICATION_ID_PREFIX = 'duavara-prayer-';
export const FASTING_NOTIFICATION_ID_PREFIX = 'duavara-fasting-';
const NOTIFICATION_ID_PREFIX = 'duavara-';
export const MAX_TIMESTAMP_NOTIFICATIONS = 50;

export interface NativePrayerNotification {
  id: string;
  title: string;
  body: string;
  at: number;
  adhan: boolean;
  adhanVolumeCategory: AdhanVolumeCategory;
}

export type NotificationStatus =
  | 'allowed'
  | 'blocked'
  | 'notDetermined'
  | 'unknown';
export type NotificationTimingStatus =
  | 'exact'
  | 'approximate'
  | 'notApplicable'
  | 'unknown';
export type BatteryOptimizationStatus =
  | 'unrestricted'
  | 'restricted'
  | 'notApplicable'
  | 'unknown';
export type BootReschedulingStatus = 'supported' | 'notApplicable';

export interface NotificationHealth {
  notifications: NotificationStatus;
  timing: NotificationTimingStatus;
  batteryOptimization: BatteryOptimizationStatus;
  bootRescheduling: BootReschedulingStatus;
}

type DuavaraNotificationsModule = {
  requestPermission(): Promise<boolean>;
  schedule(notifications: NativePrayerNotification[]): Promise<string[]>;
  cancelWithPrefix(prefix: string): Promise<void>;
  playAdhanPreview(volumeCategory: AdhanVolumeCategory): Promise<boolean>;
  stopAdhanPreview(): Promise<void>;
  getNotificationHealth?(): Promise<unknown>;
  openExactAlarmSettings?(): Promise<void>;
  openBatteryOptimizationSettings?(): Promise<void>;
};

const UNKNOWN_NOTIFICATION_HEALTH: NotificationHealth = {
  notifications: 'unknown',
  timing: 'unknown',
  batteryOptimization: 'unknown',
  bootRescheduling: 'notApplicable',
};

const notificationStatuses = [
  'allowed',
  'blocked',
  'notDetermined',
  'unknown',
] as const;
const notificationTimingStatuses = [
  'exact',
  'approximate',
  'notApplicable',
  'unknown',
] as const;
const batteryOptimizationStatuses = [
  'unrestricted',
  'restricted',
  'notApplicable',
  'unknown',
] as const;
const bootReschedulingStatuses = ['supported', 'notApplicable'] as const;

function normalizeStatus<T extends string>(
  value: unknown,
  statuses: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && statuses.includes(value as T)
    ? (value as T)
    : fallback;
}

export function normalizeNotificationHealth(
  value: unknown,
): NotificationHealth {
  const health =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    notifications: normalizeStatus(
      health.notifications,
      notificationStatuses,
      'unknown',
    ),
    timing: normalizeStatus(
      health.timing,
      notificationTimingStatuses,
      'unknown',
    ),
    batteryOptimization: normalizeStatus(
      health.batteryOptimization,
      batteryOptimizationStatuses,
      'unknown',
    ),
    bootRescheduling: normalizeStatus(
      health.bootRescheduling,
      bootReschedulingStatuses,
      'notApplicable',
    ),
  };
}

function getNativeNotificationsCandidate():
  | Partial<DuavaraNotificationsModule>
  | undefined {
  const module: unknown = NativeModules.DuavaraNotifications;
  return typeof module === 'object' && module !== null
    ? (module as Partial<DuavaraNotificationsModule>)
    : undefined;
}

export interface SchedulePrayerNotificationOptions {
  adhanEnabled?: boolean;
  adhanVolumeCategory?: AdhanVolumeCategory;
  enabledPrayers?: Partial<Record<PrayerName, boolean>>;
  prayerRemindersEnabled?: boolean;
  use24HourTime?: boolean;
  fasting?: FastingPreferences & { fastingAlarmsEnabled: boolean };
  now?: Date;
}

type ScheduledReminder = NativePrayerNotification & {
  date: string;
};

export function hasNativeNotificationSupport(): boolean {
  const module = getNativeNotificationsCandidate();
  return Boolean(
    module?.requestPermission && module.schedule && module.cancelWithPrefix,
  );
}

function getNativeNotifications(): DuavaraNotificationsModule {
  const module = getNativeNotificationsCandidate();
  if (!hasNativeNotificationSupport()) {
    throw new Error(
      'Native reminder service is unavailable. Reinstall the current Duavara APK; a JavaScript reload cannot install native reminder support.',
    );
  }
  return module as DuavaraNotificationsModule;
}

function createPrayerReminders(
  schedules: readonly DailyPrayerData[],
  enabledPrayers: Partial<Record<PrayerName, boolean>>,
  use24HourTime: boolean,
  adhanEnabled: boolean,
  adhanVolumeCategory: AdhanVolumeCategory,
  now: Date,
): ScheduledReminder[] {
  return schedules.flatMap(schedule =>
    schedule.prayers.flatMap(prayer => {
      if (enabledPrayers[prayer.name] === false || prayer.date <= now) {
        return [];
      }
      return [
        {
          id: `${PRAYER_NOTIFICATION_ID_PREFIX}${formatLocalDateKey(
            prayer.date,
          )}-${prayer.name.toLowerCase()}`,
          title: prayer.name,
          body: adhanEnabled
            ? `Adhan for ${prayer.name} · ${formatPrayerTime(
                prayer.time,
                use24HourTime,
              )}`
            : `Prayer time: ${formatPrayerTime(prayer.time, use24HourTime)}`,
          at: prayer.date.getTime(),
          adhan: adhanEnabled,
          adhanVolumeCategory,
          date: schedule.date,
        },
      ];
    }),
  );
}

function createFastingReminders(
  schedules: readonly DailyPrayerData[],
  fasting: FastingPreferences & { fastingAlarmsEnabled: boolean },
  use24HourTime: boolean,
  now: Date,
): ScheduledReminder[] {
  if (!fasting.fastingAlarmsEnabled || fasting.fastingRoutine === 'off') {
    return [];
  }
  return getFastingAlarms(schedules, fasting, now).map(alarm => {
    const isSuhoor = alarm.kind === 'suhoor';
    return {
      id: `${FASTING_NOTIFICATION_ID_PREFIX}${alarm.date}-${alarm.kind}`,
      title: isSuhoor ? 'Suhoor reminder' : 'Imsak',
      body: isSuhoor
        ? `Suhoor ends at Imsak, ${formatPrayerTime(
            alarm.time,
            use24HourTime,
          )}.`
        : 'Imsak is now — begin your fast.',
      at: alarm.at.getTime(),
      adhan: false,
      adhanVolumeCategory: 'notification',
      date: alarm.date,
    };
  });
}

export function buildPrayerNotificationRequests(
  schedules: readonly DailyPrayerData[],
  options: SchedulePrayerNotificationOptions = {},
): NativePrayerNotification[] {
  if (schedules.length > 7) {
    throw new Error('A maximum of 7 days can be scheduled');
  }
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('Invalid notification start date');
  }

  const prayerReminders =
    options.prayerRemindersEnabled ?? true
      ? createPrayerReminders(
          schedules,
          options.enabledPrayers ?? {},
          options.use24HourTime ?? false,
          options.adhanEnabled ?? false,
          options.adhanVolumeCategory ?? 'notification',
          now,
        )
      : [];
  const fastingReminders = options.fasting
    ? createFastingReminders(
        schedules,
        options.fasting,
        options.use24HourTime ?? false,
        now,
      )
    : [];
  const reminders = [...prayerReminders, ...fastingReminders];

  if (reminders.length > MAX_TIMESTAMP_NOTIFICATIONS) {
    throw new Error(
      `A maximum of ${MAX_TIMESTAMP_NOTIFICATIONS} notifications can be scheduled`,
    );
  }

  return reminders.map(({ date: _, ...reminder }) => reminder);
}

export async function requestNotificationPermission(): Promise<boolean> {
  return getNativeNotifications().requestPermission();
}

export async function getNotificationHealth(): Promise<NotificationHealth> {
  const notifications = getNativeNotificationsCandidate();
  if (!notifications?.getNotificationHealth) {
    return { ...UNKNOWN_NOTIFICATION_HEALTH };
  }
  return normalizeNotificationHealth(
    await notifications.getNotificationHealth(),
  );
}

export async function openExactAlarmSettings(): Promise<void> {
  const notifications = getNativeNotificationsCandidate();
  if (!notifications?.openExactAlarmSettings) {
    throw new Error('UNSUPPORTED');
  }
  await notifications.openExactAlarmSettings();
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  const notifications = getNativeNotificationsCandidate();
  if (!notifications?.openBatteryOptimizationSettings) {
    throw new Error('UNSUPPORTED');
  }
  await notifications.openBatteryOptimizationSettings();
}

async function cancelNotificationsWithPrefix(prefix: string): Promise<void> {
  await getNativeNotifications().cancelWithPrefix(prefix);
}

export async function cancelPrayerNotifications(): Promise<void> {
  await withStorageLock(() =>
    cancelNotificationsWithPrefix(PRAYER_NOTIFICATION_ID_PREFIX),
  );
}

export async function cancelFastingNotifications(): Promise<void> {
  await withStorageLock(() =>
    cancelNotificationsWithPrefix(FASTING_NOTIFICATION_ID_PREFIX),
  );
}

export async function schedulePrayerNotifications(
  schedules: readonly DailyPrayerData[],
  options: SchedulePrayerNotificationOptions = {},
): Promise<string[]> {
  const reminders = buildPrayerNotificationRequests(schedules, options);
  return withStorageLock(async () => {
    const notifications = getNativeNotifications();
    if (!reminders.length) {
      await notifications.cancelWithPrefix(NOTIFICATION_ID_PREFIX);
      return [];
    }
    if (!(await notifications.requestPermission())) {
      throw new Error('Notification permission was denied');
    }
    return notifications.schedule(reminders);
  });
}

export async function playAdhanPreview(
  volumeCategory: AdhanVolumeCategory,
): Promise<boolean> {
  const notifications = getNativeNotifications();
  if (!notifications.playAdhanPreview) {
    throw new Error('Adhan preview is unavailable on this device');
  }
  return notifications.playAdhanPreview(volumeCategory);
}

export async function stopAdhanPreview(): Promise<void> {
  const notifications = getNativeNotifications();
  if (!notifications.stopAdhanPreview) return;
  await notifications.stopAdhanPreview();
}

export async function clearAllNotifications(
  expectedEpoch?: number,
): Promise<void> {
  await withStorageLock(
    async () => {
      const notifications = getNativeNotificationsCandidate();
      if (!notifications?.cancelWithPrefix) return;
      await notifications.cancelWithPrefix(NOTIFICATION_ID_PREFIX);
      if (notifications.stopAdhanPreview)
        await notifications.stopAdhanPreview();
    },
    expectedEpoch,
    expectedEpoch !== undefined,
  );
}

export function enabledPrayerNames(
  enabledPrayers: Partial<Record<PrayerName, boolean>>,
): PrayerName[] {
  return PRAYER_NAMES.filter(name => enabledPrayers[name] !== false);
}
