import { DailyPrayerData, FastingRoutine } from '@/domain/types';

export type { FastingRoutine } from '@/domain/types';
export type FastingAlarmKind = 'suhoor' | 'imsak';

export interface FastingPreferences {
  fastingRoutine: FastingRoutine;
  dawudAnchorDate: string | null;
  suhoorReminderEnabled: boolean;
  imsakAlarmEnabled: boolean;
}

export interface FastingAlarm {
  kind: FastingAlarmKind;
  date: string;
  time: string;
  at: Date;
}

function calendarDayNumber(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid local date: ${dateKey}`);
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid local date: ${dateKey}`);
  }
  return timestamp / 86_400_000;
}

export function isValidLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    calendarDayNumber(value);
    return true;
  } catch {
    return false;
  }
}

export function isFastingDate(
  dateKey: string,
  routine: FastingRoutine,
  dawudAnchorDate: string | null,
): boolean {
  if (routine === 'off') return false;
  const dayNumber = calendarDayNumber(dateKey);
  if (routine === 'mondayThursday') {
    const weekday = new Date(dayNumber * 86_400_000).getUTCDay();
    return weekday === 1 || weekday === 4;
  }
  if (!dawudAnchorDate) return false;
  const dayDifference = dayNumber - calendarDayNumber(dawudAnchorDate);
  return Math.abs(dayDifference) % 2 === 0;
}

export function getFastingAlarms(
  schedules: readonly DailyPrayerData[],
  preferences: FastingPreferences,
  now: Date = new Date(),
): FastingAlarm[] {
  if (Number.isNaN(now.getTime())) throw new Error('Invalid current date');

  return schedules.flatMap(schedule => {
    if (
      !isFastingDate(
        schedule.date,
        preferences.fastingRoutine,
        preferences.dawudAnchorDate,
      )
    ) {
      return [];
    }

    const alarms: FastingAlarm[] = [];
    if (preferences.suhoorReminderEnabled) {
      const suhoorAt = new Date(schedule.imsak.date.getTime() - 30 * 60_000);
      if (suhoorAt.getTime() > now.getTime()) {
        alarms.push({
          kind: 'suhoor',
          date: schedule.date,
          time: schedule.imsak.time,
          at: suhoorAt,
        });
      }
    }
    if (
      preferences.imsakAlarmEnabled &&
      schedule.imsak.date.getTime() > now.getTime()
    ) {
      alarms.push({
        kind: 'imsak',
        date: schedule.date,
        time: schedule.imsak.time,
        at: schedule.imsak.date,
      });
    }
    return alarms;
  });
}
