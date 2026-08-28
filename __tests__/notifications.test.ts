import { NativeModules } from 'react-native';
import { DailyPrayerData } from '@/domain';
import {
  buildPrayerNotificationRequests,
  getNotificationHealth,
  normalizeNotificationHealth,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
} from '@/services/notifications';

const schedule: DailyPrayerData = {
  date: '2026-08-31',
  timings: {
    Fajr: '05:00',
    Dhuhr: '12:00',
    Asr: '15:30',
    Maghrib: '18:00',
    Isha: '19:15',
  },
  imsak: { time: '04:30', date: new Date('2026-08-31T04:30:00.000Z') },
  prayers: [
    { name: 'Fajr', time: '05:00', date: new Date('2026-08-31T05:00:00.000Z') },
    {
      name: 'Dhuhr',
      time: '12:00',
      date: new Date('2026-08-31T12:00:00.000Z'),
    },
    { name: 'Asr', time: '15:30', date: new Date('2026-08-31T15:30:00.000Z') },
    {
      name: 'Maghrib',
      time: '18:00',
      date: new Date('2026-08-31T18:00:00.000Z'),
    },
    { name: 'Isha', time: '19:15', date: new Date('2026-08-31T19:15:00.000Z') },
  ],
};

describe('notification health', () => {
  test('normalizes valid native statuses and falls back for invalid values', () => {
    expect(
      normalizeNotificationHealth({
        notifications: 'allowed',
        timing: 'approximate',
        batteryOptimization: 'restricted',
        bootRescheduling: 'supported',
      }),
    ).toEqual({
      notifications: 'allowed',
      timing: 'approximate',
      batteryOptimization: 'restricted',
      bootRescheduling: 'supported',
    });
    expect(
      normalizeNotificationHealth({
        notifications: 'enabled',
        timing: null,
        batteryOptimization: 1,
        bootRescheduling: 'unknown',
      }),
    ).toEqual({
      notifications: 'unknown',
      timing: 'unknown',
      batteryOptimization: 'unknown',
      bootRescheduling: 'notApplicable',
    });
  });

  test('returns unknown health and rejects settings when native methods are absent', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraNotifications;
    modules.DuavaraNotifications = {};
    try {
      await expect(getNotificationHealth()).resolves.toEqual({
        notifications: 'unknown',
        timing: 'unknown',
        batteryOptimization: 'unknown',
        bootRescheduling: 'notApplicable',
      });
      await expect(openExactAlarmSettings()).rejects.toThrow('UNSUPPORTED');
      await expect(openBatteryOptimizationSettings()).rejects.toThrow(
        'UNSUPPORTED',
      );
    } finally {
      modules.DuavaraNotifications = original;
    }
  });

  test('normalizes health returned by the native module', async () => {
    const modules = NativeModules as Record<string, unknown>;
    const original = modules.DuavaraNotifications;
    modules.DuavaraNotifications = {
      getNotificationHealth: jest.fn().mockResolvedValue({
        notifications: 'notDetermined',
        timing: 'exact',
        batteryOptimization: 'notApplicable',
        bootRescheduling: 'notApplicable',
      }),
    };
    try {
      await expect(getNotificationHealth()).resolves.toEqual({
        notifications: 'notDetermined',
        timing: 'exact',
        batteryOptimization: 'notApplicable',
        bootRescheduling: 'notApplicable',
      });
    } finally {
      modules.DuavaraNotifications = original;
    }
  });
});

describe('native prayer notification requests', () => {
  test('marks prayer alerts for the bundled Adhan but leaves fasting alerts on system sound', () => {
    const notifications = buildPrayerNotificationRequests([schedule], {
      adhanEnabled: true,
      adhanVolumeCategory: 'alarm',
      now: new Date('2026-08-30T00:00:00.000Z'),
      fasting: {
        fastingRoutine: 'mondayThursday',
        fastingAlarmsEnabled: true,
        suhoorReminderEnabled: true,
        imsakAlarmEnabled: true,
        dawudAnchorDate: null,
      },
    });

    expect(notifications).toHaveLength(7);
    const prayerAlerts = notifications.filter(notification =>
      notification.id.startsWith('duavara-prayer-'),
    );
    const fastingAlerts = notifications.filter(notification =>
      notification.id.startsWith('duavara-fasting-'),
    );
    expect(prayerAlerts.every(notification => notification.adhan)).toBe(true);
    expect(
      prayerAlerts.every(
        notification => notification.adhanVolumeCategory === 'alarm',
      ),
    ).toBe(true);
    expect(fastingAlerts.every(notification => !notification.adhan)).toBe(true);
    expect(
      fastingAlerts.every(
        notification => notification.adhanVolumeCategory === 'notification',
      ),
    ).toBe(true);
  });

  test('uses the system sound path when Adhan is disabled', () => {
    const notifications = buildPrayerNotificationRequests([schedule], {
      adhanEnabled: false,
      adhanVolumeCategory: 'media',
      now: new Date('2026-08-30T00:00:00.000Z'),
    });

    expect(notifications).toHaveLength(5);
    expect(notifications.every(notification => !notification.adhan)).toBe(true);
    expect(
      notifications.every(
        notification => notification.adhanVolumeCategory === 'media',
      ),
    ).toBe(true);
  });
});
