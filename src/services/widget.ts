import { NativeModules, Platform } from 'react-native';
import { DailyPrayerData, PrayerName } from '@/domain/types';
import { withStorageLock } from '@/services/storageLock';

export interface WidgetPrayer {
  name: PrayerName;
  time: string;
  at: number;
}

type DuavaraWidgetModule = {
  clearPrayerSchedule(): Promise<void>;
  updatePrayerSchedule(prayers: WidgetPrayer[]): Promise<void>;
};

function isWidgetPrayer(value: WidgetPrayer): boolean {
  return (
    Number.isFinite(value.at) &&
    value.at > 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
  );
}

export function toWidgetPrayers(
  schedules: readonly DailyPrayerData[],
): WidgetPrayer[] {
  const now = Date.now();
  const prayers = schedules
    .flatMap(schedule => schedule.prayers)
    .map(prayer => ({
      name: prayer.name,
      time: prayer.time,
      at: prayer.date.getTime(),
    }))
    .filter(isWidgetPrayer)
    .filter(prayer => prayer.at > now)
    .sort((first, second) => first.at - second.at);

  return prayers.filter(
    (prayer, index) =>
      index === 0 ||
      prayer.at !== prayers[index - 1].at ||
      prayer.name !== prayers[index - 1].name,
  );
}

export async function clearPrayerWidget(expectedEpoch?: number): Promise<void> {
  await withStorageLock(
    async () => {
      if (Platform.OS !== 'android') return;
      const widget = NativeModules.DuavaraWidget as
        | DuavaraWidgetModule
        | undefined;
      if (!widget?.clearPrayerSchedule) return;
      await widget.clearPrayerSchedule();
    },
    expectedEpoch,
    expectedEpoch !== undefined,
  );
}

export async function syncPrayerWidget(
  schedules: readonly DailyPrayerData[],
): Promise<void> {
  const prayers = toWidgetPrayers(schedules);
  await withStorageLock(async () => {
    if (Platform.OS !== 'android') return;
    const widget = NativeModules.DuavaraWidget as
      | DuavaraWidgetModule
      | undefined;
    if (!widget) return;
    if (!prayers.length) {
      await widget.clearPrayerSchedule?.();
      return;
    }
    await widget.updatePrayerSchedule?.(prayers);
  });
}
