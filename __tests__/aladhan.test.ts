import { AlAdhanClient } from '@/services/aladhan';
import { AlAdhanCalculationOptions, PrayerSettings } from '@/domain/types';

type MockResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock;
};

const baseUrl = 'https://aladhan.test/v1';
const coordinates = { latitude: 51.5085, longitude: -0.1257 };
const settings: PrayerSettings = {
  method: 3,
  school: 'standard',
  notificationsEnabled: false,
  adhanEnabled: false,
  adhanVolumeCategory: 'notification',
  enabledPrayers: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true,
  },
  fastingRoutine: 'off',
  fastingAlarmsEnabled: false,
  suhoorReminderEnabled: true,
  imsakAlarmEnabled: true,
  dawudAnchorDate: null,
  use24HourTime: true,
};

function createClient(): {
  client: AlAdhanClient;
  fetchMock: jest.MockedFunction<typeof fetch>;
} {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  const response: MockResponse = {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ code: 200, status: 'OK', data: {} }),
  };
  fetchMock.mockResolvedValue(response as unknown as Response);
  return {
    client: new AlAdhanClient({ baseUrl, fetchImpl: fetchMock }),
    fetchMock,
  };
}

const calculation: AlAdhanCalculationOptions = {
  timezone: 'Europe/London',
  highLatitudeRule: 'oneSeventh',
  adjustments: {
    Fajr: 2,
    Dhuhr: -1,
    Asr: 3,
    Maghrib: 4,
    Isha: -2,
  },
};

describe('AlAdhan calculation options', () => {
  test('times out while parsing response JSON', async () => {
    jest.useFakeTimers();
    try {
      const json = jest.fn(() => new Promise<never>(() => undefined));
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json,
      } as unknown as Response);
      const client = new AlAdhanClient({
        baseUrl,
        timeoutMs: 10,
        fetchImpl: fetchMock,
      });

      const request = client.getMethods();
      await Promise.resolve();
      await Promise.resolve();
      expect(json).toHaveBeenCalled();
      jest.advanceTimersByTime(10);

      await expect(request).rejects.toThrow(
        'AlAdhan request timed out after 10ms',
      );
    } finally {
      jest.useRealTimers();
    }
  });
  test('adds timezone, high-latitude rule, and ten-position tune to timings', async () => {
    const { client, fetchMock } = createClient();

    await client.getTimings('28-08-2026', coordinates, settings, calculation);

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URL(url).searchParams;
    expect(url.startsWith(`${baseUrl}/timings/28-08-2026?`)).toBe(true);
    expect(params.get('timezonestring')).toBe('Europe/London');
    expect(params.get('latitudeAdjustmentMethod')).toBe('2');
    expect(params.get('tune')).toBe('2,0,-1,3,0,4,0,0,0,-2');
  });

  test('sends the same calculation parameters to calendar', async () => {
    const { client, fetchMock } = createClient();

    await client.getCalendar(8, 2026, coordinates, settings, calculation);

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URL(url).searchParams;
    expect(url.startsWith(`${baseUrl}/calendar/2026/8?`)).toBe(true);
    expect(params.get('timezonestring')).toBe('Europe/London');
    expect(params.get('latitudeAdjustmentMethod')).toBe('2');
    expect(params.get('tune')).toBe('2,0,-1,3,0,4,0,0,0,-2');
  });

  test('uses zero offsets for omitted adjustment values', async () => {
    const { client, fetchMock } = createClient();

    await client.getTimings('28-08-2026', coordinates, settings, {
      timezone: 'UTC',
      highLatitudeRule: 'angleBased',
      adjustments: { Isha: 7 },
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.get('tune')).toBe('0,0,0,0,0,0,0,0,0,7');
  });

  test('preserves legacy requests without calculation options', async () => {
    const { client, fetchMock } = createClient();

    await client.getTimings('28-08-2026', coordinates, settings);

    const [url] = fetchMock.mock.calls[0] as [string];
    const params = new URL(url).searchParams;
    expect(params.has('timezonestring')).toBe(false);
    expect(params.has('latitudeAdjustmentMethod')).toBe(false);
    expect(params.has('tune')).toBe(false);
  });

  test('rejects invalid calculation options before fetching', async () => {
    for (const invalid of [
      { timezone: 'Not/AnIanaZone', highLatitudeRule: 'angleBased' },
      { timezone: 'UTC', highLatitudeRule: 'invalidRule' },
      {
        timezone: 'UTC',
        highLatitudeRule: 'angleBased',
        adjustments: { Fajr: 1.5 },
      },
      {
        timezone: 'UTC',
        highLatitudeRule: 'angleBased',
        adjustments: { Isha: 181 },
      },
    ]) {
      const { client, fetchMock } = createClient();

      expect(() =>
        client.getTimings(
          '28-08-2026',
          coordinates,
          settings,
          invalid as AlAdhanCalculationOptions,
        ),
      ).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
