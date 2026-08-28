/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

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

jest.mock('@/components', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    NearbyMosques: () => null,
    QiblaCameraFinder: () => null,
    QuranReader: () => null,
    RamadanDashboard: () => null,
    SplashScreen: () =>
      ReactRuntime.createElement(View, {
        accessibilityLabel: 'Duavara splash screen',
      }),
    WorshipCompanion: () => null,
    ZakatCalculator: () => null,
  };
});

import App, {
  formatLocationLabel,
  getCachedTodaySchedule,
  getCalculationKey,
  parseManualCoordinates,
} from '../App';
import { DEFAULT_PRAYER_SETTINGS } from '@/services';

test('includes coordinates in the calculation cache key', () => {
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

  expect(getCalculationKey(profile, DEFAULT_PRAYER_SETTINGS)).not.toBe(
    getCalculationKey(movedProfile, DEFAULT_PRAYER_SETTINGS),
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

test('renders the initial splash screen', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });

  expect(
    renderer!.root.findAll(
      node => node.props.accessibilityLabel === 'Duavara splash screen',
    ).length,
  ).toBeGreaterThan(0);
});
