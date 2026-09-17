/**
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Alert, Linking, NativeModules } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: { getCurrentPosition: jest.fn() },
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@/services/compass', () => {
  const actual = jest.requireActual('@/services/compass');
  return { ...actual, startQiblaCompass: jest.fn() };
});

jest.mock('@/services/notifications', () => {
  const actual = jest.requireActual('@/services/notifications');
  return {
    ...actual,
    cancelFastingNotifications: jest.fn(async () => undefined),
    cancelPrayerNotifications: jest.fn(async () => undefined),
    clearAllNotifications: jest.fn(async () => undefined),
    getNotificationHealth: jest.fn(async () => ({
      notifications: 'allowed',
      timing: 'exact',
      batteryOptimization: 'unrestricted',
      bootRescheduling: 'supported',
    })),
    hasNativeNotificationSupport: jest.fn(() => true),
    openBatteryOptimizationSettings: jest.fn(async () => undefined),
    openExactAlarmSettings: jest.fn(async () => undefined),
    playAdhanPreview: jest.fn(async () => true),
    schedulePrayerNotifications: jest.fn(async () => []),
    stopAdhanPreview: jest.fn(async () => undefined),
  };
});

jest.mock('@/services/widget', () => ({
  clearPrayerWidget: jest.fn(async () => undefined),
  syncPrayerWidget: jest.fn(async () => undefined),
  widgetLocationLabel: jest.fn(
    (regionName: string | null, profileName: string | null) =>
      regionName ?? profileName,
  ),
}));

jest.mock('@/services/mosques', () => {
  const actual = jest.requireActual('@/services/mosques');
  return { ...actual, clearNearbyMosqueCache: jest.fn() };
});

jest.mock('@/services/storage', () => {
  const actual = jest.requireActual('@/services/storage');
  return { ...actual, deleteAllLocalData: jest.fn() };
});

jest.mock('@/components', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    NearbyMosques: () => null,
    QiblaCameraFinder: () => null,
    QuranReader: ({ visible }: { visible: boolean }) =>
      visible
        ? ReactRuntime.createElement(View, {
            accessibilityLabel: 'Quran reader is open',
          })
        : null,
    RamadanDashboard: () => null,
    SplashScreen: ({ onFinish }: { onFinish: () => void }) =>
      ReactRuntime.createElement(View, {
        accessibilityLabel: 'Duavara splash screen',
        onFinish,
      }),
    WorshipCompanion: () => null,
    ZakatCalculator: () => null,
  };
});

import App, {
  formatLocationLabel,
  getCachedTodaySchedule,
  getCalculationKey,
  isQuranShortcutUrl,
  parseManualCoordinates,
} from '../App';
import {
  alAdhanClient,
  DEFAULT_PRAYER_SETTINGS,
  LOCATION_PROFILES_KEY,
  SETTINGS_KEY,
} from '@/services';

const geolocationMocks = jest.requireMock('@react-native-community/geolocation')
  .default as {
  getCurrentPosition: jest.Mock;
};
const notificationMocks = jest.requireMock('@/services/notifications') as {
  cancelFastingNotifications: jest.Mock;
  cancelPrayerNotifications: jest.Mock;
  schedulePrayerNotifications: jest.Mock;
};
const compassMocks = jest.requireMock('@/services/compass') as {
  startQiblaCompass: jest.Mock;
};
const mosqueMocks = jest.requireMock('@/services/mosques') as {
  clearNearbyMosqueCache: jest.Mock;
};
const storageMocks = jest.requireMock('@/services/storage') as {
  deleteAllLocalData: jest.Mock;
};
const renderers = new Set<ReactTestRenderer.ReactTestRenderer>();
let urlListener: ((event: { url: string }) => void) | null = null;
let removeUrlListener: jest.Mock;

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function renderApp(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await flushMicrotasks();
  });
  renderers.add(renderer);
  return renderer;
}

async function finishSplash(
  renderer: ReactTestRenderer.ReactTestRenderer,
): Promise<void> {
  const splash = renderer.root.findAll(
    node => node.props.accessibilityLabel === 'Duavara splash screen',
  )[0];
  if (!splash) throw new Error('Splash screen was not rendered');
  await ReactTestRenderer.act(async () => {
    splash.props.onFinish();
    await flushMicrotasks();
  });
}

function findByAccessibilityLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const control = renderer.root.findAll(
    node => node.props.accessibilityLabel === label,
  )[0];
  if (!control)
    throw new Error(`No control found for accessibility label: ${label}`);
  return control;
}

async function press(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): Promise<void> {
  const control = findByAccessibilityLabel(renderer, label);
  await ReactTestRenderer.act(async () => {
    await control.props.onPress();
    await flushMicrotasks();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  urlListener = null;
  removeUrlListener = jest.fn();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest
    .spyOn(Linking, 'addEventListener')
    .mockImplementation((event, listener) => {
      if (event === 'url')
        urlListener = listener as (event: { url: string }) => void;
      return { remove: removeUrlListener };
    });
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const renderer of renderers) renderer.unmount();
    renderers.clear();
    await flushMicrotasks();
  });
  jest.restoreAllMocks();
});

test('includes location and calculation mode in the calculation cache key', () => {
  const profile = {
    id: 'home',
    name: 'Home',
    kind: 'home' as const,
    coordinates: { latitude: 51.5, longitude: -0.12 },
  };
  const movedProfile = {
    ...profile,
    coordinates: { latitude: 51.6, longitude: -0.12 },
  };
  const manualSettings = { ...DEFAULT_PRAYER_SETTINGS, method: 3 };

  expect(getCalculationKey(profile, DEFAULT_PRAYER_SETTINGS)).not.toBe(
    getCalculationKey(movedProfile, DEFAULT_PRAYER_SETTINGS),
  );
  expect(getCalculationKey(profile, DEFAULT_PRAYER_SETTINGS)).not.toBe(
    getCalculationKey(profile, manualSettings),
  );
});

test('switches a stored manual method back to Automatic through prayer settings', async () => {
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockImplementation(async key =>
      key === SETTINGS_KEY
        ? JSON.stringify({ ...DEFAULT_PRAYER_SETTINGS, method: 3 })
        : null,
    );
  jest.spyOn(alAdhanClient, 'getMethods').mockResolvedValue({
    code: 200,
    status: 'OK',
    data: {},
  });
  const renderer = await renderApp();
  await finishSplash(renderer);

  await press(renderer, 'Open prayer preferences');
  await press(renderer, 'Choose calculation method');

  expect(
    findByAccessibilityLabel(renderer, 'Automatic (closest authority)').props
      .accessibilityState,
  ).toEqual({ selected: false });

  await press(renderer, 'Automatic (closest authority)');
  await press(renderer, 'Choose calculation method');

  expect(
    findByAccessibilityLabel(renderer, 'Automatic (closest authority)').props
      .accessibilityState,
  ).toEqual({ selected: true });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    SETTINGS_KEY,
    expect.stringContaining('"method":null'),
  );
});

test('clears the nearby mosque cache when confirmed deletion begins', async () => {
  let completeDeletion!: () => void;
  const deletion = new Promise<void>(resolve => {
    completeDeletion = resolve;
  });
  storageMocks.deleteAllLocalData.mockReturnValueOnce(deletion);
  const alert = jest.spyOn(Alert, 'alert');

  const renderer = await renderApp();
  await finishSplash(renderer);
  await press(renderer, 'Open prayer preferences');
  await press(renderer, 'Delete all local data');

  const destructiveAction = alert.mock.calls[0]?.[2]?.find(
    action => action.style === 'destructive',
  );
  expect(destructiveAction?.text).toBe('Delete data');

  await ReactTestRenderer.act(async () => {
    destructiveAction?.onPress?.();
    await flushMicrotasks();
  });

  expect(storageMocks.deleteAllLocalData).toHaveBeenCalledTimes(1);
  expect(mosqueMocks.clearNearbyMosqueCache).toHaveBeenCalledTimes(1);

  completeDeletion();
  await ReactTestRenderer.act(async () => {
    await flushMicrotasks();
  });
});

test('opens About Duavara with installed metadata and verified links', async () => {
  const modules = NativeModules as Record<string, unknown>;
  const originalAppInfo = modules.DuavaraAppInfo;
  modules.DuavaraAppInfo = {
    getAppInfo: jest.fn().mockResolvedValue({ version: '1.2.3', build: '42' }),
  };
  const openUrl = jest
    .spyOn(Linking, 'openURL')
    .mockResolvedValue(undefined as never);

  try {
    const renderer = await renderApp();
    await finishSplash(renderer);
    await press(renderer, 'About');

    expect(
      findByAccessibilityLabel(renderer, 'About').props.accessibilityState,
    ).toEqual({
      selected: true,
    });
    expect(
      findByAccessibilityLabel(renderer, 'Duavara version 1.2.3, build 42'),
    ).toBeDefined();
    expect(
      findByAccessibilityLabel(
        renderer,
        'Privacy by design: app data is stored locally; location is shared with named services only when location-based features are used',
      ),
    ).toBeDefined();

    const support = findByAccessibilityLabel(
      renderer,
      'Support Duavara on Buy Me a Coffee',
    );
    expect(support.props.accessibilityRole).toBe('button');
    expect(support.props.accessibilityHint).toBe(
      'Opens Buy Me a Coffee in your browser.',
    );
    const heart = renderer.root.findAll(node => node.props.children === '♥')[0];
    expect(heart.parent?.props.accessibilityElementsHidden).toBe(true);
    expect(heart.parent?.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );

    await press(renderer, 'Open Duavara source repository');
    await press(renderer, 'View Duavara privacy policy');
    await press(renderer, 'Support Duavara on Buy Me a Coffee');
    await press(renderer, 'Open AlAdhan data source');
    await press(renderer, 'Open latest Duavara release');

    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/ivanarifin/Duavara',
    );
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/ivanarifin/Duavara/blob/main/PRIVACY.md',
    );
    expect(openUrl).toHaveBeenCalledWith('https://buymeacoffee.com/ivanarifin');
    expect(openUrl).toHaveBeenCalledWith(
      'https://aladhan.com/prayer-times-api',
    );
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/ivanarifin/Duavara/releases/latest',
    );
  } finally {
    modules.DuavaraAppInfo = originalAppInfo;
  }
});

test('cancels stale alarms without rescheduling when Automatic refresh fails', async () => {
  const profile = {
    id: 'home',
    name: 'Home',
    kind: 'home' as const,
    coordinates: { latitude: 51.5, longitude: -0.12 },
  };
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async key => {
    if (key === SETTINGS_KEY) {
      return JSON.stringify({
        ...DEFAULT_PRAYER_SETTINGS,
        method: 3,
        notificationsEnabled: true,
        fastingRoutine: 'mondayThursday',
        fastingAlarmsEnabled: true,
      });
    }
    if (key === LOCATION_PROFILES_KEY) {
      return JSON.stringify({
        activeProfileId: profile.id,
        profiles: [profile],
      });
    }
    return null;
  });
  jest.spyOn(alAdhanClient, 'getMethods').mockResolvedValue({
    code: 200,
    status: 'OK',
    data: {},
  });
  const getTimings = jest
    .spyOn(alAdhanClient, 'getTimings')
    .mockRejectedValue(new Error('AlAdhan unavailable'));
  jest
    .spyOn(alAdhanClient, 'getCalendar')
    .mockRejectedValue(new Error('AlAdhan unavailable'));

  const renderer = await renderApp();
  await finishSplash(renderer);
  await ReactTestRenderer.act(async () => {
    await flushMicrotasks();
  });
  getTimings.mockClear();
  notificationMocks.cancelPrayerNotifications.mockClear();
  notificationMocks.cancelFastingNotifications.mockClear();
  notificationMocks.schedulePrayerNotifications.mockClear();

  await press(renderer, 'Open prayer preferences');
  await press(renderer, 'Choose calculation method');
  await press(renderer, 'Automatic (closest authority)');
  await ReactTestRenderer.act(async () => {
    await flushMicrotasks();
  });

  expect(getTimings).toHaveBeenCalledWith(
    expect.any(String),
    profile.coordinates,
    expect.objectContaining({ method: null }),
    expect.any(Object),
  );
  expect(notificationMocks.cancelPrayerNotifications).toHaveBeenCalledTimes(1);
  expect(notificationMocks.cancelFastingNotifications).toHaveBeenCalledTimes(1);
  expect(notificationMocks.schedulePrayerNotifications).not.toHaveBeenCalled();
});

test('refreshes the active saved place from the header device-location button', async () => {
  const profile = {
    id: 'work',
    name: 'Office',
    kind: 'work' as const,
    coordinates: { latitude: 51.5, longitude: -0.12 },
    timezone: 'Europe/London',
    highLatitudeRule: 'angleBased' as const,
    adjustments: { Fajr: 2 },
  };
  const otherProfile = {
    id: 'home',
    name: 'Home',
    kind: 'home' as const,
    coordinates: { latitude: 40.7128, longitude: -74.006 },
  };
  const deviceCoordinates = { latitude: -6.1754, longitude: 106.8272 };
  const scheduleResponse = {
    code: 200,
    status: 'OK',
    data: {
      timings: {
        Imsak: '04:30',
        Fajr: '04:40',
        Dhuhr: '12:00',
        Asr: '15:15',
        Maghrib: '18:00',
        Isha: '19:15',
      },
      date: { gregorian: { date: '01-01-2026' } },
    },
  };
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async key =>
    key === LOCATION_PROFILES_KEY
      ? JSON.stringify({
          activeProfileId: profile.id,
          profiles: [profile, otherProfile],
        })
      : null,
  );
  const getTimings = jest
    .spyOn(alAdhanClient, 'getTimings')
    .mockResolvedValue(scheduleResponse);
  jest.spyOn(alAdhanClient, 'getCalendar').mockResolvedValue({
    code: 200,
    status: 'OK',
    data: [],
  });
  geolocationMocks.getCurrentPosition.mockImplementation(onSuccess => {
    onSuccess({ coords: deviceCoordinates, timestamp: 0 });
  });

  const renderer = await renderApp();
  await finishSplash(renderer);
  await ReactTestRenderer.act(async () => {
    await flushMicrotasks();
  });
  getTimings.mockClear();
  (AsyncStorage.setItem as jest.Mock).mockClear();

  await press(renderer, 'Refresh location from device');

  expect(geolocationMocks.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    expect.objectContaining({ enableHighAccuracy: true }),
  );
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    LOCATION_PROFILES_KEY,
    JSON.stringify({
      activeProfileId: profile.id,
      profiles: [{ ...profile, coordinates: deviceCoordinates }, otherProfile],
    }),
  );
  expect(getTimings).toHaveBeenCalledWith(
    expect.any(String),
    deviceCoordinates,
    expect.any(Object),
    expect.objectContaining({
      timezone: profile.timezone,
      highLatitudeRule: profile.highLatitudeRule,
    }),
  );
});

test('places the device refresh action immediately left of Settings', async () => {
  const renderer = await renderApp();
  await finishSplash(renderer);

  const refresh = findByAccessibilityLabel(
    renderer,
    'Refresh location from device',
  );
  const settings = findByAccessibilityLabel(
    renderer,
    'Open prayer preferences',
  );

  expect(refresh.parent).toBe(settings.parent);
  const headerActions = refresh.parent;
  if (!headerActions) throw new Error('Header actions were not rendered');
  expect(headerActions.children.indexOf(refresh)).toBeLessThan(
    headerActions.children.indexOf(settings),
  );
});

test('places About immediately after Discover in the bottom tabs', async () => {
  const renderer = await renderApp();
  await finishSplash(renderer);

  const discover = findByAccessibilityLabel(renderer, 'Discover');
  const about = findByAccessibilityLabel(renderer, 'About');

  expect(discover.parent).toBe(about.parent);
  const tabBar = discover.parent;
  if (!tabBar) throw new Error('Bottom tabs were not rendered');
  expect(tabBar.children.indexOf(about)).toBe(
    tabBar.children.indexOf(discover) + 1,
  );
});

test('does not restore a cache without the active profile date', () => {
  const schedule = { date: '2026-08-27' } as never;

  expect(getCachedTodaySchedule([schedule], '2026-08-28')).toBeNull();
});

test('rejects empty manual coordinate values', () => {
  expect(parseManualCoordinates('  ', '0')).toBeNull();
  expect(parseManualCoordinates('51.5', '\t')).toBeNull();
  expect(parseManualCoordinates('51.5', '-0.12')).toEqual({
    latitude: 51.5,
    longitude: -0.12,
  });
  expect(parseManualCoordinates('1e2', '0')).toBeNull();
  expect(parseManualCoordinates('-90.1', '0')).toBeNull();
  expect(parseManualCoordinates('0', '180.1')).toBeNull();
});

test('prefers the resolved region in the location label', () => {
  const coordinates = { latitude: -6.2615, longitude: 106.8106 };

  expect(formatLocationLabel('South Jakarta', 'Home', coordinates)).toBe(
    'in South Jakarta',
  );
  expect(formatLocationLabel(null, 'Home', coordinates)).toBe('Home');
  expect(formatLocationLabel(null, null, coordinates)).toBe('-6.26°, 106.81°');
});

test('recognizes only the Quran home-screen shortcut URL', () => {
  expect(isQuranShortcutUrl('duavara://quran')).toBe(true);
  expect(isQuranShortcutUrl('duavara://quran/')).toBe(true);
  expect(isQuranShortcutUrl('duavara://quran/ayah/1')).toBe(false);
  expect(isQuranShortcutUrl('https://duavara.example/quran')).toBe(false);
  expect(isQuranShortcutUrl(null)).toBe(false);
});

test('opens Quran after a cold-start home-screen shortcut', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('duavara://quran');
  const renderer = await renderApp();

  await finishSplash(renderer);

  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Quran reader is open',
    ).length,
  ).toBeGreaterThan(0);
});

test('replays a home-screen shortcut received during the splash screen', async () => {
  const renderer = await renderApp();

  expect(urlListener).not.toBeNull();
  await ReactTestRenderer.act(async () => {
    urlListener?.({ url: 'duavara://quran' });
    await flushMicrotasks();
  });
  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Quran reader is open',
    ),
  ).toHaveLength(0);

  await finishSplash(renderer);

  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Quran reader is open',
    ).length,
  ).toBeGreaterThan(0);
});

test('opens Quran after a warm home-screen shortcut and removes its listener', async () => {
  const renderer = await renderApp();
  await finishSplash(renderer);

  expect(urlListener).not.toBeNull();
  await ReactTestRenderer.act(async () => {
    urlListener?.({ url: 'duavara://quran' });
    await flushMicrotasks();
  });

  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Quran reader is open',
    ).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
    await flushMicrotasks();
  });
  renderers.delete(renderer);
  expect(removeUrlListener).toHaveBeenCalledTimes(1);
});

test('keeps the Kaaba target fixed while the Qibla needle rotates', async () => {
  const profile = {
    id: 'home',
    name: 'Home',
    kind: 'home' as const,
    coordinates: { latitude: -6.2, longitude: 106.8 },
  };
  jest
    .spyOn(AsyncStorage, 'getItem')
    .mockImplementation(async key =>
      key === LOCATION_PROFILES_KEY
        ? JSON.stringify({ activeProfileId: profile.id, profiles: [profile] })
        : null,
    );
  jest.spyOn(alAdhanClient, 'getQibla').mockResolvedValue({
    code: 200,
    status: 'OK',
    data: { ...profile.coordinates, direction: 118 },
  });
  compassMocks.startQiblaCompass.mockImplementation(
    async (_qibla, onHeading) => {
      onHeading({ heading: 90, accuracy: 1, north: 'true', timestamp: 0 });
      return () => undefined;
    },
  );
  const renderer = await renderApp();
  await finishSplash(renderer);

  await press(renderer, 'Qibla');

  const needle = renderer.root.findAll(
    node =>
      Array.isArray(node.props.style) &&
      node.props.style.some(
        (style: unknown) =>
          typeof style === 'object' &&
          style !== null &&
          'transform' in style &&
          JSON.stringify(style.transform) ===
            JSON.stringify([{ rotate: '28deg' }]),
      ),
  )[0];
  const kaaba = renderer.root.findAll(node => {
    const styles = Array.isArray(node.props.style)
      ? node.props.style
      : [node.props.style];
    return styles.some(
      (style: unknown) =>
        typeof style === 'object' &&
        style !== null &&
        'width' in style &&
        style.width === 46 &&
        'height' in style &&
        style.height === 46,
    );
  })[0];

  expect(compassMocks.startQiblaCompass).toHaveBeenCalledWith(
    { ...profile.coordinates, direction: 118 },
    expect.any(Function),
  );
  expect(needle).toBeDefined();
  expect(kaaba).toBeDefined();
  expect(needle.findAll(node => node === kaaba)).toHaveLength(0);
  const kaabaStyles = Array.isArray(kaaba.props.style)
    ? kaaba.props.style
    : [kaaba.props.style];
  expect(kaabaStyles).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ transform: expect.any(Array) }),
    ]),
  );
});

test('renders the initial splash screen', async () => {
  const renderer = await renderApp();

  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Duavara splash screen',
    ).length,
  ).toBeGreaterThan(0);
});
