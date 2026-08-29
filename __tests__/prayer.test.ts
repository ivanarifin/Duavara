import {
  addDateKey,
  formatCountdown,
  formatDateKeyInTimeZone,
  formatPrayerScheduleForSharing,
  formatPrayerTime,
  getFivePrayerRows,
  getNextPrayer,
  parseLocalPrayerDate,
  stripTimezoneText,
} from '@/domain';

describe('prayer utilities', () => {
  test('strips timezone suffixes and normalizes valid times', () => {
    expect(stripTimezoneText(' 5:07 (UTC+3) ')).toBe('05:07');
    expect(stripTimezoneText('2026-08-26T05:07:00+03:00')).toBe('05:07');
    expect(stripTimezoneText('25:00')).toBeNull();
  });

  test('preserves timezone-aware API timing instants for notification triggers', () => {
    const date = parseLocalPrayerDate(
      '26-08-2026',
      '2026-08-26T05:07:00+03:00',
    );
    expect(date.toISOString()).toBe('2026-08-26T02:07:00.000Z');
  });

  test('creates five ordered rows and finds the next row', () => {
    const rows = getFivePrayerRows(
      {
        Fajr: '05:00',
        Dhuhr: '12:30 (+03)',
        Asr: '16:00',
        Maghrib: '19:00',
        Isha: '20:30',
      },
      '26-08-2026',
    );
    expect(rows.map(row => row.name)).toEqual([
      'Fajr',
      'Dhuhr',
      'Asr',
      'Maghrib',
      'Isha',
    ]);
    expect(getNextPrayer(rows, new Date(2026, 7, 26, 13, 0))?.name).toBe('Asr');
    expect(getNextPrayer(rows, new Date(2026, 7, 26, 21, 0))).toBeNull();
  });

  test('uses the selected 12-hour or 24-hour clock format', () => {
    expect(formatPrayerTime('05:07', true)).toBe('05:07');
    expect(formatPrayerTime('5:07', true)).toBe('05:07');
    expect(formatPrayerTime(' 5:07 (UTC+3) ', true)).toBe('05:07');
    expect(formatPrayerTime('17:07', false)).toBe('5:07 PM');
    expect(formatPrayerTime('5:07', false)).toBe('5:07 AM');
  });

  test('formats a complete prayer schedule for sharing', () => {
    const schedule = {
      date: '2026-08-31',
      timezone: 'Europe/London',
      timings: {
        Fajr: '05:00',
        Dhuhr: '12:30',
        Asr: '16:00',
        Maghrib: '19:00',
        Isha: '20:30',
      },
      imsak: { time: '04:30', date: new Date('2026-08-31T04:30:00') },
      prayers: getFivePrayerRows(
        {
          Fajr: '05:00',
          Dhuhr: '12:30',
          Asr: '16:00',
          Maghrib: '19:00',
          Isha: '20:30',
        },
        '31-08-2026',
      ),
    };

    expect(formatPrayerScheduleForSharing(schedule, true)).toContain(
      'Imsak: 04:30',
    );
    expect(formatPrayerScheduleForSharing(schedule, false)).toContain(
      'Isha: 8:30 PM',
    );
  });

  test('formats date keys in a timezone and adds calendar-day offsets', () => {
    const instant = new Date('2026-08-28T00:30:00.000Z');

    expect(formatDateKeyInTimeZone(instant, 'UTC')).toBe('2026-08-28');
    expect(formatDateKeyInTimeZone(instant, 'America/Los_Angeles')).toBe(
      '2026-08-27',
    );
    expect(addDateKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDateKey('2024-03-01', -1)).toBe('2024-02-29');
  });

  test('formats countdowns with clamping and zero padding', () => {
    expect(formatCountdown(3_661_999)).toBe('01:01:01');
    expect(formatCountdown(-1)).toBe('00:00:00');
  });
});
