import { DailyPrayerData } from '@/domain';
import { toWidgetPrayers, widgetLocationLabel } from '@/services/widget';

const schedule = (date: string, offset: number): DailyPrayerData => ({
  date,
  timings: {
    Fajr: '05:00',
    Dhuhr: '12:00',
    Asr: '15:30',
    Maghrib: '18:00',
    Isha: '19:15',
  },
  imsak: { time: '04:30', date: new Date(offset + 500) },
  prayers: [
    { name: 'Fajr', time: '05:00', date: new Date(offset + 1_000) },
    { name: 'Dhuhr', time: '12:00', date: new Date(offset + 2_000) },
    { name: 'Asr', time: '15:30', date: new Date(offset + 3_000) },
    { name: 'Maghrib', time: '18:00', date: new Date(offset + 4_000) },
    { name: 'Isha', time: '19:15', date: new Date(offset + 5_000) },
  ],
});

describe('widget schedule', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_500);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('drops expired prayers so native can clear an exhausted schedule', () => {
    expect(toWidgetPrayers([schedule('2026-08-27', -10_000)])).toEqual([]);
  });

  test('prefers a resolved region over the saved place name', () => {
    expect(widgetLocationLabel('Kota Bandung', 'Home')).toBe('Kota Bandung');
    expect(widgetLocationLabel(null, 'Home')).toBe('Home');
    expect(widgetLocationLabel(null, null)).toBeNull();
  });

  test('keeps future prayer timestamps in chronological order', () => {
    const prayers = toWidgetPrayers([
      schedule('2026-08-27', 0),
      schedule('2026-08-28', 10_000),
    ]);

    expect(prayers.map(prayer => [prayer.name, prayer.at])).toEqual([
      ['Dhuhr', 2_000],
      ['Asr', 3_000],
      ['Maghrib', 4_000],
      ['Isha', 5_000],
      ['Fajr', 11_000],
      ['Dhuhr', 12_000],
      ['Asr', 13_000],
      ['Maghrib', 14_000],
      ['Isha', 15_000],
    ]);
  });
});
