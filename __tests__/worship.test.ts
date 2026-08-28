import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { WorshipCompanion } from '@/components/WorshipCompanion';
import type { DailyPrayerData } from '@/domain/types';
import {
  calculateCurrentStreak,
  calculatePrayedCount,
  completedCycles,
  getWorshipHistory,
  incrementTasbih,
  normalizeTasbihState,
  normalizeWorshipRecords,
  resetTasbih,
  setPrayerStatus,
  setTasbihTarget,
  togglePrayerStatus,
} from '@/domain/worship';
import {
  getTasbihState,
  getWorshipRecords,
  saveTasbihState,
  saveWorshipRecords,
  setTasbihTarget as saveTasbihTarget,
} from '@/services/worship';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native', () => {
  const ReactNative = jest.requireActual('react-native');
  const ReactRuntime = require('react');
  return {
    Modal: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, props, children),
    Pressable: ReactNative.Pressable,
    StyleSheet: ReactNative.StyleSheet,
    Text: ReactNative.Text,
    View: ReactNative.View,
  };
});

const completeDay = (date: string) =>
  setPrayerStatus(
    setPrayerStatus(
      setPrayerStatus(
        setPrayerStatus(
          setPrayerStatus({}, date, 'Fajr', 'prayed'),
          date,
          'Dhuhr',
          'qada',
        ),
        date,
        'Asr',
        'prayed',
      ),
      date,
      'Maghrib',
      'prayed',
    ),
    date,
    'Isha',
    'prayed',
  );

describe('worship records', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('normalizes malformed records safely and bounds dates', () => {
    const tooManyDates = Object.fromEntries(
      Array.from({ length: 121 }, (_, index) => [
        `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(
          (index % 28) + 1,
        ).padStart(2, '0')}`,
        { Fajr: 'prayed', invalid: 'prayed' },
      ]),
    );
    const normalized = normalizeWorshipRecords({
      ...tooManyDates,
      'not-a-date': { Fajr: 'prayed' },
      '2026-02-30': { Isha: 'prayed' },
      '2026-08-27': { Fajr: 'invalid', Dhuhr: 'qada' },
      broken: null,
    });

    expect(Object.keys(normalized)).toHaveLength(120);
    expect(normalized['2026-08-27']).toEqual({ Dhuhr: 'qada' });
    expect(normalized['not-a-date']).toBeUndefined();
    expect(normalized['2026-02-30']).toBeUndefined();
  });

  test('sets and toggles statuses using local date keys', () => {
    const localDate = new Date(2026, 7, 27, 23, 30);
    const set = setPrayerStatus({}, localDate, 'Fajr', 'missed');
    expect(set).toEqual({ '2026-08-27': { Fajr: 'missed' } });
    expect(togglePrayerStatus(set, '2026-08-27', 'Fajr', 'prayed')).toEqual({
      '2026-08-27': { Fajr: 'prayed' },
    });
    expect(togglePrayerStatus(set, '2026-08-27', 'Fajr', 'missed')).toEqual({});
  });

  test('returns recent history in descending date order', () => {
    const records = setPrayerStatus(
      setPrayerStatus(
        setPrayerStatus({}, '2026-08-25', 'Fajr', 'prayed'),
        '2026-08-27',
        'Fajr',
        'qada',
      ),
      '2026-08-26',
      'Fajr',
      'missed',
    );

    expect(getWorshipHistory(records, 2)).toEqual([
      { date: '2026-08-27', statuses: { Fajr: 'qada' } },
      { date: '2026-08-26', statuses: { Fajr: 'missed' } },
    ]);
  });

  test('counts prayed and qada, and streak requires all five prayers', () => {
    const records = completeDay('2026-08-25');
    const withGap = setPrayerStatus(records, '2026-08-26', 'Fajr', 'prayed');
    const complete = completeDay('2026-08-27');
    const all = { ...withGap, ...complete };

    expect(calculatePrayedCount(records, '2026-08-25')).toBe(5);
    expect(calculateCurrentStreak(all, '2026-08-27')).toBe(1);
    expect(calculateCurrentStreak(all, '2026-08-26')).toBe(0);
  });

  test('persists normalized records and Tasbih target through AsyncStorage', async () => {
    await saveWorshipRecords({
      '2026-08-27': { Fajr: 'prayed', bad: 'value' },
      invalid: { Fajr: 'prayed' },
    });
    expect(await getWorshipRecords()).toEqual({
      '2026-08-27': { Fajr: 'prayed' },
    });

    await saveTasbihTarget(99);
    expect(await getTasbihState()).toEqual({ count: 0, target: 99 });
  });
});

