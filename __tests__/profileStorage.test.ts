import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/documents',
  readDir: jest.fn().mockResolvedValue([]),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-sound', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import type { DailyPrayerData, LocationProfile } from '@/domain/types';
import {
  deleteAllLocalData,
  getCachedSchedule,
  getCachedSchedules,
  getLocationProfileStore,
  LOCATION_PROFILES_KEY,
  normalizeLocationProfileStore,
  saveCachedSchedule,
  saveCachedSchedules,
  saveLocationProfileStore,
  setActiveLocationProfile,
  upsertLocationProfile,
} from '@/services/storage';
import { captureLocalDataEpoch, withStorageLock } from '@/services/storageLock';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const profile = (id: string, name = 'Home'): LocationProfile => ({
  id,
  name,
  kind: 'home',
  coordinates: { latitude: 35.681236, longitude: 139.767125 },
  timezone: 'UTC',
  highLatitudeRule: 'oneSeventh',
  adjustments: { Fajr: 2, Isha: -3 },
});

const schedule = (date: string): DailyPrayerData => ({
  date,
  timings: {
    Fajr: '05:00',
    Dhuhr: '12:30',
    Asr: '16:00',
    Maghrib: '19:00',
    Isha: '20:30',
  },
  prayers: [
    { name: 'Fajr', time: '05:00', date: new Date(`${date}T05:00:00.000Z`) },
    { name: 'Dhuhr', time: '12:30', date: new Date(`${date}T12:30:00.000Z`) },
    { name: 'Asr', time: '16:00', date: new Date(`${date}T16:00:00.000Z`) },
    {
      name: 'Maghrib',
      time: '19:00',
      date: new Date(`${date}T19:00:00.000Z`),
    },
    { name: 'Isha', time: '20:30', date: new Date(`${date}T20:30:00.000Z`) },
  ],
  imsak: {
    time: '04:30',
    date: new Date(`${date}T04:30:00.000Z`),
  },
  timezone: 'UTC',
  location: { latitude: 35.681236, longitude: 139.767125 },
});

describe('location profile storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('normalizes and roundtrips valid profiles', async () => {
    const saved = await saveLocationProfileStore({
      activeProfileId: 'home',
      profiles: [{ ...profile('home', '  Home  ') }],
    });

    expect(saved).toEqual({
      activeProfileId: 'home',
      profiles: [profile('home')],
    });
    await expect(getLocationProfileStore()).resolves.toEqual(saved);
  });

  test('falls back safely for malformed or invalid profiles', async () => {
    expect(normalizeLocationProfileStore(null)).toEqual({
      activeProfileId: null,
      profiles: [],
    });
    expect(
      normalizeLocationProfileStore({
        activeProfileId: 'missing',
        profiles: [
          profile('valid'),
          { ...profile('valid'), name: 'duplicate' },
          {
            ...profile('bad-coordinates'),
            coordinates: { latitude: 91, longitude: 0 },
          },
          { id: 'missing-fields', name: 'Invalid', kind: 'home' },
        ],
      }),
    ).toEqual({
      activeProfileId: 'valid',
      profiles: [profile('valid')],
    });

    await AsyncStorage.setItem(LOCATION_PROFILES_KEY, '{malformed');
    await expect(getLocationProfileStore()).resolves.toEqual({
      activeProfileId: null,
      profiles: [],
    });
  });

  test('ignores duplicate profile IDs while preserving the first profile', () => {
    const normalized = normalizeLocationProfileStore({
      activeProfileId: 'home',
      profiles: [profile('home', 'First'), profile('home', 'Duplicate')],
    });

    expect(normalized.profiles).toEqual([profile('home', 'First')]);
  });

  test('serializes concurrent profile saves without losing independent profiles', async () => {
    await Promise.all([
      saveLocationProfileStore({
        activeProfileId: 'home',
        profiles: [profile('home')],
      }),
      saveLocationProfileStore({
        activeProfileId: 'work',
        profiles: [profile('work', 'Work')],
      }),
    ]);

    await expect(getLocationProfileStore()).resolves.toEqual({
      activeProfileId: 'work',
      profiles: [profile('work', 'Work'), profile('home')],
    });
  });

  test('skips stale profile updates before they reach storage', async () => {
    await saveLocationProfileStore({
      activeProfileId: 'home',
      profiles: [profile('home')],
    });

    await expect(
      upsertLocationProfile(profile('work', 'Work'), () => false),
    ).resolves.toBeNull();
    await expect(
      setActiveLocationProfile('home', () => false),
    ).resolves.toBeNull();
    await expect(getLocationProfileStore()).resolves.toEqual({
      activeProfileId: 'home',
      profiles: [profile('home')],
    });
  });
});

describe('profile schedule cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('isolates profiles and revives cached prayer dates as Date instances', async () => {
    const homeSchedules = [schedule('2026-08-28')];
    const workSchedules = [schedule('2026-08-29')];

    await saveCachedSchedules('home', 'home-calculation-v1', homeSchedules);
    await saveCachedSchedules('work', 'work-calculation-v1', workSchedules);

    const cachedHome = await getCachedSchedules('home', 'home-calculation-v1');
    const cachedWork = await getCachedSchedules('work', 'work-calculation-v1');

    expect(cachedHome?.map(item => item.date)).toEqual(['2026-08-28']);
    expect(cachedWork?.map(item => item.date)).toEqual(['2026-08-29']);
    expect(cachedHome?.[0].prayers).toHaveLength(5);
    expect(cachedHome?.[0].prayers[0].date).toBeInstanceOf(Date);
    expect(cachedHome?.[0].imsak.date).toBeInstanceOf(Date);
  });

  test('returns null when the calculation key does not match', async () => {
    await saveCachedSchedules('home', 'calculation-v1', [
      schedule('2026-08-28'),
    ]);

    await expect(
      getCachedSchedules('home', 'calculation-v2'),
    ).resolves.toBeNull();
  });

  test('rejects persisted schedules with invalid timing strings', async () => {
    const cached = schedule('2026-08-28');
    await AsyncStorage.setItem(
      'duavara.schedule',
      JSON.stringify({
        ...cached,
        timings: { ...cached.timings, Fajr: '25:00' },
      }),
    );
    await expect(getCachedSchedule()).resolves.toBeNull();

    await expect(
      saveCachedSchedule({
        ...cached,
        prayers: cached.prayers.map(prayer =>
          prayer.name === 'Fajr' ? { ...prayer, time: '5:00' } : prayer,
        ),
      }),
    ).rejects.toThrow('Invalid cached schedule');
  });
});

describe('delete all local data', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('removes every Duavara AsyncStorage key but preserves other app data', async () => {
    await AsyncStorage.setItem('duavara.settings', '{}');
    await AsyncStorage.setItem('duavara.quran.bookmarks', '[]');
    await AsyncStorage.setItem('other-app.key', 'keep');

    await deleteAllLocalData();

    expect(await AsyncStorage.getItem('duavara.settings')).toBeNull();
    expect(await AsyncStorage.getItem('duavara.quran.bookmarks')).toBeNull();
    expect(await AsyncStorage.getItem('other-app.key')).toBe('keep');
  });

  test('prevents a write queued after deletion begins from recreating data', async () => {
    const deletion = deleteAllLocalData();
    const staleWrite = withStorageLock(() =>
      AsyncStorage.setItem('duavara.settings', '{}'),
    );

    await deletion;
    await expect(staleWrite).rejects.toThrow('LOCAL_DATA_RESET');
    expect(await AsyncStorage.getItem('duavara.settings')).toBeNull();
    expect(captureLocalDataEpoch()).toBeGreaterThan(0);
  });
});
