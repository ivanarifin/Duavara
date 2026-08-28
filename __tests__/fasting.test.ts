import {
  DailyPrayerData,
  getFastingAlarms,
  isFastingDate,
  isValidLocalDateKey,
} from '@/domain';

function schedule(date: string, imsakAt: string): DailyPrayerData {
  const imsakDate = new Date(imsakAt);
  return {
    date,
    timings: {
      Fajr: '05:00',
      Dhuhr: '12:00',
      Asr: '15:30',
      Maghrib: '18:00',
      Isha: '19:15',
    },
    imsak: { time: '04:30', date: imsakDate },
    prayers: [
      { name: 'Fajr', time: '05:00', date: new Date('2026-08-31T05:00:00') },
      { name: 'Dhuhr', time: '12:00', date: new Date('2026-08-31T12:00:00') },
      { name: 'Asr', time: '15:30', date: new Date('2026-08-31T15:30:00') },
      { name: 'Maghrib', time: '18:00', date: new Date('2026-08-31T18:00:00') },
      { name: 'Isha', time: '19:15', date: new Date('2026-08-31T19:15:00') },
    ],
  };
}

describe('fasting schedule', () => {
  test('selects Monday and Thursday only', () => {
    expect(isFastingDate('2026-08-31', 'mondayThursday', null)).toBe(true);
    expect(isFastingDate('2026-09-03', 'mondayThursday', null)).toBe(true);
    expect(isFastingDate('2026-09-01', 'mondayThursday', null)).toBe(false);
  });

  test('alternates Dawud fasting from its user-selected fasting anchor', () => {
    expect(isFastingDate('2026-08-31', 'dawud', '2026-08-31')).toBe(true);
    expect(isFastingDate('2026-09-01', 'dawud', '2026-08-31')).toBe(false);
    expect(isFastingDate('2026-09-02', 'dawud', '2026-08-31')).toBe(true);
  });

  test('accepts only real local calendar dates for the Dawud anchor', () => {
    expect(isValidLocalDateKey('2028-02-29')).toBe(true);
    expect(isValidLocalDateKey('2026-02-29')).toBe(false);
    expect(isValidLocalDateKey('2026-02-30')).toBe(false);
    expect(isValidLocalDateKey('2026-2-03')).toBe(false);
  });

  test('creates a suhoor reminder 30 minutes before Imsak and an Imsak alarm', () => {
    const alarms = getFastingAlarms(
      [schedule('2026-08-31', '2026-08-31T04:30:00.000Z')],
      {
        fastingRoutine: 'mondayThursday',
        dawudAnchorDate: null,
        suhoorReminderEnabled: true,
        imsakAlarmEnabled: true,
      },
      new Date('2026-08-30T00:00:00.000Z'),
    );

    expect(alarms.map(alarm => [alarm.kind, alarm.at.toISOString()])).toEqual([
      ['suhoor', '2026-08-31T04:00:00.000Z'],
      ['imsak', '2026-08-31T04:30:00.000Z'],
    ]);
  });
});