const schedule: DailyPrayerData = {
  date: '2026-08-28',
  timings: {
    Fajr: '05:00',
    Dhuhr: '12:00',
    Asr: '15:30',
    Maghrib: '18:00',
    Isha: '19:15',
  },
  prayers: [
    { name: 'Fajr', time: '05:00', date: new Date('2026-08-28T05:00:00.000Z') },
    {
      name: 'Dhuhr',
      time: '12:00',
      date: new Date('2026-08-28T12:00:00.000Z'),
    },
    { name: 'Asr', time: '15:30', date: new Date('2026-08-28T15:30:00.000Z') },
    {
      name: 'Maghrib',
      time: '18:00',
      date: new Date('2026-08-28T18:00:00.000Z'),
    },
    { name: 'Isha', time: '19:15', date: new Date('2026-08-28T19:15:00.000Z') },
  ],
  imsak: {
    time: '04:30',
    date: new Date('2026-08-28T04:30:00.000Z'),
  },
};

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function findByAccessibilityLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const match = renderer.root.findAll(
    node => node.props.accessibilityLabel === label,
  )[0];
  if (!match) {
    throw new Error(`No control found for accessibility label: ${label}`);
  }
  return match;
}

describe('Tasbih', () => {
  test('does not wrap and reports completed cycles', () => {
    const state = incrementTasbih({ count: 98, target: 99 });
    const beyondTarget = incrementTasbih(state);

    expect(beyondTarget).toEqual({ count: 100, target: 99 });
    expect(completedCycles(beyondTarget.count, beyondTarget.target)).toBe(1);
    expect(resetTasbih(beyondTarget)).toEqual({ count: 0, target: 99 });
  });

  test('normalizes malformed state and switches target without changing count', () => {
    expect(normalizeTasbihState({ count: -1, target: 12 })).toEqual({
      count: 0,
      target: 33,
    });
    expect(setTasbihTarget({ count: 34, target: 33 }, 99)).toEqual({
      count: 34,
      target: 99,
    });
  });

  test('requires confirmation before resetting the persisted count', async () => {
    await saveTasbihState({ count: 5, target: 33 });
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(WorshipCompanion, {
          schedule,
          use24HourTime: true,
        }),
      );
      await flushMicrotasks();
    });

    await ReactTestRenderer.act(async () => {
      findByAccessibilityLabel(renderer, 'Reset Tasbih count').props.onPress();
      await flushMicrotasks();
    });
    expect(
      findByAccessibilityLabel(renderer, 'Confirm reset Tasbih count'),
    ).toBeDefined();
    expect(await getTasbihState()).toEqual({ count: 5, target: 33 });

    await ReactTestRenderer.act(async () => {
      findByAccessibilityLabel(
        renderer,
        'Cancel resetting Tasbih count',
      ).props.onPress();
      await flushMicrotasks();
    });
    expect(await getTasbihState()).toEqual({ count: 5, target: 33 });

    await ReactTestRenderer.act(async () => {
      findByAccessibilityLabel(renderer, 'Reset Tasbih count').props.onPress();
      await flushMicrotasks();
    });
    await ReactTestRenderer.act(async () => {
      findByAccessibilityLabel(
        renderer,
        'Confirm reset Tasbih count',
      ).props.onPress();
      await flushMicrotasks();
    });
    expect(await getTasbihState()).toEqual({ count: 0, target: 33 });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
      await flushMicrotasks();
    });
  });
});
