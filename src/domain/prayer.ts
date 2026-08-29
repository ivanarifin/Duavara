import {
  AlAdhanTimingsData,
  DailyPrayerData,
  PRAYER_NAMES,
  PrayerName,
  PrayerTime,
} from '@/domain/types';

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

export function stripTimezoneText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const isoTime = /T(\d{1,2}:\d{2})/.exec(value)?.[1];
  const time = (isoTime ?? value)
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(/\s+/)[0];
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60
    ? `${String(hour).padStart(2, '0')}:${match[2]}`
    : null;
}

function dateParts(value: string | Date): [number, number, number] {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid prayer date');
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }

  const match = /^(?:(\d{2})-(\d{2})-(\d{4})|(\d{4})-(\d{2})-(\d{2}))$/.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Invalid prayer date: ${value}`);
  const day = Number(match[1] ?? match[6]);
  const month = Number(match[2] ?? match[5]);
  const year = Number(match[3] ?? match[4]);
  return [year, month, day];
}

export function parseLocalPrayerDate(date: string | Date, time: unknown): Date {
  if (typeof time === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(time)) {
    const result = new Date(time);
    if (!Number.isNaN(result.getTime())) return result;
  }
  const parsedTime = stripTimezoneText(time);
  if (!parsedTime) throw new Error(`Invalid prayer time: ${String(time)}`);
  const [year, month, day] = dateParts(date);
  const [hour, minute] = parsedTime.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    throw new Error(`Invalid prayer date: ${String(date)}`);
  }
  return result;
}

export function formatPrayerTime(time: string, use24HourTime: boolean): string {
  const normalized = stripTimezoneText(time);
  if (!normalized) return time;
  if (use24HourTime) return normalized;
  const [hourText, minute] = normalized.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatPrayerScheduleForSharing(
  schedule: DailyPrayerData,
  use24HourTime: boolean,
): string {
  const prayers = schedule.prayers
    .map(
      prayer =>
        `${prayer.name}: ${formatPrayerTime(prayer.time, use24HourTime)}`,
    )
    .join('\n');
  const timezone = schedule.timezone ? ` (${schedule.timezone})` : '';
  return `Duavara prayer times — ${
    schedule.date
  }${timezone}\nImsak: ${formatPrayerTime(
    schedule.imsak.time,
    use24HourTime,
  )}\n${prayers}`;
}

export function formatLocalDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return `${String(date.getDate()).padStart(2, '0')}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-${date.getFullYear()}`;
}

export function formatLocalDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDateKeyInTimeZone(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  if (!timeZone) return formatLocalDateKey(date);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value]),
    );
    if (!values.year || !values.month || !values.day) {
      throw new Error('Timezone date formatting failed');
    }
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

export function addDateKey(dateKey: string, amount: number): string {
  if (!Number.isInteger(amount))
    throw new Error('Date offset must be an integer');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid date key: ${dateKey}`);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function getFivePrayerRows(
  timings: Record<string, unknown>,
  date: string | Date,
): PrayerTime[] {
  return PRAYER_NAMES.map(name => {
    const rawTime = timings[name];
    const time = stripTimezoneText(rawTime);
    if (!time) throw new Error(`Missing or invalid ${name} timing`);
    return { name, time, date: parseLocalPrayerDate(date, rawTime) };
  });
}

export function toDailyPrayerData(
  data: AlAdhanTimingsData,
  date: string | Date,
  location?: { latitude: number; longitude: number },
): DailyPrayerData {
  const prayers = getFivePrayerRows(data.timings, date);
  const imsakTime = stripTimezoneText(data.timings.Imsak);
  if (!imsakTime) throw new Error('Missing or invalid Imsak timing');
  const [year, month, day] = dateParts(date);
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
      2,
      '0',
    )}`,
    timings: Object.fromEntries(
      prayers.map(prayer => [prayer.name, prayer.time]),
    ) as Record<PrayerName, string>,
    prayers,
    imsak: {
      time: imsakTime,
      date: parseLocalPrayerDate(date, data.timings.Imsak),
    },
    timezone: data.meta?.timezone,
    location,
  };
}

export function getNextPrayer(
  prayers: readonly PrayerTime[],
  now: Date = new Date(),
): PrayerTime | null {
  if (Number.isNaN(now.getTime())) throw new Error('Invalid current date');
  return (
    prayers
      .filter(prayer => prayer.date.getTime() > now.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null
  );
}

export function formatCountdown(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid countdown');
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}
